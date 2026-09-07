---
"@deevy/core": patch
"@deevy/db": patch
"@deevy/web": patch
"@deevy/server": patch
---

deevy now offers GitLab as a sign-in provider, and a GitLab group is an allowlist rule the way a GitHub
organization is. Set `GITLAB_CLIENT_ID` and `GITLAB_CLIENT_SECRET` — environment variables on the Node
server, `wrangler secret put` on the Worker — and the sign-in page draws a GitLab button beside whatever
else is configured. The Redirect URI to give the GitLab application is
`${BETTER_AUTH_URL}/api/auth/callback/gitlab`, and both halves or neither, the same rule every provider
follows.

One entry serves gitlab.com and a self-hosted instance: `GITLAB_ISSUER` is where GitLab is, defaulting to
`https://gitlab.com`, and the authorization, token and `/api/v4` endpoints are all built from it.

Settings, Allowlist gains a **GitLab group** rule beside Email domain and GitHub organization. Its value is
the group's full path — `acme/platform` — and a subgroup is not its parent: `acme` admits nobody from
`acme/platform` unless you say so. A group rule needs the `read_api` scope, the only one GitLab has that
lists a person's groups, so deevy asks for it beside `read_user`; the token is the sign-in's own, read once
on the join and never again, and an instance with no group rule never spends it. Existing rules and the two
kinds that were already there are unchanged, and the schema needed no migration.

An allowlist value is now validated per kind rather than against one pattern: `acme/platform` is a group
path and is still refused as an email domain. A provider that cannot be reached when the rule is checked
now costs a teammate their join and not their sign-in — they land signed in and not a Member, and the next
sign-in asks again.
