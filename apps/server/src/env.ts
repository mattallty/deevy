export interface ServerEnv {
  port: number;
  databasePath: string;
  migrationsFolder: string;
  baseURL?: string;
  secret?: string;
  webOrigin?: string;
  github: { clientId: string; clientSecret: string };
  adminEmail?: string;
  workspaceName?: string;
  webDist?: string;
  /** Silence after which a Run is presumed stale (docs/plans/m2.md). */
  runStaleMinutes: number;
  /** How often the background runner sweeps for silent Runs. */
  sweepIntervalSeconds: number;
  gateReminderHours: number;
}

/** A positive number from the environment, or the default when it is absent or nonsense. */
function positive(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function readEnv(env: NodeJS.ProcessEnv = process.env): ServerEnv {
  return {
    // DEEVY_PORT first: tooling commonly injects a generic PORT meant for something else.
    port: Number(env.DEEVY_PORT ?? env.PORT ?? 3000),
    databasePath: env.DEEVY_DATABASE_PATH ?? "./data/deevy.sqlite",
    migrationsFolder: env.DEEVY_MIGRATIONS_DIR ?? new URL("./drizzle", import.meta.url).pathname,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    webOrigin: env.DEEVY_WEB_ORIGIN,
    github: {
      clientId: env.GITHUB_CLIENT_ID ?? "",
      clientSecret: env.GITHUB_CLIENT_SECRET ?? "",
    },
    adminEmail: env.DEEVY_ADMIN_EMAIL,
    workspaceName: env.DEEVY_WORKSPACE_NAME,
    webDist: env.DEEVY_WEB_DIST,
    runStaleMinutes: positive(env.DEEVY_RUN_STALE_MINUTES, 30),
    sweepIntervalSeconds: positive(env.DEEVY_SWEEP_INTERVAL_SECONDS, 60),
    gateReminderHours: positive(env.DEEVY_GATE_REMINDER_HOURS, 4),
  };
}
