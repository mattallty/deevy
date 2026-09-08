import { createRouterClient } from "@orpc/server";
import { member as memberTable } from "@deevy/db";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { router } from "../src/operations/index.ts";
import type { WorkflowState } from "@deevy/db";
import { agentContext, memberContext, testDb, type MemberContext } from "./helpers.ts";

type WorkflowStateView = Pick<WorkflowState, "id" | "name" | "isGate" | "category">;

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

async function withProject(db: MemberContext["db"]) {
  const admin = await memberContext(db, { role: "admin", name: "Ada" });
  const client = createRouterClient(router, { context: admin });
  const project = await client.projects.create({ name: "deevy", key: "DEV" });
  const state = (name: string) => project.states.find((s) => s.name === name)!;
  return { admin, client, project, state };
}

describe("workflow.get", () => {
  it("returns the Project's States in order", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withProject(db);

    const { states } = await client.workflow.get({ projectKey: "DEV" });

    expect(states.map((s) => s.name)).toEqual([
      "Intent",
      "Spec",
      "Plan",
      "Build",
      "Review",
      "Done",
    ]);
  });
});

describe("workflow.update", () => {
  it("renames, reorders and retypes States, and records one Event", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client, state } = await withProject(db);

    const { states } = await client.workflow.update({
      projectKey: "DEV",
      states: [
        { id: state("Intent").id, name: "Todo", isGate: false, category: "backlog" },
        { id: state("Done").id, name: "Done", isGate: false, category: "done" },
        { name: "Doing", isGate: false, category: "active" },
      ],
      deleteStates: [state("Spec").id, state("Plan").id, state("Build").id, state("Review").id],
    });

    expect(states.map((s) => s.name)).toEqual(["Todo", "Done", "Doing"]);
    expect(states.map((s) => s.position)).toEqual([0, 1, 2]);
    expect(states.every((s) => !s.isGate)).toBe(true);
    const page = await client.events.list({ subjectType: "project" });
    expect(page.events.at(-1)).toMatchObject({ kind: "workflow.updated" });
  });

  it("refuses to delete a State that holds Issues without somewhere to put them", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client, state } = await withProject(db);
    await client.issues.create({ projectKey: "DEV", title: "In Intent" });

    await expect(
      client.workflow.update({
        projectKey: "DEV",
        states: [{ id: state("Done").id, name: "Done", isGate: false, category: "done" }],
        deleteStates: [state("Intent").id],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("relocates the Issues when told where to put them", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client, state } = await withProject(db);
    await client.issues.create({ projectKey: "DEV", title: "In Intent" });

    await client.workflow.update({
      projectKey: "DEV",
      states: [
        { id: state("Intent").id, name: "Todo", isGate: false, category: "backlog" },
        { id: state("Done").id, name: "Done", isGate: false, category: "done" },
      ],
      deleteStates: [state("Spec").id, state("Plan").id, state("Build").id, state("Review").id],
      moveIssuesTo: state("Intent").id,
    });

    const issue = await client.issues.get({ key: "DEV-1" });
    expect(issue.state.name).toBe("Todo");
    expect((await client.workflow.get({ projectKey: "DEV" })).states.map((s) => s.name)).toEqual([
      "Todo",
      "Done",
    ]);
  });

  it("refuses a Member who is neither an admin nor on the owning Team", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client, state } = await withProject(db);
    const bob = await memberContext(db, { name: "Bob", email: "bob@example.com" });

    const asBob = createRouterClient(router, { context: bob });
    await expect(
      asBob.workflow.update({
        projectKey: "DEV",
        states: [{ id: state("Intent").id, name: "Todo", isGate: false, category: "backlog" }],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await client.workflow.get({ projectKey: "DEV" })).states).toHaveLength(6);
  });

  it("will not leave a Project with no States at all", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withProject(db);

    await expect(client.workflow.update({ projectKey: "DEV", states: [] })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("the State rule on a Workflow", () => {
  it("names the Agent entering a State assigns the Issue to, and clears it again", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { admin, client } = await withProject(db);
    const agent = await agentContext(db, { sponsor: admin.member });

    const asGiven = (states: WorkflowStateView[], triggerAgentMemberId: string | null) =>
      states.map((current) => ({
        id: current.id,
        name: current.name,
        isGate: current.isGate,
        category: current.category,
        triggerAgentMemberId: current.name === "Plan" ? triggerAgentMemberId : null,
      }));

    const original = (await client.workflow.get({ projectKey: "DEV" })).states;
    const named = await client.workflow.update({
      projectKey: "DEV",
      states: asGiven(original, agent.member.id),
    });
    expect(named.states.find((s) => s.name === "Plan")?.triggerAgentMemberId).toBe(agent.member.id);
    // Every other State is left without a rule, not left as it was.
    expect(named.states.filter((s) => s.triggerAgentMemberId).map((s) => s.name)).toEqual(["Plan"]);

    const cleared = await client.workflow.update({
      projectKey: "DEV",
      states: asGiven(named.states, null),
    });
    expect(cleared.states.every((s) => s.triggerAgentMemberId === null)).toBe(true);
  });

  it("refuses a rule naming anything but an Agent of this Workspace", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { admin, client } = await withProject(db);
    const states = (await client.workflow.get({ projectKey: "DEV" })).states;
    const given = (triggerAgentMemberId: string) =>
      states.map((current) => ({
        id: current.id,
        name: current.name,
        isGate: current.isGate,
        category: current.category,
        ...(current.name === "Plan" ? { triggerAgentMemberId } : {}),
      }));

    // A Human is not something a State can trigger: only an Agent runs.
    await expect(
      client.workflow.update({ projectKey: "DEV", states: given(admin.member.id) }),
    ).rejects.toThrow(/Agent/);
    await expect(
      client.workflow.update({ projectKey: "DEV", states: given("nobody") }),
    ).rejects.toThrow(/Agent/);
  });
});

