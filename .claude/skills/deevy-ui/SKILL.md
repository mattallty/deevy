---
name: deevy-ui
description: How deevy's web UI (apps/web) is designed and built — the visual language for Humans, Agents and Gates, the navigation model, which shadcn registries and editor are used and why, and the test contracts a screen must keep. Load before touching anything under apps/web/src or apps/web/tests.
---

# deevy UI

deevy is project management where Humans and Agents are peers on the same Issues (CONTEXT.md). The UI's one
memorable idea: **you can always tell who is a Human and who is an Agent, and what is waiting on a Human.**
Everything else is quiet. This skill records the decisions of the 2026-09 redesign
(`docs/plans/ui-redesign.md`); each slice of that plan appends what it settled. Read `shadcn` (component
rules) and `frontend-design` (design process) beside it.

## Ground rules

- Vocabulary is CONTEXT.md's, in code, copy and tests: Member, Human, Agent, Sponsor, Workspace, Project,
  Issue, State, Gate, Run, Activity, Document, Event, Notification, Channel. "Board" is the column view of a
  Project, never a Project. Never "ticket", "task", "status", "user", "bot".
- **Base UI, not Radix.** `apps/web/components.json` is `"style": "base-mira"`. Custom triggers use
  `render={<Link … />}` (and `nativeButton={false}` on a Button that renders an anchor), never `asChild`.
  Nothing under `apps/web` may import `@radix-ui/*`.
- Work from `apps/web` so the `shadcn` skill's `shadcn info` finds `components.json`. Add components with
  `pnpm dlx shadcn@latest add <item> --overwrite`; it rewrites `pnpm-workspace.yaml` and pins versions, so
  move new dependencies to the catalog and restore the file's comments.
- Markdown is the source of truth for Documents, descriptions and comments (Agents write it over MCP). An
  editor may render it richly; it stores markdown and never a second format.
- Every screen is verified in the browser through the stubbed dev instance (below), in both themes.

## Running the app without an OAuth App

`DEEVY_DEV_STUB_GITHUB=1` makes the Node server import `apps/web/scripts/stub-github.js` — the same stub the
acceptance walk and the Workers smoke prepend to their bundles — so the OAuth `code` is the email address and
the signed-out page offers "Sign in as this email". Refused under `NODE_ENV=production`. The Worker never has
it. `health.ping` reports `devSignIn`, which is how the SPA knows to show the form.

```bash
# in .claude/launch.json as "dev:stub": the stubbed instance on its own database file
DEEVY_DEV_STUB_GITHUB=1 DEEVY_DATABASE_PATH=./data/stub.sqlite vp run -r --parallel dev
DEEVY_DATABASE_PATH=./data/stub.sqlite vp run server#seed        # a Workspace worth looking at
```

`vp run server#seed` (`apps/server/src/seed.ts`, a second `vp pack` entry) signs in the admin
(`DEEVY_ADMIN_EMAIL`) and `grace@<the admin's domain>` through the stub, creates the Agents `Planner` and
`Builder` sponsored by the admin, two Projects (`DEV` with the default six States, `OPS` with Todo/Doing/Done),
~35 Issues, Documents, comments with mentions, Runs in every status, Gate rulings, Links, a Slack Channel,
routing and a webhook — all through the operations, so the inbox and the Event log fill themselves. It
refuses a database that already has a Project unless `--force` (which removes the file). Sign in as either
Human with the dev form.

## Registries

Two hard constraints on anything added from a registry: **an open-source licence with no licence key**, and
**no `@radix-ui/*` import**. Run `pnpm dlx shadcn@latest view <item>` before `add` and read the imports.
Verified 2026-09-05:

