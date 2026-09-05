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
  await client.projects.create({ name: "deevy", key: "DEV" });
  return { admin, client };
}

describe("labels.create", () => {
  it("makes a plain Label and a scoped one, and records the Events", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withProject(db);

    const backend = await client.labels.create({ name: "backend", color: "#3b82f6" });
    const epic = await client.labels.create({
      scope: "epic",
      name: "Checkout rewrite",
      color: "#a855f7",
    });

    expect(backend).toMatchObject({ scope: null, name: "backend" });
    expect(epic).toMatchObject({ scope: "epic", name: "Checkout rewrite" });
    expect((await client.labels.list({})).labels).toHaveLength(2);
    const page = await client.events.list({ subjectType: "label", subjectId: epic.id });
    expect(page.events.map((e) => e.kind)).toEqual(["label.created"]);
  });

  it("reports the same scope and name twice as a conflict", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withProject(db);
    await client.labels.create({ scope: "epic", name: "Checkout", color: "#a855f7" });

    await expect(
      client.labels.create({ scope: "epic", name: "Checkout", color: "#000000" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    // The same name under no scope is a different Label.
    expect(await client.labels.create({ name: "Checkout", color: "#000000" })).toMatchObject({
      scope: null,
    });
  });
});

describe("issues.setLabels", () => {
  it("stacks plain Labels but keeps one per scope, the last given", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withProject(db);
    await client.issues.create({ projectKey: "DEV", title: "Ship it" });
    const backend = await client.labels.create({ name: "backend", color: "#1" });
    const frontend = await client.labels.create({ name: "frontend", color: "#2" });
    const checkout = await client.labels.create({ scope: "epic", name: "Checkout", color: "#3" });
    const billing = await client.labels.create({ scope: "epic", name: "Billing", color: "#4" });

    const labelled = await client.issues.setLabels({
      key: "DEV-1",
      labelIds: [backend.id, frontend.id, checkout.id, billing.id],
    });

    expect(labelled.labels.map((label) => label.name).sort()).toEqual([
      "Billing",
      "backend",
      "frontend",
    ]);
  });

  it("replaces the set and says what changed", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withProject(db);
    const issue = await client.issues.create({ projectKey: "DEV", title: "Ship it" });
    const backend = await client.labels.create({ name: "backend", color: "#1" });
    const frontend = await client.labels.create({ name: "frontend", color: "#2" });
    await client.issues.setLabels({ key: "DEV-1", labelIds: [backend.id] });

    await client.issues.setLabels({ key: "DEV-1", labelIds: [frontend.id] });

    const page = await client.events.list({ subjectType: "issue", subjectId: issue.id });
    expect(page.events.findLast((e) => e.kind === "issue.labels_changed")).toMatchObject({
      payload: { added: [frontend.id], removed: [backend.id] },
    });
  });
});

describe("labels.delete", () => {
  it("takes the Label off every Issue and records one Event per Issue", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withProject(db);
    const first = await client.issues.create({ projectKey: "DEV", title: "One" });
    const second = await client.issues.create({ projectKey: "DEV", title: "Two" });
    const backend = await client.labels.create({ name: "backend", color: "#1" });
    await client.issues.setLabels({ key: "DEV-1", labelIds: [backend.id] });
    await client.issues.setLabels({ key: "DEV-2", labelIds: [backend.id] });

    await client.labels.delete({ labelId: backend.id });

    expect((await client.labels.list({})).labels).toEqual([]);
    expect((await client.issues.get({ key: "DEV-1" })).labels).toEqual([]);
    for (const issue of [first, second]) {
      const page = await client.events.list({ subjectType: "issue", subjectId: issue.id });
      expect(page.events.filter((e) => e.kind === "issue.labels_changed")).toHaveLength(2);
    }
  });

  it("refuses a Member who is not an admin", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withProject(db);
    const backend = await client.labels.create({ name: "backend", color: "#1" });
    const bob = await memberContext(db, { name: "Bob", email: "bob@example.com" });

    const asBob = createRouterClient(router, { context: bob });
    await expect(asBob.labels.delete({ labelId: backend.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("issues.list", () => {
  it("filters by Label", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withProject(db);
    await client.issues.create({ projectKey: "DEV", title: "One" });
    await client.issues.create({ projectKey: "DEV", title: "Two" });
    const backend = await client.labels.create({ name: "backend", color: "#1" });
    await client.issues.setLabels({ key: "DEV-2", labelIds: [backend.id] });

    const { issues } = await client.issues.list({ projectKey: "DEV", labelId: backend.id });

    expect(issues.map((issue) => issue.key)).toEqual(["DEV-2"]);
  });
});
