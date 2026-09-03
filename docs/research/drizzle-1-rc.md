# Research: Drizzle 1.0 rc with node:sqlite, D1, and Better Auth (2026-09-03, smoke-tested)
- drizzle-orm/drizzle-kit `rc` tag = 1.0.0-rc.4 (2026-06-27) for 10 weeks; only hash-suffixed rc.5 builds since;
  no stable ETA stated. `latest` still 0.45.2. Pin exact 1.0.0-rc.4, not @rc.
- 1.0 changes: relations() removed -> defineRelations()/defineRelationsPart(); pass `relations` not `schema`;
  casing -> snakeCase; getTableColumns -> getColumns; validators moved to drizzle-orm/zod; migration folder layout v3
  (<out>/<timestamp>_<name>/migration.sql + snapshot.json, no meta/_journal.json); migrations table gains name/applied_at.
- drizzle-orm/node-sqlite: sync driver (also awaitable); needs Node 24.0 / 22.16+ (stmt.setReturnArrays). Transactions are
  synchronous: async callbacks are rejected by types and, if forced, COMMIT runs before the body (tested). No batch().
  Migrator drizzle-orm/node-sqlite/migrator works; drizzle-kit migrate auto-detects node:sqlite.
- drizzle-orm/d1 present in rc.4 with batch(); transaction() still emits BEGIN (D1 rejects). Open #6038: batch() shifts
  values on duplicate column names. Bundles for workerd with zero node: imports (migrator needs nodejs_compat).
- @better-auth/drizzle-adapter 1.7.2 peer: "^0.45.2 || >=1.0.0-rc.1 <2.0.0". Use the `/relations-v2` entry
  (default adapter breaks with joins:true on 1.x). Tested on rc.4 + node-sqlite: sign-up, sign-in, sessions OK,
  joins true and false. Drive `auth generate` from a config that imports relations-v2; the flag form
  `--adapter drizzle` emits legacy relations() and fails (#10924). Check generated .notNull() on plugin fields (#10947).
- drizzle-kit rc with D1: `drizzle-kit migrate` with d1-http is BROKEN on non-empty migration tables (#5952) ->
  use generate + `wrangler d1 migrations apply` with `migrations_pattern: "drizzle/*/migration.sql"` (wrangler >= 4.98).
  Regression #6165: kit v1 emits `id text PRIMARY KEY` without NOT NULL -> NULL ids accepted; patch + CI grep.
  #5782: table-rebuild migrations can wipe ON DELETE CASCADE children (all SQLite drivers); set foreign_keys=OFF on
  the raw client before runtime migrate(). #6207: blank statements when a migration ends with a breakpoint.
- Fallback to 0.45 = rewrite relations, switch adapter, swap driver to better-sqlite3/libsql, regenerate migrations
  (folder formats incompatible both ways) -> decide before the first production migration.
