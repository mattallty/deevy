---
"@deevy/server": patch
"@deevy/web": patch
"@deevy/agent": patch
---

The development sign-in flag is now `DEEVY_DEV_STUB_OAUTH`, and it stubs every provider deevy offers rather
than GitHub alone. Rename it wherever you set it — in `.env`, in a `docker run -e`, in a shell alias: the old
`DEEVY_DEV_STUB_GITHUB` is not read any more and is not aliased, so an instance that still sets it starts with
sign-in pointed at the real provider. Nothing changes for a deployment that never set it; the flag is still
refused outright under `NODE_ENV=production`, and no Worker ever has it.

The stub behind it (`apps/web/scripts/stub-oauth.js`, formerly `stub-github.js`) now answers for Google,
GitLab and a generic OIDC issuer beside GitHub, and signs the `id_token` it hands back with a key pair it
generates and publishes as a JWKS at whichever certificate URL was asked for. So a developer, the Workers
smoke and the acceptance walk can each drive a real OAuth sign-in for any provider without an account
anywhere.
