import {
  MissingAPIKeyError,
  OctogenAPIError,
  OctogenAuthenticationError,
  OctogenConnectionError,
  OctogenForbiddenError,
  OctogenNotFoundError,
  OctogenValidationError,
} from "./errors.js";
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
  MoreLikeThisProductsParams,
  MoreLikeThisProductsResponse,
  MoreLikeThisSource,
  LookupProductOptions,
  MerchantProductListPage,
  MerchantProductUrlLookupResponse,
  ProgrammaticMoreLikeThisRequest,
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
export const SDK_VERSION = "0.2.0";
export const USER_AGENT = `octogen-ai-sdk-typescript/${SDK_VERSION}`;

/** The environment variable every Octogen document names. */
export const API_KEY_ENV_VAR = "OCTOGEN_PLATFORM_API_KEY";

/**
 * The name this SDK read before 0.2.0. Still honored so an existing checkout
 * keeps working, but it warns once per process and will be removed.
 */
export const DEPRECATED_API_KEY_ENV_VAR = "OCTO_API_KEY";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface OctogenClientOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: FetchLike;
}

type HttpMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

interface SendOptions {
  json?: object;
  query?: Record<string, string | number | undefined>;
  headers?: Record<string, string>;
}

export class OctogenClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: FetchLike;
  private readonly timeoutMs: number;

  constructor(options: OctogenClientOptions = {}) {
    const resolvedApiKey = options.apiKey ?? readEnvApiKey();
    if (!resolvedApiKey) {
      throw new MissingAPIKeyError();
    }

    this.apiKey = resolvedApiKey;
    this.baseUrl = trimTrailingSlash(options.baseUrl ?? DEFAULT_BASE_URL);
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
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
    const data = await this.request("POST", "/products/lookup", {
      url,
      resolutionMode,
      onDemandCachePolicy,
    });
    return data as MerchantProductUrlLookupResponse;
  }

  /** Schedule indexed products for a refresh crawl. */
  async refreshProducts(
    params: RefreshProductsParams,
  ): Promise<ProductRefreshResponse> {
    const payload = toRefreshPayload(params);
    const data = await this.request("POST", "/products/refresh", payload);
    return data as ProductRefreshResponse;
  }

  /**
   * List every host covered by an active crawled catalog.
   *
   * This is the coverage gate: match a page's host against this set before
   * sending its URL to {@link OctogenClient.lookupProduct}. The set is stable
   * and large, so cache it and revalidate with the returned `etag`:
   *
   * ```ts
   * let cached = await client.listDomains();
   * // ...later...
   * const fresh = await client.listDomains({ ifNoneMatch: cached.etag ?? undefined });
   * if (!fresh.notModified) cached = fresh;
   * ```
   */
  async listDomains(options: ListDomainsOptions = {}): Promise<ListDomainsResult> {
    const sendOptions: SendOptions = {};
    if (options.ifNoneMatch !== undefined) {
      sendOptions.headers = { "If-None-Match": options.ifNoneMatch };
    }
    const response = await this.send("GET", "/domains", sendOptions);
    const etag = response.headers.get("ETag");

    if (response.status === 304) {
      return { notModified: true, domains: null, etag };
    }

    const data = (await parseJsonResponse(response)) as ListDomainsResponse;
    return { notModified: false, domains: data.domains, etag };
  }

  /**
   * Resolve a product from HTML you already have — no index read, no fetch.
   *
   * Pass `url` whenever you know it. Without it the document must declare its
   * own canonical URL, and storefronts that encode a variant selection only in
   * the query string lose that identity.
   */
  async resolveProductFromHtml(
    params: ResolveProductFromHtmlParams,
  ): Promise<MerchantProductUrlLookupResponse> {
    assertNonEmptyString(params.html, "html");
    const payload: ProgrammaticResolveFromHtmlRequest = { html: params.html };
    if (params.url !== undefined) {
      assertNonEmptyString(params.url, "url");
      payload.url = params.url;
    }
    const data = await this.request("POST", "/products/resolve-from-html", payload);
    return data as MerchantProductUrlLookupResponse;
  }

  /**
   * Start — or join — a Voyager crawl and extraction run for a domain.
   *
   * Voyages are shared per domain: if one is already running for `domain` (or
   * the domain already has a live catalog) this joins it, consumes no quota,
   * and returns `joined: true`. Voyages take hours to days; poll
   * {@link OctogenClient.getVoyage} every five minutes or slower.
   */
  async startVoyage(domain: string): Promise<StartVoyageResult> {
    assertNonEmptyString(domain, "domain");
    const response = await this.send("POST", "/voyage", { json: { domain } });
    const task = (await parseJsonResponse(response)) as VoyageTask;
    return { task, joined: response.status === 200 };
  }

  /** List your organization's voyages, newest first, with its quota usage. */
  async listVoyages(params: ListVoyagesParams = {}): Promise<VoyageListResponse> {
    const data = await this.request("GET", "/voyage", undefined, {
      status: params.status,
      cursor: params.cursor,
      limit: params.limit,
    });
    return data as VoyageListResponse;
  }

  /**
   * Poll one voyage.
   *
   * A task that does not exist and a task belonging to another organization
   * are deliberately indistinguishable: both raise `OctogenNotFoundError`.
   */
  async getVoyage(taskId: string): Promise<VoyageTask> {
    const data = await this.request(
      "GET",
      `/voyage/${encodePathSegment(taskId, "taskId")}`,
    );
    return data as VoyageTask;
  }

  async searchProducts(params: SearchProductsParams): Promise<MerchantProductListPage> {
    const payload = toSearchPayload(params);
    const data = await this.request("POST", "/products/search", payload);
    return data as MerchantProductListPage;
  }

  async moreLikeThisProducts(
    params: MoreLikeThisProductsParams,
  ): Promise<MoreLikeThisProductsResponse> {
    const payload = toMoreLikeThisPayload(params);
    const data = await this.request("POST", "/products/more-like-this", payload);
    return data as MoreLikeThisProductsResponse;
  }

  /** Create a coverage URL list (returned in `provisioning`). */
  async createCoverageUrlList(name: string): Promise<CoverageUrlList> {
    assertNonEmptyString(name, "name");
    const data = await this.request("POST", "/coverage/url-lists", { name });
    return data as CoverageUrlList;
  }

  /** List your organization's coverage URL lists, newest first. */
  async listCoverageUrlLists(
    params: CoveragePaginationParams = {},
  ): Promise<CoverageUrlListPage> {
    const data = await this.request("GET", "/coverage/url-lists", undefined, {
      cursor: params.cursor,
      limit: params.limit,
    });
    return data as CoverageUrlListPage;
  }

  /** Get one coverage URL list by id. */
  async getCoverageUrlList(urlListId: string): Promise<CoverageUrlList> {
    const data = await this.request(
      "GET",
      `/coverage/url-lists/${encodePathSegment(urlListId, "urlListId")}`,
    );
    return data as CoverageUrlList;
  }

  /**
   * Delete a coverage URL list (returned in `delete_pending`). Deletion is
   * asynchronous and permanent: there is no grace window and no restore.
   */
  async deleteCoverageUrlList(urlListId: string): Promise<CoverageUrlList> {
    const data = await this.request(
      "DELETE",
      `/coverage/url-lists/${encodePathSegment(urlListId, "urlListId")}`,
    );
    return data as CoverageUrlList;
  }

  /** Add URLs to a list — an idempotent set-add with per-URL outcomes. */
  async addCoverageUrlListUrls(
    urlListId: string,
    urls: string[],
  ): Promise<CoverageUrlMutationResponse> {
    assertUrlBatch(urls);
    const data = await this.request(
      "POST",
      `/coverage/url-lists/${encodePathSegment(urlListId, "urlListId")}/urls`,
      { urls },
    );
    return data as CoverageUrlMutationResponse;
  }

  /** Remove URLs from a list — an idempotent set-remove. */
  async removeCoverageUrlListUrls(
    urlListId: string,
    urls: string[],
  ): Promise<CoverageUrlMutationResponse> {
    assertUrlBatch(urls);
    const data = await this.request(
      "POST",
      `/coverage/url-lists/${encodePathSegment(urlListId, "urlListId")}/urls/remove`,
      { urls },
    );
    return data as CoverageUrlMutationResponse;
  }

  /** Check which URLs are members of a list (normalized server-side). */
  async checkCoverageUrlListUrls(
    urlListId: string,
    urls: string[],
  ): Promise<CoverageContainsResponse> {
    assertUrlBatch(urls);
    const data = await this.request(
      "POST",
      `/coverage/url-lists/${encodePathSegment(urlListId, "urlListId")}/urls/contains`,
      { urls },
    );
    return data as CoverageContainsResponse;
  }

  /** Enumerate a list's URLs in stable insertion order. */
  async listCoverageUrlListUrls(
    urlListId: string,
    params: CoveragePaginationParams = {},
  ): Promise<CoverageUrlListUrlsPage> {
    const data = await this.request(
      "GET",
      `/coverage/url-lists/${encodePathSegment(urlListId, "urlListId")}/urls`,
      undefined,
      { cursor: params.cursor, limit: params.limit },
    );
    return data as CoverageUrlListUrlsPage;
  }

  private async request(
    method: HttpMethod,
    path: string,
    json?: object,
    query?: Record<string, string | number | undefined>,
  ): Promise<unknown> {
    const options: SendOptions = {};
    if (json !== undefined) {
      options.json = json;
    }
    if (query !== undefined) {
      options.query = query;
    }
    const response = await this.send(method, path, options);
    if (response.status === 204 || response.status === 304) {
      return undefined;
    }
    return await parseJsonResponse(response);
  }

  /**
   * Issue one request and return the raw `Response` with its body unread.
   *
   * `listDomains` needs the `ETag` header and the `304` status, and
   * `startVoyage` needs to tell `200` (joined) from `202` (dispatched), so the
   * status line is part of those contracts rather than an implementation
   * detail `request` can flatten away.
   */
  private async send(
    method: HttpMethod,
    path: string,
    options: SendOptions = {},
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const init: RequestInit = {
        headers: { ...this.headers(options.json !== undefined), ...options.headers },
        method,
        signal: controller.signal,
      };
      if (options.json !== undefined) {
        init.body = JSON.stringify(options.json);
      }

      const response = await this.fetchFn(this.url(path, options.query), init);

      if (response.status >= 400) {
        throw await apiErrorFromResponse(response);
      }

      return response;
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
      Authorization: `Bearer ${this.apiKey}`,
      "User-Agent": USER_AGENT,
    };
    if (hasJsonBody) {
      headers["Content-Type"] = "application/json";
    }
    return headers;
  }
}

let warnedDeprecatedEnvVar = false;

function readEnvApiKey(): string | undefined {
  if (typeof process === "undefined") {
    return undefined;
  }

  const primary = process.env[API_KEY_ENV_VAR];
  if (primary !== undefined && primary.length > 0) {
    return primary;
  }

  const deprecated = process.env[DEPRECATED_API_KEY_ENV_VAR];
  if (deprecated !== undefined && deprecated.length > 0) {
    if (!warnedDeprecatedEnvVar) {
      warnedDeprecatedEnvVar = true;
      console.warn(
        `[octogen] ${DEPRECATED_API_KEY_ENV_VAR} is deprecated and will be ` +
          `removed in a future release. Rename it to ${API_KEY_ENV_VAR}, which ` +
          `is the name used by every Octogen document and by the Octogen CLI.`,
      );
    }
    return deprecated;
  }

  return undefined;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function assertNonEmptyString(value: string, fieldName: string): void {
  if (value.length === 0) {
    throw new TypeError(`${fieldName} is required`);
  }
}

function encodePathSegment(value: string, fieldName: string): string {
  const trimmed = value.trim();
  assertNonEmptyString(trimmed, fieldName);
  return encodeURIComponent(trimmed);
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
