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
  /** The model the session runs on. */
  model: string;
  /** How hard it thinks. Raise it for work that is more than a Document. */
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  /** A backstop on a session that will not stop. The timeout is the real bound. */
  maxTurns: number;
  /**
   * The repository this runtime works in, or null.
   *
   * It is the runtime's configuration and not deevy's data: deevy's Repository
   * rows exist so an Issue can point at code, they carry no credential, and
   * they are not a checkout instruction. One service works one repository,
   * which is also how a coding agent is actually deployed (docs/plans/m4.md).
   */
  repo: RepoConfig | null;
  /** Where per-Run working directories are made. */
  workdir?: string;
  /**
   * The secret deevy signs its webhooks with, chosen when the Agent's webhook
   * URL was set. Absent means the runtime polls and listens to nobody, which is
   * the default: a delivery is an accelerator, never the only way work arrives
   * (docs/plans/m4.md).
   */
  webhookSecret?: string;
  /** The port the listener binds. Zero picks one, which is only useful in a test. */
  listenPort: number;
  /** The GitHub API root, when it is not github.com's. */
  githubApi?: string;
  /** `owner/name`, when it cannot be read off the clone URL. */
  githubRepo?: string;
  /**
   * Environment variables to pass through to the session on top of the
   * allowlist — a proxy, a private registry, a custom CA.
   */
  passEnv?: string[];
}

const efforts = ["low", "medium", "high", "xhigh", "max"] as const;

function effort(value: string | undefined): Config["effort"] {
  const found = efforts.find((level) => level === value);
  return found ?? "high";
}

import type { RepoConfig } from "./workspace.ts";

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
    model: env.DEEVY_AGENT_MODEL ?? "claude-opus-5",
    effort: effort(env.DEEVY_AGENT_EFFORT),
    maxTurns: positive(env.DEEVY_AGENT_MAX_TURNS, 100),
    repo: env.DEEVY_AGENT_REPO
      ? {
          url: env.DEEVY_AGENT_REPO,
          ...(env.DEEVY_AGENT_GIT_TOKEN ? { token: env.DEEVY_AGENT_GIT_TOKEN } : {}),
          baseBranch: env.DEEVY_AGENT_BASE_BRANCH ?? "main",
        }
      : null,
    ...(env.DEEVY_AGENT_WORKDIR ? { workdir: env.DEEVY_AGENT_WORKDIR } : {}),
    ...(env.DEEVY_AGENT_WEBHOOK_SECRET ? { webhookSecret: env.DEEVY_AGENT_WEBHOOK_SECRET } : {}),
    listenPort: positive(env.DEEVY_AGENT_PORT, 8787),
    ...(env.DEEVY_AGENT_GITHUB_API ? { githubApi: env.DEEVY_AGENT_GITHUB_API } : {}),
    ...(env.DEEVY_AGENT_GITHUB_REPO ? { githubRepo: env.DEEVY_AGENT_GITHUB_REPO } : {}),
    ...(env.DEEVY_AGENT_PASS_ENV
      ? {
          passEnv: env.DEEVY_AGENT_PASS_ENV.split(",")
            .map((name) => name.trim())
            .filter(Boolean),
        }
      : {}),
  };
}
