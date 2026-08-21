/**
 * Secret hygiene, asserted in **both directions**.
 *
 * An absence-only test — "the secret does not appear in the output" — passes
 * just as happily when redaction has eaten the whole field, and a redaction
 * layer that erases `auth.keyPrefix` breaks `status`'s output contract while
 * looking green. So every case here checks that the secret is gone *and* that
 * the safe identifier survived.
 */

import { describe, expect, it } from "vitest";

import { keyPrefixOf, looksLikeApiKey, REDACTED, Redactor } from "../src/redact.js";

/**
 * A key of the exact minted shape: `octo_live_<32 hex>_<43 char secret>`, which
 * is `secrets.token_urlsafe(32)` on the server.
 */
const KEY_ID = "3f9c1a2b4d5e6f708192a3b4c5d6e7f8";
const SECRET = "sZ9wQ1x-Yv3TbN7mK2pRdL4gH6jF8cA0eU5iO1yW3qE";
const KEY = `octo_live_${KEY_ID}_${SECRET}`;
const PREFIX = `octo_live_${KEY_ID}`;

describe("keyPrefixOf", () => {
  it("keeps the first two segments — the value the API keys UI shows", () => {
    expect(keyPrefixOf(KEY)).toBe(PREFIX);
  });

  it("refuses anything that is not a minted key", () => {
    expect(keyPrefixOf("octo_live_short_abc")).toBeUndefined();
    expect(keyPrefixOf(PREFIX)).toBeUndefined();
    expect(keyPrefixOf("sk-openai-whatever")).toBeUndefined();
    expect(keyPrefixOf("")).toBeUndefined();
    // Non-hex key id: the minting pattern is 32 hex characters exactly.
    expect(keyPrefixOf(`octo_live_${"z".repeat(32)}_${SECRET}`)).toBeUndefined();
  });

  it("accepts a test-environment key too", () => {
    expect(keyPrefixOf(`octo_test_${KEY_ID}_${SECRET}`)).toBe(`octo_test_${KEY_ID}`);
  });
});

describe("Redactor", () => {
  it("degrades a leaked full key to its prefix, not to [redacted]", () => {
    const redactor = new Redactor();
    const output = redactor.redact(`the key is ${KEY} ok`);
    expect(output).not.toContain(SECRET);
    expect(output).toContain(PREFIX);
    expect(output).toBe(`the key is ${PREFIX} ok`);
  });

  it("leaves a bare prefix alone, which `status` depends on", () => {
    // The wrong first implementation — `octo_(live|test)_[A-Za-z0-9_]+` — would
    // redact this, and the pressure to fix *that* would be pressure to weaken
    // the one control that keeps a secret out of an agent transcript.
    const redactor = new Redactor();
    expect(redactor.redact(`"keyPrefix":"${PREFIX}"`)).toBe(`"keyPrefix":"${PREFIX}"`);
  });

  it("redacts a registered secret outright", () => {
    const redactor = new Redactor();
    // A PKCE `code_verifier` is just base64url; no pattern can tell it from a
    // pagination cursor, so it is registered rather than matched.
    redactor.register("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk");
    const output = redactor.redact(
      "verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
    );
    expect(output).toBe(`verifier=${REDACTED}`);
  });

  it("registers a full key as its secret segment, so the prefix rule still fires", () => {
    const redactor = new Redactor();
    redactor.register(KEY);
    const output = redactor.redact(`Authorization used ${KEY}`);
    expect(output).not.toContain(SECRET);
    expect(output).toContain(PREFIX);
  });

  it("redacts a bare secret segment even without the prefix around it", () => {
    const redactor = new Redactor();
    redactor.register(KEY);
    expect(redactor.redact(`leaked: ${SECRET}`)).toBe(`leaked: ${REDACTED}`);
  });

  it("ignores a registration too short to replace safely", () => {
    const redactor = new Redactor();
    redactor.register("abc");
    expect(redactor.registeredCount).toBe(0);
    expect(redactor.redact("abcdef")).toBe("abcdef");
  });

  it("replaces any Authorization header value outright", () => {
    const redactor = new Redactor();
    expect(redactor.redact(`authorization: Bearer ${KEY}`)).toBe(
      `authorization: ${REDACTED}`,
    );
    expect(redactor.redact("Authorization=Bearer whatever")).toBe(
      `Authorization=${REDACTED}`,
    );
  });

  it("redacts inside a stack trace, which is the leak nobody plans for", () => {
    const redactor = new Redactor();
    redactor.register(KEY);
    const error = new Error(`request failed for key ${KEY}`);
    const redacted = redactor.redact(error.stack ?? error.message);
    expect(redacted).not.toContain(SECRET);
    expect(redacted).toContain(PREFIX);
  });

  it("redacts nested structures without changing their shape", () => {
    const redactor = new Redactor();
    const value = redactor.redactValue({
      auth: { keyPrefix: PREFIX, token: KEY },
      items: [{ note: `key ${KEY}` }],
      limit: 3,
      nothing: null,
    });
    expect(value).toEqual({
      auth: { keyPrefix: PREFIX, token: PREFIX },
      items: [{ note: `key ${PREFIX}` }],
      limit: 3,
      nothing: null,
    });
  });

  it("redacts every occurrence, not just the first", () => {
    const redactor = new Redactor();
    expect(redactor.redact(`${KEY} and ${KEY}`)).toBe(`${PREFIX} and ${PREFIX}`);
  });
});

describe("looksLikeApiKey", () => {
  it("is the preflight that stops a malformed key reaching the API", () => {
    expect(looksLikeApiKey(KEY)).toBe(true);
    expect(looksLikeApiKey(`  ${KEY}  `)).toBe(true);
    expect(looksLikeApiKey(PREFIX)).toBe(false);
    expect(looksLikeApiKey("octo_live_")).toBe(false);
    expect(looksLikeApiKey("please paste your key here")).toBe(false);
  });
});
