# Sign-in: the rest of the providers, and invitations — vertical slices

Breakdown of the two things [PLAN.md](../PLAN.md) promises under "Authentication and access" that no
milestone built, 2026-09-07. Vocabulary is [CONTEXT.md](../../CONTEXT.md); the slice that built what exists
today is slice 2 of [m1.md](./m1.md), which took GitHub-only sign-in and rule-based joining and wrote both
deferrals down.

PLAN.md says a Human signs in "with GitHub, GitLab, Google, or generic OpenID Connect" and that everyone the
allowlist does not match "is invited". `packages/core/src/auth.ts` registers one provider, and there is no
invitation table. M1 called the providers "a later slice", M2 deferred them again, and nothing since has
picked either up.

It is done when an operator chooses which of four providers their instance offers by setting environment
variables and nothing else, a teammate who signs in with a second one stays one Member, and an admin can
admit exactly one person without opening the door to their whole email domain.

Eight slices. Each is one PR on `main` that leaves both deployments working and carries its own tests.

## Decisions taken

- **A provider is configuration, not a constant.** `AuthEnv.github` becomes a list of providers, built from
  what the environment sets, and the sign-in page renders that list. Every slice after the first adds a
  provider by adding an entry, not by editing a page.
- **One generic OIDC provider, from environment variables.** `DEEVY_OIDC_ISSUER` and its client pair, one
  entry, discovered from the issuer's well-known document. A self-hosted instance has one IdP; a list of
  them would put JSON in a wrangler secret to serve a case nobody has.
- **`gitlab_group` joins `github_org`.** The allowlist schema's `kind` column was left open for exactly
  this (`packages/db/src/schema/allowlist.ts:12`). Google and OIDC join by email domain: a Google Workspace
  _is_ an email domain, and a rule in deevy's own UI beats a second place to configure who may join.
- **One Human, one Member.** A verified email from a provider the operator configured links onto the
  existing user rather than making a second one, so a teammate has one handle, one inbox and one Member row.
  Better Auth already defaults this way; the point of the slice is that it is written down and tested rather
  than inherited from a minor release.
- **The dev stub stands in for any provider.** `DEEVY_DEV_STUB_GITHUB` becomes `DEEVY_DEV_STUB_OAUTH` and
  the script behind it answers for whichever providers are configured, so every slice below has a dev loop,
  a screenshot and an end-to-end test without an account anywhere.
- **An invitation is a link, not an email.** deevy has no email Channel until after v1, so
  `invitations.create` returns a URL the admin sends however they like. Nothing about invitations waits on
  a mail transport.
- **An invitation is accepted after sign-in, not during it.** The Human signs in with any configured
  provider, lands in the state the SPA already has a screen for — signed in, no Member — and the SPA calls
  `invitations.accept` with the token it held. Joining stays an operation with a Member and an Event, rather
  than a third branch inside a Better Auth database hook.
- **The invited address must match the signed-in address.** Per-person means per person; a forwarded link
  is not a second seat.
- **Nothing here changes what an Agent may do.** An Agent is an API key (ADR-0007), never a social sign-in,
  and every operation added below is agent-denied by default (ADR-0011).

## Deferred

SAML. More than one OIDC provider. Sending an invitation by email, which wants the email Channel from
PLAN.md's after-v1 list. Invitations scoped to a Team or Project, which wants private Projects first.
Google's `hd` enforcement, in favour of the allowlist rule. Unlinking a provider from the UI. Bulk invite
from a CSV. Profile sync after the join that created the Member: a handle is allocated once, and a
teammate who renames themselves upstream renames themselves in deevy.

## Conventions every slice follows

1. Schema in `packages/db/src/schema/<area>.ts`, relations merged in `relations.ts`, migration generated
   with `vp run db#generate`, `NOT NULL` hand-patched onto text primary keys, `vp run db#check:migrations`
   green.
2. Operations through `defineOperation` in their area's module; `NOT_FOUND`, `CONFLICT`, `FORBIDDEN` and
   `BAD_REQUEST` with messages in CONTEXT.md vocabulary. `vp run core#snapshot:openapi` committed whenever
   an input or output changes.
3. Every write appends its Event through `appendEvent` in the same handler.
4. Both runtimes in the same PR: a variable read in `apps/server/src/env.ts` is read in `apps/web/src/env.ts`
   under the same name, and `WorkerBindings` grows with it.
