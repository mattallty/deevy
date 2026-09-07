---
"@deevy/core": patch
"@deevy/server": patch
"@deevy/web": patch
---

A teammate whose first sign-in was GitLab can now add a second provider. GitLab's API carries no
`email_verified` — a confirmed address is `confirmed_at` — so every GitLab sign-in was landing on a `user`
row that had never proved its address, and Better Auth then refused that Human every later link with
`account_not_linked`: one Human, one Member failed for exactly the provider it was meant to cover. deevy now
reads `confirmed_at` as the proof it is, and believes a GitLab that does report `email_verified` first.
Nothing changes for a Human already signed in with GitLab, whose row stays as it was; a fresh sign-in with
GitLab fixes it, and an admin who cannot wait can set `email_verified` on that row by hand. An IdP behind
`DEEVY_OIDC_ISSUER` that publishes no `email_verified` claim at all — Entra is one — has the same effect
and no equivalent fallback; `docs/OPERATIONS.md`, "Signing in", now says so.

`DEEVY_DEV_STUB_OAUTH=1` stands in for the client pairs as well as the endpoints, so the documented
no-OAuth-App loop works from a fresh copy of `.env.example` again. Since a provider with half a pair is not
offered, an environment that sets no pair at all was getting a sign-in page saying the deployment has no
provider configured and a development form whose sign-in answered `PROVIDER_NOT_FOUND`. A stubbed instance
now offers all four — GitHub, Google, GitLab and one generic OpenID Connect entry — and keeps whichever
pairs the environment did set. `vp run server#seed` stubs the same way whatever the flag says, and
`vp run web#screens` signs in with the first provider the instance offers rather than naming GitHub.
