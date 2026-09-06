import { createRouterClient } from "@orpc/server";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { router } from "../src/operations/index.ts";
import { agentContext, memberContext, testDb, type MemberContext } from "./helpers.ts";
import { newId } from "../src/ids.ts";

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

/** An admin with one Project, the arrangement every Issue test starts from. */
async function withProject(db: MemberContext["db"]) {
  const admin = await memberContext(db, { role: "admin", name: "Ada" });
  const client = createRouterClient(router, { context: admin });
  const project = await client.projects.create({ name: "deevy", key: "DEV" });
  return { admin, client, project };
}

describe("issues.create", () => {
  it("gives the Issue a key, the first State, and the caller as creator", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { admin, client, project } = await withProject(db);

    const issue = await client.issues.create({ projectKey: "DEV", title: "Ship the Event log" });

    expect(issue).toMatchObject({
      key: "DEV-1",
      number: 1,
      title: "Ship the Event log",
      createdBy: admin.member.id,
      assigneeMemberId: null,
      parentId: null,
      closedAt: null,
    });
    expect(issue.state).toMatchObject({ name: "Intent", position: 0 });
    expect(issue.projectId).toBe(project.id);
  });

  it("records issue.created against the Project", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { admin, client, project } = await withProject(db);

    const issue = await client.issues.create({ projectKey: "DEV", title: "Ship it" });

    const page = await client.events.list({ subjectType: "issue", subjectId: issue.id });
    expect(page.events.filter((e) => e.kind === "issue.created")).toMatchObject([
      {
        kind: "issue.created",
        actorMemberId: admin.member.id,
        projectId: project.id,
        payload: { key: "DEV-1", title: "Ship it", state: "Intent" },
      },
    ]);
  });
});

describe("Issue numbers", () => {
  it("run 1 to 20 with no gap when twenty calls race", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withProject(db);

    const created = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        client.issues.create({ projectKey: "DEV", title: `Issue ${index}` }),
      ),
    );

    expect(created.map((issue) => issue.number).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
  });
});

