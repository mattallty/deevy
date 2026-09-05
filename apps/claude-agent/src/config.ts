/**
 * What the runtime needs to be an Agent in a deevy Workspace.
 *
 * Read once, from the environment, and never at module scope: the same rule
 * `apps/server` follows, for the same reason (docs/plans/m3.md).
 */
export interface Config {
  /** The deevy instance this Agent works in, without a trailing slash. */
  url: string;
  /**
   * The Agent's API key, issued by its Sponsor and shown once. Everything the
   * runtime does is attributed to the Agent it belongs to, so this is the whole
   * of the runtime's identity (ADR-0001).
   */
  key: string;
  /** How long to wait before asking deevy for work again when there was none. */
  pollSeconds: number;
  /** How long one Run may take before the session working it is aborted. */
  runTimeoutSeconds: number;
}

/** A positive number from the environment, or the default when it is absent or nonsense. */
function positive(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function required(env: Record<string, string | undefined>, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set, and the runtime is nobody without it`);
  return value;
}

export function readConfig(env: Record<string, string | undefined> = process.env): Config {
  return {
    url: required(env, "DEEVY_URL").replace(/\/+$/, ""),
    key: required(env, "DEEVY_AGENT_KEY"),
    pollSeconds: positive(env.DEEVY_AGENT_POLL_SECONDS, 30),
    // Thirty minutes is deevy's own stale window (docs/plans/m2.md): a session
    // allowed to outlive it would be reported stale by the sweep while it was
    // still working, and the Human watching would be told the wrong thing.
    runTimeoutSeconds: positive(env.DEEVY_AGENT_RUN_TIMEOUT_SECONDS, 30 * 60),
  };
}
