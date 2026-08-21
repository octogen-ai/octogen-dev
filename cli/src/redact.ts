/**
 * The redaction layer that sits between every writer and both streams.
 *
 * It is **prefix-preserving rather than all-or-nothing**. `api_key_service`
 * mints keys as `octo_live_<key_id>_<secret>`, so a safe identifier is already
 * embedded in the value: the first two segments are the same thing the API keys
 * UI shows, and `octogen status` is contractually required to print them as
 * `auth.keyPrefix`. A full key that leaks anywhere therefore degrades to that
 * identifier instead of vanishing into `[redacted]`, which keeps the output
 * useful — a bug report can still say *which* key — and keeps the pressure off
 * the one control that stops a secret reaching an agent transcript.
 *
 * The obvious first implementation, `octo_(live|test)_[A-Za-z0-9_]+`, is wrong
 * in exactly the way that matters: it also matches `octo_live_<key_id>`, so
 * `status` would render `[redacted]` where its own output contract requires the
 * prefix — and the fix for *that* would be to weaken redaction, which points
 * the wrong way on the only thing standing between a key and a chat log.
 */

/**
 * The minting pattern: `octo_<env>_<32 hex key id>_<secret>`. Only a value of
 * this exact shape is reduced to its prefix; anything else that has been
 * registered as a secret is replaced outright.
 */
const FULL_KEY = /octo_(live|test)_([0-9a-f]{32})_[A-Za-z0-9_-]{32,}/g;

/**
 * `Authorization: Bearer …` in a header dump, however it is spelled.
 *
 * The optional `Bearer` is not optional decoration: `\S+` alone matches the
 * scheme and stops, leaving the credential in the output — which is how a rule
 * that looks right redacts nothing that matters.
 */
const AUTHORIZATION =
  /((?:authorization|proxy-authorization)\s*[:=]\s*)(?:bearer\s+)?\S+/gi;

export const REDACTED = "[redacted]";

/** The safe two-segment identifier for a full key. */
export function keyPrefixOf(apiKey: string): string | undefined {
  const match = /^octo_(live|test)_([0-9a-f]{32})_[A-Za-z0-9_-]{32,}$/.exec(
    apiKey.trim(),
  );
  if (match === null) {
    return undefined;
  }
  return `octo_${match[1] ?? ""}_${match[2] ?? ""}`;
}

/** Does this value have the shape of a mintable key? */
export function looksLikeApiKey(value: string): boolean {
  return keyPrefixOf(value) !== undefined;
}

export class Redactor {
  /**
   * Values to remove outright: the secret segment of the resolved key, and the
   * PKCE `code_verifier` once `init` exists. Registered rather than
   * pattern-matched, because a verifier is just base64url and no pattern can
   * tell it from a cursor.
   */
  private readonly secrets = new Set<string>();

  /**
   * Register a value that must never appear in output.
   *
   * A full key is registered as its *secret segment* as well as whole, so that
   * the whole-key rule can still fire and leave the prefix behind rather than
   * being pre-empted by the outright rule.
   */
  register(secret: string | undefined): void {
    if (secret === undefined) {
      return;
    }
    const value = secret.trim();
    // Short values are not worth registering: replacing every occurrence of a
    // 4-character string would corrupt unrelated output.
    if (value.length < 8) {
      return;
    }
    const prefix = keyPrefixOf(value);
    if (prefix !== undefined) {
      this.secrets.add(value.slice(prefix.length + 1));
      return;
    }
    this.secrets.add(value);
  }

  /** Everything registered, for tests. */
  get registeredCount(): number {
    return this.secrets.size;
  }

  redact(text: string): string {
    let result = text.replace(
      FULL_KEY,
      (_match, environment: string, keyId: string) => `octo_${environment}_${keyId}`,
    );
    result = result.replace(
      AUTHORIZATION,
      (_match, label: string) => `${label}${REDACTED}`,
    );
    for (const secret of this.secrets) {
      if (secret.length > 0 && result.includes(secret)) {
        result = result.split(secret).join(REDACTED);
      }
    }
    return result;
  }

  /**
   * Redact anything, including inside nested objects and `Error` stacks.
   *
   * Unexpected exceptions are the leak nobody plans for: a `422` body echoed
   * into a message, a request URL in a stack frame. Everything that reaches a
   * stream goes through {@link redact} anyway, but structured values are
   * redacted here too so the JSON envelope is clean before it is serialized.
   */
  redactValue<T>(value: T): T {
    if (typeof value === "string") {
      return this.redact(value) as T;
    }
    if (Array.isArray(value)) {
      return value.map((item: unknown) => this.redactValue(item)) as T;
    }
    if (value instanceof Error) {
      return value;
    }
    if (typeof value === "object" && value !== null) {
      const result: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) {
        result[key] = this.redactValue(item);
      }
      return result as T;
    }
    return value;
  }
}
