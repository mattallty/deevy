import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vite-plus/test";
import {
  deevyTools,
  linkAbort,
  readInstructions,
  sessionOptions,
  toSessionEvents,
  sessionEnv,
  sessionEnvAllowed,
} from "../src/sdk.ts";
import { testConfig } from "./helpers.ts";

const input = {
  prompt: "Work Run r1 on Issue DEV-1.",
  cwd: "/tmp/run",
  signal: AbortSignal.abort(),
};

/** A deterministic environment, so the options a test reads are the same twice. */
const env = {
  PATH: "/usr/bin",
  ANTHROPIC_API_KEY: "sk-ant-x",
  DEEVY_AGENT_KEY: "deevy_sk_secret",
  DEEVY_AGENT_GIT_TOKEN: "ghp_secret",
};

const withRepo = {
  ...testConfig,
  repo: { url: "https://github.com/owner/repo.git", token: "ghp_secret", baseBranch: "main" },
};

describe("the options a session runs under", () => {
  /**
   * Asserted whole, never sampled. Every field here is a decision about what an
   * agent holding a shell may do, and a test that checks most of them passes
   * while the one that matters goes missing (docs/plans/m4.md, convention 21).
   */
  it("is the whole security boundary, and this is all of it", () => {
    const options = sessionOptions(testConfig, input, "INSTRUCTIONS", env);

    expect(options).toEqual({
      mcpServers: {
        deevy: {
          type: "http",
          url: "http://localhost:3000/mcp",
          headers: { Authorization: "Bearer unset" },
        },
      },
      allowedTools: [
        "mcp__deevy__inbox_list",
        "mcp__deevy__runs_list",
        "mcp__deevy__runs_get",
        "mcp__deevy__runs_start",
        "mcp__deevy__issues_get",
        "mcp__deevy__documents_get",
        "mcp__deevy__documents_write",
        "mcp__deevy__runs_post_activity",
        "mcp__deevy__runs_request_approval",
        "mcp__deevy__links_add",
        "mcp__deevy__comments_create",
        "mcp__deevy__runs_finish",
      ],
      // No repository, so no shell: a session with nothing to run has no use
      // for one, and the tool surface follows the configuration rather than a
      // flag somebody has to remember.
      disallowedTools: [],
      env: { PATH: "/usr/bin", ANTHROPIC_API_KEY: "sk-ant-x" },
      strictMcpConfig: true,
      settingSources: [],
      permissionPrompts: "none",
      permissionMode: "default",
      cwd: "/tmp/run",
      systemPrompt: { type: "preset", preset: "claude_code", append: "INSTRUCTIONS" },
      model: "claude-opus-5",
      effort: "high",
      maxTurns: 10,
    });
  });

  it("adds the file and shell tools only when there is a repository to use them on", () => {
    const options = sessionOptions(withRepo, input, "", env);

    expect(options.allowedTools).toEqual([
      ...deevyTools,
      "Read",
      "Write",
      "Edit",
      "Glob",
      "Grep",
      "Bash",
      "WebSearch",
      "WebFetch",
    ]);
    // The supervisor owns git and the credential to use it, so the session
    // reaching for a push is a bug rather than initiative.
    expect(options.disallowedTools).toEqual([
      "Bash(git push:*)",
      "Bash(git remote:*)",
      "Bash(git config:*)",
      "Bash(gh:*)",
    ]);
  });

  it("never hands the session the secrets that would make the allowlist a suggestion", () => {
    const options = sessionOptions(withRepo, input, "", env);

    // `Bash` plus the Agent's key is every operation the Agent may call, over
    // curl, including the ones deliberately left out of the tool list.
    expect(options.env).toEqual({ PATH: "/usr/bin", ANTHROPIC_API_KEY: "sk-ant-x" });
    expect(JSON.stringify(options.env)).not.toContain("deevy_sk_secret");
    expect(JSON.stringify(options.env)).not.toContain("ghp_secret");
  });

  it("passes only what is named, so a credential nobody thought of is not inherited", () => {
    const hostile = {
      PATH: "/usr/bin",
      HOME: "/home/runtime",
      ANTHROPIC_API_KEY: "sk-ant-x",
      // The kind of thing that is simply present on a developer's machine, and
      // that a denylist can only exclude if somebody thought of it first.
      AWS_SECRET_ACCESS_KEY: "aws",
      NPM_TOKEN: "npm",
      GITHUB_TOKEN: "gh",
      CLAUDE_CODE_OAUTH_SCOPES: "the host tooling's own session",
      DEEVY_AGENT_KEY: "deevy_sk_secret",
    };

    expect(sessionEnv(hostile)).toEqual({
      PATH: "/usr/bin",
      HOME: "/home/runtime",
      ANTHROPIC_API_KEY: "sk-ant-x",
    });
  });

  it("passes what the operator names, and nothing more", () => {
    const env = { PATH: "/usr/bin", HTTPS_PROXY: "http://proxy:3128", NPM_TOKEN: "npm" };

    expect(sessionEnv(env, ["HTTPS_PROXY"])).toEqual({
      PATH: "/usr/bin",
      HTTPS_PROXY: "http://proxy:3128",
    });
  });

  it("allows a process to run and git to find its own configuration", () => {
    expect(sessionEnvAllowed).toContain("PATH");
    expect(sessionEnvAllowed).toContain("HOME");
    // The host tooling's own state is not the runtime's configuration, and
    // inheriting it is what let a session authenticate as somebody's editor.
    expect(sessionEnvAllowed.some((name) => name.startsWith("CLAUDE"))).toBe(false);
  });

  it("grants tools by name, so deevy widening is not this program widening", () => {
    // A wildcard would make `mcp-tools.json` gaining a tool a change to what
    // this runtime may do, decided by a different pull request.
    expect(deevyTools.some((tool) => tool.includes("*"))).toBe(false);
    expect(deevyTools).not.toContain("mcp__deevy__gates_approve");
    expect(deevyTools).not.toContain("mcp__deevy__labels_create");
  });

  it("never asks for the permission mode that turns the allowlist off", () => {
    const options = sessionOptions(testConfig, input, "", env);

    expect(options.permissionMode).not.toBe("bypassPermissions");
    expect(options.permissionPrompts).toBe("none");
  });

  it("carries the instructions the worked example writes out in prose", async () => {
    const shipped = await readInstructions();

    expect(shipped).toContain("## Working an Issue in deevy");
    expect(shipped).toContain("runs_request_approval");
    // The one thing an Agent must not try, in the file that tells it so.
    expect(shipped).toContain("do not approve one");
  });
});

