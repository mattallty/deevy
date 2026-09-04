/**
 * Applies the committed D1 projection to an empty local D1 through the
 * committed `apps/web/wrangler.jsonc`, and checks the schema it builds against
 * the one `packages/db/src/schema` describes (docs/plans/m3.md slice 3).
 *
 * This is a script rather than a test file because it drives the wrangler CLI
 * against miniflare, which is neither jsdom nor the Node test environment. It
 * needs no Cloudflare account: `--local` is the whole story.
 */
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { getTableName, is } from "drizzle-orm";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "../src/schema/index.ts";

const run = promisify(execFile);

const wrangler = new URL("../node_modules/.bin/wrangler", import.meta.url).pathname;
const config = new URL("../../../apps/web/wrangler.jsonc", import.meta.url).pathname;
const database = "deevy";

/**
 * The tables the schema module defines. Derived, not listed, so a new table
 * without a migration fails here rather than waiting for someone to update a
 * fixture.
 */
function tablesTheSchemaDefines(): string[] {
  return Object.values(schema)
    .filter((exported) => is(exported, SQLiteTable))
    .map((table) => getTableName(table))
    .sort();
}

async function wrangle(persistTo: string, args: string[]) {
  return run(wrangler, [...args, "--local", "--config", config, "--persist-to", persistTo], {
    // wrangler asks about telemetry on a fresh machine and would block on it.
    env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
    maxBuffer: 32 * 1024 * 1024,
  });
}

async function apply(persistTo: string) {
  const { stdout } = await wrangle(persistTo, ["d1", "migrations", "apply", database]);
  return stdout;
}

/**
 * Tables the platform owns rather than packages/db: SQLite's own bookkeeping,
 * D1's (`_cf_METADATA`), and wrangler's journal of what it has applied.
 */
function platformOwned(name: string): boolean {
  return name.startsWith("sqlite_") || name.startsWith("_cf_") || name === "d1_migrations";
}

/** The tables D1 holds that packages/db is answerable for. */
async function tablesInD1(persistTo: string): Promise<string[]> {
  const { stdout } = await wrangle(persistTo, [
    "d1",
    "execute",
    database,
    "--json",
    "--command",
    "select name from sqlite_master where type='table' order by name",
  ]);
  const [result] = JSON.parse(stdout.slice(stdout.indexOf("["))) as {
    results: { name: string }[];
  }[];
  return (result?.results ?? [])
    .map(({ name }) => name)
    .filter((name) => !platformOwned(name))
    .sort();
}

function same(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

const persistTo = await mkdtemp(join(tmpdir(), "deevy-d1-"));
try {
  await apply(persistTo);

  const expected = tablesTheSchemaDefines();
  const actual = await tablesInD1(persistTo);
  if (!same(expected, actual)) {
    const missing = expected.filter((name) => !actual.includes(name));
    const extra = actual.filter((name) => !expected.includes(name));
    console.error(
      "the schema wrangler built on D1 is not the schema packages/db describes:\n" +
        (missing.length > 0 ? `  no migration creates: ${missing.join(", ")}\n` : "") +
        (extra.length > 0 ? `  no longer in the schema: ${extra.join(", ")}\n` : ""),
    );
    process.exit(1);
  }

  // Applying twice is a no-op: wrangler's journal is what makes a redeploy safe.
  const again = await apply(persistTo);
  if (!/No migrations to apply/i.test(again)) {
    console.error(`applying twice was not a no-op:\n${again}`);
    process.exit(1);
  }
  if (!same(expected, await tablesInD1(persistTo))) {
    console.error("the second apply changed the schema");
    process.exit(1);
  }

  console.log(`D1 schema ok: ${expected.length} tables from ${config}`);
} finally {
  await rm(persistTo, { recursive: true, force: true });
}
