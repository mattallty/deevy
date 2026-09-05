# UI redesign: vertical slices

Breakdown of the web UI redesign, 2026-09-05. Vocabulary is [CONTEXT.md](../../CONTEXT.md); the milestones
that built the SPA this replaces are [m1.md](./m1.md) through [m4.md](./m4.md). It is done when the daily loop
— find the work, read it, rule on a Gate, answer an Agent — is one screen with a keyboard, every screen can be
seen without a GitHub OAuth App, and the decisions are written into `.claude/skills/deevy-ui/SKILL.md` so the
next hundred UI changes are consistent.

Twelve slices, 0–11, in dependency order. Each is one PR on `ui-redesign` that leaves `vp check` and
`vp run -r test` green and ends with screenshots against the seeded dev instance. Slice 1 is a review
checkpoint: nothing after it starts until the frame, both themes and the token page have been looked at.

## Why

The SPA shipped as the thinnest possible projection of the core during M1–M4: a stock shadcn `sidebar-07`
shell, a "Work" group of two links and a flat "Settings" group of eleven, and every page an `<h1>` + one-line
description + Table inside a `max-w-5xl` column. No visual identity (slate tokens, no font, dark mode follows
the OS with no toggle), no keyboard model beyond `c`, no way to look at an Issue without leaving the list,
and an Issue page in which the Gate ruling — the thing a Human is most often there to do — sits fifth in a
vertical stack.

## Decisions taken

- **A distinct deevy identity**, not polished shadcn defaults: chosen typefaces, a palette that encodes
  Human vs Agent and Gate vs State. The `frontend-design` skill drives that; shadcn stays the component layer.
- **Linear-like information architecture**: dense, keyboard-first, ⌘K command palette, Issues as the home
  screen, a side-peek Issue view, Settings as its own area with its own sidebar.
- **Incremental rewrite on one branch**, screen by screen, tests kept green — not throwaway mockups.
- **A dev sign-in flag** so the real app runs locally without a GitHub OAuth App and every screen can be
  screenshotted and verified in the browser (slice 0, shipped).
- **Skills vendored in the repo**: shadcn (official), frontend-design (Anthropic), and `deevy-ui`, which
  records what each slice decides.
- **shadcn blocks from the official registry** as starting points where they fit, and four community
  registries under two hard constraints (below).
- **Markdown stays the one format** a Document is stored in; Humans get a Tiptap editor on top (below).

"Board" names the per-Project column view at `/projects/$key/board`, never a Project.

## What exists that this builds on

- **The GitHub stub already exists.** `apps/web/scripts/stub-github.js` replaces `globalThis.fetch` for
  `github.com/login/oauth/access_token` and `api.github.com/user{,/emails,/orgs}`; the OAuth `code` _is_ the
  email address. `apps/claude-agent/scripts/boot.ts:20` prepends it to the packed Node bundle,
  `apps/web/scripts/smoke-workers.ts:186` to the Worker. `acceptance.ts:63` (`signIn`) shows the whole dance:
  POST `/api/auth/sign-in/social` → read `state` from the returned URL → GET
  `/api/auth/callback/github?state=…&code=<email>` → session cookie. Nothing on deevy's side is mocked, and
  no Better Auth option changes — which is why it beats enabling `emailAndPassword` for dev.
- **`buildServer(env)`** in `apps/server/src/server.ts` assembles the Node app; `readEnv()` in
  `apps/server/src/env.ts` reads env. Both are tested in `apps/server/tests/server.test.ts`.
- **`createRouterClient(router, { context })`** (`apps/claude-agent/tests/helpers.ts:45`) drives real
  operations in-process as a given Member — the right tool for a seed script, because Events, notifications
  and Run state derive the way they do in production.
- **Core facts that shape screens.** `issues.list` requires `projectKey` (`operations/issues.ts:95`) — there
  is no Workspace-wide Issue list or search. `runs.list` refuses a Workspace-wide scan (`runs.ts:385`).
  `events.list` pages ascending from `after` only. `inbox.list` rows carry `issue` and the originating
  `event` (payload has the Run id / Gate State). `members.list` returns `kind` and `sponsorId`.
  `projects.update`, `projects.archive` and `agents.setSponsor` exist with no UI.
- **Test contracts.** Every SPA test queries by role/label. `stubClient(overrides)` in
  `apps/web/tests/stub-client.ts` merges shallowly per namespace; routed tests call
  `createAppRouter(ctx, { initialEntries })` then `await act(() => router.load())`. The names each slice
  must keep or change are listed per slice below.
- **`useLiveEvents`** (`apps/web/src/lib/live.ts:55-76`) invalidates `events`, all of `issues` on any
  Issue/Project Event, `projects`+`workflow`, `members`, `teams`, `allowlist` — and **not** `inbox`, `runs`,
  `comments`, `documents`, `links`. Six mutations call `queryClient.invalidateQueries()` with no key
  (`issue.tsx`, `gate-controls.tsx`, `agent.tsx`, `agents.tsx`, `workspace.tsx`, `workflow.tsx`).
