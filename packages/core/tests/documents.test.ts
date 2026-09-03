import { createRouterClient } from "@orpc/server";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { defaultWorkflow } from "../src/workflow.ts";
import { router } from "../src/operations/index.ts";
import { memberContext, testDb, type MemberContext } from "./helpers.ts";

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

async function withIssue(db: MemberContext["db"]) {
  const admin = await memberContext(db, { role: "admin", name: "Ada" });
  const client = createRouterClient(router, { context: admin });
  await client.projects.create({ name: "deevy", key: "DEV" });
  const issue = await client.issues.create({ projectKey: "DEV", title: "Ship it" });
  return { admin, client, issue };
}

describe("the default Workflow's templates", () => {
  it("asks Intent, Spec and Plan for a Document, following the playbook headings", () => {
    const states = defaultWorkflow();
    const byName = Object.fromEntries(states.map((state) => [state.name, state]));

    expect(byName.Intent?.documentName).toBe("intent");
    expect(byName.Intent?.documentTemplate).toContain("## Problem");
    expect(byName.Intent?.documentTemplate).toContain("## Proposed outcome");
    expect(byName.Spec?.documentName).toBe("spec");
    expect(byName.Plan?.documentName).toBe("plan");
    expect(byName.Plan?.documentTemplate).toContain("## Files that change");
    expect(byName.Build?.documentName).toBeNull();
  });
});

describe("entering a State that asks for a Document", () => {
  it("creates it from the template at version 1", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client, issue } = await withIssue(db);

    const { documents } = await client.documents.list({ issueKey: "DEV-1" });

    expect(documents.map((doc) => doc.name)).toEqual(["intent"]);
    expect(documents[0]?.currentVersion).toBe(1);
    const intent = await client.documents.get({ issueKey: "DEV-1", name: "intent" });
    expect(intent.body).toContain("## Problem");
    const page = await client.events.list({ subjectType: "issue", subjectId: issue.id });
    expect(page.events.map((e) => e.kind)).toContain("document.created");
  });

  it("creates the next Document when a Gate is approved, and only once", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withIssue(db);

    await client.gates.approve({ key: "DEV-1" });
    expect(
      (await client.documents.list({ issueKey: "DEV-1" })).documents.map((d) => d.name),
    ).toEqual(["intent", "spec"]);

    // Back to Intent and forward again: the spec is not created a second time.
    await client.gates.reject({ key: "DEV-1" });
    await client.gates.approve({ key: "DEV-1" });
    expect(
      (await client.documents.list({ issueKey: "DEV-1" })).documents.map((d) => d.name),
    ).toEqual(["intent", "spec"]);
  });
});

describe("documents.write", () => {
  it("appends a version and leaves the older one readable", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { admin, client, issue } = await withIssue(db);

    const written = await client.documents.write({
      issueKey: "DEV-1",
      name: "intent",
      body: "## Problem\n\nThe Event log has no reader.",
    });

    expect(written.version).toBe(2);
    expect(written.authorMemberId).toBe(admin.member.id);
    const latest = await client.documents.get({ issueKey: "DEV-1", name: "intent" });
    expect(latest.body).toContain("The Event log has no reader");
    expect(latest.version).toBe(2);

    const first = await client.documents.get({ issueKey: "DEV-1", name: "intent", version: 1 });
    expect(first.body).toContain("## Problem");
    expect(first.body).not.toContain("The Event log has no reader");

    const page = await client.events.list({ subjectType: "issue", subjectId: issue.id });
    expect(page.events.at(-1)).toMatchObject({
      kind: "document.updated",
      payload: { name: "intent", version: 2 },
    });
  });

  it("reports an unknown Document as not found", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withIssue(db);

    await expect(
      client.documents.write({ issueKey: "DEV-1", name: "nope", body: "x" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("workflow.update", () => {
  it("carries the Document name and template", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withIssue(db);
    const { states } = await client.workflow.get({ projectKey: "DEV" });

    const updated = await client.workflow.update({
      projectKey: "DEV",
      states: states.map((state) => ({
        id: state.id,
        name: state.name,
        isGate: state.isGate,
        category: state.category,
        documentName: state.name === "Build" ? "notes" : state.documentName,
        documentTemplate: state.name === "Build" ? "## Notes" : state.documentTemplate,
      })),
    });

    expect(updated.states.find((s) => s.name === "Build")).toMatchObject({
      documentName: "notes",
      documentTemplate: "## Notes",
    });
  });
});
