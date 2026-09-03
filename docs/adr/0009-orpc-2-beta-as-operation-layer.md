# oRPC 2.0 beta as the operation definition layer

Each API operation is defined once and projected to HTTP with OpenAPI, to a typed browser client, and to MCP
tools. The obvious choice was a small in-house registry on Hono with zod-openapi and a client generated from the
spec, all on stable packages. We chose oRPC 2.0 while it is still in beta because it gives the typed client,
typed errors, server-sent-event helpers, and OpenAPI from one definition, and because its v2 API is the one the
project's docs and future are built on, so there is no v1-to-v2 migration mid-build.

Known costs, accepted deliberately: the project has one maintainer who has said his resources are stretched
thin; betas ship every couple of days with no announced GA date; v1 and v2 wire formats are incompatible, so
there is no stepping back to 1.x without changing clients. The MCP projection is our own code: about forty
lines walking the router and registering each procedure's schemas with the MCP SDK v2. The community bridge is
not used because it reimplements the protocol instead of using the SDK.

## Consequences

- Pin exact beta versions; upgrade on purpose, with the OpenAPI snapshot and MCP tool list diffed in CI.
- Keep the operation registry shape (name, input, output, auth rule, handler) as our own type in
  `packages/core`, with oRPC as the implementation behind it, so a forced exit costs adapters, not the domain.
