import { DomainCoverage } from "./domains.js";
import {
  MissingAPIKeyError,
  OctogenAPIError,
  OctogenAuthenticationError,
  OctogenConnectionError,
  OctogenForbiddenError,
  OctogenNotFoundError,
  OctogenValidationError,
} from "./errors.js";
import type { HttpMethod, OperationId } from "./operations.js";
import { OPERATIONS, resolveOperationPath } from "./operations.js";
import type {
  CoverageContainsResponse,
  CoveragePaginationParams,
  CoverageUrlList,
  CoverageUrlListPage,
  CoverageUrlListUrlsPage,
  CoverageUrlMutationResponse,
  ListDomainsOptions,
  ListDomainsResponse,
  ListDomainsResult,
  ListVoyagesParams,
  MeResponse,
  MoreLikeThisProductsParams,
  MoreLikeThisProductsResponse,
  MoreLikeThisSource,
  LookupProductOptions,
  MerchantProductListPage,
  MerchantProductUrlLookupResponse,
  ProgrammaticMoreLikeThisRequest,
  ProgrammaticProductLookupRequestBody,
  ProgrammaticProductRefreshRequest,
  ProgrammaticProductSearchRequest,
  ProgrammaticResolveFromHtmlRequest,
  ProductRefreshResponse,
  ProductRefreshTarget,
  RefreshProductsParams,
  ResolveProductFromHtmlParams,
  SearchProductsParams,
  StartVoyageResult,
  TextSearchQuery,
  TextSearchQueryPayload,
  VoyageListResponse,
  VoyageTask,
} from "./models.js";

export const DEFAULT_BASE_URL = "https://api.octogen.ai/v1";
export const DEFAULT_TIMEOUT_MS = 30_000;
export const SDK_VERSION = "0.3.0";
export const USER_AGENT = `octogen-ai-sdk-typescript/${SDK_VERSION}`;

/**
 * The environment variable every Octogen document, skill, and CLI command
 * names. Prefer it in code and in docs.
 */
export const API_KEY_ENV_VAR = "OCTOGEN_PLATFORM_API_KEY";

/**
 * Read for backwards compatibility only. It never appeared in any Octogen
 * document — early SDK builds read it and nothing else did — so it is a
 * deprecated fallback that warns once and will be dropped.
 */
export const DEPRECATED_API_KEY_ENV_VAR = "OCTO_API_KEY";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * The three routes the keyless metered trial answers without a credential,
 * as `operationId`s. 30 requests per IP per day, complete untruncated
 * payloads; everything else on `/v1` refuses a credential-free request with
 * `401 keyless_trial_endpoint_not_included`.
 *
 * Exported so a caller can ask *before* spending a request whether the call it
 * is about to make is even eligible.
 */
export const KEYLESS_TRIAL_OPERATIONS: readonly OperationId[] = Object.freeze([
  "listDomains",
  "lookupProduct",
  "searchProducts",
]);

export interface OctogenClientOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: FetchLike;
  /**
   * Permit a client with no API key, for the keyless metered trial.
   *
   * Off by default: a client built without a key is only useful against
   * {@link KEYLESS_TRIAL_OPERATIONS}, and silently degrading to it would turn
   * a misconfigured deployment into a 30-request-a-day one. With it on and no
   * key resolved, requests carry **no** `Authorization` header at all —
   * sending a placeholder instead earns `401 Invalid API key`, because the
   * trial is entered by presenting nothing rather than by presenting
   * something empty.
   */
  allowKeyless?: boolean;
}

