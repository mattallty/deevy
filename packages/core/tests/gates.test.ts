import { member as memberTable } from "@deevy/db";
import { createRouterClient } from "@orpc/server";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { router } from "../src/operations/index.ts";
import { agentContext, memberContext, testDb, type MemberContext } from "./helpers.ts";

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
    expect(page.events.findLast((e) => e.kind === "issue.moved")).toMatchObject({
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
    expect(page.events.find((e) => e.kind === "gate.approved")).toMatchObject({
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
    expect(page.events.findLast((e) => e.kind === "gate.rejected")).toMatchObject({
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

describe("the approvers a Gate names", () => {
  it("are the only Humans asked when the Issue reaches that Gate", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { admin, client, state } = await withIssue(db);
    const bob = await memberContext(db, { name: "Bob", email: "bob@example.com" });
    const carol = await memberContext(db, { name: "Carol", email: "carol@example.com" });
    const states = (await client.workflow.get({ projectKey: "DEV" })).states;
    await client.workflow.update({
      projectKey: "DEV",
      states: states.map((current) => ({
        id: current.id,
        name: current.name,
        isGate: current.isGate,
        category: current.category,
        approverMemberIds: current.name === "Spec" ? [bob.member.id] : [],
      })),
    });

    // Intent names nobody, so approving it tells every other active Human; the
    // Spec Gate it lands in names Bob, so only Bob is asked to decide it.
    await client.gates.approve({ key: "DEV-1" });

    const asked = await db.query.notification.findMany({ where: { kind: "gate_awaiting" } });
    expect(asked.map((row) => row.recipientMemberId)).toEqual([bob.member.id]);
    expect(asked.map((row) => row.recipientMemberId)).not.toContain(carol.member.id);
    expect(state("Spec").isGate).toBe(true);
    expect(admin.member.id).toBeTruthy();
  });

  it("are the only Humans who may decide it, and every Human again once named none", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withIssue(db);
    const bob = await memberContext(db, { name: "Bob", email: "bob@example.com" });
    const asBob = createRouterClient(router, { context: bob });
    const named = (approverMemberIds: string[]) =>
      client.workflow.get({ projectKey: "DEV" }).then(({ states }) =>
        client.workflow.update({
          projectKey: "DEV",
          states: states.map((current) => ({
            id: current.id,
            name: current.name,
            isGate: current.isGate,
            category: current.category,
            approverMemberIds: current.name === "Intent" ? approverMemberIds : [],
          })),
        }),
      );

    await named([bob.member.id]);
    // Ada is an admin, and still not one of the Humans this Gate names.
    await expect(client.gates.approve({ key: "DEV-1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(client.gates.reject({ key: "DEV-1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    await named([]);
    expect((await client.gates.approve({ key: "DEV-1" })).state.name).toBe("Spec");
    expect(asBob).toBeTruthy();
  });
});

/**
 * A Gate that wants more than one Human (docs/plans/four-eyes-gates.md). Every
 * test here stands up a second Human against a real deevy: one Member cannot
 * prove a rule about two, and a faked second proves the fake.
 */
async function withTwoHumans(db: MemberContext["db"]) {
  const base = await withIssue(db);
  const grace = await memberContext(db, { name: "Grace" });
  const asGrace = createRouterClient(router, { context: grace });
  return { ...base, grace, asGrace };
}

/** Rewrite the Workflow whole, changing one Gate's rules and nothing else. */
type Client = Awaited<ReturnType<typeof withIssue>>["client"];

async function wants(
  client: Client,
  states: Array<{
    id: string;
    name: string;
    isGate: boolean;
    category: "backlog" | "active" | "done";
  }>,
  gate: string,
  rules: { approvalsRequired?: number; excludeRequester?: boolean },
) {
  await client.workflow.update({
    projectKey: "DEV",
    states: states.map((state) => ({
      id: state.id,
      name: state.name,
      isGate: state.isGate,
      category: state.category,
      ...(state.name === gate ? rules : {}),
    })),
  });
}

describe("a Gate that wants two Humans", () => {
  it("holds the Issue on the first approval and opens on the second", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { admin, client, project, asGrace, grace } = await withTwoHumans(db);
    await wants(client, project.states, "Intent", { approvalsRequired: 2 });

    const first = await client.gates.approve({ key: "DEV-1", note: "Worth doing" });

    expect(first.state.name).toBe("Intent");
    const after = await client.events.list({ subjectType: "issue", subjectId: first.id });
    expect(after.events.find((e) => e.kind === "gate.approval")).toMatchObject({
      actorMemberId: admin.member.id,
      payload: { state: "Intent", approvals: 1, required: 2, remaining: 1 },
    });
    expect(after.events.find((e) => e.kind === "gate.approved")).toBeUndefined();

    const second = await asGrace.gates.approve({ key: "DEV-1" });

    expect(second.state.name).toBe("Spec");
    const done = await client.events.list({ subjectType: "issue", subjectId: second.id });
    expect(done.events.find((e) => e.kind === "gate.approved")).toMatchObject({
      actorMemberId: grace.member.id,
      payload: { state: "Intent", to: "Spec" },
    });
  });

  it("refuses the same Human twice, and says how many more it wants", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client, project } = await withTwoHumans(db);
    await wants(client, project.states, "Intent", { approvalsRequired: 2 });
    await client.gates.approve({ key: "DEV-1" });

    await expect(client.gates.approve({ key: "DEV-1" })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "You have already approved the Intent Gate; it wants 1 more Human",
    });
    expect((await client.issues.get({ key: "DEV-1" })).state.name).toBe("Intent");
  });

  it("spends the approvals already given when the Gate is rejected in place", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client, project, asGrace } = await withTwoHumans(db);
    await wants(client, project.states, "Intent", { approvalsRequired: 2 });
    await client.gates.approve({ key: "DEV-1" });

    // Intent is the first State, so a rejection has nowhere to send the Issue
    // and does not stamp `stateEnteredAt`. The approval before it is spent all
    // the same, or a Gate just rejected would open on the next click.
    const rejected = await asGrace.gates.reject({ key: "DEV-1", note: "Not yet" });
    expect(rejected.state.name).toBe("Intent");

    const again = await client.gates.approve({ key: "DEV-1" });
    expect(again.state.name).toBe("Intent");

    const opened = await asGrace.gates.approve({ key: "DEV-1" });
    expect(opened.state.name).toBe("Spec");
  });

  it("starts again when a rejection sends the Issue back a State", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client, project, asGrace } = await withTwoHumans(db);
    await wants(client, project.states, "Spec", { approvalsRequired: 2 });
    await client.gates.approve({ key: "DEV-1" }); // Intent, which wants one
    await client.gates.approve({ key: "DEV-1" }); // Spec, one of two
    await asGrace.gates.approve({ key: "DEV-1" }); // Spec, and through
    expect((await client.issues.get({ key: "DEV-1" })).state.name).toBe("Plan");

    // Back to Spec, where two approvals already stand from the trip before.
    const back = await asGrace.gates.reject({ key: "DEV-1" });
    expect(back.state.name).toBe("Spec");

    const one = await client.gates.approve({ key: "DEV-1" });
    expect(one.state.name).toBe("Spec");
    const two = await asGrace.gates.approve({ key: "DEV-1" });
    expect(two.state.name).toBe("Plan");
  });

  it("keeps a waiting Run waiting until the last Human approves", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client, project, asGrace } = await withTwoHumans(db);
    const admin = await db.query.member.findFirst({ where: { role: "admin" } });
    await wants(client, project.states, "Intent", { approvalsRequired: 2 });
    const agent = await agentContext(db, {
      sponsor: admin!,
      name: "Planner",
      grants: [project.id],
    });
    const asAgent = createRouterClient(router, { context: agent });
    const run = await asAgent.runs.start({ issueKey: "DEV-1" });

    const asked = await asAgent.runs.requestApproval({ runId: run.id });
    expect(asked.status).toBe("awaiting");

    await client.gates.approve({ key: "DEV-1" });
    const still = await asAgent.runs.requestApproval({ runId: run.id });
    expect(still.status).toBe("awaiting");
    expect(still.run.status).toBe("awaiting_input");

    await asGrace.gates.approve({ key: "DEV-1" });
    const now = await asAgent.runs.requestApproval({ runId: run.id });
    expect(now.status).toBe("approved");
  });

  it("leaves a Gate at the default of one deciding on one approval", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withTwoHumans(db);

    const approved = await client.gates.approve({ key: "DEV-1" });

    expect(approved.state.name).toBe("Spec");
  });
});

