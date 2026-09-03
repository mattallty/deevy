# Research: Cloudflare Workers + Vite+ + Hono + Drizzle fit (2026-09-03)
Versions: @cloudflare/vite-plugin 1.54.3 (Vite ^6.1||^7||^8), wrangler 4.128 (Node>=22), vite 8.2.2, vite-plus 0.3.0,
hono 4.13.5, @hono/node-server 2.1.1, drizzle-orm 0.45.2 stable / 1.0.0-rc.4, better-sqlite3 13 (Node>=22),
@libsql/client 0.18, better-auth 1.7.2, @modelcontextprotocol/server 2.0.0, @modelcontextprotocol/hono 2.0.0
(@hono/mcp 0.3.2 still targets SDK v1: don't use).
- Vite plugin supports Vite 8/Rolldown (tracking issue closed 2026-01). Vite+ works: Cloudflare's own vinext repo
  uses vite-plus (`vp run ...#build`, `vp test`). Open: vite-plus#2481 dev-server restart wedge under CF plugin.
- One project: React SPA + Hono API in one Worker. wrangler assets: not_found_handling single-page-application,
  run_worker_first ["/api/*", "/mcp*", "/auth/*", SSE routes]. Build: `vite build && wrangler deploy` (plugin emits
  dist/client + dist/<worker>/wrangler.json). Envs via CLOUDFLARE_ENV at build time.
- D1 + Drizzle: drizzle-orm/d1; migrations drizzle-kit generate -> wrangler d1 migrations apply --local|--remote.
  **No interactive transactions** (BEGIN/SAVEPOINT rejected; drizzle db.transaction() fails on D1) -> use db.batch().
  Free: 50 queries per invocation, 5M reads/100k writes per day, 500MB/DB. 100 bound params/statement.
  Shared Drizzle schema works across d1/better-sqlite3/libsql/node:sqlite.
- Background: Queues free since 2026-02 (10k ops/day, retries w/ delay, DLQ) -> webhook delivery. Cron (5 free,
  10ms CPU) -> stale-run sweep. DO alarms available. ctx.waitUntil 30s.
- SSE: viable on Workers (no wall-clock limit, CPU 10ms free); fan-out via D1 polling inside stream or DO hub;
  heartbeat every 15-30s. Hono streamSSE; set Content-Encoding: Identity in wrangler dev.
- nodejs_compat default for compatibility_date >= 2026-08-04; node:crypto, buffer, async_hooks(ALS) fine.
  Better Auth: construct per request; nodejs_compat. MCP SDK v2 web-standard; Cloudflare's createMcpHandler needs v2.
- Node: @hono/node-server; driver better-sqlite3 (sync) or libsql (async, closest to D1) ; node:sqlite only in
  drizzle 1.0 rc. Node baseline 22.18+.
- Vite+: vp pack (tsdown) for Node entry; unverified whether vp pack ignores `plugins` in the same config -> keep
  Worker build (vp build + cloudflare plugin) and Node build (vp pack) in separate packages.
- Free plan: 100k req/day, 10ms CPU; D1 writes 100k/day is the number most likely to bite. Paid $5/mo.
