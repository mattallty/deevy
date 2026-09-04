import type { LiveOptions } from "@deevy/core";
import type { createDb } from "@deevy/adapters/workers";

/**
 * How often a stream on Workers looks for new Events. Slower than Node's
 * second on purpose: each poll is one D1 query, and D1 caps the queries one
 * invocation may run, so doubling the interval doubles a stream's life for a
 * second of latency on a board nobody is watching that closely
 * (docs/plans/m3.md slice 7).
 */
export const STREAM_POLL_MS = 2000;

/**
 * How long a stream lives before ending itself, when no binding says
 * otherwise. Thirty polls, against a per-invocation cap of fifty queries that
 * a signed-in request has already spent a handful of.
 */
const defaultStreamSeconds = 60;

/**
 * What the platform hands the Worker: the D1 binding, plus the vars and
 * secrets `wrangler secret put` and `.dev.vars` supply. The names are the ones
 * `apps/server/src/env.ts` reads from the environment, so one variable
 * configures deevy on either runtime (docs/OPERATIONS.md).
 */
export interface WorkerBindings {
  DB: Parameters<typeof createDb>[0];
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_SECRET?: string;
  DEEVY_WEB_ORIGIN?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  DEEVY_ADMIN_EMAIL?: string;
  DEEVY_WORKSPACE_NAME?: string;
  DEEVY_RUN_STALE_MINUTES?: string;
  DEEVY_GATE_REMINDER_HOURS?: string;
  DEEVY_STREAM_SECONDS?: string;
}

/**
 * `ServerEnv` in `apps/server/src/env.ts` minus what only a filesystem has —
 * no port, no database file, no migrations folder, no built SPA — and minus
 * `DEEVY_SWEEP_INTERVAL_SECONDS`, because on Workers the schedule belongs to
 * `triggers.crons` in `wrangler.jsonc` and not to deevy (docs/OPERATIONS.md).
 * Everything left keeps its name and its default, so the two entries visibly
 * configure one app.
 */
export interface WorkerEnv {
  baseURL?: string;
  secret?: string;
  webOrigin?: string;
  github: { clientId: string; clientSecret: string };
  adminEmail?: string;
  workspaceName?: string;
  /** Silence after which a Run is presumed stale (docs/plans/m2.md). */
  runStaleMinutes: number;
  /** Hours a Gate may sit undecided before its approvers are asked again. */
  gateReminderHours: number;
  /**
   * What this runtime allows an Event stream. Workers-only: on Node the stream
   * lives as long as the request, and `apps/server` passes nothing
   * (docs/plans/m3.md slice 7).
   */
  live: LiveOptions;
}

/** A positive number from a binding, or the default when it is absent or nonsense. */
function positive(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * The Worker's configuration, read once per isolate from the bindings the
 * request carried. Nothing here reads `process.env`, which does not exist on
 * workerd (docs/plans/m3.md).
 */
export function readWorkerEnv(env: WorkerBindings): WorkerEnv {
  return {
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    webOrigin: env.DEEVY_WEB_ORIGIN,
    github: {
      clientId: env.GITHUB_CLIENT_ID ?? "",
      clientSecret: env.GITHUB_CLIENT_SECRET ?? "",
    },
    adminEmail: env.DEEVY_ADMIN_EMAIL,
    workspaceName: env.DEEVY_WORKSPACE_NAME,
    runStaleMinutes: positive(env.DEEVY_RUN_STALE_MINUTES, 30),
    gateReminderHours: positive(env.DEEVY_GATE_REMINDER_HOURS, 4),
    live: {
      pollMs: STREAM_POLL_MS,
      maxDurationMs: positive(env.DEEVY_STREAM_SECONDS, defaultStreamSeconds) * 1000,
    },
  };
}
