import { assertOperationCoverage } from "../src/contract-coverage.js";
import { describe, expect, it } from "vitest";
import { Args, parseArgs } from "../src/args.js";
import {
  assertBindings,
  CONTRACT,
  contractFlags,
  contractRequest,
  requestSchema,
  scalar,
  validate,
  type Contract,
  type RequestOperation,
} from "../src/contract.js";
import { SEARCH_FIELDS, LOOKUP_FIELDS, FIELD_MAPS } from "../src/fields.js";
import { COMMAND_LIST } from "../src/commands/index.js";
import { EXCLUDED_OPERATIONS, mappedOperations } from "../src/registry.js";
import { ExitCode } from "../src/exit.js";
import { runCli, TEST_KEY } from "./harness.js";

function mutation(): { contract: Contract; search: RequestOperation } {
  const contract = structuredClone(CONTRACT);
  const search = contract.operations["searchProducts"];
  if (search === undefined) throw new Error("fixture missing search");
  return { contract, search };
}
function build(argv: string[], contract: Contract = CONTRACT): Record<string, unknown> {
  const flags = contractFlags("searchProducts", SEARCH_FIELDS, contract);
  return contractRequest(
    "searchProducts",
    SEARCH_FIELDS,
    new Args(parseArgs(argv, flags)),
    { q: "dress" },
    contract,
  );
}

describe("contract mutations change runtime behavior", () => {
  it("requires a decision for added fields and rejects removed/excluded fields", () => {
    const { contract, search } = mutation();
    search.body.properties = {
      ...search.body.properties,
      currency: { type: "string" },
    };
    expect(() => {
      assertBindings("searchProducts", SEARCH_FIELDS, contract);
    }).toThrow("currency");
    delete search.body.properties["currency"];
    delete search.body.properties["debug"];
    expect(() => {
      assertBindings("searchProducts", SEARCH_FIELDS, contract);
    }).toThrow("debug");
  });
  it("rejects operation additions, removals, stale exclusions and changed SDK routes", () => {
    const { contract, search } = mutation();
    const check = () => {
      assertOperationCoverage(
        mappedOperations(COMMAND_LIST),
        EXCLUDED_OPERATIONS,
        contract,
      );
    };
    (contract.operations as Record<string, RequestOperation>)["newPublicOperation"] =
      structuredClone(search);
    expect(check).toThrow("newPublicOperation");
    delete (contract.operations as Record<string, RequestOperation>)[
      "newPublicOperation"
    ];
    delete (contract.operations as Record<string, RequestOperation>)["lookupProduct"];
    expect(check).toThrow("lookupProduct");
    expect(() => {
      assertOperationCoverage(mappedOperations(COMMAND_LIST), {
        ...EXCLUDED_OPERATIONS,
        retired: "A retired operation cannot remain excluded.",
      });
    }).toThrow("retired");
    search.path = "/renamed";
    expect(check).toThrow();
  });
  it("propagates type, bounds and defaults to parsing, help and SDK arguments", () => {
    const { contract, search } = mutation();
    search.body.properties = {
      ...search.body.properties,
      limit: {
        type: "integer",
        minimum: 2,
        maximum: 8,
        default: 7,
        description: "New page size",
      },
    };
    expect(build([], contract)["limit"]).toBe(7);
    expect(build(["--limit", "8"], contract)["limit"]).toBe(8);
    for (const value of ["1", "9", "2.5"])
      expect(() => build(["--limit", value], contract)).toThrow();
    expect(
      contractFlags("searchProducts", SEARCH_FIELDS, contract)["limit"]?.describe,
    ).toContain("New page size Default: 7. Minimum: 2. Maximum: 8.");
    search.body.properties["limit"] = { type: "string", default: "small" };
    expect(
      contractFlags("searchProducts", SEARCH_FIELDS, contract)["limit"]?.kind,
    ).toBe("string");
    expect(build(["--limit", "large"], contract)["limit"]).toBe("large");
  });
  it("propagates requiredness without inventing a value", () => {
    const { contract, search } = mutation();
    search.body.required = ["cursor"];
    expect(() => build([], contract)).toThrow("requires cursor");
    expect(build(["--cursor", "next"], contract)["cursor"]).toBe("next");
  });
  it("propagates enum changes and enforces them at the parser", () => {
    const contract = structuredClone(CONTRACT);
    const lookup = contract.operations["lookupProduct"];
    if (lookup === undefined) throw new Error("missing lookup");
    lookup.body.properties = {
      ...lookup.body.properties,
      matchMode: { type: "string", enum: ["new-mode"] },
    };
    const flags = contractFlags("lookupProduct", LOOKUP_FIELDS, contract);
    expect(() => parseArgs(["--match-mode", "strict"], flags)).toThrow();
    const args = new Args(parseArgs(["--match-mode", "new-mode"], flags));
    expect(
      contractRequest<Record<string, unknown>>(
        "lookupProduct",
        LOOKUP_FIELDS,
        args,
        { url: "https://example.com/p" },
        contract,
      )["matchMode"],
    ).toBe("new-mode");
  });
  it("validates nested facets, array limits and Unicode string length", () => {
    expect(() => {
      validate(
        requestSchema("searchProducts"),
        { facets: [{ name: "color", values: [1] }] },
        "search",
      );
    }).toThrow();
    expect(() => build(["--price-min", "-1"])).toThrow();
    expect(() => {
      validate({ type: "string", maxLength: 1 }, "😀", "query");
    }).not.toThrow();
    expect(() => {
      validate({ type: "array", maxItems: 1 }, [1, 2], "catalogs");
    }).toThrow();
  });
  it("validates uuid-format ids the way the server does", () => {
    const schema = requestSchema("retrieveProducts");
    expect(() => {
      validate(schema, { uuids: ["0c0e3bb8-965a-4f2d-919b-182e7a24efc9"] }, "retrieve");
    }).not.toThrow();
    expect(() => {
      validate(schema, { uuids: ["not-a-uuid"] }, "retrieve");
    }).toThrow("must be a UUID");
  });
  it("accounts for fields of every mapped operation, including parameters", () => {
    for (const operation of mappedOperations(COMMAND_LIST)) {
      const map = FIELD_MAPS[operation];
      expect(map).toBeDefined();
      assertBindings(operation, map ?? {});
    }
  });
});

