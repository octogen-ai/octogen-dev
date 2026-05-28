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
  MerchantCatalogSummary,
  MerchantProductListPage,
  MerchantProductUrlLookupResponse,
  ProgrammaticProductSearchRequest,
  SearchProductsParams,
  TextSearchQuery,
  TextSearchQueryPayload,
} from "./models.js";

export const DEFAULT_BASE_URL = "https://api.octogen.ai/v1";
export const DEFAULT_TIMEOUT_MS = 30_000;
export const SDK_VERSION = "0.1.0";
export const USER_AGENT = `octogen-ai-sdk-typescript/${SDK_VERSION}`;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface OctogenClientOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: FetchLike;
}

type HttpMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

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

  async listCatalogs(): Promise<MerchantCatalogSummary[]> {
    const data = await this.request("GET", "/catalogs");
    if (!Array.isArray(data)) {
      throw new OctogenAPIError("Expected catalog list response", {
        detail: data,
      });
    }
    return data as MerchantCatalogSummary[];
  }

  async lookupProduct(url: string): Promise<MerchantProductUrlLookupResponse> {
    assertNonEmptyString(url, "url");
    const data = await this.request("POST", "/products/lookup", { url });
    return data as MerchantProductUrlLookupResponse;
  }

  async searchProducts(params: SearchProductsParams): Promise<MerchantProductListPage> {
    const payload = toSearchPayload(params);
    const data = await this.request("POST", "/products/search", payload);
    return data as MerchantProductListPage;
  }

  private async request(
    method: HttpMethod,
    path: string,
    json?: object,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const init: RequestInit = {
        headers: this.headers(json !== undefined),
        method,
        signal: controller.signal,
      };
      if (json !== undefined) {
        init.body = JSON.stringify(json);
      }

      const response = await this.fetchFn(this.url(path), init);

      if (response.status >= 400) {
        throw await apiErrorFromResponse(response);
      }

      if (response.status === 204) {
        return undefined;
      }

      return await parseJsonResponse(response);
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

  private url(path: string): string {
    return `${this.baseUrl}/${path.replace(/^\/+/, "")}`;
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

function readEnvApiKey(): string | undefined {
  return typeof process === "undefined" ? undefined : process.env["OCTO_API_KEY"];
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function assertNonEmptyString(value: string, fieldName: string): void {
  if (value.length === 0) {
    throw new TypeError(`${fieldName} is required`);
  }
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