describe("issues.get", () => {
  it("finds an Issue by its key, with its State, Assignee, parent and children", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { admin, client } = await withProject(db);
    await client.issues.create({ projectKey: "DEV", title: "One" });
    await client.issues.create({ projectKey: "DEV", title: "Two" });
    const third = await client.issues.create({ projectKey: "DEV", title: "Three" });
    await client.issues.create({ projectKey: "DEV", title: "Child", parentKey: "DEV-3" });

    const found = await client.issues.get({ key: "dev-3" });

    expect(found).toMatchObject({ key: "DEV-3", title: "Three", id: third.id });
    expect(found.state.name).toBe("Intent");
    expect(found.assignee).toBeNull();
    expect(found.parent).toBeNull();
    expect(found.children.map((child) => child.key)).toEqual(["DEV-4"]);
    expect(admin.member.id).toBe(found.createdBy);
  });

  it("reports an unknown key as not found", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withProject(db);

    await expect(client.issues.get({ key: "DEV-99" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(client.issues.get({ key: "NOPE-1" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("issues.list", () => {
  it("lists a Project's Issues in key order and pages by cursor", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withProject(db);
    for (const title of ["One", "Two", "Three"]) {
      await client.issues.create({ projectKey: "DEV", title });
    }

    const first = await client.issues.list({ projectKey: "DEV", limit: 2 });
    expect(first.issues.map((issue) => issue.key)).toEqual(["DEV-1", "DEV-2"]);
    expect(first.nextCursor).toBe(2);

    const second = await client.issues.list({ projectKey: "DEV", after: first.nextCursor ?? 0 });
    expect(second.issues.map((issue) => issue.key)).toEqual(["DEV-3"]);
    expect(second.nextCursor).toBe(3);
  });

  it("keeps the cursor when q names an Issue by key, so neither overrides the other", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withProject(db);
    for (const title of ["One", "Two", "Three"]) {
      await client.issues.create({ projectKey: "DEV", title });
    }

    const found = await client.issues.list({ projectKey: "DEV", after: 1, q: "DEV-2" });
    expect(found.issues.map((issue) => issue.key)).toEqual(["DEV-2"]);
    const behind = await client.issues.list({ projectKey: "DEV", after: 2, q: "DEV-2" });
    expect(behind.issues).toEqual([]);
    expect(behind.nextCursor).toBeNull();
  });

  it("ignores after without a projectKey, where a number cursor means nothing", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withProject(db);
    await client.projects.create({ name: "Operations", key: "OPS" });
    await client.issues.create({ projectKey: "DEV", title: "One" });
    await client.issues.create({ projectKey: "OPS", title: "Two" });

    const all = await client.issues.list({ after: 5 });
    expect(all.issues.map((issue) => issue.key).sort()).toEqual(["DEV-1", "OPS-1"]);
    expect(all.nextCursor).toBeNull();
  });

  it("filters by State and by Assignee", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { admin, client, project } = await withProject(db);
    const spec = project.states.find((state) => state.name === "Spec");
    await client.issues.create({ projectKey: "DEV", title: "Unassigned" });
    await client.issues.create({
      projectKey: "DEV",
      title: "Mine",
      assigneeMemberId: admin.member.id,
    });

    expect(
      (
        await client.issues.list({ projectKey: "DEV", assigneeMemberId: admin.member.id })
      ).issues.map((issue) => issue.title),
    ).toEqual(["Mine"]);
    expect((await client.issues.list({ projectKey: "DEV", stateId: spec?.id })).issues).toEqual([]);
  });

  it("returns every Issue for open: true while none is done", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withProject(db);
    await client.issues.create({ projectKey: "DEV", title: "One" });
    await client.issues.create({ projectKey: "DEV", title: "Two" });

    const open = await client.issues.list({ projectKey: "DEV", open: true });
    expect(open.issues.map((issue) => issue.key)).toEqual(["DEV-1", "DEV-2"]);
  });
});

describe("issues.list across the Workspace", () => {
  it("lists every Project's Issues when none is named, newest change first, keyed per Project", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withProject(db);
    await client.projects.create({ name: "Operations", key: "OPS" });
    await client.issues.create({ projectKey: "DEV", title: "First" });
    const later = await client.issues.create({ projectKey: "OPS", title: "Second" });
    // updatedAt has millisecond resolution, and the feed sorts by it: the
    // touch must land in a later millisecond than the creation above.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await client.issues.update({ key: "DEV-1", title: "First, touched" });

    const all = await client.issues.list({});
    expect(all.issues.map((issue) => issue.key)).toEqual(["DEV-1", later.key]);
    expect(all.nextCursor).toBeNull();
  });

  it("finds an Issue by key, by number, or by a word of its title with q", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withProject(db);
    await client.projects.create({ name: "Operations", key: "OPS" });
    await client.issues.create({ projectKey: "DEV", title: "Ship the Event log" });
    await client.issues.create({ projectKey: "DEV", title: "Retry webhook deliveries" });
    await client.issues.create({ projectKey: "OPS", title: "Rotate the OAuth secret" });

    const keys = async (q: string) =>
      (await client.issues.list({ q })).issues.map((issue) => issue.key).sort();
    expect(await keys("dev-2")).toEqual(["DEV-2"]);
    expect(await keys("1")).toEqual(["DEV-1", "OPS-1"]);
    expect(await keys("event LOG")).toEqual(["DEV-1"]);
    expect(await keys("the")).toEqual(["DEV-1", "OPS-1"]);
    expect(await keys("nothing here")).toEqual([]);
    expect(await keys("ZZZ-9")).toEqual([]);
  });

  it("reads a key no Project here has as a word of the title", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withProject(db);
    await client.issues.create({ projectKey: "DEV", title: "Read ADR-0015 before touching ids" });
    await client.issues.create({ projectKey: "DEV", title: "Nothing to do with it" });

    const found = await client.issues.list({ q: "ADR-0015" });
    expect(found.issues.map((issue) => issue.key)).toEqual(["DEV-1"]);
    // A key of a Project that does exist is still exactly that Issue.
    expect((await client.issues.list({ q: "DEV-2" })).issues.map((issue) => issue.key)).toEqual([
      "DEV-2",
    ]);
  });

  it("filters by State name, by the Assignee's kind, by nobody, and by Sponsor", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { admin, client, project } = await withProject(db);
    await client.projects.create({ name: "Operations", key: "OPS" });
    const grace = await memberContext(db, { name: "Grace" });
    const planner = await agentContext(db, { sponsor: admin.member, grants: [project.id] });
    const builder = await agentContext(db, {
      name: "Builder",
      sponsor: grace.member,
      grants: [project.id],
    });
    await client.issues.create({ projectKey: "DEV", title: "Nobody's" });
    await client.issues.create({
      projectKey: "DEV",
      title: "Ada's",
      assigneeMemberId: admin.member.id,
    });
    await client.issues.create({
      projectKey: "DEV",
      title: "Planner's",
      assigneeMemberId: planner.member.id,
    });
    await client.issues.create({
      projectKey: "OPS",
      title: "Builder's",
      assigneeMemberId: builder.member.id,
    });
    // Intent is a Gate, so a ruling is what moves DEV-2 on, into Spec.
    await client.gates.approve({ key: "DEV-2" });

    const titles = async (input: Parameters<typeof client.issues.list>[0]) =>
      (await client.issues.list(input)).issues.map((issue) => issue.title).sort();
    expect(await titles({ stateName: "Spec" })).toEqual(["Ada's"]);
    expect(await titles({ stateName: "Intent" })).toEqual(["Builder's", "Nobody's", "Planner's"]);
    expect(await titles({ assigneeKind: "human" })).toEqual(["Ada's"]);
    expect(await titles({ assigneeKind: "agent" })).toEqual(["Builder's", "Planner's"]);
    expect(await titles({ unassigned: true })).toEqual(["Nobody's"]);
    expect(await titles({ sponsorMemberId: admin.member.id })).toEqual(["Planner's"]);
    expect(await titles({ sponsorMemberId: grace.member.id })).toEqual(["Builder's"]);
    // The filters narrow together.
    expect(await titles({ assigneeKind: "agent", stateName: "Intent", projectKey: "DEV" })).toEqual(
      ["Planner's"],
    );
  });

  it("says when more matched than the page holds", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withProject(db);
    for (const title of ["One", "Two", "Three"]) {
      await client.issues.create({ projectKey: "DEV", title });
    }

    const short = await client.issues.list({ limit: 2 });
    expect(short.issues).toHaveLength(2);
    expect(short.hasMore).toBe(true);
    const whole = await client.issues.list({ limit: 3 });
    expect(whole.issues).toHaveLength(3);
    expect(whole.hasMore).toBe(false);
    // A Project's page says so too, beside its cursor.
    const paged = await client.issues.list({ projectKey: "DEV", limit: 2 });
    expect(paged).toMatchObject({ nextCursor: 2, hasMore: true });
    expect(await client.issues.list({ projectKey: "DEV", after: 2, limit: 2 })).toMatchObject({
      nextCursor: 3,
      hasMore: false,
    });
  });

  it("takes % and _ in q literally, rather than as LIKE's wildcards", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withProject(db);
    await client.issues.create({ projectKey: "DEV", title: "Move 100% of traffic" });
    await client.issues.create({ projectKey: "DEV", title: "Move 1000 users" });
    await client.issues.create({ projectKey: "DEV", title: "snake_case names" });
    await client.issues.create({ projectKey: "DEV", title: "snakeXcase names" });
    await client.issues.create({ projectKey: "DEV", title: "A C:\\path\\to it" });

    const titles = async (q: string) =>
      (await client.issues.list({ q })).issues.map((issue) => issue.title).sort();
    expect(await titles("100%")).toEqual(["Move 100% of traffic"]);
    expect(await titles("snake_case")).toEqual(["snake_case names"]);
    expect(await titles("\\path")).toEqual(["A C:\\path\\to it"]);
  });

  it("shows an Agent only the Projects it was granted", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { admin, client, project } = await withProject(db);
    await client.projects.create({ name: "Operations", key: "OPS" });
    await client.issues.create({ projectKey: "DEV", title: "Seen" });
    await client.issues.create({ projectKey: "OPS", title: "Unseen" });
    const agent = await agentContext(db, { sponsor: admin.member, grants: [project.id] });
    const asAgent = createRouterClient(router, { context: agent });

    const mine = await asAgent.issues.list({});
    expect(mine.issues.map((issue) => issue.key)).toEqual(["DEV-1"]);
    expect((await asAgent.issues.list({ q: "Unseen" })).issues).toEqual([]);
  });
});

