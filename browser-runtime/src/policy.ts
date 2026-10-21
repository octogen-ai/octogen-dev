import { OPERATIONS, type OperationId } from "@octogen-ai/sdk";
import { CONTRACT, requestSchema, scalar, validate } from "../../cli/src/contract.js";
import type { Transport, TransportRequest } from "./protocol.js";

/** A profile of public read operations, not a second CLI command/schema registry. */
export const DEMO_OPERATIONS = [
  "searchProducts",
  "lookupProduct",
  "parseProductAlias",
  "moreLikeThisProducts",
  "getDomain",
  // `/brands/prefix` before `/brands/{brand}`, which would also match it.
  "searchBrandPrefix",
  "searchBrandsFromText",
  "searchSimilarBrands",
  "getBrandDetails",
  "browseBrandProducts",
  "getBrandTopCategories",
] as const satisfies readonly OperationId[];
/**
 * One already-normalized host: lowercase labels, at least one dot, no `www.`,
 * port, percent-encoding or path. Matched on the raw path segment, so nothing
 * decodes into a different route, and it names one host — never a list.
 */
const NORMALIZED_HOST =
  /^(?!www\.)(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
/**
 * A brand name or slug, decoded: no separator, dot segment or control
 * character, so the server routes it to the same operation the policy checked.
 */
function isBrandSegment(value: string): boolean {
  return (
    value.trim().length > 0 &&
    value !== "." &&
    value !== ".." &&
    !/[/\\]/.test(value) &&
    !Array.from({ length: value.length }, (_, index) => value.charCodeAt(index)).some(
      (code) => code < 0x20 || code === 0x7f,
    )
  );
}
/**
 * The query an operation declares, typed from its contract schema. Unknown or
 * repeated names, and integers that are not plain digits, are denied.
 */
function queryParams(operation: OperationId, url: URL): Record<string, unknown> {
  const declared = new Map(
    (CONTRACT.operations[operation]?.parameters ?? [])
      .filter((parameter) => parameter.in === "query")
      .map((parameter) => [parameter.name, scalar(parameter.schema)]),
  );
  // Exactly the serialization the SDK produces, so `?`, `&&` or odd escapes
  // cannot carry anything the checks below did not see.
  if (url.searchParams.toString() !== url.search.slice(1))
    throw new Error("Browser policy: query parameters denied");
  const query: Record<string, unknown> = {};
  for (const [name, value] of url.searchParams) {
    const schema = declared.get(name);
    if (schema === undefined || name in query)
      throw new Error("Browser policy: query parameters denied");
    if (schema.type === "integer") {
      if (!/^(0|[1-9][0-9]{0,5})$/.test(value))
        throw new Error("Browser policy: query parameters denied");
      query[name] = Number(value);
    } else query[name] = value;
  }
  return query;
}
/** Match a contract path template; `{name}` takes one non-empty segment. */
function routeParams(
  pathname: string,
  template: string,
): Record<string, string> | null {
  const names: string[] = [];
  const pattern = template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    names.push(name);
    return "([^/]+)";
  });
  const match = new RegExp(`^/v1${pattern}$`).exec(pathname);
  if (!match) return null;
  return Object.fromEntries(names.map((name, index) => [name, match[index + 1] ?? ""]));
}
export function checkDemoRequest(request: TransportRequest): OperationId {
  const url = new URL(request.url);
  if (
    url.origin !== "https://api.storerouter.ai" ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new Error("Browser policy: destination denied");
  let params: Record<string, string> = {};
  const operation = DEMO_OPERATIONS.find((id) => {
    const route = OPERATIONS[id];
    if (request.method !== route.method) return false;
    const matched = routeParams(url.pathname, route.path);
    if (matched) params = matched;
    return matched !== null;
  });
  if (!operation) throw new Error("Browser policy: operation denied");
  // Only the query parameters the operation declares, so nothing is smuggled
  // through raw api.
  const query = queryParams(operation, url);
  if (operation === "getDomain") {
    // One store's snapshot, by exactly one normalized host; never a list.
    if (!NORMALIZED_HOST.test(params["host"] ?? ""))
      throw new Error("Browser policy: host denied");
  }
  if (request.method === "GET") {
    if (request.body !== undefined) throw new Error("Browser policy: GET body denied");
    const decoded: Record<string, string> = {};
    for (const [name, value] of Object.entries(params)) {
      try {
        decoded[name] = decodeURIComponent(value);
      } catch {
        throw new Error("Browser policy: path denied");
      }
    }
    if (decoded["brand"] !== undefined && !isBrandSegment(decoded["brand"]))
      throw new Error("Browser policy: brand denied");
    validate(requestSchema(operation), { ...decoded, ...query }, "request");
    return operation;
  }
  const body: unknown = JSON.parse(request.body ?? "null");
  validate(requestSchema(operation), body, "body");
  // Lookup's auto/refresh modes can populate or refresh server-side caches.
  if (operation === "lookupProduct" || operation === "parseProductAlias") {
    const lookup = body as Record<string, unknown>;
    if (
      lookup["resolutionMode"] !== "index_only" ||
      (lookup["onDemandCachePolicy"] !== undefined &&
        lookup["onDemandCachePolicy"] !== "prefer_cache")
    ) {
      throw new Error("Browser policy: lookup requires --resolution-mode index_only");
    }
  }
  return operation;
}
/** Host owns the real transport (fixtures or future same-origin server proxy).
 * A production server MUST independently repeat this enforcement; client code is editable.
 */
export function withDemoPolicy(transport: Transport): Transport {
  return (request, signal) => {
    checkDemoRequest(request);
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(request.headers)) {
      if (["accept", "content-type", "if-none-match"].includes(name.toLowerCase()))
        headers[name] = value;
    }
    return transport({ ...request, headers }, signal);
  };
}
