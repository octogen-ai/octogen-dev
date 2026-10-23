import type { paths } from "./generated/types.js";

/**
 * The client's routing table: every `/v1` request this SDK can make.
 *
 * `path` is typed as `keyof paths` — a key of the *generated* contract — so a
 * method that names a route the published API does not define fails to compile.
 * That is the type-level half of the drift guard; the other half is
 * `tests/contract`, which fails when a published `operationId` has no entry
 * here (an operation the SDK cannot reach) or an entry names the wrong verb.
 *
 * Paths are contract templates, not URLs. `OctogenClient#request` substitutes
 * `{name}` placeholders from its `pathParams`, so the template stays
 * comparable to the contract verbatim.
 */
export type OperationPath = keyof paths;

export type HttpMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

export interface OperationDefinition {
  readonly method: HttpMethod;
  readonly path: OperationPath;
}

export const OPERATIONS = {
  addUrlListUrls: { method: "POST", path: "/coverage/url-lists/{urlListId}/urls" },
  browseBrandProducts: { method: "GET", path: "/brands/{brand}/products" },
  checkUrlListUrls: {
    method: "POST",
    path: "/coverage/url-lists/{urlListId}/urls/contains",
  },
  countProductFacets: { method: "POST", path: "/products/facet-counts" },
  createUrlList: { method: "POST", path: "/coverage/url-lists" },
  deleteUrlList: { method: "DELETE", path: "/coverage/url-lists/{urlListId}" },
  getBrandDetails: { method: "GET", path: "/brands/{brand}" },
  getBrandTopCategories: { method: "GET", path: "/brands/{brand}/top-categories" },
  getStore: { method: "GET", path: "/stores/{domain}" },
  getMe: { method: "GET", path: "/me" },
  getUrlList: { method: "GET", path: "/coverage/url-lists/{urlListId}" },
  listTaxonomyAttributeValues: {
    method: "GET",
    path: "/taxonomy/attributes/{handle}/values",
  },
  listTaxonomyAttributes: { method: "GET", path: "/taxonomy/attributes" },
  listTaxonomyCategories: { method: "GET", path: "/taxonomy/categories" },
  listUrlListUrls: { method: "GET", path: "/coverage/url-lists/{urlListId}/urls" },
  listUrlLists: { method: "GET", path: "/coverage/url-lists" },
  lookupProduct: { method: "POST", path: "/products/lookup" },
  moreLikeThisProducts: { method: "POST", path: "/products/more-like-this" },
  parseProductAlias: { method: "POST", path: "/products/parse" },
  removeUrlListUrls: {
    method: "POST",
    path: "/coverage/url-lists/{urlListId}/urls/remove",
  },
  resolveProductFromHtml: { method: "POST", path: "/products/resolve-from-html" },
  searchBrandPrefix: { method: "GET", path: "/brands/prefix" },
  searchBrandsFromText: { method: "POST", path: "/brands/search" },
  searchProducts: { method: "POST", path: "/products/search" },
  searchSimilarBrands: { method: "POST", path: "/brands/similar" },
  searchStores: { method: "POST", path: "/stores/search" },
} as const satisfies Record<string, OperationDefinition>;

export type OperationId = keyof typeof OPERATIONS;

/** Substitute `{name}` placeholders in a contract path template. */
export function resolveOperationPath(
  template: OperationPath,
  pathParams: Readonly<Record<string, string>> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = pathParams[name];
    if (value === undefined || value.trim().length === 0) {
      throw new TypeError(`${name} is required`);
    }
    return encodeURIComponent(value.trim());
  });
}