describe("the approvers a Gate names", () => {
  it("narrows a Gate to the Humans it names, and an empty list widens it again", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { admin, client } = await withProject(db);
    const bob = await memberContext(db, { name: "Bob" });

    const asGiven = (states: WorkflowStateView[], approverMemberIds: string[]) =>
      states.map((current) => ({
        id: current.id,
        name: current.name,
        isGate: current.isGate,
        category: current.category,
        approverMemberIds: current.name === "Plan" ? approverMemberIds : [],
      }));

    const original = (await client.workflow.get({ projectKey: "DEV" })).states;
    const named = await client.workflow.update({
      projectKey: "DEV",
      states: asGiven(original, [admin.member.id, bob.member.id]),
    });

    expect(named.states.find((s) => s.name === "Plan")?.approverMemberIds).toEqual(
      expect.arrayContaining([admin.member.id, bob.member.id]),
    );
    expect(named.states.find((s) => s.name === "Spec")?.approverMemberIds).toEqual([]);
    const read = await client.workflow.get({ projectKey: "DEV" });
    expect(read.states.find((s) => s.name === "Plan")?.approverMemberIds).toHaveLength(2);

    const widened = await client.workflow.update({
      projectKey: "DEV",
      states: asGiven(named.states, []),
    });
    expect(widened.states.every((s) => s.approverMemberIds.length === 0)).toBe(true);
  });

  it("refuses to name an Agent, which ADR-0004 never lets decide a Gate", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { admin, client } = await withProject(db);
    const agent = await agentContext(db, { sponsor: admin.member });
    const states = (await client.workflow.get({ projectKey: "DEV" })).states;

    await expect(
      client.workflow.update({
        projectKey: "DEV",
        states: states.map((current) => ({
          id: current.id,
          name: current.name,
          isGate: current.isGate,
          category: current.category,
          ...(current.name === "Plan" ? { approverMemberIds: [agent.member.id] } : {}),
        })),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

/**
 * A threshold no one could meet is refused where it is written, not found later
 * by an Issue nobody can move (docs/plans/four-eyes-gates.md).
 */
describe("workflow.update and a Gate's threshold", () => {
  it("refuses more approvals than there are Humans to give them, naming both numbers", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client, state } = await withProject(db);
    await memberContext(db, { name: "Grace" });

    await expect(
      client.workflow.update({
        projectKey: "DEV",
        states: [
          {
            id: state("Intent").id,
            name: "Intent",
            isGate: true,
            category: "backlog",
            approvalsRequired: 3,
          },
          { id: state("Done").id, name: "Done", isGate: false, category: "done" },
        ],
        deleteStates: [state("Spec").id, state("Plan").id, state("Build").id, state("Review").id],
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "That Gate asks for 3 approvals and only 2 Humans could give one",
    });
  });

  it("does not count a suspended Human, nor the Humans a Gate does not name", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client, state } = await withProject(db);
    const grace = await memberContext(db, { name: "Grace" });
    const ines = await memberContext(db, { name: "Ines" });
    await db
      .update(memberTable)
      .set({ suspendedAt: new Date() })
      .where(eq(memberTable.id, ines.member.id));

    const two = [
      { id: state("Intent").id, name: "Intent", isGate: true, category: "backlog" as const },
      { id: state("Done").id, name: "Done", isGate: false, category: "done" as const },
    ];
    const rest = [state("Spec").id, state("Plan").id, state("Build").id, state("Review").id];

    // Three Humans, one of them suspended: two can approve, not three.
    await expect(
      client.workflow.update({
        projectKey: "DEV",
        states: [{ ...two[0]!, approvalsRequired: 3 }, two[1]!],
        deleteStates: rest,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // And a Gate that names one Human cannot want two, whoever else is about.
    await expect(
      client.workflow.update({
        projectKey: "DEV",
        states: [
          { ...two[0]!, approvalsRequired: 2, approverMemberIds: [grace.member.id] },
          two[1]!,
        ],
        deleteStates: rest,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "That Gate asks for 2 approvals and only 1 Human could give one",
    });
  });

  it("keeps a threshold a client did not mention, and clears one from a State that stops being a Gate", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client, state } = await withProject(db);
    await memberContext(db, { name: "Grace" });
    const all = (isGate: boolean, approvalsRequired?: number) => ({
      projectKey: "DEV" as const,
      states: [
        {
          id: state("Intent").id,
          name: "Intent",
          isGate,
          category: "backlog" as const,
          approvalsRequired,
        },
        { id: state("Done").id, name: "Done", isGate: false, category: "done" as const },
      ],
      deleteStates: [state("Spec").id, state("Plan").id, state("Build").id, state("Review").id],
    });
    await client.workflow.update(all(true, 2));

    // A client written before this field saves the Workflow and widens nothing.
    const kept = await client.workflow.update(all(true));
    expect(kept.states[0]).toMatchObject({ name: "Intent", approvalsRequired: 2 });

    const plain = await client.workflow.update(all(false));
    expect(plain.states[0]).toMatchObject({ name: "Intent", approvalsRequired: 1 });
  });
});
