// drizzle-kit 1.0.0-rc.4 emits `id text PRIMARY KEY` without NOT NULL (#6165),
// which lets SQLite store NULL ids. Generated SQL is patched by hand; this
// check keeps CI honest about it (ADR-0008).
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../drizzle/", import.meta.url).pathname;
const problems: string[] = [];

for (const entry of await readdir(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const file = join(root, entry.name, "migration.sql");
  const sql = await readFile(file, "utf8").catch(() => null);
  if (sql === null) continue;
  for (const [index, line] of sql.split("\n").entries()) {
    if (/\btext\b.*\bPRIMARY KEY\b/i.test(line) && !/\bNOT NULL\b/i.test(line)) {
      problems.push(`${entry.name}/migration.sql:${index + 1}: ${line.trim()}`);
    }
  }
}

if (problems.length > 0) {
  console.error("text PRIMARY KEY columns without NOT NULL:\n" + problems.join("\n"));
  process.exit(1);
}
console.log("migrations ok");
