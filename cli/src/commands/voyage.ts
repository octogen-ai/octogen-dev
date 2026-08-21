/**
 * `octogen voyage <url>`, `voyage status <task_id>`, `voyage list` — onboard a
 * merchant Octogen does not cover yet.
 *
 * Voyages are shared per domain and run for hours to days, which shapes both
 * commands here:
 *
 * * starting one for a domain that already has a live voyage **joins** it and
 *   consumes no quota (`200` rather than `202`), so the output says which
 *   happened instead of implying every call spent a voyage;
 * * `--wait` polls with backoff and a hard deadline, and reaching the deadline
 *   is exit `7` — the voyage was started, the wait was not completed — not a
 *   failure, because the voyage is unaffected and `voyage status` resumes.
 *
 * `voyage list` is also the only place voyage quota is observable outside
 * `octogen status`.
 */

import type {
  ListVoyagesParams,
  VoyageListResponse,
  VoyageStatus,
  VoyageTask,
} from "@octogen-ai/sdk";

import { call } from "../client.js";
import type { CommandContext } from "../context.js";
import { CliError, ExitCode, noResult, usageError } from "../exit.js";
import type { CommandSpec } from "../registry.js";

/** Terminal states: polling one of these is finished, whatever the outcome. */
const TERMINAL: readonly VoyageStatus[] = ["completed", "failed", "cancelled"];
const VOYAGE_STATUSES: readonly VoyageStatus[] = [
  "queued",
  "running",
  "in_review",
  "completed",
  "failed",
  "cancelled",
];

/** Poll cadence. The SDK's own guidance is five minutes or slower. */
const FIRST_POLL_MS = 15_000;
const MAX_POLL_MS = 300_000;
const DEFAULT_WAIT_SECONDS = 900;

async function runVoyageStart(context: CommandContext): Promise<ExitCode> {
  const { args, writer } = context;
  const domain = context.positionals[0];
  if (domain === undefined || domain.length === 0) {
    throw usageError(
      "octogen voyage <url|domain> requires a merchant to onboard.",
      "missing_argument",
    );
  }

  const api = context.api();
  const started = await call(api, "POST /voyage", () => api.client.startVoyage(domain));
  const task = started.task;

  writer.diagnostic(
    started.created
      ? `Started a voyage for ${task.domain} (task ${task.taskId}). Voyages run for hours to days.`
      : `Joined the voyage already running for ${task.domain} (task ${task.taskId}). No quota consumed.`,
  );

  if (!args.flag("wait")) {
    writer.emit({
      command: context.command,
      data: { created: started.created, waited: false, task: taskView(task) },
      exitCode: ExitCode.Success,
      human: () => renderTask(task, started.created),
      ok: true,
    });
    return ExitCode.Success;
  }

  const deadlineSeconds = args.number("wait-timeout") ?? DEFAULT_WAIT_SECONDS;
  const final = await poll(context, task, deadlineSeconds);
  const exitCode = waitExit(final.task);
  const data = {
    created: started.created,
    waited: true,
    timedOut: final.timedOut,
    polls: final.polls,
    task: taskView(final.task),
  };

  if (exitCode !== ExitCode.Success) {
    throw new CliError(
      final.timedOut
        ? `Still ${final.task.status} after ${String(deadlineSeconds)}s. The voyage is ` +
            `unaffected: resume with \`octogen voyage status ${final.task.taskId}\`.`
        : `The voyage ${final.task.status}: ${final.task.error?.message ?? final.task.phaseLabel}`,
      {
        code: final.timedOut ? "wait_deadline" : "voyage_failed",
        data,
        exitCode,
      },
    );
  }

  writer.emit({
    command: context.command,
    data,
    exitCode,
    human: () => renderTask(final.task, started.created),
    ok: true,
  });
  return exitCode;
}

async function runVoyageStatus(context: CommandContext): Promise<ExitCode> {
  const { writer } = context;
  const taskId = context.positionals[0];
  if (taskId === undefined || taskId.length === 0) {
    throw usageError(
      "octogen voyage status <task_id> requires a task id.",
      "missing_argument",
    );
  }

  const api = context.api();
  let task: VoyageTask;
  try {
    task = await call(api, "GET /voyage/{task_id}", () => api.client.getVoyage(taskId));
  } catch (error) {
    throw unknownTaskOrRethrow(error, taskId);
  }

  writer.emit({
    command: context.command,
    data: { task: taskView(task) },
    exitCode: ExitCode.Success,
    human: () => renderTask(task, undefined),
    ok: true,
  });
  return ExitCode.Success;
}

