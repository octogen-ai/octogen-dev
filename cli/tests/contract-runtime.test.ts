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
