---
"@deevy/core": patch
"@deevy/web": patch
---

Five things the sign-in work left behind, found reading it back.

An allowlist rule that names a GitHub organization or a GitLab group now matches a teammate who is in many
of them: both forges page their lists — thirty organizations, twenty groups — and deevy read only the first
page, so a rule naming the one on page two matched nothing, which looked exactly like a rule that did not
match. A join now reads up to five pages of a hundred, and a page the forge refuses fails the question
rather than passing back a short list that looks complete.

A Member joining through a rule takes their handle from what the provider calls them — a GitHub login, a
GitLab username — rather than always from their display name. The profile is read once, when the Member is
actually being created.

`health.ping` offers only the providers Better Auth registered. A generic OpenID Connect entry is registered
by fetching the IdP's discovery document as the instance starts, and an IdP that is down at that moment is
skipped with a log and no error — so the sign-in page could draw a button that answered `PROVIDER_NOT_FOUND`
until the process was restarted.

`invitations.create` returns the link site-relative as `path` beside the absolute `url`, and the SPA builds
what an admin copies on the origin their browser is on. In the image and on Workers the two are the same
origin; in the `dev` loop and on a split-origin deployment the absolute URL pointed at the API, which serves
no SPA.

The Event log reads the three `invitation.*` Events as sentences naming the address and the role, instead of
printing the kind, and its Kind and Subject filters can narrow to invitations and allowlist rules.
