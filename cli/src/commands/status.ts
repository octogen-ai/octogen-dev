/**
 * `octogen status` — D10. The command an agent parses to decide whether
 * onboarding worked, which makes its output a contract.
 *
 * Two rules do most of the work here.
 *
 * **The auth probe must be a key-required route, and `listDomains` is not one.**
 * That is the trap the keyless trial sets: `GET /v1/domains` now answers `200`
 * with no credential at all, so a `status` built on it would report a healthy
 * install to a caller that has no key — or an entitled org for a revoked one.
 * `status` probes `GET /v1/me`, which requires a key and returns identity.
 *
 * **`status` never mutates anything.** No key minting, no file writes, no cache
 * warming. It is the one command an agent can run in a loop without
 * consequence, subject to the rate limit it reports.
 *
 * Every field of the envelope is always present; unknown values are `null` with
 * a reason in `problems[]`, so an agent never has to distinguish "absent" from
 * "we could not tell".
 */

import type { MeRateLimit, MeResponse } from "@octogen-ai/sdk";

import type { KeySource } from "../auth.js";
import { call } from "../client.js";
import type { CommandContext } from "../context.js";
import { CliError, ExitCode } from "../exit.js";
import type { CommandSpec } from "../registry.js";
import { versionBlock, type VersionBlock } from "../version.js";

/** The only organization type `/v1` admits; "Developer" in the Platform UI. */
const DEVELOPER_ORG_TYPE = "catalog_partner";

interface AuthBlock {
  state: "ok" | "missing" | "unknown";
  source: KeySource;
  /**
   * The safe two-segment identifier, never the secret.
   *
   * CI asserts both that this is present and well-formed *and* that the key's
   * secret segment is absent from the whole of `status` output. An absence-only
   * test passes just as happily when redaction has eaten the field, which is
   * the failure this pair of assertions exists to catch.
   */
  keyPrefix: string | null;
  keyId: string | null;
  keySource: string | null;
  path: string | null;
}

interface OrgBlock {
  slug: string | null;
  name: string | null;
  type: string | null;
  typeLabel: string | null;
  principal: string | null;
  source: "api" | null;
}

interface ApiBlock {
  baseUrl: string;
  reachable: boolean | null;
  latencyMs: number | null;
  probe: string | null;
}

interface QuotaBlock {
  rateLimit: MeRateLimit | null;
}

interface StatusEnvelope extends Record<string, unknown> {
  cli: VersionBlock;
  auth: AuthBlock;
  org: OrgBlock;
  api: ApiBlock;
  quota: QuotaBlock;
  keyless: { active: boolean; remaining: number | null };
}

async function runStatus(context: CommandContext): Promise<ExitCode> {
  const { args, writer } = context;
  const cli = versionBlock();
  const api = context.api();
  const baseUrl = args.string("base-url") ?? "https://api.octogen.ai/v1";

  const auth: AuthBlock = {
    keyId: null,
    keyPrefix: api.key.keyPrefix ?? null,
    keySource: null,
    path: api.key.path ?? null,
    source: api.keyless ? "keyless" : api.key.source,
    state: api.keyless ? "missing" : "unknown",
  };
  const envelope: StatusEnvelope = {
    api: { baseUrl, latencyMs: null, probe: null, reachable: null },
    auth,
    cli,
    keyless: { active: api.keyless, remaining: null },
    org: nullOrg(),
    quota: { rateLimit: null },
  };

  if (args.flag("offline")) {
    envelope["offline"] = true;
    if (api.keyless) {
      // `--offline` reports local state, and locally there is no credential.
      // Still exit `3`: an agent branching on the code must get the same answer
      // to "am I onboarded?" whether or not the network was consulted.
      throw new CliError("No API key found (no network calls made).", {
        code: "no_credential",
        data: envelope,
        exitCode: ExitCode.NoCredential,
        remediation: { command: "octogen init" },
      });
    }
    writer.emit({
      command: context.command,
      data: envelope,
      exitCode: ExitCode.Success,
      human: () => renderOffline(cli, auth),
      // A key was found and not verified, which is all `--offline` claims.
      ok: true,
    });
    return ExitCode.Success;
  }

  if (api.keyless) {
    // No key at all. Reported, not probed: the keyless trial cannot answer the
    // identity question, and spending one of its 30 daily requests to be told
    // so would be spending it for nothing.
    writer.problem({
      code: "no_credential",
      fix: "octogen init",
      message:
        "No API key found. domains, lookup, and search work on the keyless " +
        "trial (30 requests/day per IP); everything else needs a key.",
      severity: "error",
    });
    throw new CliError("No usable credential.", {
      code: "no_credential",
      data: envelope,
      exitCode: ExitCode.NoCredential,
      remediation: { command: "octogen init" },
    });
  }

  const startedAt = performance.now();
  const me = await call(api, "GET /me", () => api.client.getMe());
  envelope.api = {
    baseUrl,
    latencyMs: Math.round(performance.now() - startedAt),
    probe: "GET /me",
    reachable: true,
  };
  auth.state = "ok";

  auth.keyId = me.key?.id ?? null;
  auth.keyPrefix = api.key.keyPrefix ?? me.key?.prefix ?? null;
  auth.keySource = me.key?.source ?? null;
  envelope.org = orgFrom(me);
  envelope.quota = { rateLimit: me.rateLimit ?? null };

  // The identity response must identify an entitled organization.
  const type = envelope.org.type;
  if (type !== null && type !== DEVELOPER_ORG_TYPE) {
    writer.problem({
      code: "not_entitled",
      fix: "https://platform.octogen.ai",
      message: `This organization is type ${type}; /v1 requires a Developer organization.`,
      severity: "error",
    });
    throw new CliError("This organization is not entitled to /v1.", {
      code: "not_entitled",
      data: envelope,
      exitCode: ExitCode.NotEntitled,
      remediation: { url: "https://platform.octogen.ai" },
    });
  }

  writer.emit({
    command: context.command,
    data: envelope,
    exitCode: ExitCode.Success,
    // `ok` is the single boolean an agent should branch on, and it is `true`
    // only when a key resolved, the API answered, and the org is entitled.
    // Skills or MCP being absent are not credential problems and do not
    // change it — they appear in `problems[]`.
    human: () => render(envelope),
    ok: true,
  });
  return ExitCode.Success;
}

