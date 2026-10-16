import { OPERATIONS, type OperationId } from "@octogen-ai/sdk";
import { requestSchema, validate } from "../../cli/src/contract.js";
import type { Transport, TransportRequest } from "./protocol.js";

/** A profile of public read operations, not a second CLI command/schema registry. */
export const DEMO_OPERATIONS = [
  "searchProducts",
  "lookupProduct",
  "parseProductAlias",
  "moreLikeThisProducts",
  "listDomains",
] as const satisfies readonly OperationId[];
export function checkDemoRequest(request: TransportRequest): OperationId {
  const url = new URL(request.url);
  if (
    url.origin !== "https://api.storerouter.ai" ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new Error("Browser policy: destination denied");
  const operation = DEMO_OPERATIONS.find((id) => {
    const route = OPERATIONS[id];
    return request.method === route.method && url.pathname === `/v1${route.path}`;
  });
  if (!operation) throw new Error("Browser policy: operation denied");
  // The current allowlist has no query inputs. Deny query smuggling through raw api.
  if (url.search) throw new Error("Browser policy: query parameters denied");
  if (operation === "listDomains") {
    if (request.body !== undefined) throw new Error("Browser policy: GET body denied");
  } else {
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
