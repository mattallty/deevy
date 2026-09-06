import { readFile } from "node:fs/promises";
import { query, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { Config } from "./config.ts";
import type { Session, SessionEvent, SessionInput } from "./session.ts";

import { deevyToolNames } from "./tools.ts";

/** The deevy tools, namespaced the way an MCP client sees them (src/tools.ts). */
export const deevyTools = deevyToolNames.map((tool) => `mcp__deevy__${tool}`);

/**
 * What the session gets on top of deevy when it has a repository to work in.
 *
 * Each one is here for a reason: the file tools for the checkout, `Bash` for
 * the build and the tests, and the web tools for documentation an Issue points
 * at. Without a repository none of these are granted — a shell with nothing to
 * run is not a default worth having, and the tool surface following the
 * configuration means nobody gets one by forgetting (docs/plans/m4.md).
 */
export const repositoryTools = [
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "Bash",
  "WebSearch",
  "WebFetch",
];

/**
 * What is refused even where it would otherwise be reachable.
 *
 * The supervisor owns git and the credential to use it, so a session reaching
 * for a push or a pull request is a bug rather than initiative, and denying it
 * makes that ownership enforced instead of hoped for. Nothing else is listed:
 * a denylist beside an allowlist invites the belief that the allowlist has
 * holes this patches, and it does not.
 */
export const deniedTools = [
  "Bash(git push:*)",
  "Bash(git remote:*)",
  "Bash(git config:*)",
  "Bash(gh:*)",
];

/**
 * What the session's process is allowed to see of this one's environment.
 *
 * An allowlist rather than a denylist, and that distinction was earned: the
 * first version removed `DEEVY_AGENT_KEY` and the git token and passed
 * everything else through, which meant a session with a shell inherited every
 * other credential the operator happened to have — cloud tokens, registry
 * tokens, and on a laptop the operator's own Anthropic credentials. It was
 * found by setting `ANTHROPIC_API_KEY` to a deliberately invalid value and
 * watching a live run succeed anyway, on host credentials nobody had passed it.
 *
 * A denylist can only remove what somebody thought of. This removes everything
 * nobody named.
 */
export const sessionEnvAllowed = [
  // Enough to run a process and for git to find its own configuration.
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TMPDIR",
  "TERM",
  "LANG",
  "LC_ALL",
  "TZ",
];

/**
 * Prefixes allowed whole. `ANTHROPIC_` is how the SDK is given its credential
 * and its endpoint, which is the one secret the session is *supposed* to hold.
 * `CLAUDE_` is deliberately not here: that is the host tooling's own state, and
 * inheriting it is what let a session authenticate as somebody's editor.
 */
export const sessionEnvAllowedPrefixes = ["ANTHROPIC_"];

/**
 * The environment a session runs with: the allowlist above, plus whatever the
 * operator names in `DEEVY_AGENT_PASS_ENV`.
 *
 * The passthrough exists because an allowlist that cannot be extended gets
 * worked around: a proxy, a private registry or a custom CA is a real need, and
 * naming the variable is better than turning the list off.
 */
export function sessionEnv(
  env: Record<string, string | undefined>,
  alsoPass: ReadonlyArray<string> = [],
): Record<string, string> {
  const named = new Set([...sessionEnvAllowed, ...alsoPass]);
  const kept: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (named.has(name) || sessionEnvAllowedPrefixes.some((p) => name.startsWith(p))) {
      kept[name] = value;
    }
  }
  return kept;
}

let instructions: string | null = null;

/** The instructions every session carries, read once per process. */
export async function readInstructions(): Promise<string> {
  instructions ??= await readFile(new URL("./instructions.md", import.meta.url), "utf8");
  return instructions;
}

/**
 * The whole security boundary, in one object.
 *
 * Exported so a test can assert it entire rather than sample it: a test that
 * checks three of these fields passes while a fourth is silently missing, and
 * the fourth is the one that matters (docs/plans/m4.md, convention 21).
 */