describe("real dispatcher and SDK serialization", () => {
  it("parse and lookup send identical requests, including contract defaults", async () => {
    const options = [
      "https://example.com/p",
      "--match-mode",
      "strict",
      "--resolution-mode",
      "index_only",
    ];
    const a = await runCli({ argv: ["lookup", ...options, "--no-retry"] });
    const b = await runCli({ argv: ["parse", ...options, "--no-retry"] });
    expect(a.requests).toHaveLength(1);
    expect(a.requests[0]?.body).toEqual(b.requests[0]?.body);
    expect(a.requests[0]?.body).toEqual({
      url: "https://example.com/p",
      matchMode: "strict",
      resolutionMode: "index_only",
      onDemandCachePolicy: "prefer_cache",
    });
  });
  it("names parse, not lookup, in parse's help and usage errors", async () => {
    const help = await runCli({ argv: ["parse", "--help"] });
    expect(help.exitCode).toBe(ExitCode.Success);
    expect(help.stderr).toMatch(/^storerouter parse <url> /);
    expect(help.stderr).not.toContain("storerouter lookup");

    const missing = await runCli({ argv: ["parse"] });
    expect(missing.exitCode).toBe(ExitCode.Usage);
    expect(missing.json()["message"]).toBe(
      "storerouter parse <url> requires a product URL.",
    );
    // The JSON envelope keeps the canonical command, so agents see one shape.
    expect(missing.json()["command"]).toBe("lookup");

    const lookupHelp = await runCli({ argv: ["lookup", "--help"] });
    expect(lookupHelp.stderr).toMatch(/^storerouter lookup <url> /);
  });
  it("sends contract field names and defaults through the SDK, never camel-case wire keys", async () => {
    const result = await runCli({
      argv: [
        "search",
        "dress",
        "--price-min",
        "2",
        "--price-max",
        "9",
        "--catalog",
        "shop",
        "--facet",
        "color=red",
        "--facet",
        "color=blue",
        "--cursor",
        "next",
      ],
    });
    const body = result.requests[0]?.body;
    expect(body).toEqual({
      q: "dress",
      limit: 50,
      price_min: 2,
      price_max: 9,
      catalogs: ["shop"],
      facets: [{ name: "color", values: ["red", "blue"] }],
      cursor: "next",
    });
    validate(requestSchema("searchProducts"), body, "wire body");
  });
  it("catches contract bound violations before resolving credentials or sending requests", async () => {
    const result = await runCli({ argv: ["search", "dress", "--price-min", "-1"] });
    expect(result.exitCode).toBe(2);
    expect(result.requests).toHaveLength(0);
  });
});