export class OctogenClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchFn: FetchLike;
  private readonly timeoutMs: number;

  constructor(options: OctogenClientOptions = {}) {
    const resolvedApiKey = options.apiKey ?? readEnvApiKey();
    if (!resolvedApiKey && options.allowKeyless !== true) {
      throw new MissingAPIKeyError();
    }

    this.apiKey = resolvedApiKey === "" ? undefined : resolvedApiKey;
    this.baseUrl = trimTrailingSlash(options.baseUrl ?? DEFAULT_BASE_URL);
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** True when this client sends no credential — the keyless trial. */
  get isKeyless(): boolean {
    return this.apiKey === undefined;
  }

  async lookupProduct(
    url: string,
    options: LookupProductOptions = {},
  ): Promise<MerchantProductUrlLookupResponse> {
    assertNonEmptyString(url, "url");
    const resolutionMode = options.resolutionMode ?? "auto";
    const onDemandCachePolicy = options.onDemandCachePolicy ?? "prefer_cache";
    if (resolutionMode === "index_only" && onDemandCachePolicy !== "prefer_cache") {
      throw new TypeError("onDemandCachePolicy does not apply to index_only");
    }
    const body: ProgrammaticProductLookupRequestBody = {
      url,
      resolutionMode,
      onDemandCachePolicy,
    };
    // Omitted rather than defaulted: the server's own default is `loose`, and
    // sending it explicitly would freeze this SDK to today's default.
    if (options.matchMode !== undefined) {
      body.matchMode = options.matchMode;
    }
    const data = await this.json("lookupProduct", { body });
    return data as MerchantProductUrlLookupResponse;
  }

  /**
   * Schedule product refreshes (`POST /v1/products/refresh`).
   *
   * Answers `202`: the targets were accepted and a refresh workflow was
   * dispatched, not that the products have been re-crawled yet.
   */
  async refreshProducts(
    params: RefreshProductsParams,
  ): Promise<ProductRefreshResponse> {
    const body = toRefreshPayload(params);
    const data = await this.json("refreshProducts", { body });
    return data as ProductRefreshResponse;
  }

  /**
   * Resolve a product from page HTML you already have
   * (`POST /v1/products/resolve-from-html`).
   *
   * No index read and no outbound fetch: the answer is derived entirely from
   * the document you submit. Pass `url` whenever you have it.
   */
  async resolveProductFromHtml(
    params: ResolveProductFromHtmlParams,
  ): Promise<MerchantProductUrlLookupResponse> {
    assertNonEmptyString(params.html, "html");
    const body: ProgrammaticResolveFromHtmlRequest = { html: params.html };
    if (params.url !== undefined) {
      assertNonEmptyString(params.url, "url");
      body.url = params.url;
    }
    const data = await this.json("resolveProductFromHtml", { body });
    return data as MerchantProductUrlLookupResponse;
  }

  /**
   * The calling organization, key, quotas, and rate-limit posture
   * (`GET /v1/me`).
   *
   * Read-only and side-effect free: safe on startup and in CI. Never contains
   * key material — only the key id and its non-secret display prefix.
   */
  async getMe(): Promise<MeResponse> {
    const data = await this.json("getMe");
    return data as MeResponse;
  }

  /**
   * The covered-host set (`GET /v1/domains`), with `ETag` revalidation.
   *
   * Prefer {@link fetchDomainCoverage}, which handles the `304` and gives you
   * a matcher that normalizes hosts. Use this when you manage the cache
   * yourself.
   */
  async listDomains(options: ListDomainsOptions = {}): Promise<ListDomainsResult> {
    const headers: Record<string, string> = {};
    if (options.ifNoneMatch !== undefined) {
      headers["If-None-Match"] = options.ifNoneMatch;
    }
    const { data, response } = await this.request("listDomains", { headers });
    const etag = response.headers.get("ETag") ?? undefined;
    const maxAgeSeconds = parseMaxAge(response.headers.get("Cache-Control"));

    if (response.status === 304) {
      return { notModified: true, domains: undefined, etag, maxAgeSeconds };
    }
    const body = data as ListDomainsResponse;
    return {
      notModified: false,
      domains: body.domains,
      etag,
      maxAgeSeconds,
    };
  }

  /**
   * Fetch (or revalidate) the covered-domain snapshot.
   *
   * Pass the previous snapshot and this sends `If-None-Match`; on a `304` it
   * returns that same snapshot untouched, which is what the endpoint's
   * `max-age=300` and strong `ETag` are for.
   *
   * ```ts
   * let coverage = await client.fetchDomainCoverage();
   * if (coverage.isHostCovered("https://www.macys.com/shop/product/x")) {
   *   await client.lookupProduct("https://www.macys.com/shop/product/x");
   * }
   * // Later — one cheap revalidation, no re-download while unchanged:
   * coverage = await client.fetchDomainCoverage(coverage);
   * ```
   */
  async fetchDomainCoverage(previous?: DomainCoverage): Promise<DomainCoverage> {
    const options: ListDomainsOptions = {};
    if (previous?.etag !== undefined) {
      options.ifNoneMatch = previous.etag;
    }
    const result = await this.listDomains(options);
    if (result.notModified && previous !== undefined) {
      return previous;
    }
    return new DomainCoverage(result.domains ?? [], {
      etag: result.etag,
      maxAgeSeconds: result.maxAgeSeconds,
    });
  }

  /**
   * Start — or join — a voyage for a domain (`POST /v1/voyage`).
   *
   * Voyages are shared per domain. When one is already running (or the domain
   * already has a live catalog) the caller joins it and no quota is consumed;
   * {@link StartVoyageResult.created} says which happened. Voyages run for
   * hours to days: poll {@link getVoyage} every five minutes or slower.
   */
  async startVoyage(domain: string): Promise<StartVoyageResult> {
    assertNonEmptyString(domain, "domain");
    const { data, response } = await this.request("startVoyage", {
      body: { domain },
    });
    return { task: data as VoyageTask, created: response.status === 202 };
  }

  /** List this organization's voyages, newest first (`GET /v1/voyage`). */
  async listVoyages(params: ListVoyagesParams = {}): Promise<VoyageListResponse> {
    const data = await this.json("listVoyages", {
      query: { cursor: params.cursor, limit: params.limit, status: params.status },
    });
    return data as VoyageListResponse;
  }

  /**
   * Poll one voyage (`GET /v1/voyage/{task_id}`).
   *
   * A task belonging to another organization is reported as `404
   * voyage_not_found`, indistinguishable from one that does not exist.
   */
  async getVoyage(taskId: string): Promise<VoyageTask> {
    const data = await this.json("getVoyage", {
      pathParams: { task_id: taskId },
    });
    return data as VoyageTask;
  }

  async searchProducts(params: SearchProductsParams): Promise<MerchantProductListPage> {
    const body = toSearchPayload(params);
    const data = await this.json("searchProducts", { body });
    return data as MerchantProductListPage;
  }

  async moreLikeThisProducts(
    params: MoreLikeThisProductsParams,
  ): Promise<MoreLikeThisProductsResponse> {
    const body = toMoreLikeThisPayload(params);
    const data = await this.json("moreLikeThisProducts", { body });
    return data as MoreLikeThisProductsResponse;
  }

  /** Create a coverage URL list (returned in `provisioning`). */
  async createCoverageUrlList(name: string): Promise<CoverageUrlList> {
    assertNonEmptyString(name, "name");
    const data = await this.json("createUrlList", { body: { name } });
    return data as CoverageUrlList;
  }

  /** List your organization's coverage URL lists, newest first. */
  async listCoverageUrlLists(
    params: CoveragePaginationParams = {},
  ): Promise<CoverageUrlListPage> {
    const data = await this.json("listUrlLists", {
      query: { cursor: params.cursor, limit: params.limit },
    });
    return data as CoverageUrlListPage;
  }

  /** Get one coverage URL list by id. */
  async getCoverageUrlList(urlListId: string): Promise<CoverageUrlList> {
    const data = await this.json("getUrlList", { pathParams: { urlListId } });
    return data as CoverageUrlList;
  }

  /**
   * Delete a coverage URL list (returned in `delete_pending`). Deletion is
   * asynchronous and permanent: there is no grace window and no restore.
   */
  async deleteCoverageUrlList(urlListId: string): Promise<CoverageUrlList> {
    const data = await this.json("deleteUrlList", { pathParams: { urlListId } });
    return data as CoverageUrlList;
  }

  /** Add URLs to a list — an idempotent set-add with per-URL outcomes. */
  async addCoverageUrlListUrls(
    urlListId: string,
    urls: string[],
  ): Promise<CoverageUrlMutationResponse> {
    assertUrlBatch(urls);
    const data = await this.json("addUrlListUrls", {
      body: { urls },
      pathParams: { urlListId },
    });
    return data as CoverageUrlMutationResponse;
  }

  /** Remove URLs from a list — an idempotent set-remove. */
  async removeCoverageUrlListUrls(
    urlListId: string,
    urls: string[],
  ): Promise<CoverageUrlMutationResponse> {
    assertUrlBatch(urls);
    const data = await this.json("removeUrlListUrls", {
      body: { urls },
      pathParams: { urlListId },
    });
    return data as CoverageUrlMutationResponse;
  }

  /** Check which URLs are members of a list (normalized server-side). */
  async checkCoverageUrlListUrls(
    urlListId: string,
    urls: string[],
  ): Promise<CoverageContainsResponse> {
    assertUrlBatch(urls);
    const data = await this.json("checkUrlListUrls", {
      body: { urls },
      pathParams: { urlListId },
    });
    return data as CoverageContainsResponse;
  }

  /** Enumerate a list's URLs in stable insertion order. */
  async listCoverageUrlListUrls(
    urlListId: string,
    params: CoveragePaginationParams = {},
  ): Promise<CoverageUrlListUrlsPage> {
    const data = await this.json("listUrlListUrls", {
      pathParams: { urlListId },
      query: { cursor: params.cursor, limit: params.limit },
    });
    return data as CoverageUrlListUrlsPage;
  }

  /**
   * Issue an arbitrary `/v1` request. **Unstable by construction.**
   *
   * Every other method on this client names an `operationId` and takes its
   * verb and path from {@link OPERATIONS}, so it cannot reach a route the
   * published contract does not define. This one takes the path from you, and
   * that is the point: it exists so a `/v1` route published tomorrow is
   * reachable today, and so surfaces that are live but deliberately outside
   * the contract stay usable without freezing them into typed methods.
   *
   * What you still get: credential resolution (including keyless), the timeout,
   * `User-Agent`, JSON encoding, and the same typed error classes the rest of
   * the client throws — so retry and error handling are shared rather than
   * reimplemented. What you do not get: request or response types, defaults,
   * or any promise that the route exists. You own the body.
   *
   * `path` is relative to the `/v1` base (`"/products/lookup"`,
   * `"products/lookup"`, or a full URL on the configured base).
   */
  async fetchRaw(
    method: HttpMethod,
    path: string,
    options: {
      body?: unknown;
      headers?: Record<string, string>;
      query?: Record<string, string | number | undefined>;
    } = {},
  ): Promise<RawResponse> {
    assertNonEmptyString(path.trim(), "path");
    const { data, response } = await this.send({
      body: options.body,
      headers: options.headers,
      method,
      path: relativeToBase(path, this.baseUrl),
      query: options.query,
    });
    return {
      data,
      headers: headerRecord(response.headers),
      status: response.status,
    };
  }

  /**
   * Issue one registry-declared operation.
   *
   * Requests name an `operationId`, never a path: the verb and path template
   * come from {@link OPERATIONS}, whose `path` is typed against the generated
   * contract. There is no way to reach a route the published API does not
   * define without a compile error.
   */
  private request(
    operationId: OperationId,
    options: {
      body?: object;
      headers?: Record<string, string>;
      pathParams?: Record<string, string>;
      query?: Record<string, string | number | undefined>;
    } = {},
  ): Promise<{ data: unknown; response: Response }> {
    const operation = OPERATIONS[operationId];
    return this.send({
      body: options.body,
      headers: options.headers,
      method: operation.method,
      path: resolveOperationPath(operation.path, options.pathParams),
      query: options.query,
    });
  }

  /** The one place a `/v1` request is actually issued. */
  private async send(options: {
    body?: unknown;
    headers?: Record<string, string> | undefined;
    method: HttpMethod;
    path: string;
    query?: Record<string, string | number | undefined> | undefined;
  }): Promise<{ data: unknown; response: Response }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const init: RequestInit = {
        headers: { ...this.headers(options.body !== undefined), ...options.headers },
        method: options.method,
        signal: controller.signal,
      };
      if (options.body !== undefined) {
        init.body = JSON.stringify(options.body);
      }

      const response = await this.fetchFn(this.url(options.path, options.query), init);

      if (response.status >= 400) {
        throw await apiErrorFromResponse(response);
      }

      // 204 (no content) and 304 (revalidated) both carry no body.
      if (response.status === 204 || response.status === 304) {
        return { data: undefined, response };
      }

      return { data: await parseJsonResponse(response), response };
    } catch (error) {
      if (error instanceof OctogenAPIError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new OctogenConnectionError(error.message, { cause: error });
      }
      throw new OctogenConnectionError("Octogen API request failed", {
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  /** {@link request} for the common case: return the decoded JSON body. */
  private async json(
    operationId: OperationId,
    options: {
      body?: object;
      pathParams?: Record<string, string>;
      query?: Record<string, string | number | undefined>;
    } = {},
  ): Promise<unknown> {
    const { data } = await this.request(operationId, options);
    return data;
  }

  private url(
    path: string,
    query?: Record<string, string | number | undefined>,
  ): string {
    const base = `${this.baseUrl}/${path.replace(/^\/+/, "")}`;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) {
        params.set(key, String(value));
      }
    }
    const search = params.toString();
    return search ? `${base}?${search}` : base;
  }

  private headers(hasJsonBody: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    };
    // Omitted, not blank, when keyless: `Authorization: Bearer ` is a
    // credential the gateway rejects, while no header at all is how the
    // metered trial is entered.
    if (this.apiKey !== undefined) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    if (hasJsonBody) {
      headers["Content-Type"] = "application/json";
    }
    return headers;
  }
}