- **Base UI, not Radix.** `Sheet` is `@base-ui/react/dialog`, `Command` is cmdk in that Dialog, `Combobox`
  is Base UI, `Kbd` and `Resizable` (`react-resizable-panels`) exist. 36 of 54 `components/ui/*` files are
  unimported; most are what the redesign needs (`command`, `kbd`, `avatar`, `popover`, `dropdown-menu`,
  `resizable`, `scroll-area`, `field`, `input-group`, `toggle-group`, `combobox`, `item`, `card`, `alert`,
  `spinner`, `switch`). `chart`, `carousel`, `calendar`, `input-otp`, `aspect-ratio`, `menubar`,
  `navigation-menu`, `slider`, `progress`, `radio-group`, `drawer`, `context-menu`, `hover-card`,
  `pagination`, `accordion` go in the last slice.

## Registries beyond `@shadcn` (checked 2026-09-05 with `pnpm dlx shadcn@latest view` from `apps/web`)

Two constraints, both hard: **open-source licence with no licence key**, and **no `@radix-ui/*` import** — deevy
is on Base UI, and a Radix item would pull a second primitive library into the bundle. The CLI already
resolves `@reui`, `@kibo-ui`, `@diceui` and `@coss` without any `components.json` change (`@originui` does
not resolve and is Radix/React Aria anyway).

