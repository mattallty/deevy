# Changelog

deevy's user-visible changes, one entry per release. Each entry is folded from the changesets a pull request
declared, so it says what changed for somebody upgrading rather than what was committed.

A release is two Docker images and one `vX.Y.Z` tag — see [docs/OPERATIONS.md](./docs/OPERATIONS.md).

<!-- Entries are inserted below this line by `vp run version`. -->

## 0.5.3

### Patch Changes

- **core, web, server** — [#45](https://github.com/mattallty/deevy/pull/45) [`e4508d2`](https://github.com/mattallty/deevy/commit/e4508d2a388415d706cdd6f98f65b56c8563cc52) Thanks [@mattallty](https://github.com/mattallty)! - Every link deevy hands a Human — the Gate link an Agent surfaces mid-Run, an invitation, a Slack message —
  is now built on the origin a browser finds deevy at, rather than on the origin the API answers on. They are
  the same in the Docker image and on the Worker, which serve the SPA themselves; in the `dev` loop and on a
  split-origin deployment the API is a second port that serves no page, and a Gate link built on it 404s.
  Where the SPA has an origin of its own, `DEEVY_WEB_ORIGIN` is what deevy builds those links on. It was
  already the CORS allowance for exactly that deployment, so an operator who has set it needs to change
  nothing; one that has not is a deployment where the two origins are the same.
- **core, web, server** — [#38](https://github.com/mattallty/deevy/pull/38) [`2795934`](https://github.com/mattallty/deevy/commit/27959343a2f90bc9e5378a001bcfb4b60fabf3f3) Thanks [@mattallty](https://github.com/mattallty)! - Which providers an instance offers a Human to sign in with is now configuration rather than a constant.
  `createAuth` registers the entries whose client id and secret are both set, `health.ping` reports that
  list publicly, and the sign-in page draws one button per entry in the order the server sent. Setting only
  half a pair — a `GITHUB_CLIENT_ID` with no secret — no longer registers a provider whose sign-in ends on
  GitHub's own error page: the entry is absent, and an instance with no provider configured says so on the
  page instead of offering a button that goes nowhere. GitHub stays the one entry, on the same
  `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`, so an instance whose environment is unchanged sees only
  the heading's wording change.
- **core, db** — [#44](https://github.com/mattallty/deevy/pull/44) [`eba5cb5`](https://github.com/mattallty/deevy/commit/eba5cb55515a6814590c123cc0f19f2884e133ac) Thanks [@mattallty](https://github.com/mattallty)! - An admin can now admit exactly one person, instead of opening the door to their whole email domain. A new
  `invitations.create` takes an address and a role and hands back a URL to send however the admin likes — deevy
  has no email Channel, so nothing about inviting somebody waits on a mail transport. `invitations.list` and
  `invitations.revoke` are the other two admin operations, and `invitations.accept` is what the invited Human
  calls after signing in with whichever provider the instance offers.
  The link is a bearer: 32 random bytes, shown once in the response that created them, stored only as a
  SHA-256 hash, and in no Event payload and no list output. An admin who loses one revokes the invitation and
  issues another. An invitation is good for seven days, one address may hold one live invitation at a time,
  and the invited address has to be the address that signs in — a forwarded link is not a second seat. An
  unknown token is a 404, an expired or revoked one a 400, a mismatched address a 403 naming the address the
  invitation was for, and somebody who is already a Member gets their Member row back rather than an error.
  Accepting inserts the Member with the invited role and appends `invitation.accepted` and `member.joined`, so
  the Workspace's history reads the same whether a teammate joined by an allowlist rule or by invitation. The
  `invitation` table is a new migration; the SPA screens that create and accept invitations follow.
- **core, web, server** — [#43](https://github.com/mattallty/deevy/pull/43) [`9367dbb`](https://github.com/mattallty/deevy/commit/9367dbb50f52ae72a02eb16b7410dffa19918810) Thanks [@mattallty](https://github.com/mattallty)! - An instance behind an OpenID Connect IdP — Okta, Entra, Keycloak, Authentik, anything that publishes a
  discovery document — now offers one sign-in button that works, configured from four environment variables and
  nothing else. Set `DEEVY_OIDC_ISSUER` to where the IdP publishes `/.well-known/openid-configuration`
  (`https://acme.okta.com`, a Keycloak or Authentik realm URL with its path), `DEEVY_OIDC_CLIENT_ID` and
  `DEEVY_OIDC_CLIENT_SECRET` to the client pair, and the sign-in page draws the button beside whatever else is
  configured. The Redirect URI to register with the IdP is `${BETTER_AUTH_URL}/api/auth/callback/oidc` — deevy's
  own name for the entry, whatever the IdP is called. All three or none: the authorization, token, userinfo and
  JWKS endpoints are read out of the discovery document, so an issuer is as load-bearing as a client id.
  `DEEVY_OIDC_NAME` is what the button says, defaulting to "Single sign-on". It is reported by `health.ping` with
  the rest of the providers, so naming your IdP "Acme SSO" is a variable and not a deployment of the SPA.
  deevy asks for `openid`, `profile` and `email` and nothing more, uses PKCE, and refuses to register a provider
  whose discovery document names no issuer and no `jwks_uri`: an OIDC sign-in's identity is its `id_token`'s
  claims, and a token nobody can verify is not an identity. Who may join is unchanged — the allowlist decides,
  and an `email_domain` rule admits the addresses the IdP hands out. A teammate who already signed in with
  another provider keeps their one Member: the OIDC sign-in links onto the address they already hold.
  One entry, not a list. A self-hosted deevy has one IdP, and a second one would be JSON in a secret.
- **core, db, web, server** — [#42](https://github.com/mattallty/deevy/pull/42) [`a236ab7`](https://github.com/mattallty/deevy/commit/a236ab738f14ba089b54a133707f67fe222bf0d5) Thanks [@mattallty](https://github.com/mattallty)! - deevy now offers GitLab as a sign-in provider, and a GitLab group is an allowlist rule the way a GitHub
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
- **core, web, server** — [#45](https://github.com/mattallty/deevy/pull/45) [`e4508d2`](https://github.com/mattallty/deevy/commit/e4508d2a388415d706cdd6f98f65b56c8563cc52) Thanks [@mattallty](https://github.com/mattallty)! - A teammate whose first sign-in was GitLab can now add a second provider. GitLab's API carries no
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
- **core, web, server** — [#41](https://github.com/mattallty/deevy/pull/41) [`c4ec225`](https://github.com/mattallty/deevy/commit/c4ec225029a3164d4bfb810573ce244a72285dac) Thanks [@mattallty](https://github.com/mattallty)! - deevy now offers Google as a sign-in provider. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` — as
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
- **core** — [#40](https://github.com/mattallty/deevy/pull/40) [`2fb4631`](https://github.com/mattallty/deevy/commit/2fb4631a44bfad3bcfd4f4d328969b8387a86266) Thanks [@mattallty](https://github.com/mattallty)! - A second sign-in links onto the Human who already holds the address only when the provider says the address
  is verified. deevy no longer trusts a provider simply because the deployment configured it.
  GitHub and Google always report a verified address, and GitLab reports it as a `confirmed_at` stamp, so
  nothing changes for those three. An OpenID Connect IdP that sends no `email_verified` claim at all —
  Microsoft Entra is one — can no longer become somebody's second provider: that sign-in is refused with
  `account_not_linked`, and the teammate keeps using the provider they started with.
  The reason to fail in that direction: trusting every configured provider meant the claim was never read, so
  an IdP with open self-registration could hand somebody an account on a colleague's address and have it
  linked onto that colleague's Member — even when the IdP truthfully said the address was unverified.
- **core** — [#40](https://github.com/mattallty/deevy/pull/40) [`2fb4631`](https://github.com/mattallty/deevy/commit/2fb4631a44bfad3bcfd4f4d328969b8387a86266) Thanks [@mattallty](https://github.com/mattallty)! - A Human who signs in with a second provider stays one Member. deevy now states its account-linking policy
  rather than inheriting Better Auth's defaults: a sign-in whose address a user already holds links onto that
  user, every provider the environment configured is trusted for it and only those, and a link is always the
  same address at both ends. So a teammate who joined with one provider in March and signs in with another in
  April keeps one handle, one inbox and one Member row.
  The trusted list is the same one `health.ping` reports and the sign-in page draws its buttons from, so
  configuring an IdP is never also remembering to trust it — and un-configuring one withdraws that trust. The
  account already holding an address still has to have proved it: a sign-in that would link onto a row whose
  email was never verified is refused with `account_not_linked` rather than joining the two, and creates no
  second Human on the address.
- **core, web** — [#45](https://github.com/mattallty/deevy/pull/45) [`e4508d2`](https://github.com/mattallty/deevy/commit/e4508d2a388415d706cdd6f98f65b56c8563cc52) Thanks [@mattallty](https://github.com/mattallty)! - Five things the sign-in work left behind, found reading it back.
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
- **web** — [#45](https://github.com/mattallty/deevy/pull/45) [`e4508d2`](https://github.com/mattallty/deevy/commit/e4508d2a388415d706cdd6f98f65b56c8563cc52) Thanks [@mattallty](https://github.com/mattallty)! - The invitation an admin creates is now a link somebody can actually use, and the admin can see who has not
  used theirs. `/invite/<token>` shows the sign-in page under a line saying an invitation is waiting — it can
  say no more, because the token is a bearer and there is nothing to read without one — and holds the token
  for the sign-in that follows. Sign in with any provider the instance offers and the screen that used to say
  only "signed in, not yet a Member" spends the invitation instead, landing you in the Workspace. Somebody who
  signs in first and clicks the link second joins the same way, and a Member who lands on one is already in,
  so it takes them home.
  An address that does not match gets the message the operation gives, naming the address the invitation was
  for, with Sign out and try another account beside it: the link is still held, so signing in as the invited
  address still works. That screen also now names an invitation as a way in, beside an allowlist rule.
  Settings, Workspace gains an **Invited** row under Who may join: every invitation that is still outstanding,
  with its address, its role and how long it has left, each with Revoke. Invite someone opens a dialog for an
  address and a role, and the link it hands back is shown there once and nowhere else — deevy keeps only a
  hash of the token, so there is no Copy link on a row and no way to see it again; revoke the invitation and
  make another if it goes astray. An invitation that has run out of time is still listed, marked Expired,
  because it holds its address until it is revoked.
- **web, server, agent** — [#39](https://github.com/mattallty/deevy/pull/39) [`6bc8e74`](https://github.com/mattallty/deevy/commit/6bc8e74377bea3bb866aad01feeb3d9dea5d8c87) Thanks [@mattallty](https://github.com/mattallty)! - The development sign-in flag is now `DEEVY_DEV_STUB_OAUTH`, and it stubs every provider deevy offers rather
  than GitHub alone. Rename it wherever you set it — in `.env`, in a `docker run -e`, in a shell alias: the old
  `DEEVY_DEV_STUB_GITHUB` is not read any more and is not aliased, so an instance that still sets it starts with
  sign-in pointed at the real provider. Nothing changes for a deployment that never set it; the flag is still
  refused outright under `NODE_ENV=production`, and no Worker ever has it.
  The stub behind it (`apps/web/scripts/stub-oauth.js`, formerly `stub-github.js`) now answers for Google,
  GitLab and a generic OIDC issuer beside GitHub, and signs the `id_token` it hands back with a key pair it
  generates and publishes as a JWKS at whichever certificate URL was asked for. So a developer, the Workers
  smoke and the acceptance walk can each drive a real OAuth sign-in for any provider without an account
  anywhere.

## 0.5.2

### Patch Changes

- **release** — [#36](https://github.com/mattallty/deevy/pull/36) [`8d9fb55`](https://github.com/mattallty/deevy/commit/8d9fb558fb9bff1f9259b0b9723a51d732159228) Thanks [@mattallty](https://github.com/mattallty)! - Nothing in deevy changed. This release exists to walk the release itself end to end after a fix to it: the
  Version PR behind it is the first whose own checks run, rather than queueing for an approval that could never
  be granted. If you are on 0.5.1 you can skip it.

## 0.5.1

### Patch Changes

- **web** — [#28](https://github.com/mattallty/deevy/pull/28) [`bb21531`](https://github.com/mattallty/deevy/commit/bb215311be6f27c4d749880e25a97222ac10d248) Thanks [@mattallty](https://github.com/mattallty)! - The UI kit can now be synced to Claude Design (claude.ai/design), so a design agent builds screens out of deevy's real components instead of generic ones. `apps/web/design-system` re-exports every standalone component as one importable entry with its own stylesheet, types and per-component docs; `.design-sync/` holds the sync's configuration, its preview cards and the conventions the design agent reads. Nothing the app ships changes.
- **web** — [#32](https://github.com/mattallty/deevy/pull/32) [`5cb0ddd`](https://github.com/mattallty/deevy/commit/5cb0ddde5e85160ecab3651dbbd5f42cda06e52d) Thanks [@mattallty](https://github.com/mattallty)! - Issues can be grouped by a Label scope — one entry in Group by per scope the Workspace uses, so `epic` and
  `priority` are each a way to divide the list or column the board, with a "No epic" bucket for the Issues
  carrying none. Never by Labels at large: an Issue carries at most one Label per scope, so a scope divides
  the Issues exactly once each and a board column can take a drop, which sets that scope's Label and leaves
  every other Label alone.
- **web** — [#32](https://github.com/mattallty/deevy/pull/32) [`5cb0ddd`](https://github.com/mattallty/deevy/commit/5cb0ddde5e85160ecab3651dbbd5f42cda06e52d) Thanks [@mattallty](https://github.com/mattallty)! - Issues can be grouped by Assignee and by Project, in the list and on the board alike. On a board, dragging a
  card between Assignee columns reassigns it — including onto Unassigned, which takes it off whoever held it —
  and every Member has a column even holding nothing, so there is somewhere to drop. Project columns take no
  cards and say why: an Issue belongs to the Project its key names. The table also stops repeating whatever the
  groups already say, so grouping by Assignee brings the State column back and takes the Assignee one away.
- **web** — [#32](https://github.com/mattallty/deevy/pull/32) [`5cb0ddd`](https://github.com/mattallty/deevy/commit/5cb0ddde5e85160ecab3651dbbd5f42cda06e52d) Thanks [@mattallty](https://github.com/mattallty)! - Group by is on the board as well as the list. The columns are what a board groups by, so the board was the
  one screen where the control was hidden and the one where it is most wanted. It offers "No grouping" only
  on a list — a board with no columns is not a board — and `?group=` now carries whatever the screen groups
  by, so a grouped view is still a link.
- **web** — [#32](https://github.com/mattallty/deevy/pull/32) [`5cb0ddd`](https://github.com/mattallty/deevy/commit/5cb0ddde5e85160ecab3651dbbd5f42cda06e52d) Thanks [@mattallty](https://github.com/mattallty)! - A Settings page lays itself out by the room it actually has, not by the size of the window. The Settings
  content column is a container query now, and the nav beside it appears at 1024px rather than 768px — at
  768 it was taking 235px next to a 256px sidebar and leaving the page 161px, which pushed the window
  sideways on seven of the eleven pages. Below that the scrolling strip of tabs is the whole navigation.
  The Labels form's four columns follow the same rule and stack when they do not fit.
- **web** — [#32](https://github.com/mattallty/deevy/pull/32) [`5cb0ddd`](https://github.com/mattallty/deevy/commit/5cb0ddde5e85160ecab3651dbbd5f42cda06e52d) Thanks [@mattallty](https://github.com/mattallty)! - Settings works on a phone. Its eleven pages were a strip of tabs that scrolled sideways — MCP clients was
  four swipes from General, and the page you were on could be scrolled out of its own navigation. They are
  one control now, which names where you are without being opened and opens to the whole list in the same
  four groups the wide nav uses. The page beside it also stops adding a second 24px gutter inside the one
  the app already gives it, which was spending a quarter of a 390px screen on margins.
- **web** — [#27](https://github.com/mattallty/deevy/pull/27) [`65b4e2f`](https://github.com/mattallty/deevy/commit/65b4e2fe50d852761fbf8fd24552f30aff455153) Thanks [@mattallty](https://github.com/mattallty)! - Task-list checkboxes sit beside their text again. In the editor every `- [ ]` item stacked its checkbox above the text, and when a description or comment was read the same items carried a bullet next to the checkbox; both now render each item as one row, the checkbox at the left.
- **web** — [#32](https://github.com/mattallty/deevy/pull/32) [`5cb0ddd`](https://github.com/mattallty/deevy/commit/5cb0ddde5e85160ecab3651dbbd5f42cda06e52d) Thanks [@mattallty](https://github.com/mattallty)! - Settings › Teams is master–detail: the Teams down a rail, one of them open beside it, and the open one
  named in the URL so a Team is a link. It shows what it never used to — which Projects a Team owns, and
  which of its Members are Humans and which are Agents. Naming a Team is behind a button rather than a form
  standing above the page, taking somebody off a Team is behind that row's menu, and the only destructive
  control left is Disband, once. Below a wide column the two panes stack, so it works on a phone.
- **web** — [#32](https://github.com/mattallty/deevy/pull/32) [`5cb0ddd`](https://github.com/mattallty/deevy/commit/5cb0ddde5e85160ecab3651dbbd5f42cda06e52d) Thanks [@mattallty](https://github.com/mattallty)! - The Event log reads as a log. Its rows are 12px throughout rather than 14px, and the Actor is a name
  instead of an avatar and a name — 300 rows of avatars was a column of noise. Who is a Human and who is
  an Agent still shows, in the colour the rest of the app gives each. Its three filters now say what they
  filter on — Kind, Subject, Project — rather than leaving "Every kind" to stand on its own.
- **web** — [#32](https://github.com/mattallty/deevy/pull/32) [`5cb0ddd`](https://github.com/mattallty/deevy/commit/5cb0ddde5e85160ecab3651dbbd5f42cda06e52d) Thanks [@mattallty](https://github.com/mattallty)! - Folded to its icons, the sidebar lines up and every row can be clicked. The Workspace badge sat four
  pixels left of the column every other icon keeps, the Member's avatar had the left of its ring shaved
  off by the button clipping it, and the invisible "Projects" group label lay on top of the Projects row
  and swallowed every click on it. Settings no longer folds the sidebar on the way in and unfolds it on
  the way out either: it leaves it the way you set it. The Settings content column is wider, 1100px, and
  the app no longer scrolls sideways on a narrow window while a Settings page is open.
- **web** — [#32](https://github.com/mattallty/deevy/pull/32) [`5cb0ddd`](https://github.com/mattallty/deevy/commit/5cb0ddde5e85160ecab3651dbbd5f42cda06e52d) Thanks [@mattallty](https://github.com/mattallty)! - Settings › Workspace › General shows you the Workspace instead of only asking about it. It opens with the
  Workspace itself — its mark, its name edited where you read it, its address, when it was made, and how many
  Humans, Agents, Teams and Projects it has — and the name saves itself on blur like every other single field
  in deevy, so the Save button is gone. Who may join is a row of chips rather than a table with a form standing
  open above it. While anything is unset — no rule, no Project, no Agent, no Repository, no Channel — one strip
  at the top names what is missing and links to the page that fixes it, and it disappears once nothing is.
  Renaming the Workspace now changes the name in the sidebar, which it never did.
- **web** — [#32](https://github.com/mattallty/deevy/pull/32) [`5cb0ddd`](https://github.com/mattallty/deevy/commit/5cb0ddde5e85160ecab3651dbbd5f42cda06e52d) Thanks [@mattallty](https://github.com/mattallty)! - The Allowlist is now a section of Settings › Workspace › General, beside the Workspace's name — who may
  join is a fact about the Workspace, not a page of its own. `/settings/allowlist` redirects there, so an
  old link still lands on it. On Notifications, only the table's headings are bold now.
- **server** — [#32](https://github.com/mattallty/deevy/pull/32) [`5cb0ddd`](https://github.com/mattallty/deevy/commit/5cb0ddde5e85160ecab3651dbbd5f42cda06e52d) Thanks [@mattallty](https://github.com/mattallty)! - The seeded Workspace's fabricated people and its Allowlist rule are at `example.com`, whatever
  `DEEVY_ADMIN_EMAIL` is. The seed used to take the domain from the admin's own address, which put a real
  domain on a screen every screenshot and demo shows. The admin still signs in as themselves; only the
  fiction moved. Reseed with `--force` to pick it up, and restart the server afterwards — `--force` unlinks
  the database file, and a running server keeps serving the one it already has open.
- **server** — [#32](https://github.com/mattallty/deevy/pull/32) [`5cb0ddd`](https://github.com/mattallty/deevy/commit/5cb0ddde5e85160ecab3651dbbd5f42cda06e52d) Thanks [@mattallty](https://github.com/mattallty)! - `vp pack` no longer prints twenty lines of `UNRESOLVED_IMPORT` for `@opentelemetry/api` on every build.
  Better Auth reaches its tracer through a dynamic import with a no-op fallback and marks the package an
  optional peer; deevy does not install it, so the bundle names it external on purpose instead. Nothing
  about what the server does changes.
- **agent** — [#29](https://github.com/mattallty/deevy/pull/29) [`c8b6b06`](https://github.com/mattallty/deevy/commit/c8b6b061a522285f01da42712f9ef5cc50645840) Thanks [@mattallty](https://github.com/mattallty)! - The reference runtime is now `apps/agent` and can drive four coding-agent CLIs: Claude Code, OpenCode, Cursor
  CLI and GitHub Copilot CLI, selected with `DEEVY_AGENT_HARNESS`. Each ships as its own image
  (`deevy-agent:claude-code`, `:opencode`, `:cursor`, `:copilot`, plus `<version>-<harness>`); `deevy-agent:latest`
  stays Claude Code. What each harness bounds and does not is in `docs/OPERATIONS.md`, and `docs/harnesses.md`
  says how to add another.
- **agent** — [#31](https://github.com/mattallty/deevy/pull/31) [`f68a624`](https://github.com/mattallty/deevy/commit/f68a624620ae23afa21025df8ad2f50c50dde1de) Thanks [@mattallty](https://github.com/mattallty)! - An Agent now runs git itself: its own branches, its own commits and messages, pushed where it likes. The
  four harnesses no longer deny `git push`, `git remote`, `git config` or `gh`. The credential stays with the
  supervisor, which serves the remote on loopback and adds it on the way out, so a session's `origin` is a
  local address and its checkout holds no token. **Where an Agent can push is now the scope of the token you
  issue and whatever your forge protects**, so give it a token scoped to one repository and protect the
  branches that matter.
- **agent** — [#29](https://github.com/mattallty/deevy/pull/29) [`c8b6b06`](https://github.com/mattallty/deevy/commit/c8b6b061a522285f01da42712f9ef5cc50645840) Thanks [@mattallty](https://github.com/mattallty)! - The reference runtime drives Claude Code as a subprocess (`claude -p`) instead of through the Agent SDK,
  behind a harness contract other coding-agent CLIs can implement; `DEEVY_AGENT_HARNESS` selects the harness
  and defaults to `claude-code`. Each session now runs with a home directory of its own, so the operator's
  dotfiles and credentials are not readable from a session's shell, and the files a repository could ship to
  configure the CLI (`.mcp.json`, `.claude/`) are removed from the clone before the session starts. The
  runtime checks at startup that the harness binary runs, and logs what each Run spent when the harness
  reports it. The image no longer carries the Agent SDK; it installs the Claude Code CLI at a pinned version.
- **agent** — [#29](https://github.com/mattallty/deevy/pull/29) [`c8b6b06`](https://github.com/mattallty/deevy/commit/c8b6b061a522285f01da42712f9ef5cc50645840) Thanks [@mattallty](https://github.com/mattallty)! - The reference runtime no longer hands its session the Agent's API key. The session reaches deevy through a
  loopback proxy the runtime opens for each Run, which adds the key, offers only the twelve tools the runtime
  grants, and refuses any other tool before deevy hears of it; a refusal is written into the Run's feed as an
  error Activity. The runtime also checks that deevy answers the key before a session starts, and fails the Run
  with the reason when it does not.
- **agent** — [#31](https://github.com/mattallty/deevy/pull/31) [`f68a624`](https://github.com/mattallty/deevy/commit/f68a624620ae23afa21025df8ad2f50c50dde1de) Thanks [@mattallty](https://github.com/mattallty)! - A session now runs as its own user, so it can no longer read the supervisor's environment. On one user a
  session with a shell reads the Agent's API key and the git token out of `/proc`, whatever the environment
  allowlist hands it; the image gives the supervisor root and each session uid 10002, and the working directory
  and the session's home are handed over before it starts. Run the container with
  `--cap-drop=ALL --cap-add=SETUID --cap-add=SETGID`. A runtime that is not root keeps its old shape and says
  so in its first lines, which is fine for trying it out and is not a way to run it against a Workspace other
  people write in.
- **agent** — [#31](https://github.com/mattallty/deevy/pull/31) [`f68a624`](https://github.com/mattallty/deevy/commit/f68a624620ae23afa21025df8ad2f50c50dde1de) Thanks [@mattallty](https://github.com/mattallty)! - A pull request now carries what the Agent said. The summary it writes when it finishes its Run becomes the
  title and the body, and the commit message when the supervisor commits on its behalf; a Run that finishes
  without one keeps the runtime's old line. The instructions tell the Agent that git is its own, that the
  default branch is not to be pushed even though it can, and that what it writes when it finishes is what a
  reviewer reads.
- **agent** — [#31](https://github.com/mattallty/deevy/pull/31) [`f68a624`](https://github.com/mattallty/deevy/commit/f68a624620ae23afa21025df8ad2f50c50dde1de) Thanks [@mattallty](https://github.com/mattallty)! - Every ref a Run moves is now in its feed: the branch, the commit it came from and the one it points at, and
  whether history was rewritten. A force-push to the base branch is a sentence a Human reads on the Issue
  rather than something nobody finds. A session that pushed its own branch is attributed rather than pushed
  over: the supervisor opens a pull request for what the agent left and attaches it to the Run, instead of
  making a second branch beside it. And a Run that delivers twice, once before a Gate and once after the
  ruling, now continues its branch instead of failing the second push.
- **agent** — [#31](https://github.com/mattallty/deevy/pull/31) [`f68a624`](https://github.com/mattallty/deevy/commit/f68a624620ae23afa21025df8ad2f50c50dde1de) Thanks [@mattallty](https://github.com/mattallty)! - The runtime image documents the capabilities it actually needs:
  `--cap-drop=ALL --cap-add=SETUID --cap-add=SETGID --cap-add=CHOWN --cap-add=DAC_OVERRIDE`. Two of them are
  what lets a session be another user; the other two are what lets the supervisor hand it a working directory
  and read back what it wrote. Running with only the first two fails at the first Run.

## 0.5.0

### Minor Changes

- **release** — [#19](https://github.com/mattallty/deevy/pull/19) [`d6aa91e`](https://github.com/mattallty/deevy/commit/d6aa91e46e74152b1549aaaafc7d85e941e92ea6) Thanks [@mattallty](https://github.com/mattallty)! - Release candidates. `changeset pre enter rc` puts the release path into pre-release mode: versions become
  `0.5.0-rc.N`, the images publish under their own tags without moving `latest`, and the GitHub Release is
  marked as a prerelease. `changeset pre exit` ends the line, and the final release's notes re-list every
  change in it.

## 0.4.1

### Patch Changes

- **release** — [#14](https://github.com/mattallty/deevy/pull/14) [`d24c71a`](https://github.com/mattallty/deevy/commit/d24c71a62c58ea9c34bac0af2436d912fa575bb7) Thanks [@mattallty](https://github.com/mattallty)! - The changelog fold no longer deletes the per-package changelogs, which failed every release, and it strips a
  third shape of dependency bullet that was reaching the release notes.
- **release** — [#16](https://github.com/mattallty/deevy/pull/16) [`78fc0ad`](https://github.com/mattallty/deevy/commit/78fc0ad1fd751741769b1f52e52ea01de7284c2b) Thanks [@mattallty](https://github.com/mattallty)! - Releasing no longer tags the version pull request's own commit, the version pull request can pass its own
  checks, and a prerelease tag no longer moves the `latest` image tag.
- **release** — [#13](https://github.com/mattallty/deevy/pull/13) [`3c2bd55`](https://github.com/mattallty/deevy/commit/3c2bd5543fd4fdae4c5a7f21c9b955d02a92c142) Thanks [@mattallty](https://github.com/mattallty)! - deevy publishes a changelog. Each release now writes `CHANGELOG.md` and a GitHub Release from what its pull
  requests declared, and the images are published by merging a "Version Packages" pull request rather than by
  pushing a tag by hand.

## 0.4.0

Nothing here is backfilled. deevy reached v1 — milestones M0 through M4 — before it kept a changelog, and the
record of that is [docs/PLAN.md](./docs/PLAN.md), the per-milestone plans in [docs/plans](./docs/plans), the
decisions in [docs/adr](./docs/adr), and the git log. Only `v0.3.0` was ever tagged.
