import { createRouterClient } from "@orpc/server";
import { afterEach, describe, expect, it } from "vite-plus/test";
import type { App } from "../src/app.ts";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import type { ServerContext } from "@modelcontextprotocol/server";
import { createGateElicitation } from "../src/mcp/elicitation.ts";
import { router } from "../src/operations/index.ts";
import { agentContext, memberContext, testDb } from "./helpers.ts";

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

const secret = "test-secret-that-is-at-least-32-characters";
const baseURL = "https://deevy.example.com";

/** The protocol revision this SDK serves, and the envelope every modern request carries. */
const modern = "2026-07-28";
const envelope = {
  "io.modelcontextprotocol/protocolVersion": modern,
  "io.modelcontextprotocol/clientCapabilities": { elicitation: { url: {} } },
  "io.modelcontextprotocol/clientInfo": { name: "test-client", version: "0" },
};

interface JsonRpcAnswer {
  result?: Record<string, unknown>;
  error?: { code: number; message: string; data?: { reason?: string } };
}

/** One 2026-07-28 request to /mcp, the way a modern client sends it. */
async function mcp(
  app: App,
  key: string,
  method: string,
  params: Record<string, unknown>,
): Promise<JsonRpcAnswer> {
  const res = await app.request("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": modern,
      "mcp-method": method,
      ...(typeof params.name === "string" ? { "mcp-name": params.name } : {}),
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: { ...params, _meta: envelope } }),
  });
  if (res.status !== 200) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as JsonRpcAnswer;
}

/**
 * A Workspace with DEV-1 sitting in the Plan Gate, an Agent granted that
 * Project with an open Run on the Issue, and the key it calls /mcp with.
 */
async function agentAtAGate() {
  const { db, close } = testDb();
  closers.push(close);
  const auth = createAuth({
    db,
    env: {
      baseURL,
      secret,
      providers: { github: { clientId: "github-client", clientSecret: "github-secret" } },
    },
  });
  const admin = await memberContext(db, { role: "admin", name: "Ada" });
  const asAdmin = createRouterClient(router, { context: admin });
  const project = await asAdmin.projects.create({ name: "deevy", key: "DEV" });
  await asAdmin.issues.create({ projectKey: "DEV", title: "Ship the agent loop" });
  await asAdmin.gates.approve({ key: "DEV-1" });
  await asAdmin.gates.approve({ key: "DEV-1" });
  const plan = project.states.find((state) => state.name === "Plan")!;

  const agent = await agentContext(db, {
    sponsor: admin.member,
    name: "Planner",
    grants: [project.id],
  });
  const asAgent = createRouterClient(router, { context: agent });
  const run = await asAgent.runs.start({ issueKey: "DEV-1" });
  const issued = await auth.api.createApiKey({
    body: { userId: agent.member.userId, name: "laptop" },
  });

  const app = createApp({ db, auth, baseURL, secret });
  return {
    db,
    auth,
    admin,
    asAdmin,
    agent,
    asAgent,
    project,
    plan,
    run,
    key: issued.key,
    keyId: issued.id,
    app,
  };
}

/**
 * The same request from a client that declares no elicitation capability, which
 * is what Claude Code sends. Found by walking docs/m3-acceptance.md against a
 * deployed instance: every test above declares `elicitation`, so nothing ever
 * exercised the client the walk actually used.
 */
async function mcpWithoutElicitation(
  app: App,
  key: string,
  params: Record<string, unknown>,
): Promise<JsonRpcAnswer> {
  const res = await app.request("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": modern,
      "mcp-method": "tools/call",
      ...(typeof params.name === "string" ? { "mcp-name": params.name } : {}),
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": modern,
          "io.modelcontextprotocol/clientCapabilities": {},
          "io.modelcontextprotocol/clientInfo": { name: "no-elicitation", version: "0" },
        },
      },
    }),
  });
  if (res.status !== 200) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as JsonRpcAnswer;
}