/** What {@link OctogenClient.fetchRaw} answers: the whole response, untyped. */
export interface RawResponse {
  status: number;
  /** Lowercased header names, as `Headers` iterates them. */
  headers: Record<string, string>;
  /** The decoded JSON body, or `undefined` for `204`/`304`. */
  data: unknown;
}

function headerRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [name, value] of headers) {
    record[name] = value;
  }
  return record;
}

/**
 * Reduce a caller-supplied path to one relative to the `/v1` base.
 *
 * Accepts `/products/lookup`, `products/lookup`, and a full URL on the
 * configured base (so pasting a URL out of a log works). A full URL on a
 * *different* origin is a `TypeError` rather than a silent redirect of the
 * credential to somebody else's host.
 */
function relativeToBase(path: string, baseUrl: string): string {
  const candidate = path.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    return candidate;
  }
  const base = `${baseUrl}/`;
  if (!candidate.startsWith(base)) {
    throw new TypeError(
      `path must be relative to ${baseUrl}, or a URL on it; got ${candidate}`,
    );
  }
  return candidate.slice(base.length);
}

let warnedDeprecatedApiKeyEnvVar = false;

function readEnvApiKey(): string | undefined {
  if (typeof process === "undefined") {
    return undefined;
  }
  const apiKey = process.env[API_KEY_ENV_VAR];
  if (apiKey !== undefined && apiKey.length > 0) {
    return apiKey;
  }

  const deprecated = process.env[DEPRECATED_API_KEY_ENV_VAR];
  if (deprecated !== undefined && deprecated.length > 0) {
    if (!warnedDeprecatedApiKeyEnvVar) {
      warnedDeprecatedApiKeyEnvVar = true;
      console.warn(
        `[octogen] ${DEPRECATED_API_KEY_ENV_VAR} is deprecated and will be ` +
          `removed; set ${API_KEY_ENV_VAR} instead.`,
      );
    }
    return deprecated;
  }
  return undefined;
}

