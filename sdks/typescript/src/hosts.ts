/**
 * Host normalization, shared by the covered-domain helpers.
 *
 * `GET /v1/domains` returns hosts already normalized by the server —
 * lowercased, with a leading `www.` stripped — so it reports `macys.com` and
 * never `www.macys.com`. Product URLs in the wild overwhelmingly *do* carry
 * `www.`, so comparing a raw URL host against that list reports a covered
 * merchant as uncovered: a silent false negative, not an error. Every
 * comparison in this SDK therefore runs both sides through
 * {@link normalizeHost} first.
 */

/**
 * Normalize a URL or bare host the way the server normalizes `source_hosts`.
 *
 * Accepts either a full URL (`https://www.Macys.com/p/x?y=1`) or a bare host
 * (`www.MACYS.com:443`). Returns `undefined` when no host can be read, so an
 * unparseable input can never accidentally match.
 */
export function normalizeHost(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  let host = hostFromUrl(trimmed) ?? hostFromAuthority(trimmed);
  if (host === undefined) {
    return undefined;
  }

  // Lowercase before stripping `www.`, so `WWW.Macys.com` normalizes to the
  // same key as `www.macys.com`. Trailing dots are the fully-qualified form of
  // the same host.
  host = host.toLowerCase().replace(/\.+$/, "");
  if (host.startsWith("www.")) {
    host = host.slice("www.".length);
  }
  return host.length === 0 ? undefined : host;
}

/**
 * Is `urlOrHost` covered by `hosts`?
 *
 * Both sides are normalized, so this answers correctly for a `www.` URL
 * against the apex-only list the server returns.
 *
 * `hosts` accepts either host strings or the `DomainEntry` objects
 * `GET /v1/domains` returns, because passing `response.domains` straight in is
 * the obvious first call and a helper whose entire purpose is preventing a
 * silent false negative must not answer `false` to it. Anything that is
 * neither is a `TypeError`: this function returns a boolean an agent uses to
 * decide whether to ever ask about a merchant again, so a shape it does not
 * understand has to be loud.
 *
 * Prefer {@link DomainCoverage} when you hold a whole snapshot — it indexes
 * the set once instead of rescanning it per call.
 */
export function isHostCovered(
  urlOrHost: string | null | undefined,
  hosts: Iterable<string | HostLike>,
): boolean {
  const host = normalizeHost(urlOrHost);
  if (host === undefined) {
    return false;
  }
  for (const candidate of hosts) {
    if (normalizeHost(hostOf(candidate)) === host) {
      return true;
    }
  }
  return false;
}

/** Anything carrying a `host`, which is what `GET /v1/domains` returns. */
export interface HostLike {
  host: string;
}

// `unknown` rather than `string | HostLike`: the declared parameter type is a
// documentation aid, and JavaScript callers (and `any`-typed data) reach this
// with whatever they actually have.
function hostOf(candidate: unknown): string {
  if (typeof candidate === "string") {
    return candidate;
  }
  if (typeof candidate === "object" && candidate !== null) {
    const host: unknown = (candidate as { host?: unknown }).host;
    if (typeof host === "string") {
      return host;
    }
  }
  throw new TypeError(
    "isHostCovered: every element of `hosts` must be a host string or an " +
      "object with a string `host` (a DomainEntry). Received: " +
      describe(candidate),
  );
}

function describe(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "object") {
    return `${Object.prototype.toString.call(value)} with keys [${Object.keys(
      value,
    ).join(", ")}]`;
  }
  return typeof value;
}

function hostFromUrl(value: string): string | undefined {
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return undefined;
  }
  try {
    // `URL#hostname` already strips the port and decodes IDNs to punycode.
    const hostname = new URL(value).hostname;
    return hostname.length === 0 ? undefined : hostname;
  } catch {
    return undefined;
  }
}

function hostFromAuthority(value: string): string | undefined {
  // A bare authority: `example.com`, `example.com:8443`, `[::1]:8443`. Reject
  // anything with a path or whitespace so a mangled URL is not read as a host.
  if (/[/\s?#@]/.test(value)) {
    return undefined;
  }
  const bracketed = /^\[(?<address>[^\]]+)\](?::\d+)?$/.exec(value);
  if (bracketed?.groups?.["address"] !== undefined) {
    return bracketed.groups["address"];
  }
  const [host] = value.split(":");
  return host !== undefined && host.length > 0 ? host : undefined;
}
