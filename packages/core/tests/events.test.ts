import { user, workspace } from "@deevy/db";
import { createRouterClient } from "@orpc/server";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { bootstrapWorkspace } from "../src/auth.ts";
import { appendEvent } from "../src/events.ts";
import { router } from "../src/operations/index.ts";
import { contextFor, memberContext, testDb } from "./helpers.ts";

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

describe("appendEvent", () => {
  it("records the Event with the caller as actor, and a seq that rises", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const context = await memberContext(db);

    const created = await appendEvent(context, {
      kind: "workspace.created",
      subjectType: "workspace",
      subjectId: context.workspace.id,
    });
    const joined = await appendEvent(context, {
      kind: "member.joined",
      subjectType: "member",
      subjectId: context.member.id,
      payload: { role: "admin" },
    });

    expect(created).toMatchObject({
      workspaceId: context.workspace.id,
      actorMemberId: context.member.id,
      kind: "workspace.created",
      subjectType: "workspace",
      subjectId: context.workspace.id,
      projectId: null,
    });
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(joined.payload).toEqual({ role: "admin" });
    expect(joined.seq).toBeGreaterThan(created.seq);
  });
});

describe("events.list", () => {
  it("returns the Workspace's Events in seq order, with the last seq as the cursor", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const context = await memberContext(db);
    await appendEvent(context, {
      kind: "workspace.created",
      subjectType: "workspace",
      subjectId: context.workspace.id,
    });
    const joined = await appendEvent(context, {
      kind: "member.joined",
      subjectType: "member",
      subjectId: context.member.id,
    });

    const client = createRouterClient(router, { context });
    const page = await client.events.list({});

    expect(page.events.map((e) => e.kind)).toEqual(["workspace.created", "member.joined"]);
    expect(page.events[1]).toMatchObject({ actorMemberId: context.member.id });
    expect(page.nextCursor).toBe(joined.seq);
  });
});

describe("events.list from a cursor", () => {
  it("returns only the Events after the given seq", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const context = await memberContext(db);
    const created = await appendEvent(context, {
      kind: "workspace.created",
      subjectType: "workspace",
      subjectId: context.workspace.id,
    });
    await appendEvent(context, {
      kind: "member.joined",
      subjectType: "member",
      subjectId: context.member.id,
    });

    const client = createRouterClient(router, { context });
    const page = await client.events.list({ after: created.seq });

    expect(page.events.map((e) => e.kind)).toEqual(["member.joined"]);
    expect(await client.events.list({ after: page.nextCursor ?? 0 })).toMatchObject({
      events: [],
      nextCursor: null,
    });
  });
});

describe("events.list newest first", () => {
  it("orders by seq descending on request and pages back with before", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const context = await memberContext(db, { role: "admin" });
    const client = createRouterClient(router, { context });
    for (const kind of ["workspace.created", "member.joined", "issue.created"] as const) {
      await appendEvent(context, {
        kind,
        subjectType: "workspace",
        subjectId: context.workspace.id,
      });
    }

    const newest = await client.events.list({ order: "desc", limit: 2 });
    expect(newest.events.map((event) => event.kind)).toEqual(["issue.created", "member.joined"]);
    const older = await client.events.list({ order: "desc", before: newest.nextCursor ?? 0 });
    expect(older.events.map((event) => event.kind)).toEqual(["workspace.created"]);
    expect(older.nextCursor).toBe(older.events[0]?.seq ?? null);
  });
});

describe("events.list scoping", () => {
  it("never returns Events belonging to another Workspace", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const context = await memberContext(db);
    const other = crypto.randomUUID();
    await db.insert(workspace).values({ id: other, name: "other", slug: "other" });
    await appendEvent(
      { db, workspace: { id: other }, member: null },
      {
        kind: "workspace.created",
        subjectType: "workspace",
        subjectId: other,
      },
    );
    await appendEvent(context, {
      kind: "member.joined",
      subjectType: "member",
      subjectId: context.member.id,
    });

    const client = createRouterClient(router, { context });
    const page = await client.events.list({});

    expect(page.events.map((e) => e.kind)).toEqual(["member.joined"]);
  });

  it("filters by subject", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const context = await memberContext(db);
    await appendEvent(context, {
      kind: "workspace.created",
      subjectType: "workspace",
      subjectId: context.workspace.id,
    });
    await appendEvent(context, {
      kind: "member.joined",
      subjectType: "member",
      subjectId: context.member.id,
    });

    const client = createRouterClient(router, { context });
    const page = await client.events.list({
      subjectType: "member",
      subjectId: context.member.id,
    });

    expect(page.events.map((e) => e.kind)).toEqual(["member.joined"]);
  });
});

describe("the Event log after bootstrap", () => {
  it("records workspace.created then member.joined, with no actor", async () => {
    const { db, close } = testDb();
    closers.push(close);
    await db.insert(user).values({ id: "u1", name: "Ada", email: "ada@example.com" });
    await bootstrapWorkspace(
      db,
      { userId: "u1", email: "ada@example.com" },
      {
        adminEmail: "ada@example.com",
        workspaceName: "Flippable Team",
      },
    );

    const ws = await db.query.workspace.findFirst({ with: { members: true } });
    const admin = ws?.members[0];
    if (!ws || !admin) throw new Error("bootstrap left no Workspace or Member");

    const client = createRouterClient(router, { context: contextFor(db, admin, ws) });
    const page = await client.events.list({});

    expect(page.events.map((e) => e.kind)).toEqual(["workspace.created", "member.joined"]);
    expect(page.events.map((e) => e.actorMemberId)).toEqual([null, null]);
    expect(page.events.map((e) => e.subjectId)).toEqual([ws.id, admin.id]);
  });

  it("records only member.joined when the Workspace already exists", async () => {
    const { db, close } = testDb();
    closers.push(close);
    await db.insert(user).values({ id: "u1", name: "Ada", email: "ada@example.com" });
    await db.insert(workspace).values({ id: "w1", name: "deevy", slug: "deevy" });
    await bootstrapWorkspace(
      db,
      { userId: "u1", email: "ada@example.com" },
      {
        adminEmail: "ada@example.com",
      },
    );

    const ws = await db.query.workspace.findFirst({ with: { members: true } });
    const admin = ws?.members[0];
    if (!ws || !admin) throw new Error("bootstrap left no Member");

    const client = createRouterClient(router, { context: contextFor(db, admin, ws) });
    expect((await client.events.list({})).events.map((e) => e.kind)).toEqual(["member.joined"]);
  });
});

describe("events.list access", () => {
  it("refuses an anonymous caller", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const client = createRouterClient(router, {
      context: { db, session: null, member: null, workspace: null },
    });
    await expect(client.events.list({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
