import { createRouterClient } from "@orpc/server";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { router } from "../src/operations/index.ts";
import { memberContext, testDb, type MemberContext } from "./helpers.ts";

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
    const bob = await memberContext(db, { name: "Bob", email: "bob@flippable.net" });

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