it("every exposed first-class field reaches the SDK wire payload", async () => {
  const scenarios = [
    {
      operation: "lookupProduct",
      base: ["lookup", "https://example.com/p"],
      positional: { url: "https://example.com/p" },
    },
    {
      operation: "searchProducts",
      base: ["search", "dress"],
      positional: { q: "dress" },
    },
    {
      operation: "moreLikeThisProducts",
      base: ["similar", "https://example.com/p"],
      positional: { source: { url: "https://example.com/p" } },
    },
    {
      operation: "resolveProductFromHtml",
      base: ["resolve", "--html", "-"],
      positional: { html: "<html>product</html>" },
    },
  ];
  for (const scenario of scenarios) {
    const bindings = FIELD_MAPS[scenario.operation] ?? {};
    const properties = requestSchema(scenario.operation).properties ?? {};
    for (const [field, binding] of Object.entries(bindings)) {
      if (binding.unsupported !== undefined) continue;
      const property = scalar(properties[field] ?? {});
      let value: unknown =
        property.enum?.[0] ??
        property.default ??
        (property.type === "integer" || property.type === "number"
          ? (property.minimum ?? 1)
          : "sample");
      const argv = [...scenario.base, "--no-retry"];
      if (!binding.flag.startsWith("--") || binding.codec === "custom") {
        value =
          (scenario.positional as Record<string, unknown>)[field] ??
          "https://example.com/p";
        if (field === "url" && scenario.operation === "resolveProductFromHtml")
          argv.push("--url", String(value));
      } else if (binding.codec === "facets") {
        argv.push(binding.flag, "color=red");
        value = [{ name: "color", values: ["red"] }];
      } else if (property.type === "array") {
        argv.push(binding.flag, "shop");
        value = ["shop"];
      } else {
        argv.push(binding.flag, String(value));
      }
      const result = await runCli({
        argv,
        stdin: "<html>product</html>",
        env: { OCTOGEN_PLATFORM_API_KEY: TEST_KEY },
      });
      expect(
        result.requests,
        `${scenario.operation}.${field}: ${result.stdout}`,
      ).toHaveLength(1);
      const body = result.requests[0]?.body as Record<string, unknown>;
      expect(body[field], `${scenario.operation}.${field}`).toEqual(value);
      validate(requestSchema(scenario.operation), body, "wire body");
    }
  }
});

describe("anyOf diagnostics", () => {
  const nullable = (schema: import("../src/contract.js").Schema) => ({
    anyOf: [schema, { type: "null" }],
  });
  it.each([
    [{ type: "number", minimum: 0 }, -1, "must be at least 0"],
    [{ type: "integer", minimum: 1, maximum: 6 }, 7, "must be between 1 and 6"],
    [{ type: "string", minLength: 2 }, "x", "must have at least 2 characters"],
    [{ type: "string", maxLength: 1 }, "😀x", "must have at most 1 characters"],
    [{ type: "array", minItems: 1 }, [], "needs at least 1 entries"],
    [{ type: "array", maxItems: 1 }, [1, 2], "allows at most 1 entries"],
  ] as const)("retains nullable constraints: %j", (schema, value, message) => {
    expect(() => {
      validate(nullable(schema), value, "field");
    }).toThrow(`field ${message}`);
    expect(() => {
      validate(nullable(schema), null, "field");
    }).not.toThrow();
  });
  it("keeps array indices and nested facet paths without echoing input", () => {
    expect(() => {
      validate(
        requestSchema("searchProducts"),
        { facets: [{ name: "color", values: [123] }] },
        "search",
      );
    }).toThrow("search.facets[0].values[0] must be a string");
  });
  it("tries every genuine union branch and reports all compatible failures", () => {
    const schema = {
      anyOf: [
        { type: "number", maximum: 0 },
        { type: "number", minimum: 10 },
        { type: "string", minLength: 3 },
      ],
    };
    for (const value of [-1, 10, "abc"])
      expect(() => {
        validate(schema, value, "choice");
      }).not.toThrow();
    expect(() => {
      validate(schema, 5, "choice");
    }).toThrow("choice must be at most 0 or choice must be at least 10");
    expect(() => {
      validate(schema, "x", "choice");
    }).toThrow("choice must have at least 3 characters");
    expect(() => {
      validate(schema, false, "choice");
    }).toThrow("choice does not match the public request schema");
  });
  it("enforces union siblings and rejects an empty union", () => {
    expect(() => {
      validate({ ...nullable({ type: "string" }), maxLength: 1 }, "xx", "field");
    }).toThrow("at most 1 characters");
    expect(() => {
      validate({ anyOf: [] }, null, "field");
    }).toThrow();
    expect(() => {
      validate(
        { anyOf: [{ type: "null" }, { type: "number", minimum: 0 }] },
        -1,
        "field",
      );
    }).toThrow("field must be at least 0");
  });
  it("does not swallow runtime errors as alternative mismatches", () => {
    const failure = new TypeError("broken schema implementation");
    const branch = {
      get type(): string {
        throw failure;
      },
    };
    expect(() => {
      validate({ anyOf: [branch, {}] }, "value", "field");
    }).toThrow(failure);
  });
  it("preserves the JSON envelope, exit code and no-request behavior", async () => {
    const result = await runCli({
      argv: ["search", "dress", "--price-min", "-1", "--json"],
    });
    expect(result.exitCode).toBe(2);
    expect(result.requests).toHaveLength(0);
    const body = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(body).toMatchObject({
      ok: false,
      exitCode: 2,
      code: "invalid_option_value",
      message: "searchProducts.price_min must be at least 0",
    });
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
  });
});
