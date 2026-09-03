import { member, user, workspace } from "@deevy/db";
import { ORPCError, call, createRouterClient } from "@orpc/server";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createApp } from "../src/app.ts";
import { bootstrapWorkspace, slugify } from "../src/auth.ts";
import { router } from "../src/operations/index.ts";
import type { AppContext } from "../src/operations/registry.ts";
import { testDb } from "./helpers.ts";

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

function anonymous(): AppContext {
  const { db, close } = testDb();
  closers.push(close);
  return { db, session: null, member: null, workspace: null };
}

describe("createApp", () => {
  it("answers /healthz and the RPC ping without auth", async () => {
    const context = anonymous();
    const app = createApp({ db: context.db });
    expect((await app.request("/healthz")).status).toBe(200);

    const res = await app.request("/rpc/health/ping", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: undefined }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { json: { ok: boolean } };
    expect(body.json.ok).toBe(true);
  });

  it("serves the OpenAPI surface with a spec and a reference page", async () => {
    const context = anonymous();
    const app = createApp({ db: context.db });
    expect((await app.request("/api/health/ping")).status).toBe(200);
    const spec = await app.request("/api/spec.json");
    expect(spec.status).toBe(200);
    const docs = await app.request("/api/docs");
    expect(docs.status).toBe(200);
    expect(docs.headers.get("content-type")).toContain("text/html");
  });

  it("rejects session and member operations for anonymous callers", async () => {
    const context = anonymous();
    const client = createRouterClient(router, { context });
    await expect(client.me.get()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(call(router.workspace.get, undefined, { context })).rejects.toBeInstanceOf(
      ORPCError,
    );
  });
});

describe("bootstrapWorkspace", () => {
  it("creates the Workspace and the admin Member for the configured email only", async () => {
    const { db, close } = testDb();
    closers.push(close);
    await db.insert(user).values({ id: "u1", name: "Ada", email: "Ada@Example.com" });
    await db.insert(user).values({ id: "u2", name: "Bob", email: "bob@example.com" });

    await bootstrapWorkspace(
      db,
      { userId: "u2", email: "bob@example.com" },
      { adminEmail: "ada@example.com" },
    );
    expect(await db.query.workspace.findFirst()).toBeUndefined();

    await bootstrapWorkspace(
      db,
      { userId: "u1", email: "Ada@Example.com" },
      { adminEmail: "ada@example.com", workspaceName: "Flippable Team" },
    );
    const ws = await db.query.workspace.findFirst({ with: { members: true } });
    expect(ws?.slug).toBe("flippable-team");
    expect(ws?.members).toHaveLength(1);
    expect(ws?.members[0]).toMatchObject({ userId: "u1", role: "admin", kind: "human" });

    // A second admin sign-in must not create a second Workspace or Member.
    await bootstrapWorkspace(
      db,
      { userId: "u1", email: "ada@example.com" },
      { adminEmail: "ada@example.com" },
    );
    expect(await db.select().from(workspace)).toHaveLength(1);
    expect(await db.select().from(member)).toHaveLength(1);
  });

  it("adds the admin Member when the Workspace already exists without one", async () => {
    const { db, close } = testDb();
    closers.push(close);
    await db.insert(user).values({ id: "u1", name: "Ada", email: "ada@example.com" });
    await db.insert(workspace).values({ id: "w1", name: "deevy", slug: "deevy" });

    await bootstrapWorkspace(
      db,
      { userId: "u1", email: "ada@example.com" },
      { adminEmail: "ada@example.com" },
    );
    expect(await db.select().from(workspace)).toHaveLength(1);
    expect(await db.query.member.findMany()).toMatchObject([
      { userId: "u1", workspaceId: "w1", role: "admin" },
    ]);
  });

  it("slugifies names", () => {
    expect(slugify("Flippable Team!")).toBe("flippable-team");
    expect(slugify("   ")).toBe("workspace");
  });
});
