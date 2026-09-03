# Research: OSS trackers vs agents, group A (Plane, Huly, OpenProject, Taiga, Focalboard) as of 2026-09-03

## Plane (AGPL-3.0 CE; Commercial/Airgapped closed) - Django + React, Postgres, Redis
- REST API (PAT `X-API-Key`, OAuth bearer, 60 req/min), workspace webhooks (HMAC-SHA256), official MCP server (MIT,
  Python FastMCP, 30 tools/204 ops, stdio+PAT or hosted HTTP+OAuth). CE has no OAuth app registration -> stdio+PAT only.
- AGENT MODEL (closest existing analogue to deevy's design):
  - Installing an agent (OAuth app with "Enable App Mentions" + Agent Run scopes) creates a *bot user* in the workspace;
    agents appear in @mention picker, can be assignees, don't count as billable seats.
  - Dispatch: Plane POSTs webhooks `agent_run_create` / `agent_run_user_prompt` to the agent's URL with context.
  - Agent replies through an **Agent Run** with activity types: response (visible comment), thought, action,
    elicitation (ask the user), error. Run states: created / in_progress / awaiting / completed / stopping / stopped /
    failed / stale (5 min timeout).
  - Example agent: makeplane/prd-agent (Cloudflare Worker). SDKs: @makeplane/plane-node-sdk, plane-sdk.
  - Likely NOT available on self-hosted Community Edition (agents are OAuth apps; CE lacks OAuth app registration). Unverified.
- Automations (triggers/actions) are Business plan; send-webhook/run-script are Enterprise Grid. Plane AI ("Pi") is Pro+.
- Cursor agent integration (assign work item -> IDE agent works it) Pro+.
=> Plane has built agent identity + run model, but it is paywalled / not in the open-source edition.

## Huly (EPL-2.0) - Node/TS + Svelte; hosted service discontinued 2026-07-20
- No REST resource API (generic document api-client over WS/REST), no webhooks, no official MCP (several community ones,
  all email/password auth). No agent/service-account type. Hulia AI bot "behaves like any other user".

## OpenProject (GPL-3.0, enterprise add-ons via license key) - Rails + Angular, Postgres
- APIv3 HAL+JSON, OpenAPI; webhooks. Built-in MCP endpoint /mcp is an Enterprise add-on (17.2, 2026-03; writes in 17.8,
  2026-09-02). Acts as the authenticated user; no agent user type. Placeholder users can be assigned but cannot log in.

## Taiga (back MPL-2.0, front AGPL-3.0) - Django + AngularJS
- REST v1, application tokens bound to a user, webhooks. No official MCP (community ones w/ username+password).
  No bot type, no AI.

## Focalboard / Mattermost Boards
- Unmaintained standalone; plugin in maintenance mode. REST v2 beta; webhook_update. No Boards MCP.
  Mattermost bot accounts exist but Boards acceptance of bot tokens unverified.

## Takeaways for deevy
- Nobody in OSS ships agent identity + assignment + run/evidence + gates as open source. Plane has the closest model,
  closed. Community MCP servers everywhere authenticate as a human (email/password) -> agents impersonate humans.
- Plane's Agent Run vocabulary (activity types incl. elicitation; states incl. awaiting, stale) is worth borrowing from
  and improving: deevy's Run + Gate + Event log covers the same ground plus human approval and audit.
# Research: OSS trackers group B (Vikunja, Leantime, Kanboard, Redmine, GitLab CE) as of 2026-09-03

## Vikunja (AGPL-3.0, Go + Vue, SQLite/MySQL/Postgres, 5.3k stars) - closest OSS analogue to deevy's Agent+Sponsor
- 2.4.0 (2026-07-19): **Bot users**: username `bot-*`, API-token-only (no password/email, cannot sign in), OWNED BY A
  HUMAN, distinct avatar + badge, assignable, shareable into projects, @mentionable. 2.6.0: label sharing owner<->bots.
- **veans** CLI in main repo "for driving Vikunja from a terminal or an agent": OAuth PKCE login, creates a bot user
  with scoped token, `veans prime` emits an agent system prompt, teaches claim -> work -> in-review -> human-closes.
- REST v1 + v2 (OpenAPI 3.1, RFC 9457 errors), scoped API tokens (`tk_`), OAuth2 provider, OIDC login, project-level
  and user-level webhooks (HMAC-SHA256 X-Vikunja-Signature). No official MCP; several community ones; ufna/vikunja-mcp
  implements a gated Backlog->Queue->Design->Build->Review->[human]->Done pipeline where agents cannot mark Done.
- No built-in AI, no automation engine beyond webhooks. "Pro" features (audit logs, admin panel) license-gated but AGPL.

## Leantime (AGPL, PHP/Laravel, 11.5k stars)
- JSON-RPC API with role/project-restricted API keys; official MCP (paid plugin + in-core tools since 3.9.x). No bot
  type: hybrid-team guide says create a normal user "Claude-Agent", labels AI-Suitable / AI-Agent / Human-Review as gate.
  No generic outgoing webhooks. Paid AI features.

## Kanboard (MIT, PHP, maintenance mode) - JSON-RPC, one global webhook URL, no bot type, no AI.

## Redmine (GPL-2.0, Rails) - REST + API keys per user, OAuth2 provider (6.1), webhooks in core since 7.0 (2026-06-30,
  per-user config, GitHub-style signature). No bot type; community MCPs; redmine_ai_helper plugin exposes/consumes MCP.

