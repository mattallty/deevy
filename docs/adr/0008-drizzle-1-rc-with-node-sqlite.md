# Drizzle 1.0 release candidate with Node's built-in sqlite driver

The obvious choice is Drizzle 0.45 stable with better-sqlite3 or libsql. We chose the 1.0 release candidate
because it is the only line with the `node:sqlite` driver, which removes native modules from the Docker image
and uses Node's built-in database. On Workers the same schema runs through Drizzle's D1 driver. The cost is
building a v1 product on a release-candidate ORM whose migration tooling still has open regressions.

Verified on 2026-09-03 with a smoke test: the query layer on `node:sqlite` and D1 and Better Auth's
`relations-v2` adapter all work on 1.0.0-rc.4. The risk sits in drizzle-kit and migrations, not in queries.

## Consequences

- Node 22.16 or newer is the floor for the driver; the toolchain already needs 22.18.
- Pin the exact version `1.0.0-rc.4`, not the `rc` tag; unannounced hash-suffixed rc.5 builds exist.
- Use `@better-auth/drizzle-adapter/relations-v2` and drive Better Auth's schema generator from a config file
  that imports it; the flag-driven generator emits the removed `relations()` API.
- Never run `drizzle-kit migrate` against D1 over HTTP; it fails on any non-empty migrations table. Generate
  migrations with drizzle-kit and apply them with `wrangler d1 migrations apply` using a nested
  `migrations_pattern`. On Node, the runtime migrator works.
- drizzle-kit currently emits `id text PRIMARY KEY` without `NOT NULL`; a CI check patches generated SQL until
  the upstream fix lands.
- Transactions on `node:sqlite` are synchronous; the core does not use interactive transactions anyway (ADR-0006).
- Falling back to 0.45 means rewriting relations, switching the adapter, swapping the driver, and regenerating
  the migration history, since the folder formats are incompatible. Decide before the first production migration.
