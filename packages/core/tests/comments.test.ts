import { createRouterClient } from "@orpc/server";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { extractHandles } from "../src/mentions.ts";
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
  await client.issues.create({ projectKey: "DEV", title: "Ship it" });
  return { admin, client };
}

describe("extractHandles", () => {
  it("finds @handles and ignores an email address", () => {
    expect(extractHandles("ping @bob and @core, not bob@flippable.net")).toEqual(["bob", "core"]);
    expect(extractHandles("nothing here")).toEqual([]);
    expect(extractHandles("@bob @bob")).toEqual(["bob"]);
  });
});

describe("comments.create", () => {
  it("resolves a mentioned Member and expands a mentioned Team to its Members", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { admin, client } = await withIssue(db);
    const bob = await memberContext(db, { name: "Bob", email: "bob@flippable.net" });
    const carol = await memberContext(db, { name: "Carol", email: "carol@flippable.net" });
    await db
      .update((await import("@deevy/db")).member)
      .set({ handle: "bob" })
      .where(
        (await import("drizzle-orm")).eq((await import("@deevy/db")).member.id, bob.member.id),
      );
    const team = await client.teams.create({ name: "Core", handle: "core" });
    await client.teams.addMember({ teamId: team.id, memberId: bob.member.id });
    await client.teams.addMember({ teamId: team.id, memberId: carol.member.id });

    const comment = await client.comments.create({
      issueKey: "DEV-1",
      body: "ping @bob and @core",
    });

    expect(comment.body).toBe("ping @bob and @core");
    expect(comment.authorMemberId).toBe(admin.member.id);
    const page = await client.events.list({ subjectType: "issue" });
    const created = page.events.findLast((e) => e.kind === "comment.created");
    const mentioned = (created?.payload as { mentionedMemberIds: string[] }).mentionedMemberIds;
    expect([...mentioned].sort()).toEqual([bob.member.id, carol.member.id].sort());
  });

  it("mentions nobody when no handle matches", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withIssue(db);

    await client.comments.create({ issueKey: "DEV-1", body: "ping @nobody" });

    const page = await client.events.list({ subjectType: "issue" });
    const created = page.events.findLast((e) => e.kind === "comment.created");
    expect((created?.payload as { mentionedMemberIds: string[] }).mentionedMemberIds).toEqual([]);
  });
});

describe("comments.update", () => {
  it("lets the author edit and refuses anyone else who is not an admin", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withIssue(db);
    const bob = await memberContext(db, { name: "Bob", email: "bob@flippable.net" });
    const comment = await client.comments.create({ issueKey: "DEV-1", body: "first" });

    const edited = await client.comments.update({ commentId: comment.id, body: "second" });
    expect(edited).toMatchObject({ body: "second" });
    expect(edited.editedAt).toBeInstanceOf(Date);

    const asBob = createRouterClient(router, { context: bob });
    await expect(
      asBob.comments.update({ commentId: comment.id, body: "mine now" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("comments.delete", () => {
  it("keeps the comment in the thread with no body, and lets an admin delete another's", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withIssue(db);
    const bob = await memberContext(db, { name: "Bob", email: "bob@flippable.net" });
    const asBob = createRouterClient(router, { context: bob });
    const mine = await client.comments.create({ issueKey: "DEV-1", body: "mine" });
    const theirs = await asBob.comments.create({ issueKey: "DEV-1", body: "theirs" });

    await client.comments.delete({ commentId: mine.id });
    // An admin may delete someone else's.
    await client.comments.delete({ commentId: theirs.id });

    const { comments } = await client.comments.list({ issueKey: "DEV-1" });
    expect(comments).toHaveLength(2);
    expect(comments.every((c) => c.deletedAt !== null)).toBe(true);
    expect(comments.every((c) => c.body === "")).toBe(true);
  });

  it("refuses a Member deleting another's comment", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withIssue(db);
    const bob = await memberContext(db, { name: "Bob", email: "bob@flippable.net" });
    const mine = await client.comments.create({ issueKey: "DEV-1", body: "mine" });

    const asBob = createRouterClient(router, { context: bob });
    await expect(asBob.comments.delete({ commentId: mine.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("mentions in an Issue description", () => {
  it("are resolved the same way on update", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withIssue(db);
    const bob = await memberContext(db, { name: "Bob", email: "bob@flippable.net" });
    await db
      .update((await import("@deevy/db")).member)
      .set({ handle: "bob" })
      .where(
        (await import("drizzle-orm")).eq((await import("@deevy/db")).member.id, bob.member.id),
      );

    await client.issues.update({ key: "DEV-1", description: "over to @bob" });

    const page = await client.events.list({ subjectType: "issue" });
    const updated = page.events.findLast((e) => e.kind === "issue.updated");
    expect((updated?.payload as { mentionedMemberIds?: string[] }).mentionedMemberIds).toEqual([
      bob.member.id,
    ]);
  });
});
