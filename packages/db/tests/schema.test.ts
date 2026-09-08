import { DatabaseSync } from "node:sqlite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-sqlite";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import { describe, expect, it } from "vite-plus/test";
import {
  event,
  invitation,
  member,
  notification,
  relations,
  user,
  workspace,
} from "../src/index.ts";

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;

function openTestDb() {
  const client = new DatabaseSync(":memory:");
  const db = drizzle({ client, relations });
  const failure = migrate(db, { migrationsFolder });
  if (failure) throw new Error(JSON.stringify(failure));
  client.exec("PRAGMA foreign_keys = ON");
  return db;
}

describe("schema", () => {
  it("migrates and round-trips a Workspace with an admin Member", async () => {
    const db = openTestDb();
    await db.insert(user).values({ id: "u1", name: "Ada", email: "ada@example.com" });
    await db.insert(workspace).values({ id: "w1", name: "deevy", slug: "deevy" });
    await db.insert(member).values({ id: "m1", workspaceId: "w1", userId: "u1", role: "admin" });

    const found = await db.query.member.findFirst({
      where: { userId: "u1" },
      with: { workspace: true, user: true },
    });
    expect(found?.role).toBe("admin");
    expect(found?.kind).toBe("human");
    expect(found?.workspace.slug).toBe("deevy");
    expect(found?.user.email).toBe("ada@example.com");
    expect(found?.createdAt).toBeInstanceOf(Date);
  });

  it("refuses a second Member row for the same user", async () => {
    const db = openTestDb();
    await db.insert(user).values({ id: "u1", name: "Ada", email: "ada@example.com" });
    await db.insert(workspace).values({ id: "w1", name: "deevy", slug: "deevy" });
    await db.insert(member).values({ id: "m1", workspaceId: "w1", userId: "u1" });
    await expect(
      db.insert(member).values({ id: "m2", workspaceId: "w1", userId: "u1" }),
    ).rejects.toThrow();
  });
});

/**
 * At most one inbox row per Member per kind per Event (docs/plans/m3.md). The
 * key has to carry the kind: one Event can owe the same Human two different
 * things, and a key of Member and Event alone would silently drop the second.
 */
describe("what a Member may be owed for one Event", () => {
  async function workspaceWithEvent() {
    const db = openTestDb();
    await db.insert(user).values({ id: "u1", name: "Ada", email: "ada@example.com" });
    await db.insert(workspace).values({ id: "w1", name: "deevy", slug: "deevy" });
    await db.insert(member).values({ id: "m1", workspaceId: "w1", userId: "u1" });
    const [row] = await db
      .insert(event)
      .values({
        workspaceId: "w1",
        kind: "issue.created",
        subjectType: "issue",
        subjectId: "i1",
      })
      .returning();
    return { db, seq: (row as { seq: number }).seq };
  }

  it("refuses a second Notification of the same kind", async () => {
    const { db, seq } = await workspaceWithEvent();
    await db
      .insert(notification)
      .values({ id: "n1", recipientMemberId: "m1", kind: "mention", eventId: seq });

    await expect(
      db
        .insert(notification)
        .values({ id: "n2", recipientMemberId: "m1", kind: "mention", eventId: seq }),
    ).rejects.toThrow();
  });

  it("takes two Notifications of different kinds", async () => {
    const { db, seq } = await workspaceWithEvent();
    await db
      .insert(notification)
      .values({ id: "n1", recipientMemberId: "m1", kind: "mention", eventId: seq });

    await db
      .insert(notification)
      .values({ id: "n2", recipientMemberId: "m1", kind: "assignment", eventId: seq });

    expect(await db.query.notification.findMany()).toHaveLength(2);
  });
});

/**
 * One live invitation per address, where live is "neither accepted nor
 * revoked" (docs/plans/sign-in.md). The partial index is what makes "who is
 * invited right now" a lookup rather than a replay of the Event log, and the
 * database is where that is worth asserting: the migration carries the `where`
 * drizzle-kit generated, and `check:migrations` reads neither.
 */
describe("how many invitations one address may have", () => {
  async function workspaceWithInvitation() {
    const db = openTestDb();
    await db.insert(workspace).values({ id: "w1", name: "deevy", slug: "deevy" });
    await db.insert(invitation).values({
      id: "inv1",
      workspaceId: "w1",
      email: "grace@example.com",
      tokenHash: "hash-1",
      expiresAt: new Date("2027-01-01"),
    });
    return db;
  }

  it("refuses a second live one", async () => {
    const db = await workspaceWithInvitation();

    await expect(
      db.insert(invitation).values({
        id: "inv2",
        workspaceId: "w1",
        email: "grace@example.com",
        tokenHash: "hash-2",
        expiresAt: new Date("2027-01-01"),
      }),
    ).rejects.toThrow();
  });

  it("takes another once the first is revoked, and keeps them both", async () => {
    const db = await workspaceWithInvitation();
    await db
      .update(invitation)
      .set({ revokedAt: new Date("2026-09-07") })
      .where(eq(invitation.id, "inv1"));

    await db.insert(invitation).values({
      id: "inv2",
      workspaceId: "w1",
      email: "grace@example.com",
      tokenHash: "hash-2",
      expiresAt: new Date("2027-01-01"),
    });

    expect(await db.query.invitation.findMany()).toHaveLength(2);
  });
});
