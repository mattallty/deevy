import { member } from "@deevy/db";
import { eq } from "drizzle-orm";
import { ORPCError, createRouterClient } from "@orpc/server";
import { afterEach, describe, expect, it } from "vite-plus/test";
import type { App } from "../src/app.ts";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { opaqueToolError, toolError } from "../src/mcp/errors.ts";
import { router } from "../src/operations/index.ts";
import { agentContext, memberContext, testDb } from "./helpers.ts";

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

const secret = "test-secret-that-is-at-least-32-characters";

/** A real Better Auth instance on an in-memory database, the way the server builds it. */
function testAuth() {
  const { db, close } = testDb();
  closers.push(close);
  const auth = createAuth({
    db,
    env: {
      baseURL: "http://localhost:3000",
      secret,
      providers: { github: { clientId: "github-client", clientSecret: "github-secret" } },
    },
  });
  return { db, auth };
}

/** The protocol revision this SDK serves, and the envelope every modern request carries. */
const modern = "2026-07-28";
const envelope = {
  "io.modelcontextprotocol/protocolVersion": modern,
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "test-client", version: "0" },
};

interface JsonRpcAnswer {
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

/** One 2026-07-28 request to /mcp, the way a modern client sends it. */
async function mcp(
  app: App,
  key: string | null,
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
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: { ...params, _meta: envelope } }),
  });
  if (res.status !== 200) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as JsonRpcAnswer;
}

/** The names a tools/list answer advertises. */
function toolNames(answer: JsonRpcAnswer): string[] {
  return ((answer.result?.tools ?? []) as Array<{ name: string }>).map((tool) => tool.name);
}

/**
 * A Workspace an Agent works in: an admin Human, a granted Project with an
 * Issue in Plan, a Project the Agent was never granted, and the Agent's key.
 */
async function workspaceWithAgent() {
  const { db, auth } = testAuth();
  const admin = await memberContext(db, { role: "admin", name: "Ada" });
  const client = createRouterClient(router, { context: admin });

  const granted = await client.projects.create({ name: "deevy", key: "DEV" });
  await client.issues.create({ projectKey: "DEV", title: "Ship the MCP surface" });
  // Intent to Spec to Plan, so the Issue carries the plan Document an Agent writes.
  await client.gates.approve({ key: "DEV-1" });
  await client.gates.approve({ key: "DEV-1" });

  await client.projects.create({ name: "ops", key: "OPS" });
  await client.issues.create({ projectKey: "OPS", title: "Rotate the keys" });

  const agent = await agentContext(db, {
    sponsor: admin.member,
    name: "Planner",
    grants: [granted.id],
  });
  const issued = await auth.api.createApiKey({
    body: { userId: agent.member.userId, name: "laptop" },
  });

  return { db, auth, admin, client, agent, key: issued.key, app: createApp({ db, auth }) };
}

