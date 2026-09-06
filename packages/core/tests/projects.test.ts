import { createRouterClient } from "@orpc/server";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { router } from "../src/operations/index.ts";
import { memberContext, testDb } from "./helpers.ts";

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

describe("projects.create", () => {
  it("returns the Project with the default Workflow, in order", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    const client = createRouterClient(router, { context: admin });

    const project = await client.projects.create({ name: "deevy", key: "DEV" });

    expect(project).toMatchObject({ key: "DEV", name: "deevy", teamId: null, archivedAt: null });
    expect(project.nextIssueNumber).toBe(1);
    expect(project.states.map((state) => state.name)).toEqual([
      "Intent",
      "Spec",
      "Plan",
      "Build",
      "Review",
      "Done",
    ]);
    expect(project.states.filter((state) => state.isGate).map((state) => state.name)).toEqual([
      "Intent",
      "Spec",
      "Plan",
      "Review",
    ]);
    expect(project.states.map((state) => state.category)).toEqual([
      "backlog",
      "active",
      "active",
      "active",
      "active",
      "done",
    ]);
  });

  it("records project.created with the Project as subject", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    const client = createRouterClient(router, { context: admin });

    const project = await client.projects.create({ name: "deevy", key: "DEV" });

    const page = await client.events.list({ subjectType: "project", subjectId: project.id });
    expect(page.events).toMatchObject([
      {
        kind: "project.created",
        actorMemberId: admin.member.id,
        projectId: project.id,
        payload: { key: "DEV", name: "deevy" },
      },
    ]);
  });

  it("refuses a Member who is not an admin", async () => {
    const { db, close } = testDb();
    closers.push(close);
    await memberContext(db, { role: "admin", name: "Ada" });
    const bob = await memberContext(db, { name: "Bob", email: "bob@example.com" });

    const client = createRouterClient(router, { context: bob });
    await expect(client.projects.create({ name: "deevy", key: "DEV" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("a Project key", () => {
  it("must be two to six uppercase letters", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    const client = createRouterClient(router, { context: admin });

    for (const key of ["dev", "TOOLONGKEY", "D", "DE-V", "DEV1"]) {
      await expect(client.projects.create({ name: "deevy", key })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    }
  });

  it("cannot be taken twice", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    const client = createRouterClient(router, { context: admin });
    await client.projects.create({ name: "deevy", key: "DEV" });

    await expect(client.projects.create({ name: "Other", key: "DEV" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});

describe("projects.list and projects.get", () => {
  it("lists the Workspace's Projects and finds one by its key, case-insensitively", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    const client = createRouterClient(router, { context: admin });
    await client.projects.create({ name: "deevy", key: "DEV" });
    await client.projects.create({ name: "Website", key: "WEB" });

    const { projects } = await client.projects.list({});
    expect(projects.map((p) => p.key)).toEqual(["DEV", "WEB"]);
    expect(projects[0]?.states).toHaveLength(6);

    expect(await client.projects.get({ key: "dev" })).toMatchObject({ key: "DEV", name: "deevy" });
  });

  it("reports an unknown key as not found", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });

    const client = createRouterClient(router, { context: admin });
    await expect(client.projects.get({ key: "NOPE" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("is open to any Member, not only an admin", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    const bob = await memberContext(db, { name: "Bob", email: "bob@example.com" });
    await createRouterClient(router, { context: admin }).projects.create({
      name: "deevy",
      key: "DEV",
    });

    const client = createRouterClient(router, { context: bob });
    expect((await client.projects.list({})).projects).toHaveLength(1);
  });
});

describe("projects.update", () => {
  it("renames a Project and records what changed", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    const client = createRouterClient(router, { context: admin });
    const project = await client.projects.create({ name: "deevy", key: "DEV" });

    const updated = await client.projects.update({
      key: "DEV",
      name: "deevy core",
      description: "The product itself",
    });

    expect(updated).toMatchObject({ name: "deevy core", description: "The product itself" });
    const page = await client.events.list({ subjectType: "project", subjectId: project.id });
    expect(page.events.at(-1)).toMatchObject({
      kind: "project.updated",
      projectId: project.id,
      payload: { name: { from: "deevy", to: "deevy core" } },
    });
  });

  it("lets a Member of the owning Team update it, though they are not an admin", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    const bob = await memberContext(db, { name: "Bob", email: "bob@example.com" });
    const owner = createRouterClient(router, { context: admin });
    const team = await owner.teams.create({ name: "Platform" });
    await owner.teams.addMember({ teamId: team.id, memberId: bob.member.id });
    await owner.projects.create({ name: "deevy", key: "DEV", teamId: team.id });

    const client = createRouterClient(router, { context: bob });
    expect(await client.projects.update({ key: "DEV", name: "deevy core" })).toMatchObject({
      name: "deevy core",
    });
  });

  it("refuses a Member who is neither an admin nor on the owning Team", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    const bob = await memberContext(db, { name: "Bob", email: "bob@example.com" });
    const owner = createRouterClient(router, { context: admin });
    const team = await owner.teams.create({ name: "Platform" });
    await owner.projects.create({ name: "deevy", key: "DEV", teamId: team.id });

    const client = createRouterClient(router, { context: bob });
    await expect(client.projects.update({ key: "DEV", name: "Mine" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("refuses any non-admin on a Project no Team owns", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    const bob = await memberContext(db, { name: "Bob", email: "bob@example.com" });
    await createRouterClient(router, { context: admin }).projects.create({
      name: "deevy",
      key: "DEV",
    });

    const client = createRouterClient(router, { context: bob });
    await expect(client.projects.update({ key: "DEV", name: "Mine" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("projects.archive", () => {
  it("drops the Project from the default list but keeps it findable", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    const client = createRouterClient(router, { context: admin });
    const project = await client.projects.create({ name: "deevy", key: "DEV" });

    const archived = await client.projects.archive({ key: "DEV" });

    expect(archived.archivedAt).toBeInstanceOf(Date);
    expect((await client.projects.list({})).projects).toEqual([]);
    expect((await client.projects.list({ includeArchived: true })).projects).toHaveLength(1);
    expect(await client.projects.get({ key: "DEV" })).toMatchObject({ key: "DEV" });

    const page = await client.events.list({ subjectType: "project", subjectId: project.id });
    expect(page.events.map((e) => e.kind)).toEqual(["project.created", "project.archived"]);
  });

  it("refuses a Member who is not an admin", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    const bob = await memberContext(db, { name: "Bob", email: "bob@example.com" });
    await createRouterClient(router, { context: admin }).projects.create({
      name: "deevy",
      key: "DEV",
    });

    const client = createRouterClient(router, { context: bob });
    await expect(client.projects.archive({ key: "DEV" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
