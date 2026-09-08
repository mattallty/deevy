import type { AuthProviders } from "@deevy/core";

export interface ServerEnv {
  port: number;
  databasePath: string;
  migrationsFolder: string;
  baseURL?: string;
  secret?: string;
  webOrigin?: string;
  /**
   * The sign-in providers this instance offers, one optional entry each. A
   * provider is configuration: what is set here is what `createAuth` registers
   * and what the sign-in page draws a button for (docs/plans/sign-in.md).
   */
  providers: AuthProviders;
  adminEmail?: string;
  workspaceName?: string;
  webDist?: string;
  /** Silence after which a Run is presumed stale (docs/plans/m2.md). */
  runStaleMinutes: number;
  /** How often the background runner sweeps for silent Runs. */
  sweepIntervalSeconds: number;
  gateReminderHours: number;
  /**
   * Replace GitHub with the stub the acceptance walk signs in through
   * (apps/web/scripts/stub-github.js), so a developer needs no OAuth App and
   * the OAuth `code` is the email address. Development only, by construction:
   * `readEnv` refuses it under `NODE_ENV=production` rather than ignoring it,
   * because a flag that is silently dropped is a flag somebody will one day
   * believe is on.
   */
  devStubGithub: boolean;
}

/** A positive number from the environment, or the default when it is absent or nonsense. */
function positive(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * What the stub stands in for: a provider is registered only when both halves
 * of its client pair are set, and a developer running without an OAuth App has
 * neither. So the flag supplies the halves it does not have, and a real value
 * always wins — an instance configured with a pair keeps it
 * (docs/DEVELOPMENT.md, "Running without an OAuth App").
 */
const stubbed = "dev-stub";

export function readEnv(env: NodeJS.ProcessEnv = process.env): ServerEnv {
  const devStubGithub = env.DEEVY_DEV_STUB_GITHUB === "1";
  if (devStubGithub && env.NODE_ENV === "production") {
    throw new Error(
      "DEEVY_DEV_STUB_GITHUB replaces GitHub sign-in and cannot be set in production",
    );
  }
  const half = (value: string | undefined) => value || (devStubGithub ? stubbed : "");
  return {
    // DEEVY_PORT first: tooling commonly injects a generic PORT meant for something else.
    port: Number(env.DEEVY_PORT ?? env.PORT ?? 3000),
    databasePath: env.DEEVY_DATABASE_PATH ?? "./data/deevy.sqlite",
    migrationsFolder: env.DEEVY_MIGRATIONS_DIR ?? new URL("./drizzle", import.meta.url).pathname,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    webOrigin: env.DEEVY_WEB_ORIGIN,
    providers: {
      github: {
        clientId: half(env.GITHUB_CLIENT_ID),
        clientSecret: half(env.GITHUB_CLIENT_SECRET),
      },
    },
    adminEmail: env.DEEVY_ADMIN_EMAIL,
    workspaceName: env.DEEVY_WORKSPACE_NAME,
    webDist: env.DEEVY_WEB_DIST,
    runStaleMinutes: positive(env.DEEVY_RUN_STALE_MINUTES, 30),
    sweepIntervalSeconds: positive(env.DEEVY_SWEEP_INTERVAL_SECONDS, 60),
    gateReminderHours: positive(env.DEEVY_GATE_REMINDER_HOURS, 4),
    devStubGithub,
  };
}