describe("an Agent whose client cannot be elicited", () => {
  it("still gets the Gate's URL, as an ordinary answer rather than an error", async () => {
    const { app, key, run, plan, asAgent } = await agentAtAGate();

    const answer = await mcpWithoutElicitation(app, key, {
      name: "runs_request_approval",
      arguments: { runId: run.id },
    });

    // Not an error, and not an input_required the client cannot honour: the
    // same structured answer a polling Agent gets, carrying the URL a Human
    // has to open (docs/plans/m2.md slice 6).
    expect(answer.result?.isError).not.toBe(true);
    expect(answer.result?.structuredContent).toMatchObject({
      status: "awaiting",
      url: `${baseURL}/issues/DEV-1?gate=${plan.id}`,
      stateName: "Plan",
    });

    // And the durable half happened exactly once, as it always did: the Run is
    // waiting and the feed holds the one elicitation carrying the URL.
    const feed = await asAgent.runs.get({ runId: run.id });
    expect(feed.status).toBe("awaiting_input");
    expect(feed.activities.filter((row) => row.kind === "elicitation")).toHaveLength(1);
  });
});

describe("an Agent that reaches a Gate over MCP", () => {
  it("is asked to send its Human to a deevy URL, and told nothing has been decided", async () => {
    const { app, key, run, plan } = await agentAtAGate();

    const answer = await mcp(app, key, "tools/call", {
      name: "runs_request_approval",
      arguments: { runId: run.id },
    });

    expect(answer.result?.resultType).toBe("input_required");
    expect(answer.result?.inputRequests).toMatchObject({
      approval: {
        method: "elicitation/create",
        params: { mode: "url", url: `${baseURL}/issues/DEV-1?gate=${plan.id}` },
      },
    });
    expect(typeof answer.result?.requestState).toBe("string");
  });

  it("is told to keep waiting when it retries before anybody has decided", async () => {
    const { app, key, run, asAgent } = await agentAtAGate();
    const first = await mcp(app, key, "tools/call", {
      name: "runs_request_approval",
      arguments: { runId: run.id },
    });

    const retry = await mcp(app, key, "tools/call", {
      name: "runs_request_approval",
      arguments: { runId: run.id },
      requestState: first.result?.requestState,
      inputResponses: { approval: { action: "accept" } },
    });

    // The client saying "the Human accepted opening the URL" is not a decision,
    // so the answer is the same question with fresh state (docs/plans/m2.md).
    expect(retry.result?.resultType).toBe("input_required");
    expect(typeof retry.result?.requestState).toBe("string");
    // And asking twice is one question: the Activity feed keeps one, not two.
    const feed = await asAgent.runs.get({ runId: run.id });
    expect(feed.activities.filter((row) => row.kind === "elicitation")).toHaveLength(1);
  });
});

describe("the retry after a Human has decided", () => {
  it("completes the tool call with the ruling, and the Run is working again", async () => {
    const { app, key, run, asAdmin, admin, asAgent } = await agentAtAGate();
    const first = await mcp(app, key, "tools/call", {
      name: "runs_request_approval",
      arguments: { runId: run.id },
    });

    await asAdmin.gates.approve({ key: "DEV-1", note: "Looks right" });

    const retry = await mcp(app, key, "tools/call", {
      name: "runs_request_approval",
      arguments: { runId: run.id },
      requestState: first.result?.requestState,
      inputResponses: { approval: { action: "accept" } },
    });

    expect(retry.result?.resultType).toBe("complete");
    expect(retry.result?.structuredContent).toMatchObject({
      status: "approved",
      stateName: "Plan",
      decidedByMemberId: admin.member.id,
      note: "Looks right",
      run: { status: "active" },
    });
    // The Issue moved, which is the whole point of the round trip.
    expect((await asAgent.issues.get({ key: "DEV-1" })).state.name).toBe("Build");
  });
});