| Namespace                                                          | Licence                 | Use                                                                                                 | Do not use                                              |
| ------------------------------------------------------------------ | ----------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `@shadcn`                                                          | MIT                     | everything in `components/ui`; blocks `sidebar-07`, `sidebar-08`, `login-04` as starting points     | —                                                       |
| `@reui`                                                            | MIT (free items)        | `kanban`, `data-grid` — its `/r/{style}/{name}` URL returns the Base UI build for our style         | anything with a Pro badge; never set `REUI_LICENSE_KEY` |
| `@kibo-ui`                                                         | MIT                     | `kanban`, `list`, `table`, `avatar-stack`, `status` — compose our `ui/*` + dnd-kit / TanStack Table | `relative-time` (Radix), `gantt` for now                |
| `@diceui`                                                          | MIT                     | `sortable`                                                                                          | `mention` (Tiptap's extension does it), `data-grid`     |
| `@coss`                                                            | MIT for `apps/ui` items | pattern references: `p-command-1`, `p-group-23`, `style`                                            | as our theme                                            |
| Origin UI, Magic UI, Cult UI, Animate UI, Aceternity, shadcnblocks | mixed                   | —                                                                                                   | Radix or off-brief                                      |

Every adopted file starts with a comment naming the registry, item, date and licence. New npm dependencies
go through the catalog.

## Design language (slice 1 turns this into tokens; values are reviewed there)

- **Type.** IBM Plex Sans (variable, `@fontsource-variable/ibm-plex-sans`) for UI; IBM Plex Mono
  (`@fontsource/ibm-plex-mono`) for Issue keys, `@handles`, Event kinds, API keys, seqs, shortcut hints.
  Self-hosted; no Google Fonts. Scale 12 / 13 / 14 / 16 / 20 / 28; tabular numerals on keys and times.
  Rows 32px compact, 40px comfortable; sidebar rows 28px; radius 6px.
- **Color slots.** `--human` (copper) for a Human Member; `--agent` (teal) for an Agent; `--gate` (amber)
  for a Gate State and anything waiting on a ruling; `--state-backlog|active|done` for other States;
  `--primary` (ink-blue) for the one action colour; warm-neutral paper and ink, not slate. Those three
  saturated slots are the only saturated colours on a screen. Both themes; a real System/Light/Dark toggle.
- **Layout.** Full-bleed frame, 240px sidebar collapsing to 48px, edge-to-edge lists with a 40px filter bar,
  720px side-peek, Issue page = main + 300px rail with the Gate ruling card always on top. Cards only for
  things that are cards (a Run, a Channel).
- **Motion** only in answer to an action. Nothing on load.

## Navigation and keyboard (slice 1)

Primary sidebar: Inbox (the only badge) · My Issues · My Agents' Issues · All Issues · Projects (listed) ·
Settings (own area with its own sidebar: Workspace / Work / Agents and delivery / You) · the Member's chip.
`⌘K` palette; `c` new Issue; `?` shortcuts; `g i/m/a/p/s` go to; `j`/`k`/`Enter`/`o`/`Esc` in lists;
`a`/`s`/`l`/`p` pickers on a focused Issue; `⇧A`/`⇧R` open the ruling card (never commit); `⌘Enter` is the
only submit key. `src/lib/shortcuts.ts` owns a scope stack: an open Sheet, Dialog or palette owns the keys.

## Test contracts

Tests in `apps/web/tests` query by role and accessible name, mock `lib/orpc` with
`tests/stub-client.ts` (shallow merge per namespace), and mount routes with
`createAppRouter(ctx, { initialEntries })` + `await act(() => router.load())`. Names a redesign keeps unless a
slice says otherwise: `Sign in with GitHub`; `New Issue` / `Create Issue` / `Add Issue`; `role=table` rows
`DEV-1 · title · Build · Ada Lovelace`; `role=region` per Board column named by State with visible `Gate`;
`Decide the Intent Gate on DEV-1`; `role=group` `… Gate` with `data-focused` for `?gate=`; `Note`, `Approve`,
`Reject`, `Gate decisions`, `State`; `tablist Documents`, `Edit intent`, `Body`, `Save version`, `Version`;
`Notifications for DEV-1`, `Mark read`, `Mark all read`, `N unread`; `Comment` (textarea and button),
`listbox Mentions`; `article` named by Run id, `Answer this Run`, link `/gate/`; `Add a link`, lists
`Pull requests`/`Links`; `role=group Labels`; the settings h1s (`Workspace`, `Members`, `Agents`, …),
`Schedule for <name>`, `Grant a Project`, `Key name`, `Issue`, `Revoke DEV`, `Sponsored by`, `only time`;
`Approvers for <State>`, `Save Workflow`, list `States`. Slices 1, 2, 4 and 8 of the plan change names on
purpose and update the tests with them.
