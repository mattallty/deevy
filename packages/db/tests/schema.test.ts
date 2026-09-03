import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/node-sqlite";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import { describe, expect, it } from "vite-plus/test";
import { member, relations, user, workspace } from "../src/index.ts";

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