/** `max-age` in seconds from a `Cache-Control` header, when present. */
function parseMaxAge(header: string | null): number | undefined {
  if (header === null) {
    return undefined;
  }
  const match = /(?:^|[\s,])max-age\s*=\s*(\d+)/i.exec(header);
  if (match?.[1] === undefined) {
    return undefined;
  }
  const seconds = Number.parseInt(match[1], 10);
  return Number.isFinite(seconds) ? seconds : undefined;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function assertNonEmptyString(value: string, fieldName: string): void {
  if (value.length === 0) {
    throw new TypeError(`${fieldName} is required`);
  }
}

function assertUrlBatch(urls: string[]): void {
  if (urls.length < 1 || urls.length > 1000) {
    throw new TypeError("urls must contain between 1 and 1000 items");
  }
}

function toRefreshPayload(
  params: RefreshProductsParams,
): ProgrammaticProductRefreshRequest {
  if (params.targets.length < 1 || params.targets.length > 500) {
    throw new TypeError("targets must contain between 1 and 500 items");
  }

  return {
    targets: params.targets.map((target, index) =>
      toRefreshTargetPayload(target, index),
    ),
  };
}

function toRefreshTargetPayload(
  target: ProductRefreshTarget,
  index: number,
): ProductRefreshTarget {
  const fieldPrefix = `targets[${String(index)}]`;
  const hasUrl = target.url !== undefined;
  const hasUuid = target.uuid !== undefined;
  if (Number(hasUrl) + Number(hasUuid) !== 1) {
    throw new TypeError(
      `Exactly one of ${fieldPrefix}.url or ${fieldPrefix}.uuid is required`,
    );
  }

  const payload: ProductRefreshTarget = {};
  if (target.url !== undefined) {
    assertNonEmptyString(target.url, `${fieldPrefix}.url`);
    payload.url = target.url;
  }
  if (target.uuid !== undefined) {
    assertNonEmptyString(target.uuid, `${fieldPrefix}.uuid`);
    payload.uuid = target.uuid;
  }
  if (target.catalog !== undefined) {
    assertNonEmptyString(target.catalog, `${fieldPrefix}.catalog`);
    payload.catalog = target.catalog;
  }
  return payload;
}

function toSearchPayload(
  params: SearchProductsParams,
): ProgrammaticProductSearchRequest {
  if (params.catalog !== undefined) {
    assertNonEmptyString(params.catalog, "catalog");
  }
  const limit = params.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new TypeError("limit must be an integer between 1 and 100");
  }

  const payload: ProgrammaticProductSearchRequest = { limit };
  if (params.catalog !== undefined) {
    payload.catalog = params.catalog;
  }
  if (params.cursor !== undefined) {
    payload.cursor = params.cursor;
  }
  if (params.facets !== undefined) {
    payload.facets = params.facets;
  }
  if (params.priceMax !== undefined) {
    payload.price_max = params.priceMax;
  }
  if (params.priceMin !== undefined) {
    payload.price_min = params.priceMin;
  }
  if (params.q !== undefined) {
    payload.q = params.q;
  }
  if (params.textSearchQuery !== undefined) {
    payload.text_search_query = toTextSearchQueryPayload(params.textSearchQuery);
  }
  return payload;
}