describe("issues.update", () => {
  it("changes the title and description and records what changed", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withProject(db);
    const issue = await client.issues.create({ projectKey: "DEV", title: "Draft" });

    const updated = await client.issues.update({
      key: "DEV-1",
      title: "Ship the Event log",
      description: "## Why\nBecause everything derives from it.",
    });

    expect(updated).toMatchObject({ title: "Ship the Event log" });
    expect(updated.description).toContain("Because everything");
    const page = await client.events.list({ subjectType: "issue", subjectId: issue.id });
    expect(page.events.findLast((e) => e.kind === "issue.updated")).toMatchObject({
      kind: "issue.updated",
      payload: { title: { from: "Draft", to: "Ship the Event log" } },
    });
  });

  it("records an assignment as its own Event, carrying old and new", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { admin, client } = await withProject(db);
    const bob = await memberContext(db, { name: "Bob", email: "bob@example.com" });
    const issue = await client.issues.create({ projectKey: "DEV", title: "Draft" });

    await client.issues.update({ key: "DEV-1", assigneeMemberId: admin.member.id });
    const reassigned = await client.issues.update({
      key: "DEV-1",
      assigneeMemberId: bob.member.id,
    });

    expect(reassigned.assignee).toMatchObject({ id: bob.member.id });
    const page = await client.events.list({ subjectType: "issue", subjectId: issue.id });
    expect(page.events.filter((e) => e.kind === "issue.assigned")).toHaveLength(2);
    expect(page.events.findLast((e) => e.kind === "issue.assigned")).toMatchObject({
      payload: { from: admin.member.id, to: bob.member.id },
    });
  });

  it("refuses an Assignee who is not a Member", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withProject(db);
    await client.issues.create({ projectKey: "DEV", title: "Draft" });

    await expect(
      client.issues.update({ key: "DEV-1", assigneeMemberId: newId("member") }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("reparents an Issue and records issue.reparented", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withProject(db);
    const parent = await client.issues.create({ projectKey: "DEV", title: "Epic" });
    await client.issues.create({ projectKey: "DEV", title: "Child" });

    const child = await client.issues.update({ key: "DEV-2", parentKey: "DEV-1" });

    expect(child.parent).toMatchObject({ key: "DEV-1" });
    const page = await client.events.list({ subjectType: "issue", subjectId: parent.id });
    expect(page.events.map((e) => e.kind)).not.toContain("issue.reparented");
    const childEvents = await client.events.list({ subjectType: "issue", subjectId: child.id });
    expect(childEvents.events.findLast((e) => e.kind === "issue.reparented")).toMatchObject({
      kind: "issue.reparented",
      payload: { from: null, to: parent.id },
    });
  });

  it("refuses a parent that is the Issue itself or one of its descendants", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withProject(db);
    await client.issues.create({ projectKey: "DEV", title: "Grandparent" });
    await client.issues.create({ projectKey: "DEV", title: "Parent", parentKey: "DEV-1" });
    await client.issues.create({ projectKey: "DEV", title: "Child", parentKey: "DEV-2" });

    await expect(client.issues.update({ key: "DEV-1", parentKey: "DEV-1" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(client.issues.update({ key: "DEV-1", parentKey: "DEV-3" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("detaches a parent when passed null", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withProject(db);
    await client.issues.create({ projectKey: "DEV", title: "Epic" });
    await client.issues.create({ projectKey: "DEV", title: "Child", parentKey: "DEV-1" });

    expect(await client.issues.update({ key: "DEV-2", parentKey: null })).toMatchObject({
      parent: null,
      parentId: null,
    });
  });
});
