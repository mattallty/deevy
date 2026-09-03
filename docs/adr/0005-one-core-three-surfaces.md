# One typed core, three surfaces: REST, MCP, Events

Humans use a UI, agents use MCP, scripts use HTTP, and agents must be triggered rather than poll. Rather than
build separate APIs, deevy has one typed core (domain model, workflow engine, Event log, and API contracts in a
shared package) exposed three ways: a REST API used by the web UI and scripts, an MCP server for agents, and an
outbound Event stream delivered by webhooks for triggering. All three share types and authorization, so a tool
in MCP and a route in REST are two projections of the same operation.

The MCP server speaks the 2026-07-28 revision of the protocol in its stateless form, using the TypeScript SDK v2
per-request handler, and serves 2025-era clients through the SDK's legacy stateless mode. No protocol sessions
exist, so any instance can answer any request, which is what the Cloudflare Workers target requires.

## Considered options

- **MCP only.** Excludes the UI and scripts, and no client-side approval flows.
- **REST only.** Agents would need hand-written tool wrappers per client.
- **Sessionful MCP (2025-11-25).** Simpler client compatibility today, incompatible with stateless hosting and
  deprecated by the protocol's direction.
