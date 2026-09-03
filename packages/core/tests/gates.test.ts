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

async function withIssue(db: MemberContext["db"]) {
  const admin = await memberContext(db, { role: "admin", name: "Ada" });
  const client = createRouterClient(router, { context: admin });
  const project = await client.projects.create({ name: "deevy", key: "DEV" });
  const issue = await client.issues.create({ projectKey: "DEV", title: "Ship it" });
  const state = (name: string) => project.states.find((s) => s.name === name)!;
  return { admin, client, project, issue, state };
}

describe("issues.move", () => {
  it("refuses to leave a Gate without a decision", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client, state } = await withIssue(db);

    await expect(
      client.issues.move({ key: "DEV-1", stateId: state("Spec").id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("moves freely between States that are not Gates", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client, state } = await withIssue(db);
    // Walk the Gates until the Issue sits in Build, which is not one.
    for (const _ of ["Intent", "Spec", "Plan"]) {
      await client.gates.approve({ key: "DEV-1" });
    }
    const before = await client.issues.get({ key: "DEV-1" });
    expect(before.state.name).toBe("Build");

    const moved = await client.issues.move({ key: "DEV-1", stateId: state("Review").id });

    expect(moved.state.name).toBe("Review");
    expect(moved.stateEnteredAt).toBeInstanceOf(Date);
    const page = await client.events.list({ subjectType: "issue", subjectId: moved.id });
    expect(page.events.at(-1)).toMatchObject({
      kind: "issue.moved",
      payload: { from: "Build", to: "Review" },
    });
  });
});

describe("gates.approve", () => {
  it("moves the Issue to the next State and records the decision", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { admin, client, state } = await withIssue(db);

    const approved = await client.gates.approve({ key: "DEV-1", note: "Worth doing" });

    expect(approved.state.name).toBe("Spec");
    expect(approved.gateDecisions).toMatchObject([
      { decision: "approved", note: "Worth doing", stateId: state("Intent").id },
    ]);
    const page = await client.events.list({ subjectType: "issue", subjectId: approved.id });
    expect(page.events.at(-1)).toMatchObject({
      kind: "gate.approved",
      actorMemberId: admin.member.id,
      payload: { state: "Intent" },
    });
  });

  it("refuses when the Issue is not in a Gate", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client, state } = await withIssue(db);
    for (const _ of ["Intent", "Spec", "Plan"]) {
      await client.gates.approve({ key: "DEV-1" });
    }
    expect((await client.issues.get({ key: "DEV-1" })).state.id).toBe(state("Build").id);

    await expect(client.gates.approve({ key: "DEV-1" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("refuses an Agent, because only a Human approves a Gate", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { admin, client } = await withIssue(db);
    await db.update(memberTable).set({ kind: "agent" }).where(eq(memberTable.id, admin.member.id));
    const asAgent = await db.query.member.findFirst({ where: { id: admin.member.id } });

    const agentClient = createRouterClient(router, {
      context: { ...admin, member: asAgent ?? admin.member },
    });
    await expect(agentClient.gates.approve({ key: "DEV-1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await client.issues.get({ key: "DEV-1" })).toMatchObject({
      state: { name: "Intent" },
    });
  });
});

describe("gates.reject", () => {
  it("sends the Issue back to the previous State", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withIssue(db);
    await client.gates.approve({ key: "DEV-1" });

    const rejected = await client.gates.reject({ key: "DEV-1", note: "Needs rethinking" });

    expect(rejected.state.name).toBe("Intent");
    const page = await client.events.list({ subjectType: "issue", subjectId: rejected.id });
    expect(page.events.at(-1)).toMatchObject({
      kind: "gate.rejected",
      payload: { state: "Spec" },
    });
  });

  it("keeps the Issue in place when the Gate is the first State", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withIssue(db);

    const rejected = await client.gates.reject({ key: "DEV-1" });

    expect(rejected.state.name).toBe("Intent");
    expect(rejected.gateDecisions).toMatchObject([{ decision: "rejected" }]);
  });
});

describe("a done State", () => {
  it("closes the Issue and hides it from open lists, and reopening clears that", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client, state } = await withIssue(db);
    for (const _ of ["Intent", "Spec", "Plan"]) {
      await client.gates.approve({ key: "DEV-1" });
    }
    await client.issues.move({ key: "DEV-1", stateId: state("Review").id });
    const done = await client.gates.approve({ key: "DEV-1" });

    expect(done.state.name).toBe("Done");
    expect(done.closedAt).toBeInstanceOf(Date);
    expect((await client.issues.list({ projectKey: "DEV", open: true })).issues).toEqual([]);

    const reopened = await client.issues.move({ key: "DEV-1", stateId: state("Build").id });
    expect(reopened.closedAt).toBeNull();
    expect((await client.issues.list({ projectKey: "DEV", open: true })).issues).toHaveLength(1);
  });
});