function toTextSearchQueryPayload(query: TextSearchQuery): TextSearchQueryPayload {
  const payload: TextSearchQueryPayload = {
    text: query.text,
  };
  if (query.brandQualityMax !== undefined) {
    payload.brand_quality_max = query.brandQualityMax;
  }
  if (query.brandQualityMin !== undefined) {
    payload.brand_quality_min = query.brandQualityMin;
  }
  if (query.brandSimilarityWeight !== undefined) {
    payload.brand_similarity_weight = query.brandSimilarityWeight;
  }
  if (query.browseMenuUuid !== undefined) {
    payload.browse_menu_uuid = query.browseMenuUuid;
  }
  if (query.compactMode !== undefined) {
    payload.compact_mode = query.compactMode;
  }
  if (query.exclusionFacets !== undefined) {
    payload.exclusion_facets = query.exclusionFacets;
  }
  if (query.facets !== undefined) {
    payload.facets = query.facets;
  }
  if (query.limit !== undefined) {
    payload.limit = query.limit;
  }
  if (query.priceMax !== undefined) {
    payload.price_max = query.priceMax;
  }
  if (query.priceMin !== undefined) {
    payload.price_min = query.priceMin;
  }
  if (query.rankingEmbeddingColumns !== undefined) {
    payload.ranking_embedding_columns = query.rankingEmbeddingColumns;
  }
  if (query.rankingText !== undefined) {
    payload.ranking_text = query.rankingText;
  }
  if (query.retrievalEmbeddingColumns !== undefined) {
    payload.retrieval_embedding_columns = query.retrievalEmbeddingColumns;
  }
  if (query.searchAfter !== undefined) {
    payload.search_after = query.searchAfter;
  }
  if (query.searchId !== undefined) {
    payload.search_id = query.searchId;
  }
  if (query.similarToBrands !== undefined) {
    payload.similar_to_brands = query.similarToBrands;
  }
  if (query.textSimilarityWeight !== undefined) {
    payload.text_similarity_weight = query.textSimilarityWeight;
  }
  return payload;
}

