# Research: oRPC as of 2026-09-03
Canonical repo moved to https://github.com/middleapi/orpc; docs at https://orpc.dev (v2 beta default), v1 at https://v1.orpc.dev.
- Lines: 1.15.0 stable (2026-08-08); 2.0.0-beta.32 (2026-08-29, ~1 beta every 2 days since June). No v2 GA date.
  v1 and v2 wire formats are incompatible; v2 migration is large (routes -> openapi() meta, $meta -> meta plugins,
  eventIterator -> asyncIteratorObject, package renames, Zod v3 dropped, dedupe removed, CORS default changed).
- Health: 5.6k stars, MIT, ~1.1M weekly downloads, 32 open issues. **Bus factor 1** (1,137 commits vs next contributor 3).
  Maintainer (PR #1604, 2026-07-11): "my resources are stretched thin ... oRPC isn't profitable enough on its own yet";
  declined an official MCP adapter: "MCP interest is trending downward ... maybe after v2 ships".
- Definition: procedure-first or contract-first; Zod v4; middleware with context; typed errors; per-procedure meta.
- Runtimes: fetch adapter for Hono and Cloudflare Workers; Node adapter; @orpc/cloudflare has DurablePublisher.
- OpenAPI 3.1 generator with per-route metadata and a reference UI plugin.
- Client: RPCLink + typed client; @orpc/tanstack-query; SSE via async-iterator handlers with lastEventId + retry plugin.
- MCP: no official adapter. Community orpc-mcp 0.1.3 (1 author, 11 stars) needs v2 beta and reimplements the
  protocol instead of using @modelcontextprotocol/server. Rolling our own projection from oRPC introspection
  (procedure['~orpc'].inputSchemas/outputSchemas + registerTool with Standard Schema) is ~40 lines; verified by prototype.
- Alternative costed: own registry {name, input, output, auth, handler} projected to Hono + @hono/zod-openapi
  (1.6, Zod 4, 1.9M dl/wk) and to MCP SDK v2; typed browser client via openapi-typescript + openapi-fetch.
  Loses oRPC's typed errors and SSE client conveniences; gains stable, multi-maintainer dependencies.