async function runVoyageList(context: CommandContext): Promise<ExitCode> {
  const { args, writer } = context;
  const api = context.api();
  const status = args.string("status");
  const params: ListVoyagesParams = {};
  const cursor = args.string("cursor");
  if (cursor !== undefined) {
    params.cursor = cursor;
  }
  const limit = args.integer("limit", { max: 100, min: 1 });
  if (limit !== undefined) {
    params.limit = limit;
  }
  if (status !== undefined) {
    params.status = status as VoyageStatus;
  }
  const page: VoyageListResponse = await call(api, "GET /voyage", () =>
    api.client.listVoyages(params),
  );

  // Quota comes back on this response and nowhere else on `/v1` except
  // `GET /me`, so it is surfaced here even when the page is empty.
  const data = {
    count: page.items.length,
    nextCursor: page.nextCursor ?? null,
    quotas: page.quotas ?? null,
    voyages: page.items.map(taskView),
  };

  if (page.items.length === 0) {
    throw noResult({
      answeredWith: "200 GET /voyage with an empty items[]",
      code: "no_voyages",
      data,
      message:
        status === undefined
          ? "This organization has no voyages."
          : `This organization has no ${status} voyages.`,
      serverAnswered: true,
    });
  }

  writer.emit({
    command: context.command,
    data,
    exitCode: ExitCode.Success,
    human: () =>
      [
        `${String(page.items.length)} voyages`,
        ...page.items.map(
          (task) =>
            `  ${task.taskId}  ${task.domain.padEnd(28)} ${task.status} · ${task.phaseLabel} (${String(task.progressPercent)}%)`,
        ),
        ...quotaLines(page.quotas),
      ].join("\n"),
    ok: true,
  });
  return ExitCode.Success;
}

/**
 * Poll to a terminal state or to the deadline, whichever comes first.
 *
 * Backoff from 15s to 5 minutes: a voyage takes hours, so a tight loop would
 * spend the caller's rate limit to learn nothing. The deadline is checked
 * *before* sleeping so the command never overshoots it by a poll interval.
 */
async function poll(
  context: CommandContext,
  initial: VoyageTask,
  deadlineSeconds: number,
): Promise<{ task: VoyageTask; timedOut: boolean; polls: number }> {
  const api = context.api();
  const startedAt = Date.now();
  let task = initial;
  let delay = FIRST_POLL_MS;
  let polls = 0;

  while (!TERMINAL.includes(task.status)) {
    const elapsed = Date.now() - startedAt;
    const remaining = deadlineSeconds * 1000 - elapsed;
    if (remaining <= 0) {
      return { polls, task, timedOut: true };
    }
    await api.sleep(Math.min(delay, remaining));
    delay = Math.min(delay * 2, MAX_POLL_MS);
    polls += 1;
    task = await call(api, "GET /voyage/{task_id}", () =>
      api.client.getVoyage(task.taskId),
    );
    context.writer.diagnostic(
      `${task.domain}: ${task.status} · ${task.phaseLabel} (${String(task.progressPercent)}%)`,
    );
  }
  return { polls, task, timedOut: false };
}

/**
 * What `--wait` exits with.
 *
 * `7` for the deadline is the honest reading of "partial success": the voyage
 * was started or joined, which is what the command was asked to do, and the
 * wait — a convenience on top — did not finish. `1` for a voyage that actually
 * failed, because at that point the thing the caller wanted did not happen.
 */
export function waitExit(task: VoyageTask): ExitCode {
  switch (task.status) {
    case "completed":
      return ExitCode.Success;
    case "failed":
    case "cancelled":
      return ExitCode.Unexpected;
    default:
      return ExitCode.Partial;
  }
}

