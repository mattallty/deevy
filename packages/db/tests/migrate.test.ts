import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vite-plus/test";

/**
 * The unique keys that make one delivery owed once (docs/plans/m3.md) land on
 * databases that already hold deliveries and Notifications, and an instance
 * that somehow holds a duplicate must still migrate rather than fail halfway
 * through a deploy. So this applies the migrations the way a real instance
 * does — in order, on data — rather than to an empty file.
 */

const root = new URL("../drizzle/", import.meta.url).pathname;

/** Every migration in the order the migrator applies them: by folder name. */
async function migrations() {
  const entries = await readdir(root, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  return Promise.all(
    names.map(async (name) => ({
      name,
      sql: await readFile(join(root, name, "migration.sql"), "utf8"),
    })),
  );
}

/**
 * A database migrated up to, but not including, the one under test, so the
 * rows below are the rows an instance running the previous release would hold.
 */
async function upToTheUniqueKeys() {
  const all = await migrations();
  const at = all.findIndex((one) => one.sql.includes("notification_event_uidx"));
  expect(at).toBeGreaterThan(0);
  const client = new DatabaseSync(":memory:");
  for (const one of all.slice(0, at)) client.exec(one.sql);
  return { client, migration: all[at] as { name: string; sql: string } };
}

/** A Workspace, a Human, and one Event, which is all the rows below need. */
function seed(client: DatabaseSync) {
  client.exec(`
    INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
      VALUES ('u1', 'Ada', 'ada@example.com', 0, 0, 0);
    INSERT INTO workspace (id, name, slug) VALUES ('w1', 'deevy', 'deevy');
    INSERT INTO member (id, workspace_id, user_id) VALUES ('m1', 'w1', 'u1');
    INSERT INTO event (seq, workspace_id, kind, subject_type, subject_id)
      VALUES (1, 'w1', 'issue.created', 'issue', 'i1');
  `);
}

describe("the migration that makes one delivery owed once", () => {
  it("applies to a database that already holds deliveries and Notifications", async () => {
    const { client, migration } = await upToTheUniqueKeys();
    seed(client);
    client.exec(`
      INSERT INTO notification (id, recipient_member_id, kind, event_id)
        VALUES ('n1', 'm1', 'gate_awaiting', 1);
      INSERT INTO delivery (id, workspace_id, target, target_id, event_seq)
        VALUES ('d1', 'w1', 'webhook', 's1', 1);
      INSERT INTO delivery (id, workspace_id, target, target_id, event_seq)
        VALUES ('d2', 'w1', 'slack', 'c1', 1);
    `);

    client.exec(migration.sql);

    expect(client.prepare("SELECT id FROM notification").all()).toEqual([{ id: "n1" }]);
    expect(client.prepare("SELECT id FROM delivery ORDER BY id").all()).toEqual([
      { id: "d1" },
      { id: "d2" },
    ]);
  });

  it("keeps the earlier of a duplicate pair rather than failing halfway", async () => {
    const { client, migration } = await upToTheUniqueKeys();
    seed(client);
    // What the missing index allowed: the same derivation run twice.
    client.exec(`
      INSERT INTO notification (id, recipient_member_id, kind, event_id)
        VALUES ('n1', 'm1', 'gate_awaiting', 1);
      INSERT INTO notification (id, recipient_member_id, kind, event_id)
        VALUES ('n2', 'm1', 'gate_awaiting', 1);
      INSERT INTO notification (id, recipient_member_id, kind, event_id)
        VALUES ('n3', 'm1', 'assignment', 1);
      INSERT INTO delivery (id, workspace_id, target, target_id, event_seq)
        VALUES ('d1', 'w1', 'webhook', 's1', 1);
      INSERT INTO delivery (id, workspace_id, target, target_id, event_seq)
        VALUES ('d2', 'w1', 'webhook', 's1', 1);
    `);

    client.exec(migration.sql);

    // The earlier row of each pair survives, and a Member owed two kinds for
    // one Event keeps both: the key carries the kind.
    expect(client.prepare("SELECT id FROM notification ORDER BY id").all()).toEqual([
      { id: "n1" },
      { id: "n3" },
    ]);
    expect(client.prepare("SELECT id FROM delivery").all()).toEqual([{ id: "d1" }]);
  });
});