describe("the requestState a Gate elicitation hands back", () => {
  it("is refused when another principal echoes it, which the 2026-07-28 revision requires", async () => {
    const { app, auth, agent, key, run } = await agentAtAGate();
    const minted = await mcp(app, key, "tools/call", {
      name: "runs_request_approval",
      arguments: { runId: run.id },
    });
    // The same Agent on a second key is a second principal: the retry has to
    // come back on the credential the question was asked on.
    const other = await auth.api.createApiKey({
      body: { userId: agent.member.userId, name: "desktop" },
    });

    const replayed = await mcp(app, other.key, "tools/call", {
      name: "runs_request_approval",
      arguments: { runId: run.id },
      requestState: minted.result?.requestState,
    });

    expect(replayed.result).toBeUndefined();
    expect(replayed.error?.code).toBe(-32602);
    expect(replayed.error?.data?.reason).toBe("invalid_request_state");
  });

  it("is refused once it has expired, however well signed it still is", async () => {
    const { app, key, keyId, agent, run, plan } = await agentAtAGate();
    // Minted out of band on this instance's own secret and this caller's own
    // binding, and only aged: nothing about it is wrong except the clock.
    const aged = createGateElicitation({ key: secret, ttlSeconds: -1 });
    const ctx = {
      mcpReq: { method: "tools/call" },
      http: { authInfo: { clientId: `api_key:${keyId}:${agent.member.id}` } },
    } as unknown as ServerContext;
    const stale = await aged.ask(
      {
        status: "awaiting",
        url: `${baseURL}/issues/DEV-1?gate=${plan.id}`,
        stateId: plan.id,
        stateName: "Plan",
        run: { id: run.id, issueKey: "DEV-1" },
      },
      ctx,
    );

    const replayed = await mcp(app, key, "tools/call", {
      name: "runs_request_approval",
      arguments: { runId: run.id },
      requestState: stale.requestState,
    });

    expect(replayed.error?.code).toBe(-32602);
    expect(replayed.error?.data?.reason).toBe("invalid_request_state");

    // The same state, minted the same way but not aged, is accepted: what the
    // test above proves refused is the expiry and nothing else.
    const fresh = createGateElicitation({ key: secret, ttlSeconds: 60 });
    const good = await fresh.ask(
      {
        status: "awaiting",
        url: `${baseURL}/issues/DEV-1?gate=${plan.id}`,
        stateId: plan.id,
        stateName: "Plan",
        run: { id: run.id, issueKey: "DEV-1" },
      },
      ctx,
    );
    const accepted = await mcp(app, key, "tools/call", {
      name: "runs_request_approval",
      arguments: { runId: run.id },
      requestState: good.requestState,
    });
    expect(accepted.error).toBeUndefined();
    expect(accepted.result?.resultType).toBe("input_required");
  });
});

/** The names a tools/list answer advertises. */
function toolNames(answer: JsonRpcAnswer): string[] {
  return ((answer.result?.tools ?? []) as Array<{ name: string }>).map((tool) => tool.name);
}

describe("ADR-0004, where this slice puts it under the most pressure", () => {
  it("never lets an Agent decide a Gate, not even the one its own Run is stuck at", async () => {
    const { app, key, asAgent, run } = await agentAtAGate();
    await mcp(app, key, "tools/call", {
      name: "runs_request_approval",
      arguments: { runId: run.id },
    });

    // It is offered the tool that asks, and never the one that decides.
    const names = toolNames(await mcp(app, key, "tools/list", {}));
    expect(names).toContain("runs_request_approval");
    expect(names).not.toContain("gates_approve");

    const named = await mcp(app, key, "tools/call", {
      name: "gates_approve",
      arguments: { key: "DEV-1" },
    });
    expect(named.result).toBeUndefined();
    expect(named.error?.message).toContain("gates_approve");

    // And the procedure behind it refuses the Agent whatever surface asks,
    // which is what makes the missing tool a courtesy rather than the rule.
    await expect(asAgent.gates.approve({ key: "DEV-1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "An Agent cannot do that",
    });
  });

  it("refuses a Human's own MCP client too, so approval happens in deevy's UI", async () => {
    const { admin, asAdmin } = await agentAtAGate();
    // What slice 7 will mint for Claude Code once deevy is an authorization
    // server: the Member is a Human, and the credential is still delegated.
    const viaOAuth = createRouterClient(router, {
      context: {
        ...admin,
        principal: { kind: "oauth" as const, clientId: "https://claude.ai/mcp", scopes: [] },
      },
    });

    await expect(viaOAuth.gates.approve({ key: "DEV-1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(viaOAuth.gates.reject({ key: "DEV-1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    // The same Human in a browser decides it, which is the point of the rule.
    expect(await asAdmin.gates.approve({ key: "DEV-1" })).toMatchObject({
      state: { name: "Build" },
    });
  });
});
