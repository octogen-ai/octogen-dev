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
 * `status` probes `GET /v1/me` (key-required, and it returns the identity and
 * the quotas in the same answer), or `GET /v1/voyage?limit=1` on the fallback
 * path. `listDomains` stays the coverage question, never the identity question.
 *
 * **`status` never mutates anything.** No key minting, no file writes, no cache
 * warming. It is the one command an agent can run in a loop without
 * consequence, subject to the rate limit it reports.
 *
 * Every field of the envelope is always present; unknown values are `null` with
 * a reason in `problems[]`, so an agent never has to distinguish "absent" from
 * "we could not tell".
 */

import type {
  MeRateLimit,
  MeResponse,
  VoyageListResponse,
  VoyageQuotas,
} from "@octogen-ai/sdk";

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
  voyage: VoyageQuotas | null;
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
    quota: { rateLimit: null, voyage: null },
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
  const probe = await probeIdentity(context);
  envelope.api = {
    baseUrl,
    latencyMs: Math.round(performance.now() - startedAt),
    probe: probe.kind === "me" ? "GET /me" : "GET /voyage?limit=1",
    reachable: true,
  };
  auth.state = "ok";

  if (probe.kind === "me") {
    auth.keyId = probe.me.key?.id ?? null;
    // `/v1/me` returns the 20-character display prefix; a locally resolved key
    // yields the full two-segment identifier, which is the value the API keys
    // UI shows. Prefer the local one, fall back to the server's.
    auth.keyPrefix = api.key.keyPrefix ?? probe.me.key?.prefix ?? null;
    // Omitted entirely — not `null` — until the parent plan's Phase 2 adds the
    // column. That is the shape status wants: an absent field reads as unknown.
    auth.keySource = probe.me.key?.source ?? null;
    envelope.org = orgFrom(probe.me);
    envelope.quota = {
      rateLimit: probe.me.rateLimit ?? null,
      voyage: probe.me.quotas?.voyage ?? null,
    };
  } else {
    envelope.quota = { rateLimit: null, voyage: probe.voyages.quotas ?? null };
    writer.problem({
      code: "me_unavailable",
      message:
        "GET /v1/me was unavailable, so the key was verified with the fallback " +
        "probe (GET /v1/voyage?limit=1) and the organization is unknown.",
      severity: "warning",
    });
  }

  // A `200` on a key-required route means Developer even on the fallback path,
  // where the type is not reported: a merchant key is refused everywhere on
  // `/v1`. So an unknown type is not treated as unentitled.
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

type Probe =
  { kind: "me"; me: MeResponse } | { kind: "voyage"; voyages: VoyageListResponse };

/**
 * One key-required round trip, with the pre-`/me` path as a fallback.
 *
 * `/v1/me` shipped as P3 and is in the published contract, so the fallback is
 * for an older deployment rather than for today — but the command's contract is
 * designed to work either way, and only `api.probe` and `org.source` differ
 * between them. A `404` is the only trigger: any other failure is a real
 * failure and keeps its own exit code.
 */
async function probeIdentity(context: CommandContext): Promise<Probe> {
  const api = context.api();
  try {
    return { kind: "me", me: await call(api, "GET /me", () => api.client.getMe()) };
  } catch (error) {
    if (!(error instanceof CliError) || error.status !== 404) {
      throw error;
    }
    context.writer.trace("GET /me is not available; falling back to GET /voyage");
    return {
      kind: "voyage",
      voyages: await call(api, "GET /voyage?limit=1", () =>
        api.client.listVoyages({ limit: 1 }),
      ),
    };
  }
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
  if (quota.voyage !== null) {
    const monthly = quota.voyage.monthly;
    const concurrent = quota.voyage.concurrent;
    lines.push(
      `            voyage    ${String(monthly.used)}/${String(monthly.limit)} this ` +
        `month · ${String(concurrent.used)}/${String(concurrent.limit)} concurrent`,
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
  operations: ["getMe", "listVoyages"] as const,
  run: runStatus,
  summary: "Org, key, quotas, and whether onboarding worked",
  usage: "status [--offline]",
} satisfies CommandSpec;