5. Core tests through `createRouterClient(router, { context })` with the `memberContext` helper; SPA tests
   against the mocked `client` in `apps/web/tests/stub-client.ts`; sign-in paths tested through the stub of
   slice 2 rather than by mocking Better Auth.
6. `docs/OPERATIONS.md`'s environment table and `docs/DEVELOPMENT.md`'s setup section gain every variable the
   slice introduces, in the same PR, with the callback URL an IdP has to be told.
7. `vp check` clean, `vp run -r test` green, `vp run web#build:workers` then `vp run web#check:workers`
   green, a changeset written for somebody upgrading deevy.

## Dependency order

```
1 A provider is configuration
└─ 2 The stub stands in for any provider
   ├─ 3 One Human, one Member
   │  ├─ 4 Google
   │  ├─ 5 GitLab, and a gitlab_group rule
   │  └─ 6 A generic OIDC provider
   └─ 7 An invitation is a link
      └─ 8 Accepting one
```

Slices 4, 5 and 6 are independent of one another once 3 is in. Slices 7 and 8 need only 1 to be correct and
2 to be demonstrable, so they can run in parallel with the providers.

---

## Slice 1: A provider is configuration (S)

**Goal.** What a deployment configures is a list of sign-in providers, and the sign-in page renders that
list. GitHub is still the only entry, so the only thing a Human sees change is the copy.

**Depends on.** Nothing.

**Core.** `AuthEnv.github` becomes `AuthEnv.providers`: an optional entry per provider, each a client pair,
with `gitlab` also taking an issuer and `oidc` also taking an issuer and a label. `createAuth` builds
`socialProviders` from the entries that have both halves of a pair. An entry with a blank client id is
absent rather than registered — today `clientId: ""` still registers GitHub and the failure arrives as a
redirect to a GitHub error page, which is exactly the case the sign-in page needs to be able to report.
A new `signInProviders(env)` returns `Array<{ id, label, kind }>`, where `kind` is `social` for now and
grows a second value in slice 6.

**Operations.** `health.ping`'s output gains `providers`. Public on purpose: an instance that cannot say
what it offers cannot render its own sign-in page, and "this deployment has GitHub configured" is not a
secret worth a session. `devSignIn` stays as it is.

**Both runtimes.** `apps/server/src/env.ts` and `apps/web/src/env.ts` read the same names into the same
shape; `apps/server/src/server.ts` and `apps/web/src/worker.ts` pass it to `createApp` beside `devSignIn`,
and `AppContext` (`packages/core/src/operations/registry.ts:65`) carries it.

**UI.** `apps/web/src/App.tsx` renders one button per provider, GitHub keeping its icon and its wording.
The heading copy loses "GitHub": "With an account your Workspace admin allowlisted." An instance with no
provider configured says so in a line, instead of offering a button that goes nowhere.

**Acceptance test.** `packages/core/tests/app.test.ts`: a ping on an app configured with a client pair
lists that provider; one configured with half a pair lists nothing. `apps/web/tests/app.test.tsx`: two
providers render two buttons in the order the server sent, none renders the message and no button.

**What must stay true.** An instance whose environment is exactly today's shows exactly today's page.

What shipped differently:

- `AuthEnv.providers` declares the one entry the slice registers, `github`, rather than all four shapes up
  front. `signInProviders` and `createAuth` decide from the same predicate, so slices 4 to 6 each add their
  entry beside GitHub's — an entry declared here now and read by nothing would be a later slice half-built.
- The GitHub button keeps its wording and gains no icon: it has never had one (lucide 1.x carries no brand
  marks), and "exactly today's page" is the stronger of the two promises.
- The list is passed to `createApp` as `signInProviders` and reported by `health.ping` as `providers`; the
  SPA renders `Sign in with <label>` per entry, so the accessible name the tests rely on is unchanged.

---

## Slice 2: The stub stands in for any provider (M)

**Goal.** The no-OAuth-App path (`docs/DEVELOPMENT.md`, "Running without an OAuth App") covers every
provider deevy offers, so slices 3 to 6 each arrive with a dev loop, a screenshot and a test that exercises
Better Auth's real OAuth dance rather than a mock of it.

**Depends on.** 1.

