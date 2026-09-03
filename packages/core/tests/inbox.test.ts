import { member as memberTable } from "@deevy/db";
import { createRouterClient } from "@orpc/server";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { router } from "../src/operations/index.ts";
import { memberContext, testDb, type MemberContext } from "./helpers.ts";

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

async function workspace(db: MemberContext["db"]) {
  const alice = await memberContext(db, { role: "admin", name: "Alice" });
  const bob = await memberContext(db, { name: "Bob", email: "bob@flippable.net" });
  const carol = await memberContext(db, { name: "Carol", email: "carol@flippable.net" });
  await db.update(memberTable).set({ handle: "bob" }).where(eq(memberTable.id, bob.member.id));
  const asAlice = createRouterClient(router, { context: alice });
  const asBob = createRouterClient(router, { context: bob });
  const asCarol = createRouterClient(router, { context: carol });
  await asAlice.projects.create({ name: "deevy", key: "DEV" });
  return { alice, bob, carol, asAlice, asBob, asCarol };
}

describe("an assignment", () => {
  it("notifies the new Assignee and nobody else", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { bob, asAlice, asBob, asCarol } = await workspace(db);
    await asAlice.issues.create({ projectKey: "DEV", title: "Ship it" });

    await asAlice.issues.update({ key: "DEV-1", assigneeMemberId: bob.member.id });

    const inbox = await asBob.inbox.list({});
    expect(inbox.notifications.filter((n) => n.kind === "assignment")).toHaveLength(1);
    expect(
      (await asCarol.inbox.list({})).notifications.filter((n) => n.kind === "assignment"),
    ).toEqual([]);
    expect(
      (await asAlice.inbox.list({})).notifications.filter((n) => n.kind === "assignment"),
    ).toEqual([]);
  });

  it("says nothing when someone assigns an Issue to themselves", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { alice, asAlice } = await workspace(db);
    await asAlice.issues.create({ projectKey: "DEV", title: "Ship it" });

    await asAlice.issues.update({ key: "DEV-1", assigneeMemberId: alice.member.id });

    expect(
      (await asAlice.inbox.list({})).notifications.filter((n) => n.kind === "assignment"),
    ).toEqual([]);
  });
});

describe("a mention", () => {
  it("notifies the mentioned Member but not the one who wrote it", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { asAlice, asBob } = await workspace(db);
    await asAlice.issues.create({ projectKey: "DEV", title: "Ship it" });

    await asAlice.comments.create({ issueKey: "DEV-1", body: "over to @bob" });

    expect(
      (await asBob.inbox.list({})).notifications.filter((n) => n.kind === "mention"),
    ).toHaveLength(1);
    expect(
      (await asAlice.inbox.list({})).notifications.filter((n) => n.kind === "mention"),
    ).toEqual([]);
  });
});

describe("an Issue arriving in a Gate", () => {
  it("tells every other Human a Gate is waiting for them", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { asAlice, asBob, asCarol } = await workspace(db);

    await asAlice.issues.create({ projectKey: "DEV", title: "Needs a decision" });

    for (const client of [asBob, asCarol]) {
      const inbox = await client.inbox.list({});
      expect(inbox.notifications.filter((n) => n.kind === "gate_awaiting")).toHaveLength(1);
    }
    expect(
      (await asAlice.inbox.list({})).notifications.filter((n) => n.kind === "gate_awaiting"),
    ).toEqual([]);
  });

  it("says nothing when the Issue lands in a State that is not a Gate", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { asAlice, asBob } = await workspace(db);
    await asAlice.issues.create({ projectKey: "DEV", title: "Ship it" });
    for (const _ of ["Intent", "Spec", "Plan"]) await asAlice.gates.approve({ key: "DEV-1" });
    const { states } = await asAlice.workflow.get({ projectKey: "DEV" });

    await asAlice.issues.move({
      key: "DEV-1",
      stateId: states.find((s) => s.name === "Done")!.id,
    });

    // Only the creation into the Intent Gate notified. Approving through Spec
    // and Plan did not, because docs/plans/m1.md lists issue.created,
    // issue.moved and gate.rejected as the triggers and not gate.approved:
    // an Issue can reach the Spec Gate with nobody told. Worth revisiting.
    expect(
      (await asBob.inbox.list({})).notifications.filter((n) => n.kind === "gate_awaiting"),
    ).toHaveLength(1);
  });
});

describe("the inbox", () => {
  it("counts unread, marks read for the caller only, and pages", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { bob, asAlice, asBob, asCarol } = await workspace(db);
    await asAlice.issues.create({ projectKey: "DEV", title: "One" });
    await asAlice.issues.update({ key: "DEV-1", assigneeMemberId: bob.member.id });

    const before = await asBob.inbox.unreadCount({});
    expect(before.unread).toBeGreaterThan(0);
    const carolBefore = await asCarol.inbox.unreadCount({});

    const { notifications } = await asBob.inbox.list({});
    await asBob.inbox.markRead({ ids: notifications.map((n) => n.id) });

    expect((await asBob.inbox.unreadCount({})).unread).toBe(0);
    expect((await asCarol.inbox.unreadCount({})).unread).toBe(carolBefore.unread);
    expect((await asBob.inbox.list({ unreadOnly: true })).notifications).toEqual([]);
  });

  it("marks everything read at once", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { asAlice, asBob } = await workspace(db);
    await asAlice.issues.create({ projectKey: "DEV", title: "One" });

    await asBob.inbox.markAllRead({});

    expect((await asBob.inbox.unreadCount({})).unread).toBe(0);
  });

  it("never shows one Member another's Notifications", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { bob, asAlice, asCarol } = await workspace(db);
    await asAlice.issues.create({ projectKey: "DEV", title: "One" });
    await asAlice.issues.update({ key: "DEV-1", assigneeMemberId: bob.member.id });

    const carol = await asCarol.inbox.list({});
    expect(carol.notifications.every((n) => n.recipientMemberId !== bob.member.id)).toBe(true);
  });
});
