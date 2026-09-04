# deevy: v1 plan

Discovery output, 2026-09-03. Vocabulary is defined in [CONTEXT.md](../CONTEXT.md); the reasoning behind the
hard-to-reverse choices is in [docs/adr](./adr). Research notes that informed this plan are in
[docs/research](./research).

## What deevy is

Project management where Humans and Agents collaborate as peers on the same Issues. Open source (AGPL-3.0),
self-hosted, built first for our own team of 2 to 10 people who use coding agents every day, with the solo
developer as the zero-config case.

Four things make it different from Plane, Linear, It's a Plan, Paperclip, and Vikunja's bot users:

1. **Every Agent has a Sponsor.** An Agent is a first-class Member with its own identity, keys, and audit trail,
   and exactly one Human is accountable for it.
2. **Gates are a workflow primitive.** A Gate is a State an Issue cannot leave without a Human's approval, and an
   Agent can never approve one.
3. **The Event log is the audit trail.** Every change is an immutable Event with actor and timestamp; webhooks,
   live UI, notifications, and metrics all derive from it.
4. **deevy never runs agents.** It triggers them through events and an MCP inbox, and receives Runs back. Claude
   Code in CI, an Agent SDK service, a GitHub Action, or a local loop does the running.

Everything else is deliberately conventional so agents and humans already know how to use it: Issues with keys
like `DEV-42`, Projects, Teams, Labels, a board, comments, links to pull requests.

## Domain model in one paragraph

A **Workspace** holds **Members** (Humans and Agents), **Teams**, **Projects**, Labels, and settings. A Team owns
Projects and can be mentioned; it is not a permission wall, and every Human sees every Project in v1. A Project
has a **Workflow**: an ordered list of **States**, some of which are **Gates**, plus rules that fire on entering
a State. An **Issue** belongs to a Project, has a key, a Description, named **Documents** (intent, spec, plan,
each versioned markdown with a template from its State), Labels (plain or scoped, one per scope), an optional
parent Issue, one **Assignee** (Human or Agent), comments, and typed **Links** to pull requests, commits,
branches, and URLs in linked **Repositories**. An Agent working an Issue produces a **Run** that records who
triggered it, posts **Activities** (thought, action, elicitation, response, error), attaches evidence and
Links, and ends in a state. Every change becomes an **Event**. **Notifications** derive from Events and are
delivered to **Channels**: each Human's in-app inbox, and Slack.

## Default workflow template

Intent → Spec → Plan → Build → Review → Done, with Gates on leaving Intent, Spec, Plan, and Review. Each of the
first three States supplies a Document template following the playbook's headings (Problem, Proposed outcome,
Affected users and systems, Constraints, Open questions for intent; requirements, design, and flagged concerns
for spec; files that change, order of work, tests that prove it for plan). Teams that want Todo, Doing, Done
delete the middle. Sizing is binary: fits in one PR, or needs an intent. No estimates.

## The agent loop

**Triggers** that create a Run: assigning an Issue to an Agent; mentioning an Agent in a comment; a workflow
rule on entering a State (for example, entering Plan assigns the planning Agent); a schedule on an Agent.

**Delivery.** A trigger appends an Event, creates a Run in `pending`, and delivers a signed webhook to the URL
the Agent registered, with retries and backoff from the Event log. Agents without a URL poll their inbox over
MCP. Either way the Agent then reads the Issue and its Documents over MCP.

**Run lifecycle.** `pending` → `active` on first Activity → `awaiting_input` when the Agent posts an elicitation
→ back to `active` when a Human answers → `completed` or `failed`; `stale` after a configurable silence (default
30 minutes), recoverable. The Run's final response carries a summary and Links. This is the shape Linear, Plane,
and Notion converged on, so existing agents port with a thin adapter.

**Gates.** When an Issue reaches a Gate, Humans with Project access (or the approvers the Gate names) get a
Notification. Approval or rejection is an Event. An Agent that reaches a Gate mid-Run can surface it as a URL
elicitation so the Human approves in deevy and the Agent resumes. No requester-cannot-approve rule in v1.