/**
 * A Gate that refuses the Human who asked for it (docs/plans/four-eyes-gates.md
 * slice 2). The requester is the actor on the move that brought the Issue here,
 * and the Sponsor when that actor was an Agent.
 */
describe("a Gate that excludes the requester", () => {
  it("refuses the Human who brought the Issue, and takes another's approval", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client, project, asGrace } = await withTwoHumans(db);
    await wants(client, project.states, "Review", { excludeRequester: true });
    for (const _ of ["Intent", "Spec", "Plan"]) await client.gates.approve({ key: "DEV-1" });
    await client.issues.move({
      key: "DEV-1",
      stateId: project.states.find((s) => s.name === "Review")!.id,
    });

    await expect(client.gates.approve({ key: "DEV-1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You brought DEV-1 to the Review Gate, and it asks somebody else to agree",
    });

    const approved = await asGrace.gates.approve({ key: "DEV-1" });
    expect(approved.state.name).toBe("Done");
  });

  it("refuses the Agent's Sponsor when an Agent brought the Issue", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { admin, client, project, asGrace } = await withTwoHumans(db);
    await wants(client, project.states, "Review", { excludeRequester: true });
    for (const _ of ["Intent", "Spec", "Plan"]) await client.gates.approve({ key: "DEV-1" });
    const agent = await agentContext(db, {
      sponsor: admin.member,
      name: "Builder",
      grants: [project.id],
    });
    const asAgent = createRouterClient(router, { context: agent });

    // The Agent moves it into Review, so its Sponsor is the Human accountable
    // for the work and is not the one to agree it is done.
    await asAgent.issues.move({
      key: "DEV-1",
      stateId: project.states.find((s) => s.name === "Review")!.id,
    });

    await expect(client.gates.approve({ key: "DEV-1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect((await asGrace.gates.approve({ key: "DEV-1" })).state.name).toBe("Done");
  });

  it("lets the same Human approve when the Gate does not exclude them", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client, project } = await withTwoHumans(db);
    for (const _ of ["Intent", "Spec", "Plan"]) await client.gates.approve({ key: "DEV-1" });
    await client.issues.move({
      key: "DEV-1",
      stateId: project.states.find((s) => s.name === "Review")!.id,
    });

    expect((await client.gates.approve({ key: "DEV-1" })).state.name).toBe("Done");
  });

  it("asks nobody in particular when the log does not say who brought the Issue", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client, project } = await withTwoHumans(db);
    await wants(client, project.states, "Intent", { excludeRequester: true });

    // Created straight into the Gate by the Human who then approves it: the
    // Issue was created, not moved in, so `issue.created` is the move that
    // brought it here and its actor is the requester.
    await expect(client.gates.approve({ key: "DEV-1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("wants both rules at once when both are set", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client, project, asGrace } = await withTwoHumans(db);
    const ines = await memberContext(db, { name: "Ines" });
    const asInes = createRouterClient(router, { context: ines });
    await wants(client, project.states, "Review", {
      approvalsRequired: 2,
      excludeRequester: true,
    });
    for (const _ of ["Intent", "Spec", "Plan"]) await client.gates.approve({ key: "DEV-1" });
    await client.issues.move({
      key: "DEV-1",
      stateId: project.states.find((s) => s.name === "Review")!.id,
    });

    await expect(client.gates.approve({ key: "DEV-1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect((await asGrace.gates.approve({ key: "DEV-1" })).state.name).toBe("Review");
    expect((await asInes.gates.approve({ key: "DEV-1" })).state.name).toBe("Done");
  });
});
