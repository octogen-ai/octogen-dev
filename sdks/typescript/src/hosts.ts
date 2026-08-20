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
 */
export function isHostCovered(
  urlOrHost: string | null | undefined,
  hosts: Iterable<string>,
): boolean {
  const host = normalizeHost(urlOrHost);
  if (host === undefined) {
    return false;
  }
  for (const candidate of hosts) {
    if (normalizeHost(candidate) === host) {
      return true;
    }
  }
  return false;
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