**Accountability.** The Run records the Member that triggered it. The accountable Human for any agent action is
one hop away: the triggering Human, or the Sponsor when an Agent triggered it.

## Authentication and access

- Humans sign in with GitHub, GitLab, Google, or generic OpenID Connect. No local passwords.
- A Workspace admin allowlists a GitHub organization, a GitLab group, or an email domain; matching sign-ins
  auto-join. Everyone else is invited. The first sign-in matching the configured admin email becomes admin.
- Every Member is a Better Auth user. Agents are token-only users created by their Sponsor, who issues and
  rotates their API keys. A suspended Sponsor suspends their Agents until someone else sponsors them.
- Agents get a fixed capability set scoped to granted Projects: read and write Issues, comment, create and
  update Runs. Never administer, never manage Members, never approve a Gate.
- MCP clients used by Humans sign in with OAuth 2.1; deevy is its own authorization server. Agents use API keys
  as bearer tokens on the same MCP endpoint.

## Surfaces

One typed core, projected three ways (ADR-0005):

- **HTTP API** defined with oRPC 2.0 (beta) procedures behind our own operation-registry type, served by Hono
  through the fetch adapter, with generated OpenAPI 3.1 and a reference UI. The React SPA uses the typed client
  with TanStack Query (ADR-0009).
- **MCP server** speaking the 2026-07-28 revision in stateless form through the TypeScript SDK v2 per-request
  handler, serving 2025-era clients through the SDK's legacy stateless mode. Tools are projected from the same
  oRPC procedures by walking the router and registering each procedure's schemas. The v1 set is twenty tools:
  `issues_list`, `issues_get`, `issues_create`, `issues_update`, `issues_set_labels`; `documents_get`,
  `documents_write`; `comments_create`; `labels_list`, `labels_create`; `links_list`, `links_add`,
  `links_remove`; `inbox_list`; `runs_start`, `runs_list`, `runs_get`, `runs_post_activity`,
  `runs_request_approval`, `runs_finish`. Renaming or deleting a Label, and ruling on a Gate, stay off it: a
  Label is Workspace-scoped and a Gate is a Human's to rule on.
- **Events** delivered as signed webhooks to Agents and to generic subscribers, and consumed internally by the
  SSE stream, the inbox, and Slack.

## Architecture

- **Runtime-agnostic core** (ADR-0006): web-standard APIs only. Two deployment shapes, operator's choice: a
  single Node process with SQLite in a Docker image (first), and a Cloudflare Worker with D1 (second). The Workers
  build runs in CI from day one.
- **Adapters** with a Node and a Workers implementation: storage driver, job queue (in-process outbox on Node,
  Queues on Workers), cron (timer on Node, Cron Triggers on Workers), static assets. Webhook delivery and the
  stale-Run sweep are adapter operations.
- **No interactive transactions in the core.** D1 has none, so multi-statement writes are batches behind the
  storage adapter.
- **Live UI** over server-sent events fed by an Event-log cursor, with heartbeats; identical on both targets.
- **Data**: Drizzle 1.0 release candidate, pinned to the exact rc, on the SQLite dialect; `node:sqlite` on Node,
  D1 on Workers (ADR-0008). Migrations are generated by drizzle-kit and applied by the Node migrator or by
  `wrangler d1 migrations apply`, never by drizzle-kit against D1. Timestamps as integers. Postgres is a later
  third adapter.
- **Auth**: Better Auth 1.7 with the GitHub, GitLab, Google, and generic OAuth providers, the API-key plugin, and
  the MCP plugin as OAuth authorization server (ADR-0007).
- **Toolchain**: Vite+ (`vp`) on Node 22.18+; pnpm workspace from `vp create vite:monorepo`; React with shadcn.

Repository layout:

```
apps/web         React SPA (vp dev / vp build); also hosts the Cloudflare Worker entry via the Cloudflare Vite plugin
apps/server      Node entry (Hono on @hono/node-server), built with vp pack; Docker image
packages/core    domain model, workflow engine, Event log, oRPC contracts, MCP tool projection
packages/db      Drizzle schema and migrations (shared by node:sqlite and D1)
packages/adapters node/ and workers/ implementations of storage, jobs, cron, assets
```

