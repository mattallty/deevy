# Research: Better Auth 1.7.2 (2026-09-03)
- 1.7 split plugins into scoped packages: @better-auth/oauth-provider, /mcp, /cimd, /api-key, /drizzle-adapter...
  CLI is now `npx auth@latest`. Weekly patches. ~20 security advisories in 2026; only 1.7.x line fully patched for
  the OAuth/MCP role -> pin 1.7.x and upgrade scoped packages together.
- Hono: app.all("/api/auth/*", c => auth.handler(c.req.raw)); session middleware via auth.api.getSession.
  Workers: nodejs_compat; construct auth per request (D1 binding only in handler).
- Workers/D1: workable, not officially "supported". OPEN #10816: Drizzle adapter + text date columns fail on D1
  -> use integer({mode:'timestamp'}) columns. Kysely path has native D1 dialect + getMigrations (fixed 1.7.2).
  #10888 OPEN: requireMcpAuth self-fetch of /jwks fails when AS and MCP RS are the same Worker -> use
  verifyJwsAccessToken with in-process jwksFetch. #10315 OPEN: aborted init request can hang an isolate.
- Social: github, gitlab, google built in; genericOAuth plugin with discoveryUrl (Keycloak, Okta, Entra...).
  Restriction: user.validateUserInfo({user, source}) on create/link/sign-in; databaseHooks; Google `hd`.
  GitHub org check needs custom getUserInfo calling org API (unverified composition).
- Organization plugin: organization/member/invitation/team/teamMember; single-org achievable via
  allowUserToCreateOrganization:false + server-side create. Dictates table set + string ids.
- API key plugin (@better-auth/api-key): expiry, rate limit, metadata, permissions, SHA-256 hashed, header
  x-api-key (custom getter for Authorization: Bearer). Keys are owned by a user (key == that user for authz).
- MCP/OAuth provider (@better-auth/mcp + jwt plugin; optional @better-auth/cimd): targets MCP 2026-07-28.
  PKCE S256 enforced, RFC 8414, RFC 9728 (/.well-known/oauth-protected-resource), RFC 8707, DCR opt-in,
  CIMD (Node transport only; Workers must supply own fetch transport), refresh rotation, scopes + step-up,
  custom consent page, requireMcpAuth(auth, handler, {...}). Churn: multiple CIMD/DCR interop bugs filed Aug-Sep 2026
  (#11081 DCR rejects Claude w/ extra grant types; #11136 CIMD 429s; #10937 localhost redirect).
- Admin plugin: roles, ban, adminUserIds env bootstrap, `auth create-admin`. "First user becomes admin" not
  built in; hook-based count check is racy without transactions.
- Schema: `npx auth generate --adapter drizzle --dialect sqlite` -> merge into own Drizzle schema -> drizzle-kit.
