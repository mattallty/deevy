import { member as memberTable, workflowState as workflowStateTable } from "@deevy/db";
import { createRouterClient } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import type { Db } from "@deevy/db";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { appendEvent } from "../src/events.ts";
import { router } from "../src/operations/index.ts";
import { triggersFor } from "../src/triggers.ts";
import { agentContext, memberContext, testDb } from "./helpers.ts";
import { newId } from "../src/ids.ts";

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

/** An admin, a Project, DEV-1, and an Agent `@planner` granted that Project. */
async function workspaceWithAgent() {
  const { db, close } = testDb();
  closers.push(close);
  const admin = await memberContext(db, { role: "admin", name: "Ada" });
  const asAdmin = createRouterClient(router, { context: admin });
  const project = await asAdmin.projects.create({ key: "DEV", name: "deevy" });
  await asAdmin.issues.create({ projectKey: "DEV", title: "Ship the thing" });
  const agent = await agentContext(db, { sponsor: admin.member, grants: [project.id] });
  // A mention resolves by handle, and nothing else gives an Agent one here.
  await db
    .update(memberTable)
    .set({ handle: "planner" })
    .where(eq(memberTable.id, agent.member.id));
  return { db, admin, asAdmin, project, agent };
}

/** Names the Agent a State's rule triggers, the way `workflow.update` does. */
async function ruleOn(db: Db, projectId: string, stateName: string, agentMemberId: string) {
  await db
    .update(workflowStateTable)
    .set({ triggerAgentMemberId: agentMemberId })
    .where(
      and(eq(workflowStateTable.projectId, projectId), eq(workflowStateTable.name, stateName)),
    );
}

describe("the assignment trigger", () => {
  it("creates one pending Run when an Issue is assigned to an Agent", async () => {
    const { db, asAdmin, agent } = await workspaceWithAgent();

    await asAdmin.issues.update({ key: "DEV-1", assigneeMemberId: agent.member.id });

    const runs = await db.query.run.findMany();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      agentMemberId: agent.member.id,
      trigger: "assignment",
      status: "pending",
    });
  });
});

describe("the mention trigger", () => {
  it("creates a Run for an Agent a comment mentions", async () => {
    const { db, asAdmin, agent } = await workspaceWithAgent();

    await asAdmin.comments.create({ issueKey: "DEV-1", body: "ping @planner" });

    const runs = await db.query.run.findMany();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      agentMemberId: agent.member.id,
      trigger: "mention",
      status: "pending",
    });
  });

  it("reaches an Agent through the Team a comment mentions", async () => {
    const { db, asAdmin, agent } = await workspaceWithAgent();
    const team = await asAdmin.teams.create({ name: "Planning", handle: "planning" });
    await asAdmin.teams.addMember({ teamId: team.id, memberId: agent.member.id });

    await asAdmin.comments.create({ issueKey: "DEV-1", body: "over to you @planning" });

    // Mentions resolve a Team to its Members, so a Team is a way to name an
    // Agent and needs no rule of its own here.
    const runs = await db.query.run.findMany();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ agentMemberId: agent.member.id, trigger: "mention" });
  });
});

describe("the State rule", () => {
  it("assigns the Issue and starts a Run when a Gate approval lands it in the State", async () => {
    const { db, asAdmin, agent, project } = await workspaceWithAgent();
    await ruleOn(db, project.id, "Plan", agent.member.id);

    await asAdmin.gates.approve({ key: "DEV-1" });
    const inPlan = await asAdmin.gates.approve({ key: "DEV-1" });

    expect(inPlan.state.name).toBe("Plan");
    // The rule is what makes the Agent responsible, so the Issue says so.
    expect(inPlan.assigneeMemberId).toBe(agent.member.id);
    const runs = await db.query.run.findMany();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      agentMemberId: agent.member.id,
      trigger: "state_rule",
      status: "pending",
    });
  });

  it("fires on arriving in the State however the Issue got there", async () => {
    const { db, asAdmin, agent, project } = await workspaceWithAgent();
    await ruleOn(db, project.id, "Intent", agent.member.id);

    // On creation: the first State is a State the Issue entered.
    await asAdmin.issues.create({ projectKey: "DEV", title: "Second" });
    // And on a rejection sending an Issue back into it.
    await asAdmin.gates.approve({ key: "DEV-1" });
    await asAdmin.gates.reject({ key: "DEV-1" });

    const runs = await db.query.run.findMany();
    expect(runs.map((run) => run.trigger)).toEqual(["state_rule", "state_rule"]);
  });

  it("announces the assignment it makes without triggering itself a second time", async () => {
    const { db, asAdmin, agent, project } = await workspaceWithAgent();
    await ruleOn(db, project.id, "Plan", agent.member.id);

    await asAdmin.gates.approve({ key: "DEV-1" });
    await asAdmin.gates.approve({ key: "DEV-1" });

    // The assignment is in the log, so the timeline shows how the Issue got
    // its Assignee; the open Run is what stops it starting an `assignment` Run.
    const assigned = await db.query.event.findMany({ where: { kind: "issue.assigned" } });
    expect(assigned).toHaveLength(1);
    expect(await db.query.event.findMany({ where: { kind: "run.started" } })).toHaveLength(1);
    expect(await db.query.run.findMany()).toHaveLength(1);
  });
});

describe("what does not trigger a Run", () => {
  it("says nothing when an Issue is assigned to a Human", async () => {
    const { db, admin, asAdmin } = await workspaceWithAgent();

    await asAdmin.issues.update({ key: "DEV-1", assigneeMemberId: admin.member.id });

    expect(await db.query.run.findMany()).toHaveLength(0);
  });

  it("starts no second Run when the same Agent is assigned again", async () => {
    const { db, admin, asAdmin, agent } = await workspaceWithAgent();

    await asAdmin.issues.update({ key: "DEV-1", assigneeMemberId: agent.member.id });
    await asAdmin.issues.update({ key: "DEV-1", assigneeMemberId: admin.member.id });
    await asAdmin.issues.update({ key: "DEV-1", assigneeMemberId: agent.member.id });

    // The first Run is still open, and one Agent gets one attempt at a time.
    expect(await db.query.run.findMany()).toHaveLength(1);
  });
});

describe("the recursion guard", () => {
  it("makes a Run's own Events trigger nothing at all", async () => {
    const { db, admin, asAdmin, agent, project } = await workspaceWithAgent();
    await ruleOn(db, project.id, "Intent", agent.member.id);
    const created = await asAdmin.issues.create({ projectKey: "DEV", title: "Second" });

    // Every Event a Run appends, against a Workspace whose rules would all fire
    // on an Issue Event. `appendEvent` runs this tail on its own output, so a
    // single `true` here would be an unbounded loop.
    const runEvents = [
      "run.started",
      "run.activity",
      "run.awaiting_input",
      "run.answered",
      "run.completed",
      "run.failed",
      "run.went_stale",
    ] as const;
    for (const kind of runEvents) {
      const appended = await appendEvent(
        { db, workspace: admin.workspace, member: admin.member },
        {
          kind,
          subjectType: "run",
          subjectId: newId("issue"),
          projectId: project.id,
          payload: { issueId: created.id },
        },
      );
      expect(await triggersFor(db, appended)).toEqual([]);
    }
    // The Issue's own State rule fired once, when it was created, and nothing
    // a Run said afterwards added to it.
    expect(await db.query.run.findMany()).toHaveLength(1);
  });
});
