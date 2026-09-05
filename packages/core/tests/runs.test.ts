import { activity, run } from "@deevy/db";
import { eq } from "drizzle-orm";
import { createRouterClient } from "@orpc/server";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { router } from "../src/operations/index.ts";
import { agentContext, memberContext, testDb } from "./helpers.ts";

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

/** An admin, a Project, one Issue in it, and an Agent granted that Project. */
async function workspaceWithAgent() {
  const { db, close } = testDb();
  closers.push(close);
  const admin = await memberContext(db, { role: "admin", name: "Ada" });
  const asAdmin = createRouterClient(router, { context: admin });
  const project = await asAdmin.projects.create({ key: "DEV", name: "deevy" });
  await asAdmin.issues.create({ projectKey: "DEV", title: "Ship the thing" });
  const agent = await agentContext(db, { sponsor: admin.member, grants: [project.id] });
  return {
    db,
    admin,
    asAdmin,
    project,
    agent,
    asAgent: createRouterClient(router, { context: agent }),
  };
}

describe("the Run lifecycle", () => {
  it("starts pending, so a triggered Run exists before the Agent says anything", async () => {
    const { asAgent } = await workspaceWithAgent();

    const run = await asAgent.runs.start({ issueKey: "DEV-1" });

    expect(run).toMatchObject({ issueKey: "DEV-1", status: "pending", trigger: "manual" });
    expect(run.startedAt).toBeNull();
  });

  it("goes active on the first Activity, which is when the Agent actually started", async () => {
    const { asAgent } = await workspaceWithAgent();
    const run = await asAgent.runs.start({ issueKey: "DEV-1" });

    const posted = await asAgent.runs.postActivity({
      runId: run.id,
      kind: "thought",
      body: "Reading the Issue",
    });

    expect(posted.activity).toMatchObject({ kind: "thought", body: "Reading the Issue" });
    expect(posted.run.status).toBe("active");
    expect(posted.run.startedAt).toBeInstanceOf(Date);
  });

  it("waits on an elicitation, and tells the Human behind the Run that it waits", async () => {
    const { asAdmin, asAgent } = await workspaceWithAgent();
    const run = await asAgent.runs.start({ issueKey: "DEV-1" });

    const posted = await asAgent.runs.postActivity({
      runId: run.id,
      kind: "elicitation",
      body: "Postgres or SQLite?",
    });

    expect(posted.run.status).toBe("awaiting_input");
    // The Agent triggered its own Run, so the accountable Human is its Sponsor.
    const { notifications } = await asAdmin.inbox.list({});
    const waiting = notifications.filter((row) => row.kind === "run_awaiting_input");
    expect(waiting).toHaveLength(1);
    expect(waiting[0]?.issue?.key).toBe("DEV-1");
    // Never the actor: the Agent asked the question, it does not need telling.
    const forTheAgent = await asAgent.inbox.list({});
    expect(forTheAgent.notifications).toHaveLength(0);
  });

  it("comes back to active when a Human answers, with the answer where the Agent reads", async () => {
    const { asAdmin, asAgent } = await workspaceWithAgent();
    const run = await asAgent.runs.start({ issueKey: "DEV-1" });
    await asAgent.runs.postActivity({
      runId: run.id,
      kind: "elicitation",
      body: "Postgres or SQLite?",
    });

    const answered = await asAdmin.runs.answer({ runId: run.id, body: "SQLite" });

    expect(answered.run.status).toBe("active");
    expect(answered.activity).toMatchObject({ kind: "prompt", body: "SQLite" });
  });

  it("finishes with a summary, and tells the Human behind it once", async () => {
    const { asAdmin, asAgent } = await workspaceWithAgent();
    const run = await asAgent.runs.start({ issueKey: "DEV-1" });
    await asAgent.runs.postActivity({ runId: run.id, kind: "thought", body: "Working" });

    const finished = await asAgent.runs.finish({
      runId: run.id,
      status: "completed",
      summary: "Opened a pull request",
    });

    expect(finished).toMatchObject({ status: "completed", summary: "Opened a pull request" });
    expect(finished.finishedAt).toBeInstanceOf(Date);
    const { notifications } = await asAdmin.inbox.list({});
    expect(notifications.filter((row) => row.kind === "run_finished")).toHaveLength(1);
  });

  it("refuses an Agent posting into another Agent's Run", async () => {
    const { db, admin, project, asAgent } = await workspaceWithAgent();
    const run = await asAgent.runs.start({ issueKey: "DEV-1" });
    const other = await agentContext(db, {
      sponsor: admin.member,
      grants: [project.id],
      name: "Reviewer",
    });
    const asOther = createRouterClient(router, { context: other });

    await expect(
      asOther.runs.postActivity({ runId: run.id, kind: "thought", body: "Mine now" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lists Runs by Issue and by Agent, newest first", async () => {
    const { db, asAdmin, agent, asAgent } = await workspaceWithAgent();
    await asAdmin.issues.create({ projectKey: "DEV", title: "Second thing" });
    const older = await asAgent.runs.start({ issueKey: "DEV-1" });
    const newer = await asAgent.runs.start({ issueKey: "DEV-2" });
    // Two Runs a millisecond apart order by whatever the clock did; an hour
    // apart says what "newest first" means.
    await db
      .update(run)
      .set({ createdAt: new Date(Date.now() - 3_600_000) })
      .where(eq(run.id, older.id));

    const onTheIssue = await asAgent.runs.list({ issueKey: "DEV-1" });
    const byTheAgent = await asAgent.runs.list({ agentMemberId: agent.member.id });

    expect(onTheIssue.runs.map((row) => row.id)).toEqual([older.id]);
    expect(byTheAgent.runs.map((row) => row.id)).toEqual([newer.id, older.id]);
    expect(byTheAgent.runs.map((row) => row.issueKey)).toEqual(["DEV-2", "DEV-1"]);
  });

  it("gives one Run with its Activities in the order they happened", async () => {
    const { db, asAdmin, asAgent } = await workspaceWithAgent();
    const started = await asAgent.runs.start({ issueKey: "DEV-1" });
    const thought = await asAgent.runs.postActivity({
      runId: started.id,
      kind: "thought",
      body: "Reading the Issue",
    });
    const question = await asAgent.runs.postActivity({
      runId: started.id,
      kind: "elicitation",
      body: "Postgres or SQLite?",
    });
    const answer = await asAdmin.runs.answer({ runId: started.id, body: "SQLite" });
    // Three writes inside one millisecond order by nothing in particular;
    // spacing them says what the feed is supposed to be sorted by.
    const seconds = [thought.activity.id, question.activity.id, answer.activity.id];
    for (const [at, id] of seconds.entries()) {
      await db
        .update(activity)
        .set({ createdAt: new Date(Date.now() - 10_000 + at * 1_000) })
        .where(eq(activity.id, id));
    }

    const detail = await asAdmin.runs.get({ runId: started.id });

    expect(detail).toMatchObject({ id: started.id, issueKey: "DEV-1", status: "active" });
    expect(detail.activities.map((row) => [row.kind, row.body])).toEqual([
      ["thought", "Reading the Issue"],
      ["elicitation", "Postgres or SQLite?"],
      ["prompt", "SQLite"],
    ]);
  });

  it("attributes evidence to the Run that found it", async () => {
    const { asAdmin, asAgent } = await workspaceWithAgent();
    const started = await asAgent.runs.start({ issueKey: "DEV-1" });

    const link = await asAgent.links.add({
      issueKey: "DEV-1",
      url: "https://github.com/deevy/deevy/pull/7",
      runId: started.id,
    });

    expect(link.runId).toBe(started.id);
    const { links } = await asAdmin.links.list({ issueKey: "DEV-1" });
    expect(links.map((row) => row.runId)).toEqual([started.id]);
  });

  it("keeps at most one open Run per Issue and Agent", async () => {
    const { asAgent } = await workspaceWithAgent();
    const first = await asAgent.runs.start({ issueKey: "DEV-1" });

    await expect(asAgent.runs.start({ issueKey: "DEV-1" })).rejects.toMatchObject({
      code: "CONFLICT",
    });

    // Finished, the Issue is free for another attempt.
    await asAgent.runs.finish({ runId: first.id, status: "failed", summary: "Out of my depth" });
    const second = await asAgent.runs.start({ issueKey: "DEV-1" });
    expect(second.status).toBe("pending");
  });

  it("refuses an Agent answering an elicitation, because the question is for a Human", async () => {
    const { asAgent } = await workspaceWithAgent();
    const started = await asAgent.runs.start({ issueKey: "DEV-1" });
    await asAgent.runs.postActivity({
      runId: started.id,
      kind: "elicitation",
      body: "Postgres or SQLite?",
    });

    await expect(asAgent.runs.answer({ runId: started.id, body: "SQLite" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("pages Runs from a cursor, showing each one once", async () => {
    const { db, asAdmin, agent, asAgent } = await workspaceWithAgent();
    await asAdmin.issues.create({ projectKey: "DEV", title: "Second thing" });
    const older = await asAgent.runs.start({ issueKey: "DEV-1" });
    const newer = await asAgent.runs.start({ issueKey: "DEV-2" });
    await db
      .update(run)
      .set({ createdAt: new Date(Date.now() - 3_600_000) })
      .where(eq(run.id, older.id));

    const page = await asAgent.runs.list({ agentMemberId: agent.member.id, limit: 1 });
    const next = await asAgent.runs.list({
      agentMemberId: agent.member.id,
      before: page.nextCursor ?? undefined,
      limit: 1,
    });

    expect(page.runs.map((row) => row.id)).toEqual([newer.id]);
    expect(next.runs.map((row) => row.id)).toEqual([older.id]);
    expect(next.nextCursor).not.toBe(page.nextCursor);
  });

  it("has started once it has spoken, even when its first word is a question", async () => {
    const { asAgent } = await workspaceWithAgent();
    const started = await asAgent.runs.start({ issueKey: "DEV-1" });

    const posted = await asAgent.runs.postActivity({
      runId: started.id,
      kind: "elicitation",
      body: "Postgres or SQLite?",
    });

    expect(posted.run.status).toBe("awaiting_input");
    expect(posted.run.startedAt).toBeInstanceOf(Date);
  });
});

describe("what a Human says into a Run", () => {
  it("is a prompt, not the Agent's own response, so a ported agent can tell them apart", async () => {
    const { asAgent, asAdmin } = await workspaceWithAgent();
    const run = await asAgent.runs.start({ issueKey: "DEV-1" });
    await asAgent.runs.postActivity({ runId: run.id, kind: "elicitation", body: "Which repo?" });

    await asAdmin.runs.answer({ runId: run.id, body: "the deevy one" });

    const detail = await asAgent.runs.get({ runId: run.id });
    const last = detail.activities.at(-1);
    expect(last).toMatchObject({ kind: "prompt", body: "the deevy one" });
  });

  it("is a word only a Human may use", async () => {
    const { asAgent } = await workspaceWithAgent();
    const run = await asAgent.runs.start({ issueKey: "DEV-1" });

    // TypeScript already refuses this, which is why the cast is here: the
    // callers that are not typechecked are the ones that matter, an MCP tool
    // call or a raw HTTP request, and for those the schema is the only guard.
    const posting = asAgent.runs.postActivity({
      runId: run.id,
      kind: "prompt",
      body: "answering myself",
    } as unknown as Parameters<typeof asAgent.runs.postActivity>[0]);

    await expect(posting).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("runs.requestApproval", () => {
  it("waits on the Gate the Issue is in, with the deevy URL a Human clicks", async () => {
    const { asAdmin, asAgent, project } = await workspaceWithAgent();
    // Intent and Spec approved, so DEV-1 sits in the Plan Gate.
    await asAdmin.gates.approve({ key: "DEV-1" });
    await asAdmin.gates.approve({ key: "DEV-1" });
    const run = await asAgent.runs.start({ issueKey: "DEV-1" });
    await asAgent.runs.postActivity({ runId: run.id, kind: "action", body: "Wrote the plan" });
    const plan = project.states.find((state) => state.name === "Plan")!;

    const asked = await asAgent.runs.requestApproval({ runId: run.id });

    expect(asked).toMatchObject({ status: "awaiting", stateId: plan.id, stateName: "Plan" });
    expect(asked.url).toBe(`https://deevy.test/issues/DEV-1?gate=${plan.id}`);
    expect(asked.run.status).toBe("awaiting_input");

    const feed = await asAgent.runs.get({ runId: run.id });
    const elicitation = feed.activities.findLast((row) => row.kind === "elicitation");
    expect(elicitation?.payload).toMatchObject({ gateStateId: plan.id, url: asked.url });
  });

  it("says a Gate that names nobody is any Human's to decide, not nobody's", async () => {
    const { db, asAdmin, asAgent } = await workspaceWithAgent();
    await asAdmin.gates.approve({ key: "DEV-1" });
    await asAdmin.gates.approve({ key: "DEV-1" });
    const run = await asAgent.runs.start({ issueKey: "DEV-1" });

    const asked = await asAgent.runs.requestApproval({ runId: run.id });

    // The answer says the rule rather than leaving it to be inferred from an
    // empty list. An Agent reading one saw "nobody was asked" and reported
    // that the request would sit there for ever; every active Human was in
    // fact notified (docs/plans/m3.md).
    expect(asked.approvers).toEqual({ kind: "any_human" });
    const told = await db.query.notification.findMany({ where: { kind: "gate_awaiting" } });
    expect(told.length).toBeGreaterThan(0);
  });

  it("tells the Agent when its Gate is decided, so its inbox is worth polling", async () => {
    const { db, asAdmin, asAgent, agent } = await workspaceWithAgent();
    await asAdmin.gates.approve({ key: "DEV-1" });
    await asAdmin.gates.approve({ key: "DEV-1" });
    const run = await asAgent.runs.start({ issueKey: "DEV-1" });
    await asAgent.runs.requestApproval({ runId: run.id });

    await asAdmin.gates.approve({ key: "DEV-1", note: "Go on then" });

    // ADR-0003 says an Agent without a webhook polls its inbox. Until now the
    // one thing it waits for never landed there: the inbox carried assignment
    // and mention, and a Gate ruling reached it only if it thought to call
    // runs.list again (docs/plans/m3.md).
    const inbox = await asAgent.inbox.list({});
    const answered = inbox.notifications.filter((row) => row.kind === "run_answered");
    expect(answered).toHaveLength(1);
    expect(answered[0]?.recipientMemberId).toBe(agent.member.id);

    // And the Run is live again, which is what the Agent acts on.
    const resumed = await asAgent.runs.get({ runId: run.id });
    expect(resumed.status).toBe("active");

    // The Human who decided it is not told about their own decision.
    const told = await db.query.notification.findMany({ where: { kind: "run_answered" } });
    expect(told.map((row) => row.recipientMemberId)).toEqual([agent.member.id]);
  });

  it("asks the Humans the Gate names, and not the Sponsor behind the Run", async () => {
    const { db, admin, asAdmin, asAgent } = await workspaceWithAgent();
    const bob = await memberContext(db, { name: "Bob", email: "bob@example.com" });
    const states = (await asAdmin.workflow.get({ projectKey: "DEV" })).states;
    await asAdmin.workflow.update({
      projectKey: "DEV",
      states: states.map((current) => ({
        id: current.id,
        name: current.name,
        isGate: current.isGate,
        category: current.category,
        approverMemberIds: current.name === "Plan" ? [bob.member.id] : [],
      })),
    });
    await asAdmin.gates.approve({ key: "DEV-1" });
    await asAdmin.gates.approve({ key: "DEV-1" });
    const run = await asAgent.runs.start({ issueKey: "DEV-1" });

    const asked = await asAgent.runs.requestApproval({ runId: run.id });

    expect(asked.approvers).toEqual({ kind: "named", memberIds: [bob.member.id] });
    const told = await db.query.notification.findMany({ where: { kind: "gate_awaiting" } });
    // Ada is the Agent's Sponsor and an admin, and is still not asked: the Gate
    // names Bob, and a Gate decides who decides it (ADR-0004).
    expect(told.map((row) => row.recipientMemberId)).toContain(bob.member.id);
    expect(told.map((row) => row.recipientMemberId)).not.toContain(admin.member.id);
    expect(await db.query.notification.findMany({ where: { kind: "run_awaiting_input" } })).toEqual(
      [],
    );
  });

  it("carries on once a Human decides, and is told who decided and what they said", async () => {
    const { asAdmin, asAgent, admin } = await workspaceWithAgent();
    await asAdmin.gates.approve({ key: "DEV-1" });
    await asAdmin.gates.approve({ key: "DEV-1" });
    const run = await asAgent.runs.start({ issueKey: "DEV-1" });
    await asAgent.runs.requestApproval({ runId: run.id });

    const moved = await asAdmin.gates.approve({ key: "DEV-1", note: "Looks right" });
    expect(moved.state.name).toBe("Build");

    const answered = await asAgent.runs.requestApproval({ runId: run.id });
    expect(answered).toMatchObject({
      status: "approved",
      stateName: "Plan",
      decidedByMemberId: admin.member.id,
      note: "Looks right",
    });
    expect(answered.run.status).toBe("active");
  });

  it("hears a rejection too, and the Issue going back a State does not lose it", async () => {
    const { asAdmin, asAgent } = await workspaceWithAgent();
    await asAdmin.gates.approve({ key: "DEV-1" });
    await asAdmin.gates.approve({ key: "DEV-1" });
    const run = await asAgent.runs.start({ issueKey: "DEV-1" });
    await asAgent.runs.requestApproval({ runId: run.id });

    const sentBack = await asAdmin.gates.reject({ key: "DEV-1", note: "Thin on tests" });
    expect(sentBack.state.name).toBe("Spec");

    const answered = await asAgent.runs.requestApproval({ runId: run.id });
    expect(answered).toMatchObject({
      status: "rejected",
      stateName: "Plan",
      note: "Thin on tests",
    });
    expect(answered.run.status).toBe("active");
  });

  it("asks afresh about the next Gate once it has been told about the last one", async () => {
    const { asAdmin, asAgent } = await workspaceWithAgent();
    await asAdmin.gates.approve({ key: "DEV-1" });
    await asAdmin.gates.approve({ key: "DEV-1" });
    const run = await asAgent.runs.start({ issueKey: "DEV-1" });
    await asAgent.runs.requestApproval({ runId: run.id });
    await asAdmin.gates.reject({ key: "DEV-1", note: "Thin on tests" });
    await asAgent.runs.requestApproval({ runId: run.id });

    // Told, and back at work in the Spec Gate: asking again is a new question
    // about where the Issue is now, not the old ruling repeated.
    const next = await asAgent.runs.requestApproval({ runId: run.id });

    expect(next).toMatchObject({ status: "awaiting", stateName: "Spec" });
    expect(next.run.status).toBe("awaiting_input");
    const feed = await asAgent.runs.get({ runId: run.id });
    expect(feed.activities.map((row) => row.kind)).toEqual([
      "elicitation",
      "prompt",
      "elicitation",
    ]);
    expect(feed.activities[1]?.body).toContain("Plan Gate on DEV-1 was rejected: Thin on tests");
  });
});