describe("POST /mcp without a credential", () => {
  it("is 401 and points the client at the Protected Resource Metadata (RFC 9728)", async () => {
    const { db, auth } = testAuth();
    const app = createApp({ db, auth, baseURL: "https://deevy.example.com" });

    const res = await app.request("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });

    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="https://deevy.example.com/.well-known/oauth-protected-resource/mcp"',
    );
  });

  it("serves the Protected Resource Metadata at the URL that header names", async () => {
    // RFC 9728 inserts the well-known segment between the host and the
    // resource's own path, so a client that derives the URL rather than
    // reading the header looks at /.well-known/oauth-protected-resource/mcp.
    // Better Auth's own document is the root form as well; the challenge is
    // the contract, so the challenge is what this follows (docs/plans/m2.md).
    const baseURL = "https://deevy.example.com";
    const { db, close } = testDb();
    closers.push(close);
    const auth = createAuth({
      db,
      env: { baseURL, secret, providers: { github: { clientId: "id", clientSecret: "secret" } } },
    });
    const app = createApp({ db, auth, baseURL });

    const challenged = await app.request("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    const advertised = /resource_metadata="([^"]+)"/.exec(
      challenged.headers.get("www-authenticate") ?? "",
    )?.[1];
    expect(advertised).toBe(`${baseURL}/.well-known/oauth-protected-resource/mcp`);

    const metadata = await app.request(advertised as string);
    expect(metadata.status).toBe(200);
    const body = (await metadata.json()) as Record<string, unknown>;
    expect(body.resource).toBe(`${baseURL}/mcp`);
    expect(body.authorization_servers).toEqual([baseURL]);
    expect(body.bearer_methods_supported).toEqual(["header"]);
  });

  it("falls back to the request's own origin when no base URL is configured", async () => {
    // The Workers entry builds the app per request with no auth at all
    // (apps/web/src/worker.ts): /mcp is still mounted, and answers the
    // challenge rather than 404 or a crash.
    const { db, close } = testDb();
    closers.push(close);
    const app = createApp({ db });

    const res = await app.request("http://deevy.test/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });

    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="http://deevy.test/.well-known/oauth-protected-resource/mcp"',
    );
  });
});

describe("tools/list", () => {
  it("offers an Agent the v1 tool set and nothing a Human must do in deevy's UI", async () => {
    const { app, key } = await workspaceWithAgent();

    const names = toolNames(await mcp(app, key, "tools/list", {}));

    expect(names).toContain("issues_get");
    expect(names).toContain("documents_write");
    expect(names).not.toContain("gates_approve");
    expect(names).not.toContain("projects_create");
  });
});

describe("a tool call authenticated with an Agent's key", () => {
  it("reads the Issue it was granted and writes that Issue's plan Document", async () => {
    const { app, key, client, agent } = await workspaceWithAgent();

    const read = await mcp(app, key, "tools/call", {
      name: "issues_get",
      arguments: { key: "DEV-1" },
    });
    expect(read.result?.isError).toBeUndefined();
    expect(read.result?.structuredContent).toMatchObject({
      key: "DEV-1",
      title: "Ship the MCP surface",
    });

    const written = await mcp(app, key, "tools/call", {
      name: "documents_write",
      arguments: {
        issueKey: "DEV-1",
        name: "plan",
        body: "## Files that change\n\npackages/core/src/mcp/server.ts",
      },
    });
    expect(written.result?.isError).toBeUndefined();
    expect(written.result?.structuredContent).toMatchObject({ name: "plan", version: 2 });

    // The write went through the same handler /api and /rpc call, so it is a
    // real version by that Agent, not an MCP-shaped copy of one.
    const stored = await client.documents.get({ issueKey: "DEV-1", name: "plan" });
    expect(stored.body).toContain("packages/core/src/mcp/server.ts");
    expect(stored.authorMemberId).toBe(agent.member.id);
  });

  it("is told an Issue in a Project it was never granted does not exist", async () => {
    const { app, key } = await workspaceWithAgent();

    const answer = await mcp(app, key, "tools/call", {
      name: "issues_get",
      arguments: { key: "OPS-1" },
    });

    expect(answer.result?.isError).toBe(true);
    expect(answer.result?.content).toEqual([{ type: "text", text: "No such Project" }]);
  });
});

describe("a tool deevy does not project", () => {
  it("is absent from tools/list and refused when an Agent names it anyway", async () => {
    const { app, key } = await workspaceWithAgent();

    expect(toolNames(await mcp(app, key, "tools/list", {}))).not.toContain("gates_approve");

    const answer = await mcp(app, key, "tools/call", {
      name: "gates_approve",
      arguments: { key: "DEV-1" },
    });

    expect(answer.result).toBeUndefined();
    expect(answer.error?.message).toContain("gates_approve");
  });

  it("refuses labels_delete by name, though an Agent may create a Label", async () => {
    const { app, key } = await workspaceWithAgent();

    const names = toolNames(await mcp(app, key, "tools/list", {}));
    expect(names).toContain("labels_create");
    expect(names).not.toContain("labels_delete");

    // Widening "manage Labels" stopped at creating one: deleting a
    // Workspace-scoped Label reaches Projects this Agent cannot see, so the
    // name is not a tool at all rather than a tool that answers with a refusal.
    const answer = await mcp(app, key, "tools/call", {
      name: "labels_delete",
      arguments: { labelId: "whatever" },
    });

    expect(answer.result).toBeUndefined();
    expect(answer.error?.message).toContain("labels_delete");
  });
});

describe("the tools/list filter", () => {
  it("is display only: a tool it leaves out is still refused by the middleware", async () => {
    const { db, app, key, agent } = await workspaceWithAgent();
    // A suspended Member keeps its row and its key, and is no Member as far as
    // the Workspace is concerned, so it is offered nothing at all.
    await db.update(member).set({ suspendedAt: new Date() }).where(eq(member.id, agent.member.id));

    expect(toolNames(await mcp(app, key, "tools/list", {}))).toEqual([]);

    // Named directly, the tool still runs, and authorize() is what refuses it:
    // the empty list is a courtesy, never the thing standing in the way.
    const answer = await mcp(app, key, "tools/call", {
      name: "issues_get",
      arguments: { key: "DEV-1" },
    });

    expect(answer.result?.isError).toBe(true);
    expect(answer.result?.content).toEqual([
      { type: "text", text: "Not a Member of this Workspace" },
    ]);
  });
});

/**
 * One request from a 2025-11-25 client: no per-request envelope, an initialize
 * handshake, and an SSE body. The SDK's `legacy: "stateless"` mode answers it
 * from the same factory (docs/research/mcp-spec-2026-07-28.md).
 */
async function legacyMcp(
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
      "mcp-protocol-version": "2025-11-25",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (res.status !== 200) throw new Error(`${res.status} ${await res.text()}`);
  const data = (await res.text()).split("\n").find((line) => line.startsWith("data: "));
  if (!data) throw new Error("no SSE data frame in the answer");
  return JSON.parse(data.slice("data: ".length)) as JsonRpcAnswer;
}

describe("a 2025-11-25 client", () => {
  it("still gets its handshake, its tool list and its answer", async () => {
    const { app, key } = await workspaceWithAgent();

    const init = await legacyMcp(app, key, "initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "an-older-client", version: "0" },
    });
    expect(init.result?.protocolVersion).toBe("2025-11-25");

    expect(toolNames(await legacyMcp(app, key, "tools/list", {}))).toContain("issues_get");

    const answer = await legacyMcp(app, key, "tools/call", {
      name: "issues_get",
      arguments: { key: "DEV-1" },
    });
    expect(answer.result?.isError).toBeUndefined();
    expect(answer.result?.structuredContent).toMatchObject({ key: "DEV-1" });
  });
});

describe("what an Agent is told when a tool call fails", () => {
  it("repeats an operation's own refusal, verbatim and unreported", async () => {
    const reported: unknown[] = [];
    const { db, auth, key } = await workspaceWithAgent();
    const app = createApp({ db, auth, onError: (error) => reported.push(error) });

    const refused = await mcp(app, key, "tools/call", {
      name: "documents_get",
      arguments: { issueKey: "DEV-1", name: "nonesuch" },
    });

    expect(refused.result?.isError).toBe(true);
    expect(refused.result?.content).toEqual([
      { type: "text", text: "This Issue has no nonesuch Document" },
    ]);
    expect(reported).toEqual([]);
  });

  it("keeps everything else to itself, and tells the log instead", () => {
    const reported: unknown[] = [];
    const report = (error: unknown) => reported.push(error);

    for (const code of ["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "BAD_REQUEST", "CONFLICT"]) {
      const spoken = toolError(new ORPCError(code, { message: `the ${code} reason` }), report);
      expect(spoken).toEqual({
        content: [{ type: "text", text: `the ${code} reason` }],
        isError: true,
      });
    }
    expect(reported).toEqual([]);

    // A bug in deevy, and a code the caller was never meant to read, are both
    // ours: the model is told nothing it could act on, the log gets the detail.
    const bug = new Error("SQLITE_BUSY: database is locked");
    const internal = new ORPCError("INTERNAL_SERVER_ERROR", { message: "column x does not exist" });
    for (const error of [bug, internal]) {
      expect(toolError(error, report)).toEqual({
        content: [{ type: "text", text: opaqueToolError }],
        isError: true,
      });
    }
    expect(reported).toEqual([bug, internal]);
  });
});

/**
 * The same Workspace, plus a key for the admin Human. deevy's UI only issues
 * keys to Agents; this one stands in for the OAuth token a Human's own client
 * holds, which resolvePrincipal turns into the same Member (oauth.test.ts).
 */
async function workspaceWithHumanKey() {
  const ws = await workspaceWithAgent();
  const issued = await ws.auth.api.createApiKey({
    body: { userId: ws.admin.member.userId, name: "laptop" },
  });
  return { ...ws, humanKey: issued.key };
}

describe("a Human's own client", () => {
  it("is offered what a Human may call, and nothing that is an Agent's alone", async () => {
    const { app, humanKey, key } = await workspaceWithHumanKey();

    const human = toolNames(await mcp(app, humanKey, "tools/list", {}));
    const agent = toolNames(await mcp(app, key, "tools/list", {}));

    // The writing side of a Run faces the Agent (ADR-0016)...
    for (const name of [
      "runs_start",
      "runs_post_activity",
      "runs_request_approval",
      "runs_finish",
    ]) {
      expect(human).not.toContain(name);
      expect(agent).toContain(name);
    }
    // ...answering one faces the Human, and the rest faces both.
    expect(human).toContain("runs_answer");
    expect(agent).not.toContain("runs_answer");
    for (const name of ["issues_move", "projects_get", "runs_list", "runs_get", "inbox_list"]) {
      expect(human).toContain(name);
      expect(agent).toContain(name);
    }
  });

  it("is refused a Run by the middleware when it names the tool anyway", async () => {
    const { app, humanKey } = await workspaceWithHumanKey();

    const answer = await mcp(app, humanKey, "tools/call", {
      name: "runs_start",
      arguments: { issueKey: "DEV-1" },
    });

    expect(answer.result?.isError).toBe(true);
    expect(answer.result?.content).toEqual([{ type: "text", text: "Only an Agent can do that" }]);
  });

  it("moves an Issue between States, and is still stopped at a Gate", async () => {
    const { app, humanKey, client } = await workspaceWithHumanKey();

    // `projects_get` is where a client learns the States and their ids.
    const project = await mcp(app, humanKey, "tools/call", {
      name: "projects_get",
      arguments: { key: "DEV" },
    });
    const answered = project.result?.structuredContent as
      | { states: Array<{ id: string; name: string; isGate: boolean }> }
      | undefined;
    const states = answered?.states ?? [];
    const build = states.find((state) => state.name === "Build");
    const review = states.find((state) => state.name === "Review");
    if (!build || !review) throw new Error("the default workflow lost a State");

    // DEV-1 sits in the Plan Gate, and a move is not a ruling (ADR-0004).
    const refused = await mcp(app, humanKey, "tools/call", {
      name: "issues_move",
      arguments: { key: "DEV-1", stateId: build.id },
    });
    expect(refused.result?.isError).toBe(true);
    expect(refused.result?.content).toEqual([
      { type: "text", text: "DEV-1 is in the Plan Gate; approve or reject it" },
    ]);

    // The ruling happens in deevy (ADR-0010); Build is then left like any State.
    await client.gates.approve({ key: "DEV-1" });
    const moved = await mcp(app, humanKey, "tools/call", {
      name: "issues_move",
      arguments: { key: "DEV-1", stateId: review.id },
    });
    expect(moved.result?.isError).toBeUndefined();
    expect(moved.result?.structuredContent).toMatchObject({
      key: "DEV-1",
      state: { name: "Review" },
    });
  });
});