| Registry                                                           | Licence                                                                                                                  | Primitives                                                                                                                                                                                                                   | Take                                                                                                                                                                                                                                                                                                          | Leave                                                                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `@reui` (reui.io, keenthemes/reui)                                 | MIT for the free registry items; "ReUI Pro" blocks/icons need `REUI_LICENSE_KEY` — never                                 | dual Radix/Base UI; the URL template is `/r/{style}/{name}`, so our `base-mira` style already returns the Base UI build (verified: `@reui/kanban` imports `@base-ui/react/merge-props` + `useRender`, dnd-kit, nothing else) | `kanban` (Board, slice 7), `data-grid` (TanStack Table + dnd-kit + `ui/button`; the base of `data-table.tsx`, slice 2)                                                                                                                                                                                        | anything whose docs page shows a Pro badge; `command` (view failed — use `ui/command`)                      |
| `@kibo-ui` (kibo-ui.com, shadcnblocks/kibo)                        | MIT, "free and open source, forever"                                                                                     | none of its own; composes our `ui/*` + dnd-kit / TanStack Table                                                                                                                                                              | `kanban` (fallback to ReUI's if its render-prop API fights ours; uses `ui/card`+`ui/scroll-area`), `list` (sortable list, for the Workflow States editor, slice 8), `table` (TanStack on `ui/table`+`ui/dropdown-menu`), `avatar-stack` (approvers, children assignees), `status` (reference for `RunStatus`) | `relative-time` (imports Radix), `gantt` (later, maybe a Run timeline; pulls `ui/context-menu`)             |
| `@diceui` (diceui.com, sadmann7/diceui)                            | MIT                                                                                                                      | own headless primitives, no Radix in `kanban`, `sortable`, `mention`                                                                                                                                                         | `sortable` (States editor reorder, slice 8)                                                                                                                                                                                                                                                                   | `mention` (mentions come from Tiptap's own extension inside the editor, slice 3), `data-grid` (view failed) |
| `@coss` (coss.com/ui, Cal.com's design system)                     | `apps/ui/` is MIT; the rest of the repo AGPL — take only `registry:ui`/`registry:block` items, which come from `apps/ui` | Base UI throughout, 577 items                                                                                                                                                                                                | pattern references, not copies: `p-command-1` (command palette with dialog), `p-group-23` (filter chip with multi-select combobox) for `issue-filters.tsx`, `@coss/style` as a second opinion on how a Base UI theme wires sidebar tokens                                                                     | `@coss/style` as our theme — we want deevy's, not Cal.com's                                                 |
| 9ui (9ui.dev)                                                      | MIT                                                                                                                      | Base UI                                                                                                                                                                                                                      | reading reference for Base UI idioms; no CLI namespace                                                                                                                                                                                                                                                        | copying: our `base-mira` set already covers it                                                              |
| Origin UI, Magic UI, Cult UI, Animate UI, Aceternity, shadcnblocks | mixed; several freemium                                                                                                  | Radix (or marketing motion)                                                                                                                                                                                                  | —                                                                                                                                                                                                                                                                                                             | all: Radix or off-brief                                                                                     |

Rules, recorded in `deevy-ui/SKILL.md`: `shadcn view` every item before `shadcn add`; refuse anything
importing `@radix-ui/*` or asking for a licence key; prefer items whose `registryDependencies` are names we
already have in `ui/`; every adopted file gets a header comment with source registry, item, date and
licence; new npm dependencies (`@dnd-kit/sortable`, `@tanstack/react-table`, `tunnel-rat`) go through the
catalog like everything else.

## Editing: markdown stays the source of truth (decided 2026-09-05)

Agents write Documents, descriptions and comments as markdown over MCP (`documents.write` takes `body:
string ≤ 100k`; `document_version.body` is text, versioned per author). That stays: **no schema change, no
MCP change, an Agent's write lands byte-for-byte, and a version diff is a text diff.** Humans get a rich
editor on top of it, not a second format under it.

- **`components/markdown-editor.tsx`** — Tiptap v3 (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`,
  MIT) with the official `@tiptap/markdown` (3.7+, bidirectional, CommonMark + GFM) as the only way in and
  out: `value` is markdown, `onChange` emits markdown, and the editor's JSON never leaves the component.
  Extensions: tables, task lists, code blocks (lowlight), links, `@tiptap/extension-mention` for Members
  and Teams (the suggestion popup keeps `role="listbox" aria-label="Mentions"`), a slash menu on
  `ui/command`, `⌘Enter` to submit. Two modes: `block` (Documents, description: full toolbar, headings,
  tables) and `inline` (comments, Gate notes, Run answers: one paragraph block, mentions, code spans).
- **A "Source" tab** beside "Edit" shows the markdown in a plain `Textarea` with `aria-label="Body"` —
  the test contract `documents.test.tsx` already has — so anything the WYSIWYG cannot model (raw HTML, a
  construct an Agent used) is visible and editable. CodeMirror 6 in that tab is a polish item, not v1.
- **Dirty-only serialization.** Opening a Document in the editor and closing it writes nothing; a save
  serializes only if Tiptap reports a change since load, so a Human reading an Agent's plan never
  normalises its markdown by accident. A save also shows a one-line diff summary when the serialized text
  differs from the loaded text in ways the Human did not type (the honest tell of lossy round-tripping).
- **Rendering** stays `react-markdown` + `remark-gfm` in `components/markdown.tsx`, plus `@shikijs/rehype`
  for code blocks (lazy-loaded languages) and the prose scale from the design brief. Read mode and edit
  mode share the same typography so switching does not reflow.
- **Loading.** The editor is `React.lazy`; the Issues list, Board and Inbox list never pay for Tiptap.
- **Rejected: BlockNote as the model.** Block-based Notion-style editing is the best-looking option, but it
  would make a Document two formats (its own bridge is named `blocksToMarkdownLossy` /
  `tryParseMarkdownToBlocks`, so a Human→Agent→Human round-trip silently normalises both sides),
  `@blocknote/shadcn` is Radix-based beside our Base UI, and it is MPL-2.0 to track. It is itself built on
  Tiptap, so going to Tiptap directly keeps the option of block UX later without the second format.

## Design brief (what slice 1 turns into tokens)

**Subject.** A tool a team of 2–10 lives in all day, where half the Members are programs. The one memorable
idea: _you can always tell who is a Human and who is an Agent, and what is waiting on a Human._ Everything
else is quiet.

**Type.** One family, two cuts, self-hosted (AGPL self-hosted app: no Google Fonts call):
`@fontsource-variable/ibm-plex-sans` (5.3.0) for UI and `@fontsource/ibm-plex-mono` (5.3.0) for Issue keys
(`DEV-42`), handles (`@planner`), Event kinds, API keys, Event seqs, and shortcut hints. Plex has character
without being Inter/Geist, and its mono shares the sans's x-height. Scale 12 / 13 (dense lists) / 14 / 16 /
20 / 28; tabular numerals on keys and times. Rows 32px compact, 40px comfortable; sidebar rows 28px. Radius
tightened to 6px from shadcn's 10px so density reads as intended.

**Color — semantic slots, both themes.** Proposal; the slots are the decision, the values are reviewed at
the slice 1 checkpoint on a `/dev/tokens` swatch page.

| Slot                                                  | Meaning                                                  | Light start             | Dark start            |
| ----------------------------------------------------- | -------------------------------------------------------- | ----------------------- | --------------------- |
| `--background` / `--foreground`                       | paper and ink: warm-neutral gray, not slate blue         | `#F7F6F3` / `#1C1B18`   | `#161513` / `#ECEAE4` |
| `--primary`                                           | the one action color: buttons, focus, selected row       | ink-blue `#1F3A5F`      | `#8FB3E0`             |
| `--human`                                             | a Human Member: avatar ring, chip                        | copper `#B3562C`        | `#E08B60`             |
| `--agent`                                             | an Agent Member: avatar ring, chip, Run rows             | teal `#1F7A6D`          | `#5FC2B0`             |
| `--gate`                                              | a State that is a Gate, and anything waiting on a ruling | amber `#B7791F`         | `#E7B04A`             |
| `--state-backlog` / `--state-active` / `--state-done` | non-Gate States by category                              | grays, blue-gray, green | same, lifted          |
| `--destructive`                                       | reject, revoke, delete                                   | `#A63D2F`               | `#E0705F`             |

Human, Agent and Gate are the only saturated colors on a screen. A Gate column, a Gate badge, the ruling
card and the inbox's "a Gate is waiting" row all carry `--gate`. Dark mode becomes a real toggle
(System / Light / Dark via `next-themes`, `attribute="class"`, persisted; the `@custom-variant dark`
in `index.css:4` finally does something).

**Layout.** Full-bleed app frame, no `max-w-5xl` column. 240px sidebar collapsing to 48px. List screens are
edge-to-edge tables with a 40px filter bar. The Issue side-peek is a 720px right panel; the Issue page is
main + sticky 300px rail. Cards only where a thing is a card (a Run, a Channel); lists are tables or rows.

**Motion.** Only in answer to an action (peek slide, palette open, selection). Nothing on load.

## Navigation model

### Primary sidebar (from `@shadcn/sidebar-07`, restyled)

```
┌──────────────────────┐
│ ◆ Flippable Team   ▾ │  Workspace name; menu: Settings, Theme, Sign out
│ [⌘K  Search or jump] │  opens the command palette
│ [+ New Issue      c] │
├──────────────────────┤
│ Inbox            ●3  │  the only badged item (inbox.unreadCount; aria-label "3 unread" kept)
│ My Issues            │  /?assignee=me
│ My Agents' Issues    │  /?assignee=agents:me — Agents I sponsor; hidden when none
│ All Issues           │  /
├ PROJECTS ────────── ▾┤  from projects.list
│ DEV  deevy      ⋯    │  → /projects/DEV ; ⋯ → Board, Workflow, Settings
│ WEB  Platform   ⋯    │
│ + New Project        │  admin
├──────────────────────┤
│ ⚙ Settings           │  → its own area
│ ◯ Ada Lovelace       │  MemberChip(me); menu: Theme, Sign out
└──────────────────────┘
```

### Settings area (`/settings/*`, a layout route with its own secondary nav, `@shadcn/sidebar-08` inset pattern; the primary sidebar stays collapsed to icons inside it)

| Group               | Pages                                                                          | Why together                                            |
| ------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Workspace           | General (h1 stays "Workspace"), Members, Teams, Allowlist, **Event log** (new) | who is in the Workspace and the record of what happened |
| Work                | Labels, Repositories                                                           | the vocabulary Issues are classified and linked with    |
| Agents and delivery | Agents (+ detail), Channels (with Routing), Webhooks                           | things that act inside deevy or reach outside it        |
| You                 | Notifications, MCP clients                                                     | the only two pages about the signed-in Human            |

### Command palette (`components/command-palette.tsx`, cmdk, `⌘K`)

Groups in order: **Actions on the focused Issue** (when a row is selected or an Issue is open: Assign to…
(Humans / Agents), Move to State… (Gate destinations labelled), Approve Gate / Reject Gate (opens the ruling
card focused — never commits from the palette), Add Label…, Set parent…, Copy key, Copy link, Open full
page) · **Create** (Issue, Project, Agent) · **Go to** (Inbox, My Issues, All Issues, each Project's
Issues/Board/Workflow, Settings pages) · **Issues** (by key or title through `issues.list`'s new `q`, slice 2) · **Help** (`?` shortcuts).

### Keyboard

`src/lib/shortcuts.ts`: `useShortcut(keys, handler, { scope })` with a scope stack so an open Sheet, Dialog
or palette owns the keys; `isTyping` moves here from `new-issue.tsx:53`.

| Keys                                  | Does                                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| `⌘K` · `c` · `?` · `⌘B`               | palette · New Issue (kept) · shortcuts sheet · toggle sidebar                           |
| `g i` / `g m` / `g a` / `g p` / `g s` | go to Inbox / My Issues / All Issues / Projects / Settings                              |
| `j` / `k` · `Enter` · `o` · `Esc`     | move selection · open in peek · open full page · close/clear                            |
| `a` / `s` / `l` / `p`                 | on a focused Issue: Assignee / State / Labels / Parent picker                           |
| `⇧A` / `⇧R`                           | on a focused Issue in a Gate: ruling card with Approve/Reject preselected, Note focused |
| `e` / `⇧E`                            | Inbox: mark read / mark all read                                                        |
| `⌘Enter`                              | submit the comment, answer or note being typed — the one submit key everywhere          |
| `[` / `]`                             | previous / next Document tab                                                            |

## Screens

**Sign-in** (`App.tsx` `SignedOut`, from `@shadcn/login-04`): left, the brand and a live legend that _is_
the palette (a Human chip, an Agent chip with Sponsor tooltip, a State dot, a Gate diamond); right, "Sign in
with GitHub" (name kept for `app.test.tsx`) and, only when `health.ping` reports `devSignIn`, an email field
and "Sign in as…" that performs the stub dance in the browser. `NotAMember` and `Suspended` share the frame.

**Home: Issues** (`/`, `routes/issues/list.tsx`):

```
┌ sidebar ┬──────────────────────────────────────────────────────┬─ peek 720px ─────────────┐
│         │ All Issues                          [⌘K] [+ New Issue]│ DEV-12  Ship the Event log│
│ Inbox ●3│ ┌Project▾┐┌State▾┐┌Assignee▾┐┌Human|Agent┐ Open●|Closed│ ◇ Intent Gate · waiting  │
│ My Iss. │ Group: State ▾                                        │ [ Approve ] [ Reject ]    │
│ All Iss.│ ◇ INTENT (Gate) ──────────────────────────────── 2    │ Note _____________________│
│ PROJECTS│ ▸ DEV-12 Ship the Event log     epic:Checkout  ◯ Ada  │ Assignee  ▢ planner       │
│ DEV     │   DEV-14 Slack approve buttons                ▢planner│ Labels · Parent · Links   │
│ WEB     │ ● BUILD ──────────────────────────────────────── 3    │ Description / Documents / │
│         │   DEV-9  Retry webhook backoff   backend      ▢builder│ Activity                  │
│ ⚙ Sett. │ ● DONE ───────────────────────────────────── 12  ▸    │ [Open full page  o]       │
└─────────┴──────────────────────────────────────────────────────┴───────────────────────────┘
```

Filters live in URL search (`?project=&state=&assignee=me|<id>|agents:me|none&kind=human|agent&open=&group=`)
so a view is a link. Grouping by State folds same-named States across Projects, done groups collapsed.
Rows: key (mono), title, Labels (2 + "+n"), `MemberChip`, relative updated; Gate glyph on Gate rows.
`j`/`k`/`Enter` → `?peek=DEV-12`. The Projects table moves to `/projects` (admin create/archive).

**Project** (`/projects/$key`): header (key, name, Team, Archived, description) and tab routes — **Issues**
(the same list, Project fixed, with the quick-add "New Issue" / "Add Issue" kept) · **Board** · **Workflow**
(moves from `/settings/workflow`, redirect kept one slice; a read-only StateBadge strip on top keeps
`aria-label="Workflow"`) · **Settings** (name, description, Team, Archive — `projects.update`/`archive`
get their first UI).

**Board**: dnd-kit kept, Gate-drop opens the ruling dialog ("Decide the Intent Gate on DEV-1" kept);
shared filter bar (the `Assignee` control stays a labelled native select — `board.test.tsx` fires `change`
on it); `section aria-label={state}` columns with StateBadge headers, Gate columns tinted; cards open the
peek. Peek is `modal={false}` on this route and closes on `onDragStart` (Base UI's modal Dialog sets
`pointer-events:none` behind it, which kills a drag).

**Issue view** — one component `components/issue-panel.tsx` for the peek, the page and the Inbox preview:

```
┌ DEV › DEV-12 ─────────────────────────────────────────────────┬─ rail 300px ──────────────┐
│ ⚠ Waiting on your ruling at the Intent Gate  →  [Rule now]    │ ◇ INTENT · Gate            │ ← banner only when ?gate= matches
│ Ship the Event log                                    [Edit]  │ ┌ role=group "Intent Gate"┐│
│ ◯ Ada opened 3d ago · ▢ planner assigned · 1 Run active       │ │ approvers · Note ______  ││
│ Description  markdown…                                        │ │ [Approve]   [Reject]     ││
│ Documents  [ intent ] [ spec ] [ plan ]        v3 ▾  [Edit]   │ │ decisions: ✗ rejected 2d ││
│ ## Problem …                                                  │ └──────────────────────────┘│
│ Activity   All | Comments | Changes | Runs                    │ Assignee   ▢ planner  ▾    │
│ ▢ builder  Run · active · started by assignment      [expand] │ Labels     epic:Checkout + │
│   ▸ thought  Reading intent v2…   ▸ action  Wrote plan v1     │ Parent DEV-3 · Children 2  │
│ ◯ Ada      commented  "First thought…"                        │ Links      PR #12 · 1 more │
│ ◯ Ada      moved Intent → Spec                                │ Runs  ▢ builder active     │
│ ┌ Comment ──────────────────────────── @handle  ⌘Enter ┐      │ Created 3d · Updated 2h    │
└───────────────────────────────────────────────────────────────┴────────────────────────────┘
```

The **Gate ruling card is the top of the rail, always** (`gate-ruling-card.tsx` from `gate-controls.tsx`;
`role="group" aria-label="Intent Gate"`, `data-focused`, `Note`, `Approve`, `Reject`, `Gate decisions`,
and the non-Gate `State` select all kept). When `?gate=` matches: ring + `scrollIntoView`, the banner with
"Rule now", and the peek opens with the rail expanded. Description is its own block; **Documents** keep
their `tablist aria-label="Documents"`. Comments, Events and Run cards merge into one `<ol aria-label=
"Activity">` (`activity-stream.tsx` + `activity-item.tsx`; the lists named "Timeline" and "Comments" go,
the "Comment" textarea/button and "Mentions" listbox stay). Title/description click-to-edit with "Edit" kept.

**Runs** (`run-card.tsx`): `article aria-label={run.id}` kept; Agent chip, `RunStatus`, "started by
assignment", elapsed, summary; Activity feed collapsed to the last three. Kinds: thought (muted italic),
action, elicitation (amber card), response (agent hue), error (destructive, mono), the Human's answer
(human hue). An `awaiting_input` Run is pinned to the top of the stream with a "Needs your answer" band and
the "Answer this Run" box (kept) — or "Waiting for approval" + "Open the Gate" link (kept) when it waits on
a Gate. `stale` reads "Gone quiet".

**Inbox** (`/inbox`): list 380px + preview pane (`ui/resizable`). Grouped by Issue (`aria-label=
"Notifications for DEV-1"`, `Mark read`, `Mark all read` kept), Unread/All, kind glyph coloured by slot.
Selecting a row shows `IssuePanel` compact with an **act bar** from the Notification kind: `gate_awaiting` →
the ruling card; `run_awaiting_input` → that Run's card and answer box (Run id from `event.payload`,
fallback `runs.list({ issueKey })`); `mention`/`assignment` → the composer focused. Acting marks the row
read. Under 1024px the preview is the peek.

**Settings** (`components/settings-page.tsx` template: `PageHeader` with each page's h1 kept, sections
with `FieldGroup`/`Field` forms, `DataTable`, destructive actions behind a confirm popover; 880px max).
**Agent detail** gains Change Sponsor (`agents.setSponsor`), Schedule, last ten Runs, Danger; keeps
"Sponsored by", `Projects`/`API keys` regions, `Revoke DEV`, `Grant a Project`, `Key name`, `Issue`, the
"only time" callout, the `claude mcp add` snippet. The Agents table keeps its `Schedule for <name>` select.

**Event log** (`/settings/events`, admin; the docs say it has no view): `DataTable` over `events.list` —
seq, time, kind (mono chip coloured by prefix), actor chip or "deevy", subject link, payload `<details>`;
filters Project / kind prefix / subject type; live through the existing `events` invalidation. Needs a
`before` input on `events.list` (one line in `operations/events.ts` + snapshot) for newest-first paging.

## Shared components (all in `apps/web/src/components/`, each with a `tests/kit.test.tsx` case)

`page-header.tsx` · `data-table.tsx` (on `ui/table`: client sort, sticky header, skeleton rows, `Empty`,
`rowLink`, density; row accessible names from the first cell so `findByRole("row", { name })` holds) ·
`member-chip.tsx` (Human round/`--human`, Agent squared/`--agent` dashed ring, Sponsor tooltip, suspended
desaturated; text content is the name) · `state-badge.tsx` (dot by category; Gate = amber diamond + visible
"Gate") · `run-status.tsx` (six statuses, wording from `issue-runs.tsx` kept) · `activity-item.tsx` ·
`kbd-hint.tsx` + `shortcuts-sheet.tsx` · `command-palette.tsx` (with a `FocusedIssueProvider`) ·
`side-peek.tsx` (reads `?peek=`) · `issue-filters.tsx` · `issue-panel.tsx` · `gate-ruling-card.tsx` ·
`run-card.tsx` · `activity-stream.tsx` · `settings-page.tsx`.

## Slices

### 0 — Sign in without GitHub, seed a Workspace worth looking at, install the skills (shipped)

- `DEEVY_DEV_STUB_GITHUB=1` → `devStubGithub` in `apps/server/src/env.ts`, refused when
  `NODE_ENV=production`. `apps/server/src/index.ts` (Node entry only; the Worker never sees it) imports and
  installs `apps/web/scripts/stub-github.js` when set, logging one loud line. The file stays where
  `boot.ts`/`smoke-workers.ts` prepend it; a test asserts the server imports that same file.
- `createApp` gets `AppOptions.devSignIn`; `health.ping` (`operations/system.ts`) reports `devSignIn:
boolean`; `buildServer` passes it. `vp run core#snapshot:openapi`, commit `openapi.json`.
- `App.tsx` `SignedOut`: when `health.ping` says so, an email field + "Sign in as…" doing the stub dance
  (POST `/api/auth/sign-in/social` → `state` → `location.assign('/api/auth/callback/github?state=&code=<email>')`).
- `apps/server/scripts/seed.ts`, `vp run server#seed` (a script: it writes). Opens the `.env` database
  (refuses if a Project exists, `--force` to wipe), then via `createRouterClient` as each Member creates:
  Ada (admin = `DEEVY_ADMIN_EMAIL`) and Grace as Humans; Planner and Builder as Agents sponsored by Ada with
  grants and keys; `DEV` (default six States) and `OPS` (Todo/Doing/Done); ~30 Issues across States with
  parents/children, plain and scoped Labels, Documents with two versions, comments with mentions, Runs in
  every status with Activities of every kind, approved and rejected Gate decisions, PR/branch Links, a Slack
  Channel + routing rule, a webhook with one failed delivery. Inbox and Event log fill themselves.
- `.claude/skills/shadcn/` (copy of `~/.claude/skills/shadcn`, `README.md` with provenance and "run UI work
  from `apps/web` so `shadcn info` finds `components.json`"), `.claude/skills/frontend-design/`
  (SKILL.md + LICENSE.txt from the official plugin), `.claude/skills/deevy-ui/SKILL.md` (this brief, the
  nav model, the test-contract table; grows per slice). `CLAUDE.md` gets a "UI" paragraph; this plan
  becomes `docs/plans/ui-redesign.md` in `m4.md`'s house style; `.env.example` and `docs/DEVELOPMENT.md`
  document the flag and the seed.
- Tests: `apps/server/tests/server.test.ts` (flag default false, refused in production, stub only under
  flag), `packages/core/tests/app.test.ts` (`health.ping.devSignIn`), `apps/web/tests/app.test.tsx` (dev
  form only when reported). `vp run claude-agent#acceptance` still passes.

### 1 — Tokens, type, theme, frame, palette, shortcuts (checkpoint; shipped)

`index.css` slots above + `--font-sans`/`--font-mono` via `@theme inline`; fontsource packages into the
catalog; `main.tsx` mounts `ThemeProvider`; `/dev/tokens` swatch/type page behind the dev flag. New
`shell.tsx` per the navigation model, `router.tsx` gains the `/settings` layout route with
`SettingsSidebar`, `command-palette.tsx` (navigation groups only), `src/lib/shortcuts.ts`, and the leaf
components `page-header`, `member-chip`, `state-badge`, `run-status`, `kbd-hint`. Existing pages render
inside the frame unchanged. `live.ts`: coalesce invalidations per frame, key `issues.get` by key and
`issues.list` by `projectId` from the Event, add `inbox`/`runs`/`comments`/`documents`/`links`, `staleTime:
5_000` on lists; replace the six bare `invalidateQueries()`; `live.test.tsx` asserts one Event → one list
refetch. Tests: `shell.test.tsx` asserts Inbox / My Issues / All Issues / Project links in the primary
sidebar and Members / Agents / Allowlist inside the Settings sidebar at `/settings/workspace`;
`inbox.test.tsx` "2 unread" unchanged. **Stop here for review of the frame, both themes, the swatch page.**

What shipped differently in slice 1: the type scale is set in `components/ui` rather than by tokens alone —
shadcn's `base-mira` style is the compact one (12px controls, 10px badges) and read too small, so those files
are resized to 14px controls with 32px heights while the root stays 16px; New Issue sits in the page's top bar
rather than the sidebar, where the owner looked for it; the sidebar's "My
Issues" and "My Agents' Issues" wait for the Issues home in slice 2, since they would link to a screen that
does not exist yet; and the palette navigates and creates only, as planned, with its Issue search arriving
with `issues.list`'s `q`. cmdk's transitive Radix dependency is recorded in `deevy-ui` as the one exception
to the no-Radix rule.

### 2 — Issues home, filters, side peek

Core: `issues.list` gets optional `projectKey` (absent = whole Workspace, Agents still scoped to grants)
and optional `q` (key or title substring) — one query per screen instead of a per-Project fan-out, which
matters on D1's per-invocation budget; snapshot regenerated; `packages/core/tests/issues.test.ts` covers
both. SPA: `routes/issues/list.tsx`, `issue-filters.tsx` (filter chips after `@coss/p-group-23`'s pattern on
`ui/combobox`), `data-table.tsx` (built on `@reui/data-grid` — TanStack Table, column sorting/pinning,
`ui/button` — wrapped so pages see the `DataTable` props above; `@kibo-ui/table` is the simpler fallback),
`side-peek.tsx`, a first `issue-panel.tsx` wrapping today's page body; `routes/projects/projects.tsx` at `/projects` holds the old
table and `NewProjectDialog`; the palette's Issues group uses `q`. Tests: `shell.test.tsx`'s root h1 →
"All Issues"; `projects.test.tsx` mounts `/projects` (names kept); new `issues-home.test.tsx` (filters in
URL, group headers, `Enter` → peek, `o` → page).

### 3 — MarkdownEditor and renderer

`components/markdown-editor.tsx` as specified above (Tiptap v3 + `@tiptap/markdown`, block and inline
modes, Mention extension fed by `members.list` + `teams.list`, slash menu on `ui/command`, Source tab as a
`Textarea aria-label="Body"`, dirty-only serialization, lazy-loaded); `components/markdown.tsx` gains
`@shikijs/rehype` and the prose scale. New catalog entries: `@tiptap/react`, `@tiptap/pm`,
`@tiptap/starter-kit`, `@tiptap/markdown`, `@tiptap/extension-mention`, `@tiptap/extension-table`,
`@tiptap/extension-task-list`, `@tiptap/extension-code-block-lowlight`, `lowlight`, `@shikijs/rehype`,
`shiki`. Wired into `issue-documents.tsx` ("Edit intent" → editor with Source tab; "Save version" kept;
"Version" select kept) and the description editor ("Title"/"Description" labels kept); the comment
composer switches in slice 4. Tests: `documents.test.tsx` drives the Source tab (`Body`), so it stays
green in jsdom; new `markdown-editor.test.tsx` covers markdown in → markdown out for headings, lists,
tables, code, task items, mentions (`@ada` → `@ada`), and that an untouched load saves nothing.

### 4 — Issue panel: two columns, ruling card, Activity stream

`issue.tsx` thins to `IssuePanel` page mode; `gate-controls.tsx` → `gate-ruling-card.tsx` (Note via the
inline editor); `issue-timeline.tsx` + `issue-comments.tsx` → `activity-stream.tsx`/`activity-item.tsx`,
the composer on the inline `MarkdownEditor` (its Mention popup keeps `role="listbox" aria-label=
"Mentions"`; the `Comment` textarea contract moves to the composer's Source fallback or the test types
into the editor's contenteditable — decide in the slice, keep the "Comment" button); `label-picker.tsx` →
rail `Popover`+`Command`; `issue-links.tsx` → rail; approver and children avatars as
`@kibo-ui/avatar-stack` of `MemberChip`s. Tests: `issues.test.tsx` and `comments.test.tsx` query within
"Activity"; `gates`, `links`, `labels`, `documents` unchanged; new `?gate=` banner case.

### 5 — Runs

`issue-runs.tsx` → `run-card.tsx`; kinds in `activity-item.tsx`; pinned `awaiting_input` Run; the answer box on the inline editor ("Answer this Run" kept).
`runs.test.tsx` unchanged; new cases per kind and for the pin.

### 6 — Inbox that you act from

Two panes, act bar, `e`/`⇧E`. `inbox.test.tsx` unchanged; new cases: `gate_awaiting` row → Approve/Reject
in the preview, approving calls `gates.approve` then `inbox.markRead`; `run_awaiting_input` row → "Answer
this Run".

### 7 — Board

The hand-rolled dnd-kit columns are replaced by `@reui/kanban` (Base UI `useRender` API, `onMove` callback
so a drop out of a Gate column still opens the ruling dialog instead of moving; `@kibo-ui/kanban` is the
fallback); shared filters, `StateBadge`, `MemberChip`, peek-on-click, non-modal peek + close on drag start.
`board.test.tsx` unchanged (columns stay `section aria-label={state}` through the `render` prop); a jsdom
pointer-sequence test for drag-with-peek.

### 8 — Project tabs, Project settings, Workflow route

Tab routes; `workflow.tsx` at `/projects/$key/workflow` with a redirect from the old path, its States
reordered by drag with `@diceui/sortable` (the `Move X up/down` buttons stay for the keyboard and the tests);
`project-settings.tsx` on `projects.update`/`archive`. `gates.test.tsx`, `workflow.test.tsx` mount the new
path; `projects.test.tsx` "Workflow" list moves with the strip.

### 9 — Settings template, eleven pages, Agent detail

`settings-page.tsx`; every `routes/settings/*.tsx` re-laid on it; native selects → `Select`/`Combobox`
except the approvers multi-select (→ `Command` multi-picker, same `aria-label`) and the Board `Assignee`;
`agent.tsx` sections above. The fourteen settings suites keep their names; `agents.test.tsx` scopes the
schedule lookup to the table.

### 10 — Event log

`routes/settings/events.tsx`, `events.list` `before` input + snapshot, `docs/OPERATIONS.md` points at it.
New `event-log.test.tsx`.

### 11 — Polish, mobile, prune, skill

Mobile is **read-and-rule** only: sidebar offcanvas, peek as full-screen Sheet, Inbox single pane, Issue
page rail stacked with the ruling card first, Board scrolls without drag. Palette Issue actions; shortcuts
sheet; `aria-live` on the Gate banner and Run band; sign-in from `login-04`; delete the unused `ui/*`;
`docs/screens/` from the seeded instance; `deevy-ui/SKILL.md` final (tokens, components, templates,
keyboard map, contract table); `docs/plans/ui-redesign.md` records what shipped differently.

## Risks and how the slices carry them

- **dnd-kit vs Base UI Sheet** — non-modal peek on the Board route, close on `onDragStart` (slice 7).
- **Shortcut letters vs editors** — scope stack; `⌘Enter` is the only submit; `⇧A`/`⇧R` never commit (slice 1).
- **SSE invalidation storms** with more queries mounted — `live.ts` rework and keyed invalidations (slice 1).
- **Accessible names are the contract** — slices 1, 2, 4, 8 change names on purpose (listed); `kit.test.tsx`
  catches a restyle that drops the visible "Gate" text before the Board test does.
- **Dev sign-in leaking** — refused under `NODE_ENV=production`, Node entry only, seed refuses a populated
  database; all tested in `apps/server`.
- **Third-party registry items** — each is vetted by `shadcn view` for `@radix-ui` imports and licence
  before `add`; a registry that later goes paid or Radix costs us nothing because the files are ours.
- **Core changes** are three and small: `health.ping.devSignIn`, `issues.list` optional `projectKey` + `q`,
  `events.list` `before`. Each regenerates `openapi.json`.

## Critical files

`apps/server/src/{env,index,server}.ts`, `apps/server/scripts/seed.ts` (new), `apps/web/scripts/stub-github.js`,
`packages/core/src/operations/{system,issues,events}.ts`, `packages/core/src/app.ts` ·
`.claude/skills/{shadcn,frontend-design,deevy-ui}/`, `CLAUDE.md`, `docs/plans/ui-redesign.md`,
`docs/DEVELOPMENT.md`, `.env.example` · `apps/web/src/{index.css,main.tsx,App.tsx,router.tsx}`,
`routes/shell.tsx`, `lib/live.ts`, `lib/shortcuts.ts` (new), the components listed above, every
`routes/**` page in slice order, `pnpm-workspace.yaml` catalog · every `apps/web/tests/*.test.tsx` a slice
names.

## Verification

- Every slice: `vp check`, `vp run -r test`, `vp run web#build:workers && vp run web#check:workers` (the
  Worker build catches a `node:` leak; the stub is only reachable from `apps/server/src/index.ts`).
- Slice 0: `DEEVY_DEV_STUB_GITHUB=1 vp run -r --parallel dev`, `vp run server#seed`, sign in as `ada@…` in
  the Browser pane, walk every route; `vp run claude-agent#acceptance` passes unchanged.
- Slices 1–11: screenshots of each rebuilt screen in light and dark, desktop and 390px, empty and seeded;
  keyboard paths driven with `computer` key presses; `read_console_messages` clean; a Run's `?gate=` URL
  lands with the ruling card focused.
- Checkpoint after slice 1 before slice 2 begins.