describe("reading the SDK's messages", () => {
  it("takes the init message as the session being ready, servers and all", () => {
    const init = {
      type: "system",
      subtype: "init",
      tools: ["Read", "mcp__deevy__issues_get"],
      mcp_servers: [{ name: "deevy", status: "connected" }],
    } as unknown as SDKMessage;

    expect(toSessionEvents(init)).toEqual([
      {
        type: "ready",
        tools: ["Read", "mcp__deevy__issues_get"],
        servers: [{ name: "deevy", status: "connected" }],
      },
    ]);
  });

  it("reports every tool call in one assistant turn, and what it said", () => {
    const assistant = {
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "Reading the Issue" },
          { type: "tool_use", name: "mcp__deevy__issues_get" },
          { type: "tool_use", name: "mcp__deevy__documents_get" },
        ],
      },
    } as unknown as SDKMessage;

    expect(toSessionEvents(assistant)).toEqual([
      { type: "text", text: "Reading the Issue" },
      { type: "tool", name: "mcp__deevy__issues_get" },
      { type: "tool", name: "mcp__deevy__documents_get" },
    ]);
  });

  it("ends well on a success and badly on anything else", () => {
    const success = { type: "result", subtype: "success", is_error: false, result: "Planned it" };
    const failed = { type: "result", subtype: "error_during_execution" };

    expect(toSessionEvents(success as unknown as SDKMessage)).toEqual([
      { type: "done", ok: true, detail: "Planned it" },
    ]);
    expect(toSessionEvents(failed as unknown as SDKMessage)).toEqual([
      { type: "done", ok: false, detail: "The session ended: error_during_execution" },
    ]);
  });

  it("treats a success the SDK flagged as an error as one", () => {
    const flagged = { type: "result", subtype: "success", is_error: true, result: "half of it" };

    expect(toSessionEvents(flagged as unknown as SDKMessage)).toEqual([
      { type: "done", ok: false, detail: "half of it" },
    ]);
  });

  it("ignores the messages the supervisor has no opinion about", () => {
    const noise = { type: "status" } as unknown as SDKMessage;

    expect(toSessionEvents(noise)).toEqual([]);
  });
});

describe("the Run's deadline", () => {
  it("aborts the SDK's controller when the supervisor's signal fires", () => {
    const supervisor = new AbortController();
    const { controller } = linkAbort(supervisor.signal);

    expect(controller.signal.aborted).toBe(false);
    supervisor.abort();

    expect(controller.signal.aborted).toBe(true);
  });

  it("is already aborted when the Run was over before the session started", () => {
    const { controller } = linkAbort(AbortSignal.abort());

    expect(controller.signal.aborted).toBe(true);
  });

  it("lets go of the signal, so a long-lived one does not collect listeners", () => {
    const supervisor = new AbortController();
    const { controller, release } = linkAbort(supervisor.signal);

    release();
    supervisor.abort();

    expect(controller.signal.aborted).toBe(false);
  });
});
