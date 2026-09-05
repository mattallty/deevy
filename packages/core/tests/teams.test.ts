import { createRouterClient } from "@orpc/server";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { router } from "../src/operations/index.ts";
import { memberContext, testDb } from "./helpers.ts";

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

describe("teams.create", () => {
  it("returns the Team with a handle derived from its name, and records the Event", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    const client = createRouterClient(router, { context: admin });

    const team = await client.teams.create({ name: "Platform Team" });

    expect(team).toMatchObject({ name: "Platform Team", handle: "platform-team" });
    expect(team.members).toEqual([]);
    const page = await client.events.list({ subjectType: "team", subjectId: team.id });
    expect(page.events).toMatchObject([
      { kind: "team.created", actorMemberId: admin.member.id, payload: { name: "Platform Team" } },
    ]);
  });

  it("will not take a handle a Member already holds", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    const client = createRouterClient(router, { context: admin });

    // memberContext leaves the admin without a handle, so claim one explicitly.
    const platform = await client.teams.create({ name: "Platform", handle: "platform" });
    const second = await client.teams.create({ name: "Platform Again" });

    expect(platform.handle).toBe("platform");
    expect(second.handle).not.toBe("platform");
  });

  it("refuses a Member who is not an admin", async () => {
    const { db, close } = testDb();
    closers.push(close);
    await memberContext(db, { role: "admin", name: "Ada" });
    const bob = await memberContext(db, { name: "Bob", email: "bob@example.com" });

    const client = createRouterClient(router, { context: bob });
    await expect(client.teams.create({ name: "Platform" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("a Team's Members", () => {
  it("lists everyone added to it", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    const bob = await memberContext(db, { name: "Bob", email: "bob@example.com" });
    const client = createRouterClient(router, { context: admin });
    const team = await client.teams.create({ name: "Platform" });

    await client.teams.addMember({ teamId: team.id, memberId: admin.member.id });
    await client.teams.addMember({ teamId: team.id, memberId: bob.member.id });

    const { teams } = await client.teams.list({});
    expect(teams).toHaveLength(1);
    expect(teams[0]?.members.map((m) => m.user.name).sort()).toEqual(["Ada", "Bob"]);
  });

  it("drops one on removeMember, and says so in the Event log", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    const bob = await memberContext(db, { name: "Bob", email: "bob@example.com" });
    const client = createRouterClient(router, { context: admin });
    const team = await client.teams.create({ name: "Platform" });
    await client.teams.addMember({ teamId: team.id, memberId: bob.member.id });

    await client.teams.removeMember({ teamId: team.id, memberId: bob.member.id });

    expect((await client.teams.list({})).teams[0]?.members).toEqual([]);
    const page = await client.events.list({ subjectType: "team", subjectId: team.id });
    expect(page.events.map((e) => e.kind)).toEqual([
      "team.created",
      "team.member_added",
      "team.member_removed",
    ]);
  });

  it("adding the same Member twice is not an error and does not duplicate them", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    const client = createRouterClient(router, { context: admin });
    const team = await client.teams.create({ name: "Platform" });

    await client.teams.addMember({ teamId: team.id, memberId: admin.member.id });
    await client.teams.addMember({ teamId: team.id, memberId: admin.member.id });

    expect((await client.teams.list({})).teams[0]?.members).toHaveLength(1);
  });
});

describe("teams.update", () => {
  it("lets a Member of the Team rename it, though they are not an admin", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    const bob = await memberContext(db, { name: "Bob", email: "bob@example.com" });
    const owner = createRouterClient(router, { context: admin });
    const team = await owner.teams.create({ name: "Platform" });
    await owner.teams.addMember({ teamId: team.id, memberId: bob.member.id });

    const client = createRouterClient(router, { context: bob });
    expect(
      await client.teams.update({ teamId: team.id, name: "Platform and Infra" }),
    ).toMatchObject({ name: "Platform and Infra" });
  });

  it("refuses a Member who is neither an admin nor on the Team", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    const bob = await memberContext(db, { name: "Bob", email: "bob@example.com" });
    const team = await createRouterClient(router, { context: admin }).teams.create({
      name: "Platform",
    });

    const client = createRouterClient(router, { context: bob });
    await expect(client.teams.update({ teamId: team.id, name: "Mine now" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("teams.delete", () => {
  it("removes the Team and leaves its Projects without one", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    const client = createRouterClient(router, { context: admin });
    const team = await client.teams.create({ name: "Platform" });
    await client.projects.create({ name: "deevy", key: "DEV", teamId: team.id });

    await client.teams.delete({ teamId: team.id });

    expect((await client.teams.list({})).teams).toEqual([]);
    expect(await client.projects.get({ key: "DEV" })).toMatchObject({ teamId: null, team: null });
  });

  it("refuses a Member of the Team who is not an admin", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    const bob = await memberContext(db, { name: "Bob", email: "bob@example.com" });
    const owner = createRouterClient(router, { context: admin });
    const team = await owner.teams.create({ name: "Platform" });
    await owner.teams.addMember({ teamId: team.id, memberId: bob.member.id });

    const client = createRouterClient(router, { context: bob });
    await expect(client.teams.delete({ teamId: team.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
