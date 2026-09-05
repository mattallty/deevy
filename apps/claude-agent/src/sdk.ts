import { readFile } from "node:fs/promises";
import { query, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { Config } from "./config.ts";
import type { Session, SessionEvent, SessionInput } from "./session.ts";

/**
 * The deevy tools a session may call, namespaced the way an MCP client sees
 * them. Listed rather than wildcarded on purpose: deevy gaining a
 * twenty-first tool must not silently widen what this program may do, and the
 * list is short enough to read as a description of the job
 * (docs/agent-loop.md).
 */
export const deevyTools = [
  "inbox_list",
  "runs_list",
  "runs_get",
  "runs_start",
  "issues_get",
  "documents_get",
  "documents_write",
  "runs_post_activity",
  "runs_request_approval",
  "links_add",
  "comments_create",
  "runs_finish",
].map((tool) => `mcp__deevy__${tool}`);

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
 * The environment the session's process gets: this one, minus the runtime's own
 * secrets.
 *
 * `Bash` plus `DEEVY_AGENT_KEY` is the tool allowlist with a hole in it — the
 * session could reach any operation the Agent may call over `curl`, including
 * the ones deliberately left out of `deevyTools`. The git credential goes for
 * the same reason: the supervisor clones and pushes, so the session has no use
 * for it (docs/plans/m4.md, slice 3's finding).
 */
export const withheldFromSession = ["DEEVY_AGENT_KEY", "DEEVY_AGENT_GIT_TOKEN"];

export function sessionEnv(env: Record<string, string | undefined>): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (value !== undefined && !withheldFromSession.includes(name)) kept[name] = value;
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
    // The same endpoint and the same credential a person puts in a `.mcp.json`,
    // built here so the key never lands in a file (docs/agent-loop.md).
    mcpServers: {
      deevy: {
        type: "http",
        url: `${config.url}/mcp`,
        headers: { Authorization: `Bearer ${config.key}` },
      },
    },
    allowedTools: config.repo ? [...deevyTools, ...repositoryTools] : deevyTools,
    disallowedTools: config.repo ? deniedTools : [],
    env: sessionEnv(env),
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
