/**
 * `octogen resolve --html <file|-> [--url <url>]` — resolve a product from HTML
 * you already have.
 *
 * **The HTML never comes from an argument.** Not as a convenience omission: the
 * server's cap is 5 MiB, argv on Linux is bounded at ~128 KiB per entry, and a
 * multi-megabyte argv entry that *did* fit would be echoed into the agent
 * transcript that invoked it, into `ps` output, and into shell history. A file
 * path or stdin is the only channel that works at the size the endpoint accepts.
 */

import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import type { MerchantProductUrlLookupResponse } from "@octogen-ai/sdk";

import { call } from "../client.js";
import type { CommandContext } from "../context.js";
import { ExitCode, noResult, usageError } from "../exit.js";
import type { CommandSpec } from "../registry.js";

/** The server's own cap, checked here so 6 MiB is not uploaded to be refused. */
const MAX_HTML_BYTES = 5 * 1024 * 1024;

async function runResolve(context: CommandContext): Promise<ExitCode> {
  const { args, writer } = context;
  const source = args.string("html");
  if (source === undefined) {
    throw usageError(
      "octogen resolve requires --html <file>, or --html - to read stdin.",
      "missing_option_value",
    );
  }
  if (context.positionals.length > 0) {
    throw usageError(
      "octogen resolve reads HTML from --html <file> or --html -, never from an " +
        "argument: the body cap is 5 MiB and argv is the wrong channel for it.",
      "too_many_arguments",
    );
  }

  const html = readHtml(source, context.cwd, context.readStdin);
  const bytes = Buffer.byteLength(html, "utf8");
  if (bytes === 0) {
    throw usageError(
      `${source === "-" ? "stdin" : source} is empty; there is no HTML to resolve.`,
      "unreadable_input",
    );
  }
  if (bytes > MAX_HTML_BYTES) {
    throw usageError(
      `HTML is ${String(Math.round(bytes / 1024))} KiB; the server caps the ` +
        `body at 5 MiB. Not sending it.`,
      "input_too_large",
    );
  }

  const url = args.string("url");
  if (url === undefined) {
    // Not an error — the page may declare its own canonical URL — but worth
    // saying, because without it a storefront that encodes the selected variant
    // in the query string loses that identity, and resolution can fail outright.
    writer.problem({
      code: "no_source_url",
      fix: "octogen resolve --html page.html --url <the page's URL>",
      message:
        "No --url given. Pass the page's own URL when you have it: it anchors " +
        "relative images and JSON-LD selection, and is the only " +
        "variant-qualified identity the response can keep.",
      severity: "info",
    });
  }

  const api = context.api();
  writer.trace(`resolving ${String(bytes)} bytes of HTML from ${source}`);

  let response: MerchantProductUrlLookupResponse;
  try {
    response = await call(api, "POST /products/resolve-from-html", () =>
      api.client.resolveProductFromHtml({
        html,
        ...(url === undefined ? {} : { url }),
      }),
    );
  } catch (error) {
    throw unresolvableOrRethrow(error, source, url);
  }

  const product = response.product;
  writer.emit({
    command: context.command,
    data: {
      source: response.source,
      bytes,
      requestedUrl: response.requestedUrl ?? url ?? null,
      canonicalUrl: response.canonicalUrl ?? null,
      resolution: response.resolution ?? null,
      product: {
        title: product.title ?? null,
        brand: product.brand?.name ?? null,
        currentPrice: product.currentPrice ?? null,
        currency: product.currency ?? null,
        imageCount: product.images?.length ?? 0,
        variantCount: product.variants?.length ?? 0,
      },
      full: product,
      warnings: response.warnings ?? [],
    },
    exitCode: ExitCode.Success,
    human: () =>
      [
        product.title ?? "(untitled)",
        `  brand       ${product.brand?.name ?? "—"}`,
        `  price       ${product.currentPrice === null || product.currentPrice === undefined ? "—" : String(product.currentPrice)}`,
        `  from        ${String(bytes)} bytes of HTML`,
        `  method      ${response.resolution?.method ?? "—"} (${response.resolution?.completeness ?? "—"})`,
        ...(response.resolution?.missingFields === undefined ||
        response.resolution.missingFields.length === 0
          ? []
          : [`  missing     ${response.resolution.missingFields.join(", ")}`]),
      ].join("\n"),
    ok: true,
  });
  return ExitCode.Success;
}

function readHtml(source: string, cwd: string, readStdin: () => string): string {
  if (source === "-") {
    try {
      return readStdin();
    } catch (error) {
      throw usageError(
        `Cannot read HTML from stdin: ${message(error)}`,
        "unreadable_input",
      );
    }
  }
  const path = resolvePath(cwd, source);
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    throw usageError(`Cannot read ${path}: ${message(error)}`, "unreadable_input");
  }
}

/**
 * `404 product_not_found` here means the document did not describe a product —
 * a miss, `6`. The most common cause is a page with no canonical URL and no
 * `--url`, so the remediation says so.
 */
function unresolvableOrRethrow(
  error: unknown,
  source: string,
  url: string | undefined,
): unknown {
  if (typeof error !== "object" || error === null) {
    return error;
  }
  const status: unknown = (error as { status?: unknown }).status;
  const code: unknown = (error as { code?: unknown }).code;
  if (status === 404 && code === "product_not_found") {
    return noResult({
      answeredWith: "404 product_not_found from POST /products/resolve-from-html",
      code: "product_not_found",
      data: { html: source },
      message:
        "No product could be resolved from that HTML." +
        (url === undefined
          ? " The page declared no canonical URL (JSON-LD url, og:url, or link rel=canonical); pass --url."
          : ""),
      ...(url === undefined
        ? { remediation: { command: `octogen resolve --html ${source} --url <url>` } }
        : {}),
      serverAnswered: true,
    });
  }
  return error;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const resolveCommand = {
  flags: {
    html: {
      describe: "Path to a file of product-page HTML, or - for stdin.",
      kind: "string",
      placeholder: "file|-",
    },
    url: {
      describe:
        "The page's own URL. Strongly recommended: anchors relative images and keeps variant identity.",
      kind: "string",
      placeholder: "url",
    },
  },
  name: "resolve",
  notes: [
    "Stateless: no index read, no outbound fetch, no caching. The answer comes",
    "entirely from the document you submit.",
    "",
    "HTML is never taken from an argument — the cap is 5 MiB and argv is the",
    "wrong channel for a payload that size, quite apart from what a",
    "multi-megabyte argv entry does to an agent transcript.",
    "",
    "Requires an API key.",
  ],
  operations: ["resolveProductFromHtml"] as const,
  run: runResolve,
  summary: "Resolve a product from page HTML you already have",
  usage: "resolve --html <file|-> [--url <url>]",
} satisfies CommandSpec;
