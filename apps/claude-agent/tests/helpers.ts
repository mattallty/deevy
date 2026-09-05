import { serve } from "@hono/node-server";
import { createApp } from "@deevy/core/app";
import { createAuth, type Session as AuthSession } from "@deevy/core/auth";
import { router } from "@deevy/core/router";
import { openDatabase } from "@deevy/adapters/node";
import { agent, member, projectGrant, user, workspace } from "@deevy/db";
import type { Db, Member, Workspace } from "@deevy/db";
import { createRouterClient } from "@orpc/server";
import type { Config } from "../src/config.ts";
import { createDeevy } from "../src/deevy.ts";
import type { Session, SessionEvent } from "../src/session.ts";

const migrationsFolder = new URL("../../../packages/db/drizzle", import.meta.url).pathname;
// Better Auth refuses a plain-http MCP resource that is not loopback, and this
// origin is what tokens and Gate URLs are built from either way.
const baseURL = "http://localhost:3000";

/** The knobs a test never varies, so a test that does vary one says why. */
export const testConfig: Config = {
  url: baseURL,
  key: "unset",
  pollSeconds: 1,
  runTimeoutSeconds: 60,
  model: "claude-opus-5",
  effort: "high",
  maxTurns: 10,
};

/**
 * A real deevy, and an Agent with a real key pointed at it.
 *
 * The runtime reaches it through `fetch`, and the fetch a test hands over is
 * the app's own handler: the request goes through the same routing, the same
 * middleware and the same API-key authentication a deployed instance uses,
 * with no port to bind and no process to wait for. Slice 4's container test is
 * where a real socket gets exercised (docs/plans/m4.md).
 */
export async function instance() {
  const { db, close } = openDatabase({ path: ":memory:", migrationsFolder });
  const auth = createAuth({
    db,
    env: {
      baseURL,
      secret: "test-secret-that-is-at-least-32-characters",
      github: { clientId: "id", clientSecret: "secret" },
    },
  });
  const app = createApp({ db, auth, baseURL });

  const ada = await insertMember(db, { name: "Ada", role: "admin", kind: "human" });
  const asAda = createRouterClient(router, { context: contextFor(db, ada.member, ada.workspace) });
  const project = await asAda.projects.create({ name: "deevy", key: "DEV" });

  const planner = await insertMember(db, { name: "Planner", role: "member", kind: "agent" });
  await db.insert(agent).values({ memberId: planner.member.id });
  await db.insert(projectGrant).values({ memberId: planner.member.id, projectId: project.id });
  const issued = await auth.api.createApiKey({
    body: { userId: planner.member.userId, name: "runtime" },
  });

  const config: Config = { ...testConfig, url: baseURL, key: issued.key };
  return {
    db,
    close,
    config,
    deevy: createDeevy({
      config,
      fetch: async (input, init) => app.request(input as string, init),
    }),
    /**
     * The Agent's key against a path the supervisor itself never calls. The
     * model reaches those over MCP, and a test playing the model needs a way to
     * make the same write without standing a second client up.
     */
    asAgent: async (path: string, body = "{}") => {
      const res = await app.request(`/api${path}`, {
        method: "POST",
        body,
        headers: { authorization: `Bearer ${issued.key}`, "content-type": "application/json" },
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      return (await res.json()) as unknown;
    },
    /**
     * The same deevy on a real port. Only the live test needs one: a session
     * that spawns Claude is a subprocess, and a subprocess cannot reach a
     * handler that lives in this process's memory.
     */
    listen: async () => {
      const server = serve({ fetch: app.fetch, port: 0 });
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      return {
        url: `http://localhost:${port}`,
        close: () => new Promise<void>((resolve) => server.close(() => resolve())),
      };
    },
    asAda,
    ada: ada.member,
    planner: planner.member,
  };
}

async function insertMember(
  db: Db,
  options: { name: string; role: Member["role"]; kind: Member["kind"] },
): Promise<{ member: Member; workspace: Workspace }> {
  const userId = crypto.randomUUID();
  await db
    .insert(user)
    .values({ id: userId, name: options.name, email: `${options.name.toLowerCase()}@deevy.test` });
  let found = await db.query.workspace.findFirst();
  if (!found) {
    const id = crypto.randomUUID();
    await db.insert(workspace).values({ id, name: "deevy", slug: "deevy" });
    found = await db.query.workspace.findFirst({ where: { id } });
  }
  const ws = found as Workspace;
  const memberId = crypto.randomUUID();
  await db.insert(member).values({
    id: memberId,
    workspaceId: ws.id,
    userId,
    role: options.role,
    kind: options.kind,
  });
  return {
    member: (await db.query.member.findFirst({ where: { id: memberId } })) as Member,
    workspace: ws,
  };
}

/**
 * The context an operation sees for a Human signed in to deevy. Built here
 * rather than imported: the runtime's tests may reach into the workspace, and
 * reaching into `packages/core`'s internals is still reaching too far.
 */
function contextFor(db: Db, row: Member, ws: Workspace) {
  return {
    db,
    workspace: ws,
    member: row,
    baseURL,
    session: {
      session: { id: crypto.randomUUID(), userId: row.userId, token: "t", expiresAt: new Date() },
      user: { id: row.userId, name: row.id, email: "ada@deevy.test", image: null, kind: row.kind },
    } as unknown as AuthSession,
  };
}

/** A session that yields what a test wrote and does what a test told it to. */
export function scripted(
  steps: Array<SessionEvent | (() => Promise<void>)>,
  ready: SessionEvent = {
    type: "ready",
    tools: [],
    servers: [{ name: "deevy", status: "connected" }],
  },
): Session {
  return async function* () {
    yield ready;
    for (const step of steps) {
      if (typeof step === "function") await step();
      else yield step;
    }
  };
}

export const finished: SessionEvent = { type: "done", ok: true, detail: "done" };