function unknownTaskOrRethrow(error: unknown, taskId: string): unknown {
  if (typeof error !== "object" || error === null) {
    return error;
  }
  const status: unknown = (error as { status?: unknown }).status;
  const code: unknown = (error as { code?: unknown }).code;
  if (status === 404 && code === "voyage_not_found") {
    return noResult({
      answeredWith: "404 voyage_not_found from GET /voyage/{task_id}",
      code: "voyage_not_found",
      data: { taskId },
      // A task belonging to another organization is reported the same way, so
      // this says "no such voyage for you" rather than "no such voyage".
      message: `No voyage ${taskId} belongs to this organization.`,
      remediation: { command: "octogen voyage list" },
      serverAnswered: true,
    });
  }
  return error;
}

function taskView(task: VoyageTask): Record<string, unknown> {
  return {
    taskId: task.taskId,
    domain: task.domain,
    status: task.status,
    phase: task.phase,
    phaseLabel: task.phaseLabel,
    progressPercent: task.progressPercent,
    createdAt: task.createdAt ?? null,
    updatedAt: task.updatedAt ?? null,
    completedAt: task.completedAt ?? null,
    result: task.result ?? null,
    error: task.error ?? null,
  };
}

function renderTask(task: VoyageTask, created: boolean | undefined): string {
  return [
    `${task.domain}  ${task.status}`,
    `  task       ${task.taskId}`,
    `  phase      ${task.phaseLabel} (${String(task.progressPercent)}%)`,
    ...(created === undefined
      ? []
      : [`  quota      ${created ? "consumed" : "joined, none consumed"}`]),
    ...(task.result === null || task.result === undefined
      ? []
      : [
          `  catalog    ${task.result.catalog} · ${String(
            task.result.productCount ?? 0,
          )} products`,
        ]),
    ...(task.error === null || task.error === undefined
      ? []
      : [`  error      ${task.error.code}: ${task.error.message}`]),
  ].join("\n");
}

function quotaLines(quotas: VoyageListResponse["quotas"]): string[] {
  if (quotas === null || quotas === undefined) {
    return [];
  }
  const { concurrent, monthly } = quotas;
  return [
    `  quota      ${String(monthly.used)}/${String(monthly.limit)} this month`,
    `             ${String(concurrent.used)}/${String(concurrent.limit)} concurrent`,
  ];
}

export const voyageCommand = {
  flags: {
    wait: {
      describe: "Poll until the voyage reaches a terminal state or the deadline.",
      kind: "boolean",
    },
    "wait-timeout": {
      describe: `Hard deadline for --wait, in seconds (default ${String(DEFAULT_WAIT_SECONDS)}).`,
      kind: "number",
      placeholder: "seconds",
    },
  },
  name: "voyage",
  notes: [
    "Voyages are shared per domain: starting one that is already running joins",
    "it and consumes no quota. `created` in the output says which happened.",
    "",
    "With --wait: exit 0 completed, 7 still running at the deadline (the voyage",
    "is unaffected — resume with `octogen voyage status`), 1 failed or",
    "cancelled. Requires an API key.",
  ],
  operations: ["startVoyage", "getVoyage"] as const,
  run: runVoyageStart,
  summary: "Start (or join) a voyage to onboard a merchant",
  usage: "voyage <url|domain> [--wait] [--wait-timeout <seconds>]",
} satisfies CommandSpec;

export const voyageStatusCommand = {
  name: "voyage status",
  notes: [
    "Exit 6 means no such voyage belongs to this organization — a task id from",
    "another org is reported identically, by design.",
  ],
  operations: ["getVoyage"] as const,
  run: runVoyageStatus,
  summary: "Poll one voyage by task id",
  usage: "voyage status <task_id>",
} satisfies CommandSpec;

export const voyageListCommand = {
  flags: {
    cursor: {
      describe: "Opaque pagination cursor.",
      kind: "string",
      placeholder: "cursor",
    },
    limit: { describe: "Voyages per page, 1–100.", kind: "number", placeholder: "n" },
    status: {
      choices: VOYAGE_STATUSES,
      describe: "Only voyages in this state.",
      kind: "string",
      placeholder: "status",
    },
  },
  name: "voyage list",
  notes: [
    "Also the only place voyage quota is observable outside `octogen status`,",
    "so it is reported even when the page is empty.",
  ],
  operations: ["listVoyages"] as const,
  run: runVoyageList,
  summary: "List this organization's voyages, newest first",
  usage: "voyage list [--status <status>] [--limit <n>] [--cursor <c>]",
} satisfies CommandSpec;