**Work.** `apps/web/scripts/stub-github.js` becomes `stub-oauth.js`, still a `globalThis.fetch`
interception keyed by host, now answering for Google (`accounts.google.com`, `oauth2.googleapis.com`,
`www.googleapis.com`), GitLab (the configured issuer's `/oauth/token` and `/api/v4/user`, `/api/v4/groups`)
and the OIDC issuer's discovery document, beside the GitHub endpoints it already answers. The sign-in still
says who it is in the OAuth `code`, which is the email address.

The hard part is the `id_token`: Google's provider in `@better-auth/core` verifies it against Google's JWKS
with `jose`, and a generic OIDC provider verifies it against the issuer's. So the stub generates an RS256
key pair when it loads, serves the JWKS at the certificate URL of whichever issuer was asked, and signs the
token it hands back from the token endpoint. It signs with `crypto.subtle` rather than pulling `jose` in:
the file is prepended to a built Worker bundle by `scripts/smoke-workers.ts`, and a dev-only dependency that
has to work inside workerd is a risk this file does not need.

**The flag.** `DEEVY_DEV_STUB_GITHUB` becomes `DEEVY_DEV_STUB_OAUTH`, renamed at every caller in the same
PR: `apps/server/src/env.ts` and `index.ts`, `apps/server/src/seed.ts`, the `dev:stub` launch configuration,
`apps/web/scripts/smoke-workers.ts`, `apps/agent/scripts/boot.ts`, `.env.example`, `docs/DEVELOPMENT.md`.
No alias for the old name: it is refused under `NODE_ENV=production` by construction, and every caller is in
this repository.

**Acceptance test.** A server test that drives a full sign-in through the stub for each provider the
environment configures and ends with a session; `vp run agent#acceptance` green, which is the regression
suite for the rename.

**What must stay true.** `vp run server#seed` produces the same seeded Workspace, signed in through GitHub
by default, and the smoke run on Workers behaves as it does today.

What shipped differently:

- **The stub is one function, not a file of declarations.** Its source is prepended to a built bundle, and
  the bundle already exports a `base64url`; esbuild refuses the duplicate rather than shadowing it, so
  `wrangler dev` would not start. Everything now lives inside an IIFE, which declares nothing at module
  scope and cannot collide again. `vp run agent#acceptance` is what caught it, exactly as the plan's last
  risk said it would.
- **GitLab and the OIDC issuer are matched by path, not by host.** The stub cannot read the environment —
  on workerd there is none at load — so it cannot know which host the operator's issuer is on. It answers
  `/oauth/token`, `/api/v4/user`, `/api/v4/groups` and `/.well-known/openid-configuration` on any host that
  is not loopback; loopback is deevy itself and must answer for its own routes, including the OAuth server
  metadata `mcp()` publishes. GitHub and Google stay keyed by host, because Better Auth hardcodes theirs.
- **The signed `id_token` is insurance, not a requirement of today's Better Auth.** On the callback path
  1.7.3's Google provider only decodes the token; it verifies a signature on the id-token sign-in path, and
  `genericOAuth` refuses to register a provider whose discovery hands back no usable `jwks_uri`. The stub
  signs anyway, and the test verifies the signature against the JWKS the stub served — which is the bet the
  plan names, checked where it can be checked.
- **The end-to-end sign-in is over the one provider the environment can configure.** `apps/server/tests/stub-oauth.test.ts`
  loops `signInProviders(env)` and drives each entry through Better Auth to a session, so it grows with
  slices 4 to 6 without being edited; the other three providers' endpoints are asserted directly, since
  nothing registers them yet.
- **The dev form still names GitHub.** `DevSignIn` posts `provider: "github"` and lands on that callback,
  which is correct while GitHub is the only entry; the slice that adds a second provider is the one that can
  see whether it needs a chooser. `docs/DEVELOPMENT.md` gained the stub's shape, `.env.example`, the
  `dev:stub` launch configuration and the `deevy-ui` skill the new flag name.

---

## Slice 3: One Human, one Member (S)

**Goal.** A teammate who signed in with GitHub in March and Google in April is one Member with one handle,
and the rule that makes that true is written in deevy rather than inherited.

**Depends on.** 2 — two stubbed providers make this testable before either real one is wired.

**Core.** `createAuth` states `account.accountLinking` explicitly: `enabled: true`; `trustedProviders`
naming exactly the providers this deployment configured, taken from the same list slice 1 built, so adding
an IdP does not also mean remembering to trust it; `requireLocalEmailVerified` left at its default `true`;
`allowDifferentEmails: false`. `admit()` is already idempotent per user, so a linked account appends no
second `member.joined`.

**Acceptance test.** `packages/core/tests/membership.test.ts`: one email through two stubbed providers
leaves one `user` row, one Member and one handle, and two `account` rows. A second provider whose profile
reports an unverified email does not link — it lands as a second user with no Member unless a rule matches
it, which the test asserts rather than assumes.

**Docs.** `docs/OPERATIONS.md`, "Signing in": what linking means for a Workspace, and that an IdP which lies
about `email_verified` is trusted exactly as far as the operator's own configuration trusts it.

**Checkpoint.** Matt walks the seeded instance with two stubbed providers before any real one lands.

What shipped differently:

- **The policy is `accountLinkingOf(env)`, and `requireLocalEmailVerified` is written down nowhere.** The
  option is deprecated in Better Auth 1.7.3 — the gate becomes unconditional in the next minor — so the
  slice's "left at its default `true`" is left there literally, with the reason in the comment rather than a
  value to delete later. `enabled`, `trustedProviders` and `allowDifferentEmails` are stated.
- **A second provider that reports an unverified address still links.** The slice expected it not to, but the
  two are the same decision: Better Auth refuses a link only when the provider is untrusted _and_ the profile
  says the address is unverified, and every provider deevy registers is trusted by construction. The gate
  that remains is the other end — `requireLocalEmailVerified`, on the row that already holds the address —
  and that is what the test drives. `docs/OPERATIONS.md` says both halves.
- **A refused link is not a second user.** 1.7.3 answers `account_not_linked` at the callback and stops; it
  does not fall through to creating a second Human on the address, so there is no "second user with no
  Member unless a rule matches it" to assert. The test asserts what happens instead: one user row, one
  account, no Member, no session.
- **The end-to-end lives in `apps/server/tests/stub-oauth.test.ts`, not `membership.test.ts`.** Only GitHub is
  registered until slices 4 to 6, and the stub a real OAuth dance needs is `apps/web/scripts/stub-oauth.js` —
  which `packages/core` may not reach for without inverting the dependency. So the provider that signed the
  Human up first is a seeded `account` row (a row is the same row whichever provider wrote it) and the
  _second_ provider arriving is a real GitHub callback. `membership.test.ts` keeps deevy's own half: the
  trusted list is exactly the configured providers, it reaches the context the linking decision reads, and a
  second account for a Member deevy already has appends no second `member.joined`.
- **The trust list is asserted where it is decided, not through the dance.** The stub reports every address
  as verified, so no sign-in it can drive turns on trust; what the end-to-end proves is that the policy holds
  in a real callback, and what `membership.test.ts` proves is that the list is the configured one.

---

## Slice 4: Google (S)

**Goal.** An instance with a Google client offers Google, and a teammate on the Workspace's domain joins.

**Depends on.** 3.

**Work.** `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on both runtimes, in `WorkerBindings`,
`.env.example`, `docker-compose.yml`, the environment table in `docs/OPERATIONS.md` and the setup section in
`docs/DEVELOPMENT.md`, with the callback `${BETTER_AUTH_URL}/api/auth/callback/google`. The provider is one
entry in the list slice 1 built. `hd` is deliberately unset: who may join is an `email_domain` rule, in
deevy's UI, and one place to look.

**Acceptance test.** Sign-in through the stub with a matching `email_domain` rule creates the user and the
Member; without a rule it creates the user and no Member. The sign-in page shows two buttons.

What shipped differently:

- **The dev form no longer names GitHub.** Slice 2 left the question — does the stubbed form need a chooser
  once a second provider exists? — to the slice that added one. It does not: under the stub every provider
  answers and the address is what decides who signs in, so any of them ends in the same session. But naming
  GitHub in the code meant a stubbed instance configured with only Google could not sign in at all, so
  `DevSignIn` takes the first provider `health.ping` reports and the copy above it stops saying "GitHub is a
  stub". Today's environment offers GitHub first, so today's form behaves exactly as it did.
- **`docker-compose.yml` stopped requiring GitHub.** `GITHUB_CLIENT_ID` was a `:?` variable, so a compose
  file that now also passes Google's pair would still refuse to start an instance that offers Google alone.
  Every provider pair is passed through as optional, which is what "an operator chooses which of four
  providers their instance offers" has to mean; an instance with no pair at all still starts and says so on
  its sign-in page, which is the behaviour slice 1 built.
- **The two-button assertion is made twice.** `apps/web/tests/app.test.tsx` already rendered two buttons from
  a stubbed `health.ping` as of slice 1, so what this slice added is the other end: `packages/core/tests/app.test.ts`
  asserts that two configured pairs are two entries, in that order, and that either alone is one.
- **The end-to-end sign-in needed no new test.** `apps/server/tests/stub-oauth.test.ts` loops
  `signInProviders(env)`, so adding Google's pair to that environment is what drives Better Auth's real
  Google dance — token endpoint, signed `id_token` and all — to a session. The rule cases the slice asks for
  are new tests beside it, driven through a Workspace the admin's own Google sign-in created.

---

## Slice 5: GitLab, and a `gitlab_group` rule (M)

**Goal.** A GitLab instance — gitlab.com or self-hosted — signs teammates in, and a group is a rule the way
a GitHub organization is.

**Depends on.** 3.

**Schema.** `allowlistRuleKinds` gains `gitlab_group`. This is a type change, not a migration: the column is
`text(..., { enum })`, which SQLite carries no CHECK for, so `vp run db#generate` must produce nothing and
the PR says so.

**Core.** `gitlab({ clientId, clientSecret, issuer })`, the issuer from `GITLAB_ISSUER` defaulting to
`https://gitlab.com`, with scopes `read_user` and `read_api` — groups are only listable with the latter, and
the comment says so beside the one `read:org` already has. `githubPorts` becomes `joinPorts(db, userId)`,
dispatching on the account's `providerId`, and gains `listGroups` reading
`GET {issuer}/api/v4/groups?min_access_level=10`, as lazy as `listOrgs`: only when a `gitlab_group` rule
exists and no email domain matched. `JoinOptions.githubLogin` becomes a provider-neutral `login` that feeds
the handle, so a GitLab username is a handle the way a GitHub login is.

**Validation.** `AllowlistValue` in `operations/shared.ts` becomes per-kind. A GitLab group is a path —
`acme/platform`, with `_` and `.` legal and subgroups nested — which today's domain-shaped regex refuses.
Lowercasing on the way in stays.

**UI.** `kindLabels` in `apps/web/src/routes/settings/allowlist.tsx` gains "GitLab group", and the field's
help text names a group path rather than a domain.

**Acceptance test.** `membership.test.ts` mirrors the four organization cases for groups: a matching group
joins, a non-matching one does not, the port is not called when a domain rule already matched, and a port
that throws leaves the sign-in without a Member rather than failing the sign-in. `allowlist.test.ts` accepts
`acme/platform` for a group rule and still refuses it for an email domain. OpenAPI snapshot updated: the
enum widened.

What shipped differently:

- **`vp run db#generate` produced nothing, as the slice said it would.** `kind` is `text(..., { enum })`,
  which SQLite carries no CHECK for, so `gitlab_group` is a type change and there is no migration in this
  commit. `vp run db#check:migrations` is green on the twenty-four that were already there.
- **`scope` is `["read_api"]`, not `["read_user", "read_api"]`.** Better Auth's GitLab provider hands
  `read_user` out by default and adds `options.scope` to it, so naming it again would put the same scope in
  the authorization URL twice. The comment names both, beside the one `read:org` already has.
- **The per-kind validation is a refinement on the pair, not three schemas.** `AllowlistRuleInput` in
  `operations/shared.ts` checks the value against the pattern its `kind` names, so the message says the shape
  the admin was actually asked for. A discriminated union would have said the same thing in the OpenAPI
  document at the cost of turning one object into a `oneOf` of three, and the slice asked for a widened enum.
  What the document advertises for `value` is now the widest of the three patterns, since a JSON Schema
  `pattern` cannot depend on a sibling field; the exact shape is enforced by the server either way.
- **`joinPorts` supplies every port rather than dispatching to one.** `admit` runs from Better Auth's user
  and session hooks, which do not say which provider just signed in, and a Human may have both accounts
  linked — so each port dispatches on its own `providerId` when it is called, and a Human with no such
  account is simply not in the group. Every port stays as lazy as `listOrgs` was.
- **A port that fails is not a sign-in that fails.** The four cases the slice asks for include one the
  existing `github_org` code could not pass: the join runs inside a database hook, so a throwing port was a
  refused sign-in. `matchesMemberships` now treats an error as no memberships, for organizations and groups
  alike, and the Human lands signed in and not a Member — which is the state the SPA has a screen for, and
  the next sign-in asks the provider again.
- **The end-to-end sign-in needed no new test.** `apps/server/tests/stub-oauth.test.ts` loops
  `signInProviders(env)`, so adding GitLab's pair and a self-hosted `GITLAB_ISSUER` to that environment is
  what drives Better Auth's real GitLab dance — the token endpoint and `/api/v4/user` on the operator's own
  host — to a session.

---

## Slice 6: A generic OIDC provider (M)

**Goal.** An instance behind Okta, Entra, Keycloak or Authentik offers one "Single sign-on" button that
works, configured from four environment variables.

**Depends on.** 3.

**Core.** `genericOAuth` from `better-auth/plugins`, one config entry: `providerId: "oidc"`, `discoveryUrl`
built from `DEEVY_OIDC_ISSUER`, the client pair from `DEEVY_OIDC_CLIENT_ID` and `DEEVY_OIDC_CLIENT_SECRET`,
`scopes: ["openid", "profile", "email"]`, PKCE on. The button's label is `DEEVY_OIDC_NAME`, defaulting to
"Single sign-on"; it is what `health.ping` reports, so an operator names their own IdP without touching the
SPA.

**The second shape.** A generic provider is not a social one: sign-in is `POST /api/auth/sign-in/oauth2`
with `{ providerId, callbackURL }` and the callback is `/api/auth/oauth2/callback/oidc`. Better Auth 1.7.3
ships no `genericOAuthClient` in `better-auth/client/plugins`, so the SPA posts it through
`authClient.$fetch`, and the `kind` slice 1 put on each provider (`social` now, `oauth2` here) is what tells
the button which call to make. This is the only place the seam has two shapes; if a later Better Auth adds
the client plugin, the button collapses back to one call and `kind` stays as the honest description of what
the server registered.

**The plugin list changed**, so `packages/db/auth.generate.config.ts` is updated to mirror it and
`vp run db#generate:auth` re-run per `docs/DEVELOPMENT.md`, "Changing a Better Auth plugin". It must produce
no schema change: `genericOAuth` adds no tables, and a diff here means something else moved.

**Acceptance test.** Sign-in through the stub's discovery document and signed `id_token`; `health.ping`
labels the provider from `DEEVY_OIDC_NAME`; the SPA's button posts to `/sign-in/oauth2` rather than
`/sign-in/social`.

**Docs.** `docs/OPERATIONS.md` gains the four variables and the redirect URI an IdP has to be given.

---

## Slice 7: An invitation is a link (M)

**Goal.** An admin invites one person by address and gets a URL to send them. Nothing about it waits on
deevy being able to send email.

**Depends on.** 1.

**Schema.** `invitation`: `id` (`inv_`, a new prefix in `packages/core/src/ids.ts`), `workspaceId`, `email`
lowercased, `role` (`member | admin`), `tokenHash`, `createdBy`, `createdAt`, `expiresAt` (seven days),
`acceptedAt`, `acceptedMemberId`, `revokedAt`. A partial unique index on `(workspaceId, email)`
`WHERE accepted_at IS NULL AND revoked_at IS NULL`: one live invitation per address, with the spent and
revoked ones kept, because "who is invited right now" is a question the Event log answers only by replay.

**The token** is 32 bytes from `crypto.getRandomValues`, base64url, returned once when the invitation is
created and stored only as a SHA-256 hash through `crypto.subtle` — web-standard only (ADR-0006), the way an
Agent's key is issued once through `packages/core/src/keys.ts` and never shown again. It appears in no Event
payload and in no list output.

**Operations.** A new `packages/core/src/operations/invitations.ts`: `list` and `create` and `revoke`
(admin), `accept` (session, agent-denied by default). `create` takes `{ email, role }` and returns the row
plus the URL, once. `accept` takes `{ token }`: hash it, find a live invitation in this Workspace, require
the signed-in address to equal the invited one, insert the Member with the invited role, mark the invitation
accepted. An unknown token is `NOT_FOUND`, an expired or revoked one `BAD_REQUEST`, a mismatched address
`FORBIDDEN` naming the address that was invited, and a caller who is already a Member gets their Member row
back rather than an error.

**Events.** `invitation.created`, `invitation.revoked`, `invitation.accepted` join the `EventKind` union,
with the address and role in the payload and never the token; accepting also appends `member.joined`, so the
Workspace's history reads the same whether somebody joined by rule or by invitation. No notification kind is
added: the invited person is not a Member yet, and the admin is holding the link.

**Acceptance test.** `packages/core/tests/invitations.test.ts`: create, list and revoke as an admin and each
refused for a Member; accept as the invited address; refused for another; expired; revoked; accepted twice
(the second is a no-op); the token absent from `events.list` and from `invitations.list`.

---

## Slice 8: Accepting one (M)

**Goal.** The invited person clicks the link, signs in with whatever the instance offers, and is a Member —
and the admin can see who is still outstanding.

**Depends on.** 7, and 2 for the walk-through.

**UI.** A `/invite/$token` route. Signed out it holds the token in `sessionStorage` and shows the sign-in
buttons under a line saying an invitation is waiting — it cannot say more, because the token is a bearer and
there is nothing to read without one. Signed in, it calls `invitations.accept` and lands the Human in the
Workspace. The screen that already exists for a signed-in Human who is nobody yet (`apps/web/src/App.tsx:163`,
"is not a Member of this Workspace") picks up a held token too, so somebody who signs in first and clicks
second still joins, and its copy stops telling every such Human to go and ask for an allowlist rule. A
mismatched address gets the operation's message, naming the address the invitation was for.

Settings gains an "Invited" row beside "Who may join", listing pending invitations with address, role and
expiry, each with Revoke. There is no Copy link on a row: only the hash is stored, so the URL exists exactly
once, in the dialog that created it. The dialog says so.

**Acceptance test.** `apps/web/tests/invitations.test.tsx`: the dialog shows the URL once and the row does
not; the list revokes a row; the invite route holds its token across a sign-in and accepts after it; a
mismatched address renders the error rather than an empty screen.

**Docs.** `docs/OPERATIONS.md`, "who may join": a rule admits a category, an invitation admits a person, and
neither is a Gate.

---

## Order, checkpoints, records

Slices 1 and 2 first, and 3 before any real second provider is configurable. 4, 5 and 6 in any order after
3; 7 and 8 in parallel with them. One checkpoint, after 3: Matt walks the seeded instance with two stubbed
providers and confirms that one person with two sign-ins is one Member before a real IdP is anywhere near
it.

Each slice appends its own "what shipped differently" to this file as it lands, in the house style of
[ui-redesign-2.md](./ui-redesign-2.md). When the last one lands, m1.md's "Deferred out of M1" line loses
invitations and the three providers, m2.md's loses them too, PLAN.md's authentication section stops being a
promise, and CLAUDE.md's milestone paragraph names this plan the way it names the others.

## Verification

`vp check`; `vp run -r test`; `vp run web#build:workers` then `vp run web#check:workers`;
`vp run core#snapshot:openapi` committed; `vp run db#check:migrations` for 7; `vp run agent#acceptance` for
2; a changeset per PR; screenshots of the sign-in page in both themes once 6 lands, and of the Invited row
once 8 does.

## Risks worth naming

- **The stubbed `id_token` is the slice-2 bet.** It works because Better Auth verifies a signature against a
  JWKS the stub also serves; a minor that changes how a provider validates its token breaks the dev path
  before it breaks production, which is the right order but is still a morning's work.
- **`read_api` is a wide scope** for what slice 5 asks of it — GitLab has no narrower one that lists a
  user's groups. The token is the sign-in's own, stored by Better Auth, read on the join and never again;
  say so in OPERATIONS.md rather than leaving an operator to discover the consent screen.
- **The partial unique index is hand-patched migration territory**, alongside the `NOT NULL` patch the
  drizzle-kit rc already needs.
- **Renaming the dev flag touches the agent acceptance script**, which is the one test that runs both
  deployments on every commit. Slice 2 is the slice most likely to be reverted for an unrelated reason.