export function sessionOptions(
  config: Config,
  input: SessionInput,
  appendedInstructions: string,
  env: Record<string, string | undefined> = process.env,
): Options {
  return {
    // The supervisor's loopback proxy, with no credential: the key stays in
    // this process and the proxy adds it (src/proxy.ts). A person's `.mcp.json`
    // names deevy's own endpoint and carries the header instead
    // (docs/agent-loop.md); the difference is who holds the key.
    mcpServers: {
      deevy: { type: "http", url: input.mcpUrl },
    },
    allowedTools: config.repo ? [...deevyTools, ...repositoryTools] : deevyTools,
    disallowedTools: config.repo ? deniedTools : [],
    env: sessionEnv(env, config.passEnv ?? []),
    // Nothing on disk configures this session. From slice 5 the working
    // directory holds a repository somebody else wrote, and a `.mcp.json` in it
    // must add no server while a `.claude/settings.json` must grant no
    // permission. Both flags are free now and load-bearing then.
    strictMcpConfig: true,
    settingSources: [],
    // Nobody is here to answer a prompt, so anything not granted above is
    // refused rather than parked. `bypassPermissions` appears nowhere in this
    // repository: an allowlist grants what was meant and nothing else.
    permissionPrompts: "none",
    permissionMode: "default",
    cwd: input.cwd,
    systemPrompt: { type: "preset", preset: "claude_code", append: appendedInstructions },
    model: config.model,
    effort: config.effort,
    maxTurns: config.maxTurns,
  };
}

/**
 * What the runtime reads out of one SDK message.
 *
 * The SDK's message union has dozens of members and grows; the supervisor cares
 * about four things. Keeping the narrowing here means a new message kind is a
 * no-op rather than a type error somewhere that reasons about Runs.
 */
export function toSessionEvents(message: SDKMessage): SessionEvent[] {
  if (message.type === "system" && message.subtype === "init") {
    return [{ type: "ready", tools: message.tools, servers: message.mcp_servers }];
  }
  if (message.type === "system" && message.subtype === "permission_denied") {
    return [
      {
        type: "denied",
        name: message.tool_name,
        reason: message.decision_reason ?? message.message,
      },
    ];
  }
  if (message.type === "assistant") {
    const events: SessionEvent[] = [];
    for (const block of message.message.content) {
      if (block.type === "tool_use") events.push({ type: "tool", name: block.name });
      if (block.type === "text") events.push({ type: "text", text: block.text });
    }
    return events;
  }
  if (message.type === "result") {
    const ok = message.subtype === "success" && !message.is_error;
    return [{ type: "done", ok, detail: detailOf(message) }];
  }
  return [];
}

function detailOf(message: Extract<SDKMessage, { type: "result" }>): string {
  if (message.subtype === "success") return message.result;
  // An error result carries no prose, so its subtype is the whole of what the
  // SDK is willing to say, and it is what the Run's error Activity will quote.
  return `The session ended: ${message.subtype}`;
}

/**
 * The Run's deadline, as something the SDK takes.
 *
 * `query` wants an `AbortController` it owns; the supervisor has an
 * `AbortSignal` made from the Run's timeout and the process's own stop. This is
 * the join, kept separate because it is the only part of the real session a
 * test can exercise without spending money.
 */
export function linkAbort(signal: AbortSignal): {
  controller: AbortController;
  release: () => void;
} {
  const controller = new AbortController();
  const stop = () => {
    controller.abort();
  };
  if (signal.aborted) stop();
  else signal.addEventListener("abort", stop, { once: true });
  return { controller, release: () => signal.removeEventListener("abort", stop) };
}

/** The real session: Claude, configured by `sessionOptions` and nothing else. */
export function buildSession(config: Config): Session {
  return async function* run(input: SessionInput) {
    const { controller, release } = linkAbort(input.signal);
    try {
      const messages = query({
        prompt: input.prompt,
        options: {
          ...sessionOptions(config, input, await readInstructions()),
          abortController: controller,
        },
      });
      for await (const message of messages) yield* toSessionEvents(message);
    } finally {
      release();
    }
  };
}
