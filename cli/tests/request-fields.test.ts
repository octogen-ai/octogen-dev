/**
 * The request-field derivation, checked against the *committed contract
 * snapshot* rather than against the generated types.
 *
 * `src/fields.ts` already fails to compile when a published request field has
 * no entry — that is the fast half. This is the legible half, and it adds
 * something the type system cannot: it reads
 * `tests/fixtures/openapi/platform-v1.json` directly, so a field map that is in
 * sync with a *stale* generated type still fails. The two together mean a newly
 * published request field cannot be silently missed whether or not anyone
 * remembered to run `npm run codegen`.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { COMMAND_LIST } from "../src/commands/index.js";
import {
  CACHE_POLICIES,
  FIELD_MAPS,
  MATCH_MODES,
  PRICE_PREFERENCES,
  RESOLUTION_MODES,
  type FieldBinding,
} from "../src/fields.js";

const SNAPSHOT = fileURLToPath(
  new URL("../../tests/fixtures/openapi/platform-v1.json", import.meta.url),
);

interface Schema {
  properties?: Record<string, { enum?: string[]; $ref?: string; default?: unknown }>;
}

interface OpenApi {
  components: { schemas: Record<string, Schema> };
}

const contract = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as OpenApi;

function propertiesOf(schemaName: string): string[] {
  const schema = contract.components.schemas[schemaName];
  expect(schema, `${schemaName} is not in the contract snapshot`).toBeDefined();
  return Object.keys(schema?.properties ?? {}).sort();
}

function enumOf(schemaName: string, property: string): string[] {
  const schema = contract.components.schemas[schemaName];
  const field = schema?.properties?.[property];
  if (field?.enum !== undefined) {
    return [...field.enum];
  }
  // Some enums are a `$ref` to their own schema (`onDemandCachePolicy`).
  const ref = field?.$ref?.split("/").pop();
  const referenced = ref === undefined ? undefined : contract.components.schemas[ref];
  return [...((referenced as { enum?: string[] } | undefined)?.enum ?? [])];
}

/** Request schema → the field map that must cover it, exactly. */
const COVERAGE: { schema: string; map: string }[] = [
  { map: "lookupProduct", schema: "ProgrammaticProductLookupRequest" },
  { map: "searchProducts", schema: "ProgrammaticProductSearchRequest" },
  { map: "moreLikeThisProducts", schema: "ProgrammaticMoreLikeThisRequest" },
  { map: "resolveProductFromHtml", schema: "ProgrammaticResolveFromHtmlRequest" },
  { map: "refreshProducts", schema: "ProgrammaticProductRefreshRequest" },
  { map: "refreshTarget", schema: "ProgrammaticProductRefreshTarget" },
  { map: "startVoyage", schema: "VoyageStartRequest" },
];

describe("every published request field is accounted for", () => {
  for (const { map, schema } of COVERAGE) {
    it(`${schema} is fully covered by ${map}`, () => {
      const fields = FIELD_MAPS[map];
      expect(fields, `${map} is missing from FIELD_MAPS`).toBeDefined();
      const declared = Object.keys(fields ?? {}).sort();
      const published = propertiesOf(schema);

      const missing = published.filter((field) => !declared.includes(field));
      expect(
        missing,
        `${schema} gained ${missing.join(", ")}. Add a flag, or mark it ` +
          "unsupported() with a reason, in src/fields.ts.",
      ).toEqual([]);

      const stale = declared.filter((field) => !published.includes(field));
      expect(
        stale,
        `${map} names ${stale.join(", ")}, which the contract no longer has.`,
      ).toEqual([]);
    });
  }

  it("gives every field either a flag or a stated reason for not having one", () => {
    for (const [map, fields] of Object.entries(FIELD_MAPS)) {
      for (const [field, binding] of Object.entries(fields)) {
        const bound: FieldBinding = binding;
        if (bound.unsupported === undefined) {
          expect(bound.flag, `${map}.${field} has no flag`).not.toBe("");
          continue;
        }
        // A reason has to be a reason. The point of the list is that a reader
        // can tell whether the decision still holds.
        expect(
          bound.unsupported.length,
          `${map}.${field}'s reason is too short to be one`,
        ).toBeGreaterThan(30);
      }
    }
  });

  it("names a flag that the command actually accepts", () => {
    // Catches the drift that matters most in the other direction: a field map
    // claiming `--facet` on a command with no such flag.
    const commandFlags = new Map<string, Set<string>>();
    for (const command of COMMAND_LIST) {
      commandFlags.set(command.name, new Set(Object.keys(command.flags ?? {})));
    }
    const byMap: Record<string, string> = {
      lookupProduct: "lookup",
      moreLikeThisProducts: "similar",
      refreshProducts: "refresh",
      refreshTarget: "refresh",
      resolveProductFromHtml: "resolve",
      searchProducts: "search",
      startVoyage: "voyage",
    };

    for (const [map, fields] of Object.entries(FIELD_MAPS)) {
      const commandName = byMap[map];
      const flags =
        commandName === undefined ? undefined : commandFlags.get(commandName);
      expect(flags, `no command is mapped for ${map}`).toBeDefined();
      for (const [field, binding] of Object.entries(fields)) {
        const bound: FieldBinding = binding;
        if (bound.unsupported !== undefined || !bound.flag.startsWith("--")) {
          // Positionals and deliberate omissions have no flag to check.
          continue;
        }
        const name = bound.flag.replace(/^--/, "").split(" ")[0] ?? "";
        expect(
          flags?.has(name),
          `${map}.${field} claims --${name}, which ${String(commandName)} does not accept`,
        ).toBe(true);
      }
    }
  });
});

describe("enum values are derived from the contract, not copied by hand", () => {
  it("matches the contract's matchMode", () => {
    expect([...MATCH_MODES].sort()).toEqual(
      enumOf("ProgrammaticProductLookupRequest", "matchMode").sort(),
    );
  });

  it("matches the contract's resolutionMode", () => {
    expect([...RESOLUTION_MODES].sort()).toEqual(
      enumOf("ProgrammaticProductLookupRequest", "resolutionMode").sort(),
    );
  });

  it("matches the contract's onDemandCachePolicy", () => {
    expect([...CACHE_POLICIES].sort()).toEqual(
      enumOf("ProgrammaticProductLookupRequest", "onDemandCachePolicy").sort(),
    );
  });

  it("matches the contract's price_preference", () => {
    expect([...PRICE_PREFERENCES].sort()).toEqual(
      enumOf("ProgrammaticMoreLikeThisRequest", "price_preference").sort(),
    );
  });

  it("offers exactly those values through the flag, so no valid value is refused", () => {
    const lookup = COMMAND_LIST.find((command) => command.name === "lookup");
    expect(lookup?.flags?.["match-mode"]?.choices).toEqual(MATCH_MODES);
    expect(lookup?.flags?.["resolution-mode"]?.choices).toEqual(RESOLUTION_MODES);
    expect(lookup?.flags?.["on-demand-cache-policy"]?.choices).toEqual(CACHE_POLICIES);
  });
});