function orgFrom(me: MeResponse): OrgBlock {
  const organization = me.organization;
  if (organization === null || organization === undefined) {
    // A super-admin operator bearer is org-less and key-less by construction;
    // `principal` says which case this is without a client inferring it.
    return { ...nullOrg(), principal: me.principal, source: "api" };
  }
  return {
    name: organization.name,
    principal: me.principal,
    slug: organization.slug,
    source: "api",
    type: organization.type,
    typeLabel: organization.type === DEVELOPER_ORG_TYPE ? "Developer" : "Merchant",
  };
}

function nullOrg(): OrgBlock {
  return {
    name: null,
    principal: null,
    slug: null,
    source: null,
    type: null,
    typeLabel: null,
  };
}

function render(envelope: StatusEnvelope): string {
  const { api, auth, cli, org, quota } = envelope;
  const lines = [
    `Octogen  cli ${cli.version}  sdk ${cli.sdkVersion}`,
    `  auth      ok        ${auth.keyPrefix ?? "—"} (from ${auth.source})`,
    `  org       ${org.slug ?? "—"}   ${org.name ?? "—"} · ${org.typeLabel ?? "—"}`,
    `  api       ok        ${api.baseUrl}  ${String(api.latencyMs ?? 0)}ms`,
  ];
  if (quota.rateLimit !== null) {
    lines.push(
      `  quota     requests  ${String(quota.rateLimit.remaining)}/${String(
        quota.rateLimit.limit,
      )} left, resets ${quota.rateLimit.resetAt}`,
    );
  }
  lines.push(
    "",
    "Coverage URL lists live in the Python CLI: `octogen-url-lists --help`.",
  );
  return lines.join("\n");
}

function renderOffline(cli: VersionBlock, auth: AuthBlock): string {
  return [
    `Octogen  cli ${cli.version}  sdk ${cli.sdkVersion}  node ${cli.node}`,
    `  auth      ${auth.state}  ${auth.keyPrefix ?? "no key found"} (${auth.source})`,
    "  api       not checked (--offline)",
  ].join("\n");
}

export const statusCommand = {
  flags: {
    offline: {
      describe:
        "Report local state only, with no network calls — for CI, and for 'is it me or the network?'.",
      kind: "boolean",
    },
  },
  name: "status",
  notes: [
    "Never mutates anything: no key minting, no file writes, no cache warming.",
    "Safe to run in a loop.",
    "",
    "`ok` is the single boolean to branch on, and it is true only when a key",
    "resolved, the API answered, and the organization is entitled. Exit 0",
    "healthy, 3 no usable credential, 4 not entitled, 5 throttled, 1",
    "unreachable.",
    "",
    "The probe is GET /v1/me, which requires a key. It is deliberately not",
    "GET /v1/domains: that route now answers 200 with no credential at all, so",
    "a status built on it would call a keyless install healthy.",
  ],
  operations: ["getMe"] as const,
  run: runStatus,
  summary: "Org, key, quotas, and whether onboarding worked",
  usage: "status [--offline]",
} satisfies CommandSpec;