function toMoreLikeThisPayload(
  params: MoreLikeThisProductsParams,
): ProgrammaticMoreLikeThisRequest {
  if (params.catalog !== undefined) {
    assertNonEmptyString(params.catalog, "catalog");
  }

  const limit = params.limit ?? 12;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new TypeError("limit must be an integer between 1 and 100");
  }

  const payload: ProgrammaticMoreLikeThisRequest = {
    debug: params.debug ?? false,
    limit,
    price_preference: params.pricePreference ?? "any",
    source: toMoreLikeThisSourcePayload(params.source),
  };

  if (params.catalog !== undefined) {
    payload.catalog = params.catalog;
  }
  if (params.cursor !== undefined) {
    payload.cursor = params.cursor;
  }
  if (params.includeFacets !== undefined) {
    payload.include_facets = params.includeFacets;
  }
  if (params.excludeFacets !== undefined) {
    payload.exclude_facets = params.excludeFacets;
  }

  return payload;
}

function toMoreLikeThisSourcePayload(
  source: MoreLikeThisSource | null | undefined,
): MoreLikeThisSource {
  if (source === undefined || source === null) {
    throw new TypeError("source is required");
  }

  const hasUrl = source.url !== undefined;
  const hasUuid = source.uuid !== undefined;
  if (Number(hasUrl) + Number(hasUuid) !== 1) {
    throw new TypeError("Exactly one of source.url or source.uuid is required");
  }

  if (source.url !== undefined) {
    assertNonEmptyString(source.url, "source.url");
    return { url: source.url };
  }

  if (source.uuid === undefined) {
    throw new TypeError("Exactly one of source.url or source.uuid is required");
  }
  assertNonEmptyString(source.uuid, "source.uuid");
  return { uuid: source.uuid };
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new OctogenAPIError("Octogen API returned a non-JSON response", {
      cause: error,
      response,
      statusCode: response.status,
    });
  }
}

