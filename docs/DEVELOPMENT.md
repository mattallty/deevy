# Developing deevy

## Prerequisites

- Node 24 (`.node-version`); Vite+ manages it for you once installed.
- [Vite+](https://viteplus.dev) 0.3.0: `curl -fsSL https://vite.plus | bash`, then open a new shell.
- A GitHub OAuth App for sign-in (below).

## First run

```bash
vp install
cp .env.example .env   # fill in the values described in the file
vp run --parallel dev
```

`vp run -r --parallel dev` starts two tasks: the Node server on http://localhost:3000 (rebuilt and restarted by
`vp pack --watch` on every change) and the Vite dev server on http://localhost:5173, which serves the SPA and
proxies `/api`, `/rpc`, and `/healthz` to the Node server. Open http://localhost:5173.

The SQLite file lives at `DEEVY_DATABASE_PATH` (default `./data/deevy.sqlite`, relative to `apps/server`) and
is created and migrated on start.

### GitHub OAuth App

Create one at https://github.com/settings/developers with:

- Homepage URL: `http://localhost:5173`
- Authorization callback URL: `http://localhost:3000/api/auth/callback/github`

Put the client id and secret in `.env`. Set `DEEVY_ADMIN_EMAIL` to the primary email of the GitHub account
that should become the Workspace admin: the first sign-in with that address creates the Workspace. Anyone else
who signs in gets an account but no Membership until M1 adds the allowlist and invitations.

## Everyday commands

| Command                        | What it does                                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `vp check`                     | Format, lint, and typecheck the whole tree (`--fix` to apply formatting).                                   |
| `vp run -r test`               | Tests in every package (Vitest through Vite+).                                                              |
| `vp run -r build`              | `apps/server/dist/index.mjs` (bundled Node server) and `apps/web/dist` (SPA).                               |
| `vp run web#build:workers`     | The Cloudflare Worker build (`DEEVY_TARGET=workers`), then `vp run web#check:workers` for a dry-run deploy. |
| `vp run db#generate`           | Generate a migration from `packages/db/src/schema` with drizzle-kit. Then run `vp run db#check:migrations`. |
| `vp run db#generate:auth`      | Regenerate `packages/db/src/schema/auth.ts` from Better Auth's config.                                      |
| `vp run core#snapshot:openapi` | Regenerate `packages/core/openapi.json`; CI fails when it is stale.                                         |

The HTTP surface is documented at http://localhost:3000/api/docs while the server runs; the raw document is at
`/api/spec.json`.

## Layout

```
apps/web            React SPA; also the Cloudflare Worker entry (src/worker.ts) when DEEVY_TARGET=workers
apps/server         Node entry (Hono on @hono/node-server), bundled by vp pack; Dockerfile
packages/core       operation registry, oRPC router, Hono app factory, Better Auth factory
packages/db         Drizzle schema, relations, migrations
packages/adapters   node/ (node:sqlite, migrator, static assets) and workers/ (D1)
```

Rules that keep the two deployment targets honest (ADR-0006): `packages/core` and `packages/db` never import
Node modules; anything runtime-specific lives in `packages/adapters`. The Worker build in CI is what catches a
leak.

## Docker

```bash
docker build -f apps/server/Dockerfile -t deevy .
docker run -p 3000:3000 -v deevy-data:/data --env-file .env -e BETTER_AUTH_URL=http://localhost:3000 deevy
```

## Pinned pre-release dependencies

Better Auth 1.7.2, Drizzle 1.0.0-rc.4, and oRPC 2.0.0-beta.32 are pinned exactly in `pnpm-workspace.yaml`
(see the comments there and ADR-0007, ADR-0008, ADR-0009). Upgrade a line on purpose, all of its packages
together, and re-run `vp run core#snapshot:openapi` and `vp run db#generate` to see what moved.