## Notifications

Notification kinds in v1: mention, assignment, Gate awaiting you, Run awaiting input, Run finished or failed.
Channels: each Human's in-app inbox (always), and Slack via an incoming-webhook URL per Channel. Routing is both
Workspace rules (this kind, for this Project, to this Channel) and per-person preferences. A Slack app with per-
person DMs and approve buttons comes after v1.

## Milestones

**M0 Scaffold.** Monorepo from the Vite+ template; `packages/core` with the first oRPC contracts; Drizzle
schema; Better Auth on Node with GitHub sign-in; CI running lint, typecheck, tests, the Node build, and the
Workers build. Done when a Human can sign in and see an empty Workspace.

**M1 Humans.** Workspace bootstrap and allowlist auto-join; Projects, Teams, Labels; Issues with keys, Documents,
parent links, comments, Links; the Workflow engine with States, Gates, and the default template; board and Issue
views; Event log; SSE live updates; in-app inbox. Done when our own team runs its work in deevy on the Docker
image with no agents yet.

**M2 Agents.** Agents created by Sponsors with API keys; MCP server with the v1 tool set; OAuth authorization
server for Human MCP clients; all four triggers; Runs and Activities with the stale sweep; signed webhooks with
retries; Gate approvals including URL elicitation; Slack Channel and routing rules. Done when a Claude Code loop
outside deevy picks up an assigned Issue, writes a plan Document, hits the Plan Gate, and resumes after a Human
approves in deevy.

**M3 Workers.** D1 storage adapter, Queues and Cron adapters, static assets configuration, the client-ID-
metadata-document fetch transport for Workers, and the token-verification workaround for a shared Worker. Done
when the M2 scenario runs on a free Cloudflare account.

Three things M2 leaves for it. The **CIMD fetch transport** M3 already owns is where the DNS-rebinding gap
closes: M2's web-standard transport checks that a host is publicly routable and then connects by name, so it
cannot pin the address it validated, and `AuthEnv.fetchClientMetadataResource` is the seam for one that can.
The **`delivery` table lost a uniqueness guard**: slices 5 and 8 merged onto one table with a `target`
discriminator, and the unique `(subscriptionId, eventSeq)` the plan called for became a plain index. Nothing
duplicates today, because deliveries are derived one statement per Event, but the guard is gone and Queues
give a message at-least-once, so M3 is when it starts to matter. And the **v1 tool set did not match the
promise above**: "manage Labels and Links" shipped as `labels_list` and `links_add` only, with no create,
update or remove over MCP. M3 widens the surface rather than narrowing the sentence, to the twenty tools
listed above.

**M4 Reference runtime.** A documented sample agent runtime (Claude Code headless in a GitHub Action and as a
local loop) consuming webhooks and the MCP inbox, plus operator docs for both targets.

**After v1**, in rough order: agent-to-agent delegation through sub-issues; cost and time accounting per Run;
mirroring Documents into the Repository; the Slack app; email Channel; private Projects; four-eyes Gates;
Postgres adapter; a CLI.

## Risks worth naming

- oRPC 2.0 is a beta from a single maintainer with no GA date; pin exact versions and keep the registry type ours.
- Better Auth's client-registration surface is changing weekly; pin 1.7.x and expect to chase upstream fixes.
- Drizzle 1.0 is a release candidate: queries and the Better Auth adapter are verified, but drizzle-kit has open
  migration regressions, and a fallback to 0.45 re-baselines the migration history. Decide before the first
  production migration.
- Vite+ is beta with no first-class Node server dev loop; the server dev loop is a watch-and-respawn task.
- Cursor and VS Code have not documented 2026-07-28 support; the SDK's legacy stateless mode covers them.
- D1 free-tier limits (50 queries per invocation, 100k writes per day) shape query design from M1, not M3.