async function apiErrorFromResponse(response: Response): Promise<OctogenAPIError> {
  const detail = await errorDetail(response);
  const message = errorMessage(response, detail);
  const options = {
    detail,
    response,
    statusCode: response.status,
  };

  if (response.status === 401) {
    return new OctogenAuthenticationError(message, options);
  }
  if (response.status === 403) {
    return new OctogenForbiddenError(message, options);
  }
  if (response.status === 404) {
    return new OctogenNotFoundError(message, options);
  }
  if (response.status === 422) {
    return new OctogenValidationError(message, options);
  }
  return new OctogenAPIError(message, options);
}

async function errorDetail(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) {
    return undefined;
  }

  try {
    const data: unknown = JSON.parse(text);
    if (isRecord(data) && "detail" in data) {
      return data["detail"];
    }
    return data;
  } catch {
    return text;
  }
}

function errorMessage(response: Response, detail: unknown): string {
  if (typeof detail === "string" && detail.length > 0) {
    return detail;
  }
  if (!isEmptyDetail(detail)) {
    return `Octogen API request failed with status ${String(
      response.status,
    )}: ${formatDetail(detail)}`;
  }
  return `Octogen API request failed with status ${String(response.status)}`;
}

function isEmptyDetail(detail: unknown): boolean {
  if (detail === undefined || detail === null || detail === "") {
    return true;
  }
  if (Array.isArray(detail) && detail.length === 0) {
    return true;
  }
  return isRecord(detail) && Object.keys(detail).length === 0;
}

function formatDetail(detail: unknown): string {
  if (typeof detail === "string") {
    return detail;
  }
  return JSON.stringify(detail);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
