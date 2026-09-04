import type { createDb } from "@deevy/adapters/workers";

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
  DEEVY_SWEEP_INTERVAL_SECONDS?: string;
  DEEVY_GATE_REMINDER_HOURS?: string;
}

/**
 * `ServerEnv` in `apps/server/src/env.ts` minus what only a filesystem has: no
 * port, no database file, no migrations folder, no built SPA. Same names, same
 * defaults, so the two entries visibly configure one app.
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
  /** How often background work looks for silent Runs. */
  sweepIntervalSeconds: number;
  gateReminderHours: number;
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
    sweepIntervalSeconds: positive(env.DEEVY_SWEEP_INTERVAL_SECONDS, 60),
    gateReminderHours: positive(env.DEEVY_GATE_REMINDER_HOURS, 4),
  };
}
