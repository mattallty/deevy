// Writes packages/db/auth.bootstrap.ts, which exists only while
// `vp run db#generate:auth` runs and is deleted straight afterwards.
//
// Why it has to exist: the Better Auth Drizzle adapter resolves every model
// and every field a plugin declares against the schema object before it will
// generate, and the mcp plugin queries its own oauth_resource table as it
// initialises. A plugin's tables therefore cannot be generated while they do
// not yet exist. Rather than hand-write them, which CLAUDE.md forbids and
// which would drift from the plugin, this reads the shapes off the plugin
// itself and emits throwaway tables plus the DDL to create them in the
// generator's in-memory database.
//
//   node scripts/bootstrap-auth-schema.ts
//   vp run db#generate:auth
//   rm auth.bootstrap.ts
//
import { writeFileSync } from "node:fs";
import { mcp } from "@better-auth/mcp";

const plugin = mcp({
  loginPage: "/",
  consentPage: "/consent",
  resource: "http://localhost:3000/mcp",
}) as unknown as {
  schema?: Record<string, { fields: Record<string, { type: string }>; modelName?: string }>;
};
const snake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
const column = (name: string, type: string) => {
  const col = `"${snake(name)}"`;
  if (type === "boolean") return `integer(${col}, { mode: "boolean" })`;
  if (type === "date") return `integer(${col}, { mode: "timestamp_ms" })`;
  if (type === "number") return `integer(${col})`;
  return `text(${col})`;
};

let out = `// Generation-time only; see auth.generate.config.ts. Deleted after use.
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
`;
const ddl: string[] = [];
for (const [model, def] of Object.entries(plugin.schema ?? {})) {
  const fields = Object.entries(def.fields)
    .map(([f, d]) => `  ${f}: ${column(f, d.type)},`)
    .join("\n");
  const table = def.modelName ?? snake(model);
  const cols = Object.keys(def.fields).map((f) => `"${snake(f)}"`);
  ddl.push(
    `CREATE TABLE IF NOT EXISTS "${table}" ("id" text PRIMARY KEY, ${cols.map((c) => `${c} text`).join(", ")})`,
  );
  out += `\nexport const ${model} = sqliteTable("${table}", {\n  id: text("id").primaryKey(),\n${fields}\n});\n`;
}
out += `\n/** The same tables as DDL, so the plugin's init query finds them. */\nexport const bootstrapSql = ${JSON.stringify(ddl, null, 2)};\n`;
writeFileSync(new URL("./auth.bootstrap.ts", import.meta.url), out);
console.log(`stubbed ${Object.keys(plugin.schema ?? {}).length} models`);
