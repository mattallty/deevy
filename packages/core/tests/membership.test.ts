import { allowlistRule, member, user } from "@deevy/db";
import { createRouterClient } from "@orpc/server";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { bootstrapWorkspace, joinWorkspace } from "../src/auth.ts";
import { router } from "../src/operations/index.ts";
import { memberContext, testDb, type MemberContext } from "./helpers.ts";
import { newId } from "../src/ids.ts";

/** An admin plus one allowlist rule: the arrangement every join test starts from. */
async function allow(
  db: Parameters<typeof memberContext>[0],
  value: string,
  kind = "email_domain",
) {
  const admin = await memberContext(db, { role: "admin", name: "Ada" });
  await db.insert(allowlistRule).values({
    id: newId("allowlistRule"),
    workspaceId: admin.workspace.id,
    kind: kind as "email_domain" | "github_org",
    value,
    createdBy: admin.member.id,
  });
  return admin satisfies MemberContext;
}

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

describe("joinWorkspace", () => {
  it("makes a Member of a sign-in whose email domain a rule allows", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    await db.insert(allowlistRule).values({
      id: newId("allowlistRule"),
      workspaceId: admin.workspace.id,
      kind: "email_domain",
      value: "example.com",
      createdBy: admin.member.id,
    });
    await db.insert(user).values({ id: "u-bob", name: "Bob", email: "bob@example.com" });

    await joinWorkspace(db, { userId: "u-bob", email: "bob@example.com", name: "Bob" });

    expect(await db.query.member.findFirst({ where: { userId: "u-bob" } })).toMatchObject({
      workspaceId: admin.workspace.id,
      role: "member",
      kind: "human",
    });
  });

  it("leaves a sign-in no Member when no rule matches", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    await db.insert(allowlistRule).values({
      id: newId("allowlistRule"),
      workspaceId: admin.workspace.id,
      kind: "email_domain",
      value: "example.com",
      createdBy: admin.member.id,
    });
    await db.insert(user).values({ id: "u-carol", name: "Carol", email: "carol@example.org" });

    await joinWorkspace(db, { userId: "u-carol", email: "carol@example.org", name: "Carol" });

    expect(await db.query.member.findFirst({ where: { userId: "u-carol" } })).toBeUndefined();
  });
});

describe("the handle a Member joins with", () => {
  it("takes the GitHub login when the sign-in supplies one", async () => {
    const { db, close } = testDb();
    closers.push(close);
    await allow(db, "example.com");
    await db.insert(user).values({ id: "u-bob", name: "Bob Vance", email: "bob@example.com" });

    await joinWorkspace(
      db,
      { userId: "u-bob", email: "bob@example.com", name: "Bob Vance" },
      { githubLogin: "bvance" },
    );

    expect(await db.query.member.findFirst({ where: { userId: "u-bob" } })).toMatchObject({
      handle: "bvance",
    });
  });

  it("falls back to a slug of the name", async () => {
    const { db, close } = testDb();
    closers.push(close);
    await allow(db, "example.com");
    await db.insert(user).values({ id: "u-bob", name: "Bob Vance", email: "bob@example.com" });

    await joinWorkspace(db, { userId: "u-bob", email: "bob@example.com", name: "Bob Vance" });

    expect(await db.query.member.findFirst({ where: { userId: "u-bob" } })).toMatchObject({
      handle: "bob-vance",
    });
  });

  it("suffixes a handle another Member already holds", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await allow(db, "example.com");
    await db.update(member).set({ handle: "bob-vance" }).where(eq(member.id, admin.member.id));
    await db.insert(user).values({ id: "u-bob", name: "Bob Vance", email: "bob@example.com" });

    await joinWorkspace(db, { userId: "u-bob", email: "bob@example.com", name: "Bob Vance" });

    expect(await db.query.member.findFirst({ where: { userId: "u-bob" } })).toMatchObject({
      handle: "bob-vance-2",
    });
  });
});

describe("the Event a join appends", () => {
  it("records member.joined with the new Member as subject and no actor", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await allow(db, "example.com");
    await db.insert(user).values({ id: "u-bob", name: "Bob", email: "bob@example.com" });

    await joinWorkspace(db, { userId: "u-bob", email: "bob@example.com", name: "Bob" });

    const bob = await db.query.member.findFirst({ where: { userId: "u-bob" } });
    const client = createRouterClient(router, { context: admin });
    const page = await client.events.list({ subjectType: "member", subjectId: bob?.id });
    expect(page.events).toMatchObject([
      { kind: "member.joined", actorMemberId: null, payload: { role: "member", kind: "human" } },
    ]);
  });
});

describe("a github_org rule", () => {
  it("admits a sign-in whose organizations include the rule's value", async () => {
    const { db, close } = testDb();
    closers.push(close);
    await allow(db, "acme", "github_org");
    await db.insert(user).values({ id: "u-bob", name: "Bob", email: "bob@example.org" });

    await joinWorkspace(
      db,
      { userId: "u-bob", email: "bob@example.org", name: "Bob" },
      { listOrgs: async () => ["Acme", "Acme"] },
    );

    expect(await db.query.member.findFirst({ where: { userId: "u-bob" } })).toMatchObject({
      role: "member",
    });
  });

  it("turns away a sign-in in none of the allowed organizations", async () => {
    const { db, close } = testDb();
    closers.push(close);
    await allow(db, "acme", "github_org");
    await db.insert(user).values({ id: "u-bob", name: "Bob", email: "bob@example.org" });

    await joinWorkspace(
      db,
      { userId: "u-bob", email: "bob@example.org", name: "Bob" },
      { listOrgs: async () => ["Globex"] },
    );

    expect(await db.query.member.findFirst({ where: { userId: "u-bob" } })).toBeUndefined();
  });

  it("never asks for organizations when an email domain already matched", async () => {
    const { db, close } = testDb();
    closers.push(close);
    await allow(db, "example.com");
    await db.insert(user).values({ id: "u-bob", name: "Bob", email: "bob@example.com" });
    let asked = false;

    await joinWorkspace(
      db,
      { userId: "u-bob", email: "bob@example.com", name: "Bob" },
      {
        listOrgs: async () => {
          asked = true;
          return [];
        },
      },
    );

    expect(asked).toBe(false);
  });
});

describe("a suspended Member", () => {
  it("is turned away from Workspace operations", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const context = await memberContext(db);
    await db
      .update(member)
      .set({ suspendedAt: new Date() })
      .where(eq(member.id, context.member.id));
    const suspended = await db.query.member.findFirst({ where: { id: context.member.id } });

    const client = createRouterClient(router, {
      context: { ...context, member: suspended ?? context.member },
    });
    await expect(client.workspace.get()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("the admin the bootstrap creates", () => {
  it("carries a handle, so slice 10 can mention them", async () => {
    const { db, close } = testDb();
    closers.push(close);
    await db.insert(user).values({ id: "u1", name: "Ada Lovelace", email: "ada@example.com" });

    await bootstrapWorkspace(
      db,
      { userId: "u1", email: "ada@example.com", name: "Ada Lovelace" },
      { adminEmail: "ada@example.com" },
    );

    expect(await db.query.member.findFirst({ where: { userId: "u1" } })).toMatchObject({
      handle: "ada-lovelace",
    });
  });
});