## GitLab CE
- Duo Agent Platform (flows, agents, triggers, AI catalog) lives in ee/ -> NOT in CE; Free-tier path needs EE build +
  activation + purchased credits. Official MCP server code is in CE mirror but enabling may need Duo prerequisites.
- **Composite identity**: one token = service account (does the actions) + the human who triggered it; effective
  permissions are the intersection; commits by service account, MR attributed to the human, audit log shows service
  account. Service accounts free, don't consume seats.
- Triggers: mention, assign to service account, assign as reviewer, pipeline status, work-item created/status change.
  Developer flow: assign Duo Developer service account or click "Implement work item"; progress in AI -> Sessions.
- Credits attributed to "the subject who performs the action"; usage rows link to the session.

## Takeaways for deevy
- Vikunja already ships human-owned bot users + a claim/in-review/human-closes convention -> deevy's Sponsor and Gate
  are validated ideas, not novel; deevy's edge must be making them first-class (Gate as workflow primitive, Run,
  Event log, trigger protocol) rather than conventions in a CLI prompt.
- GitLab's composite identity suggests Event attribution should carry BOTH the acting Agent and the triggering
  context (which Human/event started the Run). Worth a Round 3 question: Event actor + "on behalf of / triggered by".
- Permission intersection (agent caps AND triggering human's caps) is a proven pattern for bounding agent authority.
# Research: agent-first / newer OSS trackers as of 2026-09-03

## Direct competitors on deevy's pitch
- **Paperclip** (paperclipai/paperclip) MIT, TS, Node 24 + React + Postgres (embedded locally), 79.9k stars, very active.
  Framed as "the company" for AI agents (org chart, CEO, board approvals, budgets). Issues with assignee_agent_id;
  agents table separate from users; activity_log.actor_type agent|user|system. Heartbeat dispatch (cron/webhook/API),
  adapters for Claude Code/Codex/OpenClaw/Cursor/HTTP. Agents checkout issues (409 if owned), PATCH status+comment,
  X-Paperclip-Run-Id links mutations to a run. in_review status requires explicit verdicts; board-only approvals
  (approve/reject/revision-requested); pause/resume/terminate agents; audit log. Agent-to-agent subtasks (parentId,
  assigneeAgentId). cost_events per agent/issue/project with budgets (warn 80%, auto-pause 100%). Official MCP server
  (thin wrapper over REST, 30+ tools) + MCP Tool Gateway governing external tools.
- **It's a Plan** (croffasia/itsaplan) AGPL-3.0, TS, Bun + Turborepo + Elysia + Next.js + Drizzle/Postgres + MinIO +
  Mastra. Created 2026-07-14, 435 stars, v0.16.0 (2026-08-31: branches, PRs, CI on the issue). Pitch: "self-hosted
  Linear/Plane alternative where teams and AI agents work side by side". Agents as project members with own permissions
  and assigned issues; internal agents (model, prompt, tools, skills) run inside the app; runs start on @mention,
  assignment, or schedule. External runner (@itsaplan/runner) polls every 3s and drives Claude Code / Codex / opencode /
  Copilot CLI, posts result as comment. REST + OpenAPI + API keys, signed outgoing webhooks with retries, built-in /mcp.
  Human gates, agent-to-agent delegation, cost tracking: unverified/not documented.
- **Beads** (gastownhall/beads, ex steveyegge) MIT, Go, Dolt-backed, 26.8k stars. "Distributed graph issue tracker for
  AI agents", CLI `bd`; claim (assignee + in_progress atomically), hierarchical IDs, deps, `bd ready` = unblocked work,
  BEADS_ACTOR free-form actor string (no agent/human type). Pull model, no triggers, no gates, no cost. Gas Town
  orchestrates agents on top (Mayor/Polecats, merge queue).
- **Backlog.md** MIT, markdown tasks in repo + kanban + MCP; assignee string; process-level review checkpoints.
- **Macro** AGPL, Rust + SolidJS, unified workspace incl. tasks; assign task to Macro agent; PR opens -> In Review.
- **Kandev** AGPL, Go; multi-agent pipelines per step; pulls issues from GitHub/Jira/Linear; Office mode (approvals,
  roles, cost) not shipped.
- **Sortie** Apache-2.0, Go/SQLite dispatcher: tracker tickets (GitHub/GitLab/Gitea/Linear/Jira) -> agent sessions;
  label agent-ready, handoff_state e.g. "Human Review".
- **Agent Kanban** FSL-1.1; "assigned Agent cannot reject or complete its own Review Submission".
- Dead/stale: Vibe Kanban (Bloop shut down 2026-04), AutoMaker, Tegon, PlanDB, Mission Control.

## General OSS trackers with MCP (no agent model)
- Kaneo MIT, Hono + React + Postgres, 8.9k stars, official MCP (/api/mcp OAuth 2.1 PKCE), signed webhooks; MCP acts as human.
- Planka (custom fair-use license), Wekan (MIT), Worklenz (AGPL+EE), Tuleap (GPL): community MCP at best, no agent model.
- Gitea/Forgejo: official gitea-mcp; Actions triggers on issues/labels; no agent actor type.

## Vendor context
- Claude Code: `claude agents` view (Working/Needs input/Completed/Failed), agent teams share a file-locked task list
  with claiming and TaskCreated/TaskCompleted hooks; routines with schedule/API/GitHub triggers; @claude GitHub Action.
- Codex: `codex agents` dashboard, `codex queue`; Linear assignment. Jules: label `jules` on GitHub issue.

## Takeaways for deevy
- The "humans + agents side by side" pitch is no longer empty space: It's a Plan (2 months old, AGPL, Bun) and
  Paperclip (huge, but "AI company" framing, runs agents itself) occupy it. Beads owns the CLI/agent-only niche.
- Nobody in OSS has all of: agent identity + Sponsor accountability, Gates as a workflow primitive with the
  proposer-cannot-approve rule, an Event log as audit trail, and a strict "not an agent runtime" boundary with a
  standard trigger/run protocol. Paperclip is closest but couples tracker + runtime + company metaphor.
- Convergent vocabulary across Plane/Linear/Paperclip: run/session, checkout/claim, in_review, awaiting input,
  activity types. deevy's Run should interoperate with this shape.
- Positioning question for the user: why deevy rather than contributing to It's a Plan or Paperclip?
# Research: Linear + GitHub agent features as of 2026-09-03

## Linear ("Linear for Agents", May 2025)
- Agents = OAuth apps authorized with actor=app -> unique app-user per workspace; appear in assignment dropdowns,
  @mentionable, not billable seats, cannot sign in / admin / manage users. Scopes app:assignable, app:mentionable.
- DELEGATE vs ASSIGNEE (July 2025): assigning to an app sets `delegate`, not `assignee`: "humans maintain ownership
  while agents act on their behalf". Views filter by Delegate; "My Issues" shows delegated issues with status
  (working / waiting on input / finished).
- Trigger: @mention or delegation auto-creates an **Agent Session**, fires AgentSessionEvent webhook (`created` with
  promptContext; `prompted` for follow-ups). Webhook must ack in 5s; agent must emit an activity or external URL in 10s
  or is marked unresponsive; stale after ~30 min without activity (recoverable).
- Session states: pending, active, error, awaitingInput, complete, stale (derived from activities).
  Activity types: thought, action(+result), elicitation, response, error; `prompt` is human-only. thought/action can be
  ephemeral. agentSessionUpdate carries externalUrls (PR links) and a `plan` (items pending|inProgress|completed|canceled).
- Agent Interaction Guidelines (AIG): clearly identified as agents; immediate feedback; expose state
  (thinking/waiting/executing/finished); humans can inspect reasoning/tool calls; disengage when asked;
  "final responsibility should always remain with a human".
- No generic approve/reject primitive for third-party agents; elicitation -> awaitingInput is the only ask-human path.
  Linear's own coding sessions: humans review diff in Reviews tab, approve, merge.
- No official agent-to-agent delegation. Cost: third-party agents not tracked; Linear's own sessions show token cost.
- Third-party agents: Codex, Cursor, Copilot, Factory, Sentry Seer, Devin, ChatPRD, Charlie, Codegen, Cyrus (Claude Code powered)...
  No first-party Claude Code delegate; Claude is an MCP connector. Deeplinks to coding tools with prefilled prompts.
- Linear MCP: https://mcp.linear.app/mcp (streamable HTTP, OAuth 2.1 dynamic client reg, /readonly variant).

## GitHub
- Copilot cloud agent: triggered by assigning an issue to Copilot, @copilot, Agents tab, REST agent-tasks API
  (POST /agents/repos/{o}/{r}/tasks; states incl. waiting_for_user). Runs in ephemeral Actions env, 59-min limit,
  pushes only to copilot/ branches or the PR branch, never main. Commits authored by Copilot, co-authored by the human
  who started the task, linked to the session log.
- Gates: Actions workflows on agent PRs require approval from a write user; "your approval of a Copilot PR won't count"
  if you requested it (requester != approver). Plan step: approve plan before code (Apr 2026). Copilot code review can
  give binding approvals since 2026-09-01 (admin-enabled).
- Sessions surfaced in Issues/Projects sidebar with queued / working / waiting for review / completed; session log shows
  reasoning, tools, token usage, length; steering costs credits.
- Third-party agents (Claude, Codex) as GitHub Apps "anthropic code agent"/"openai code agent"; Agent apps marketplace
  (June 2026). GitHub Apps have built-in [bot] identities with 1h installation tokens and fine-grained permissions.
- Agentic Workflows (gh-aw): markdown workflows; agent job read-only in firewalled container; writes only via declared
  safe-outputs applied in separate validated jobs.
- No cross-vendor agent-to-agent handoff documented. Billing: AI credits since 2026-06-01.

## Takeaways for deevy
- De facto agent-session protocol is converging (Plane, Linear): trigger webhook -> session/run -> activities
  (thought/action/elicitation/response/error) -> states (pending/active/awaitingInput/complete/error/stale).
  deevy's Run should speak this shape so existing agents (Cyrus, Codegen, Copilot-style) port easily.
- Open question surfaced: Linear keeps a Human as assignee and makes the agent a *delegate*. deevy must decide whether
  assigning to an Agent transfers ownership or whether every Issue keeps an accountable Human.
- Gaps confirmed: no generic human approval Gate for third-party agents; no agent-to-agent delegation; per-agent
  cost tracking only for first-party agents; everything agent-native is proprietary.
- Timeouts worth copying: ack fast, first activity within seconds, stale after N minutes, recoverable.
# Research: Jira, Asana, Notion, others vs agents as of 2026-09-03

## Jira / Atlassian
- Rovo agents have NO independent identity: act on behalf of the interacting user, capped by that user's permissions.
  "Agent Accounts and Access" (distinct accounts) is EAP only. Third-party agents (Claude Agent for Jira, Copilot,
  Cursor, Devin, Codegen) are Marketplace apps / service accounts that appear in the assignee picker.
- Triggers: assignee field, @mention, workflow transition action, board column "Add agents", automation rules
  (incl. scheduled), third-party coding agents as native automation steps (GA Aug 2026).
- Output: "Agents" section on the work item; output PRIVATE to the requester until they Publish (draft comment /
  attachment). "My agent sessions": Needs input / Working / Finished. Coding agents push branch + draft PR, never merge.
- Gates: private-until-published + draft PR + Needs input. No configurable per-action approval for Rovo agents.
- Subagents GA (parent routes to subagents); no assigned-agent-to-agent handoff documented.
- Cost: Rovo credits pooled per org, per-user monthly allotment, overage $0.01/credit from Dec 2026.

## Asana
- AI Teammates: role, permissions, responsibilities; assigned tasks like a member; @mention; checkpoints.
  Add-on, contact sales. MCP hosted (OAuth+PKCE, pre-registered app). Credits per billing account.

## Notion
- Custom Agents (Business/Enterprise): own permissions to granted pages, @mentionable, sidebar "Agents" section.
  External Agents (Claude, Cursor) assignable from boards since 3.6 (Jul 2026).
- Triggers: schedules, page/database/comment events, Slack events, email/calendar, webhooks (beta), MCP spawn-session.
- Sessions API/MCP: spawn / send message / stop / query sessions / list session events. Activity tab logs trigger,
  actions, errors; "every run is logged, visible and reversible". Sub-agents supported (cost credits).
- Credits $10/1000, pooled, per-agent per-run usage dashboard, alerts at 80/100%, auto-pause when exhausted.

## Others
- ClickUp Super Agents: assignable, mentionable, schedulable; **Approval Mode**: agent prepares drafts, pauses until a
  human approves. monday.com: continuous agents, AI Cost Center per team. Shortcut: agent teammates (Devin, Korey).
- Hiveship (waitlist): "agent-native tracker; agents get their own identity, sessions, full audit trail; MCP".
- Devin in Jira: service account via OAuth client-credentials so comments post as a bot; labels !plan/!implement.
  Codegen: dedicated Jira user "Codegen". Codex in Linear runs "using the account of the issue creator".
  Warp Oz, Factory, Charlie, OpenHands: assign/@mention -> activity updates -> PR link back.

## Takeaways for deevy
- Identity is the fault line: Jira/Codex-in-Linear impersonate the human; Linear/Plane/Notion/Paperclip give agents
  their own identity. deevy's ADR-0001 sits on the right side; Sponsor adds accountability none of them name.
- Approval patterns worth naming in the model: private-until-published (Jira), Approval Mode drafts (ClickUp),
  draft PR never merge (everyone), Needs input (everyone). deevy's Gate generalizes these as a workflow state.
- Per-agent per-run cost with budgets + auto-pause is table stakes in proprietary tools (Notion, Paperclip, monday) ->
  supports keeping Q4 #6 on the roadmap right after v1.
- Sessions API shape (spawn/send/stop/query events) recurs; deevy's Run + Event log should expose equivalents.
