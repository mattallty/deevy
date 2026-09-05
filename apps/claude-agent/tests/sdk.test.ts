import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vite-plus/test";
import {
  deevyTools,
  linkAbort,
  readInstructions,
  sessionOptions,
  toSessionEvents,
} from "../src/sdk.ts";
import { testConfig } from "./helpers.ts";

const input = {
  prompt: "Work Run r1 on Issue DEV-1.",
  cwd: "/tmp/run",
  signal: AbortSignal.abort(),
};

describe("the options a session runs under", () => {
  /**
   * Asserted whole, never sampled. Every field here is a decision about what an
   * agent holding a shell may do, and a test that checks most of them passes
   * while the one that matters goes missing (docs/plans/m4.md, convention 21).
   */
  it("is the whole security boundary, and this is all of it", async () => {
    const options = sessionOptions(testConfig, input, "INSTRUCTIONS");

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
      disallowedTools: [],
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

  it("grants tools by name, so deevy widening is not this program widening", () => {
    // A wildcard would make `mcp-tools.json` gaining a tool a change to what
    // this runtime may do, decided by a different pull request.
    expect(deevyTools.some((tool) => tool.includes("*"))).toBe(false);
    expect(deevyTools).not.toContain("mcp__deevy__gates_approve");
    expect(deevyTools).not.toContain("mcp__deevy__labels_create");
  });

  it("never asks for the permission mode that turns the allowlist off", () => {
    const options = sessionOptions(testConfig, input, "");

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
