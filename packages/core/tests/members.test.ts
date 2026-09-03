import { createRouterClient } from "@orpc/server";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { router } from "../src/operations/index.ts";
import { memberContext, testDb } from "./helpers.ts";

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

describe("members.list", () => {
  it("returns every Member of the Workspace with the Human behind it", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    await memberContext(db, { name: "Bob", email: "bob@flippable.net" });

    const client = createRouterClient(router, { context: admin });
    const { members } = await client.members.list({});

    expect(members).toHaveLength(2);
    expect(members.map((m) => m.user.name).sort()).toEqual(["Ada", "Bob"]);
    expect(members.find((m) => m.user.name === "Ada")).toMatchObject({ role: "admin" });
    expect(members.find((m) => m.user.name === "Bob")).toMatchObject({
      role: "member",
      kind: "human",
    });
  });

  it("is open to any Member, not only an admin", async () => {
    const { db, close } = testDb();
    closers.push(close);
    await memberContext(db, { role: "admin", name: "Ada" });
    const bob = await memberContext(db, { name: "Bob", email: "bob@flippable.net" });

    const client = createRouterClient(router, { context: bob });
    expect((await client.members.list({})).members).toHaveLength(2);
  });
});

describe("members.updateRole", () => {
  it("promotes a Member and records the change", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    const bob = await memberContext(db, { name: "Bob", email: "bob@flippable.net" });

    const client = createRouterClient(router, { context: admin });
    expect(
      await client.members.updateRole({ memberId: bob.member.id, role: "admin" }),
    ).toMatchObject({ id: bob.member.id, role: "admin" });

    const page = await client.events.list({ subjectType: "member", subjectId: bob.member.id });
    expect(page.events).toMatchObject([
      {
        kind: "member.role_changed",
        actorMemberId: admin.member.id,
        payload: { from: "member", to: "admin" },
      },
    ]);
  });

  it("refuses a Member who is not an admin", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    const bob = await memberContext(db, { name: "Bob", email: "bob@flippable.net" });

    const client = createRouterClient(router, { context: bob });
    await expect(
      client.members.updateRole({ memberId: admin.member.id, role: "member" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("will not demote the last admin", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    await memberContext(db, { name: "Bob", email: "bob@flippable.net" });

    const client = createRouterClient(router, { context: admin });
    await expect(
      client.members.updateRole({ memberId: admin.member.id, role: "member" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("reports an unknown Member as not found", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });

    const client = createRouterClient(router, { context: admin });
    await expect(
      client.members.updateRole({ memberId: crypto.randomUUID(), role: "admin" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("members.suspend and members.reinstate", () => {
  it("suspends a Member and lets them back in", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    const bob = await memberContext(db, { name: "Bob", email: "bob@flippable.net" });
    const client = createRouterClient(router, { context: admin });

    const suspended = await client.members.suspend({ memberId: bob.member.id });
    expect(suspended.suspendedAt).toBeInstanceOf(Date);
    await expect(
      createRouterClient(router, {
        context: { ...bob, member: suspended },
      }).workspace.get(),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(await client.members.reinstate({ memberId: bob.member.id })).toMatchObject({
      suspendedAt: null,
    });

    const page = await client.events.list({ subjectType: "member", subjectId: bob.member.id });
    expect(page.events.map((e) => e.kind)).toEqual(["member.suspended", "member.reinstated"]);
    expect(page.events.map((e) => e.actorMemberId)).toEqual([admin.member.id, admin.member.id]);
  });

  it("will not suspend the last admin", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    await memberContext(db, { name: "Bob", email: "bob@flippable.net" });

    const client = createRouterClient(router, { context: admin });
    await expect(client.members.suspend({ memberId: admin.member.id })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("refuses a Member who is not an admin", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    const bob = await memberContext(db, { name: "Bob", email: "bob@flippable.net" });

    const client = createRouterClient(router, { context: bob });
    await expect(client.members.suspend({ memberId: admin.member.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
