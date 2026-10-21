/** Transient, caller-reported metadata. Wire field names match the API. */
export type RequestTrigger =
  | "user_search"
  | "page_load"
  | "filter_change"
  | "pagination"
  | "autoplay"
  | "prefetch"
  | "isr_refresh"
  | "background";

export type VisitorClassification =
  "likely_human" | "verified_bot" | "suspected_bot" | "unknown";

export interface RequestVisitor {
  classification?: VisitorClassification | null;
  provider?: string | null;
  bot_name?: string | null;
}

/** Only stable application metadata may be reused by a client. */
export interface RequestContextDefaults {
  application?: string | null;
  feature?: string | null;
  trigger?: RequestTrigger | null;
}

export interface RequestContext extends RequestContextDefaults {
  user_id?: string | null;
  session_id?: string | null;
  page_view_id?: string | null;
  user_agent?: string | null;
  visitor?: RequestVisitor | null;
}

export interface RequestOptions {
  /** Omit to inherit stable defaults; null suppresses the whole header. */
  context?: RequestContext | null;
}

export const REQUEST_CONTEXT_HEADER = "X-Octogen-Request-Context";
export const MAX_CONTEXT_HEADER_BYTES = 4096;

/** Never include caller values or unknown field names in validation errors. */
export class InvalidRequestContext extends TypeError {
  constructor() {
    super("Invalid RequestContext");
    this.name = "InvalidRequestContext";
  }
}

const stableFields = ["application", "feature", "trigger"];
const contextFields = [
  ...stableFields,
  "user_id",
  "session_id",
  "page_view_id",
  "user_agent",
  "visitor",
];
const visitorFields = ["classification", "provider", "bot_name"];
const triggers: readonly string[] = [
  "user_search",
  "page_load",
  "filter_change",
  "pagination",
  "autoplay",
  "prefetch",
  "isr_refresh",
  "background",
];
const classifications: readonly string[] = [
  "likely_human",
  "verified_bot",
  "suspected_bot",
  "unknown",
];

function snapshot(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidRequestContext();
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new InvalidRequestContext();
  const result: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    if (!fields.includes(key)) throw new InvalidRequestContext();
    // Optional undefined is omission in JavaScript; explicit null stays null.
    if (field === undefined) continue;
    if (key === "visitor" && field !== null) {
      result[key] = snapshot(field, visitorFields);
      continue;
    }
    if (field !== null) {
      if (
        typeof field !== "string" ||
        !validString(field, key === "user_agent" ? 1024 : 256)
      ) {
        throw new InvalidRequestContext();
      }
      if (key === "trigger" && !triggers.includes(field))
        throw new InvalidRequestContext();
      if (key === "classification" && !classifications.includes(field))
        throw new InvalidRequestContext();
    }
    result[key] = field;
  }
  return result;
}

// Count code points (the Python/API contract), rather than UTF-16 units or
// grapheme clusters. Reject unpaired surrogates as Pydantic does.
function validString(value: string, limit: number): boolean {
  let length = 0;
  for (const char of value) {
    const point = char.codePointAt(0) ?? 0;
    if (++length > limit || (point >= 0xd800 && point <= 0xdfff)) return false;
  }
  return true;
}

function serialize(value: Record<string, unknown>): string {
  // Escape UTF-16 code units, including surrogate pairs, just like Python's
  // ensure_ascii. The resulting ASCII length is its exact byte length.
  const header = JSON.stringify(value).replace(
    /[\u007f-\uffff]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
  if (header.length > MAX_CONTEXT_HEADER_BYTES) throw new InvalidRequestContext();
  return header;
}

export function snapshotDefaults(
  value: RequestContextDefaults | undefined,
): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  const result = snapshot(value, stableFields);
  serialize(result);
  return result;
}

export function contextHeader(
  defaults: Record<string, unknown> | undefined,
  context: RequestContext | null | undefined,
): string | undefined {
  if (context === null) return undefined;
  if (context === undefined)
    return defaults === undefined ? undefined : serialize(defaults);
  return serialize({ ...defaults, ...snapshot(context, contextFields) });
}
