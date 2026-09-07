---
"@deevy/core": patch
"@deevy/web": patch
"@deevy/server": patch
---

deevy now offers Google as a sign-in provider. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` — as
environment variables on the Node server, as `wrangler secret put` on the Worker — and the sign-in page
draws a Google button beside whatever else is configured; leave them unset and nothing changes. The
Authorized redirect URI to give the Google OAuth client is `${BETTER_AUTH_URL}/api/auth/callback/google`,
and both halves or neither, the same rule every provider follows.

Google decides nothing about who may join. deevy sets no `hd`, so anyone with a Google account can sign in
and lands signed in, not a Member, until an allowlist rule matches them: a Google Workspace is an email
domain, so an `email_domain` rule under Settings, Allowlist is what admits it, in the one place an admin
already looks. A teammate who signed in with GitHub before keeps their Member and their handle when they
sign in with Google, because the address is what identifies them.

`docker-compose.yml` no longer demands a GitHub client pair to start: it passes whichever pairs are set, so
an instance can offer Google alone. Under `DEEVY_DEV_STUB_OAUTH=1`, the development sign-in form now uses
the first provider the instance offers instead of naming GitHub, so a stubbed instance configured with only
Google signs in too.
