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

## What slice 1 settled (tokens, frame, palette, shortcuts)

- **Sizes live in `components/ui`.** shadcn's `base-mira` is the compact style — 12px controls, 10px badges
  and kbd, 28px buttons. deevy resizes those files (button, input, textarea, native-select, select, label,
  table, badge, kbd, sidebar, dropdown-menu, command, dialog) to a 14px control size with 32px heights; the
  root stays 16px so 1rem is 16px everywhere. Scale: `text-xs` 12px for meta and badges, `text-sm` 14px for
  everything a person operates or reads in a row, `text-base` 16px for prose, `text-xl` 20px for a page
  title. A `shadcn add --overwrite` of one of those files brings the compact sizes back — re-apply them.
- **Theme is a class.** `next-themes` (`attribute="class"`, system default) sets `.dark` on `<html>`; tokens
  live on `:root` and `.dark`, never in a media query. The Member menu in the sidebar footer holds the toggle.
- **Shortcuts** go through `src/lib/shortcuts.ts` — `useShortcut("g i", …)`, `useShortcut("mod+k", …,
{ global: true })`, `useShortcutScope(name, active)` on anything modal — never a raw `keydown` listener.
  Plain letters are ignored while typing; `mod+…` is not. `Shortcut keys="…"` (`kbd-hint.tsx`) draws one.
- **Navigation.** The primary sidebar is `routes/shell.tsx`; the Settings area's nav is `settingsNav` in
  `routes/settings/layout.tsx`, shared with the palette so a page has one name everywhere. Settings routes are
  children of the `/settings` layout route, each declared with a literal path: a helper that takes `path:
string` erases the literal and every typed `to` in the app stops compiling.
- **Palette.** `components/command-palette.tsx` on `ui/command`. This shadcn version's `CommandDialog` puts
  its children straight into the Dialog, so the cmdk `<Command>` root is ours to add inside it. cmdk itself
  depends on `@radix-ui/react-dialog` and friends — the one sanctioned transitive Radix dependency, because
  it is what shadcn ships for Base UI projects too; nothing under `apps/web/src` imports Radix directly.
- **Base UI menus.** A `DropdownMenuLabel` must sit inside a `DropdownMenuGroup` (or a radio group) or the
  menu throws the moment it opens. Make a menu's trigger the DOM button itself (`DropdownMenuTrigger
className={sidebarMenuButtonVariants(...)}`), not `render={<SidebarMenuButton/>}`: a `tooltip` there turns
  the button into a Tooltip wrapper and the click has nowhere to land. `tests/shell.test.tsx` opens the menu.
- **Layout facts.** shadcn's `SidebarInset` _is_ the `<main>` landmark — a page never renders another. Under
  768px the sidebar is a Sheet behind the trigger; review screens at ≥1280px. The New Issue dialog is owned
  by `NewIssueProvider` in the shell, so the button, the palette and `c` open the same one (`useNewIssue()`).
- **Live updates.** `lib/live.ts` maps an Event's `subjectType` to the query keys it may have changed
  (`keysFor`) and coalesces invalidations per 16ms; mutations invalidate by key, never `invalidateQueries()`
  bare. `QueryClient` has `staleTime: 5_000`.
- **jsdom stubs** live in `tests/setup.ts`: `matchMedia`, `ResizeObserver`, `scrollTo`, and
  `Element.prototype.scrollIntoView` (cmdk needs it).

## What slice 2 settled (Issues home, filters, peek)

- **`issues.list` is Workspace-wide when no `projectKey` is given** (newest change first, no cursor) and
  takes `q` — an Issue key, a number, or a word of the title. Its REST path is `/issues`, with everything as
  query parameters; MCP and RPC callers name it the same as before. One list per screen, never a fan-out.
- **Filters live in the URL** (`components/issue-filters.tsx`: `IssuesSearch`, `parseIssuesSearch`), so a
  view is a link and Back undoes a filter. The server filters Project, Assignee, open and `q`; State (by
  name, folded across Projects), Human/Agent and "my Agents" fold client-side. `assignee=me` becomes the
  Member id from `me.get`; `agents:me` is the Agents whose `sponsorId` is me.
- **`components/data-table.tsx`** is hand-rolled on `ui/table`: client sort per column, group rows that
  fold, skeleton, `Empty`, `aria-selected` on the keyboard row. No TanStack Table — it went to v9 with a new
  API and this list needs none of a grid. A row's accessible name is its text.
- **`components/side-peek.tsx`** renders the whole `IssuePage` in a right Sheet (`sm:max-w-[720px]`),
  keyed by `?peek=`. Base UI names the dialog from `SheetTitle` (`aria-labelledby` beats `aria-label`), so
  a test finds it by `/DEV-1/`. It pushes the `peek` shortcut scope; `o` opens the full page; `Esc` closes.
- **Keyboard on a list**: `j`/`k`/arrows move `aria-selected`, `Enter` peeks, `o` opens, `Esc` clears — bound
  by the page with `useShortcut`, not by the table.
- The sidebar has My Issues (`/?assignee=me`), My Agents' Issues (Sponsors only), All Issues (`/`) and
  Projects (`/projects`); `g m` / `g a` / `g p`. The palette searches Issues from two characters.

## What slice 3 settled (the editor)

- **`components/markdown-editor.tsx`** is the one editor: markdown in, markdown out, `mode="block"`
  (Documents, descriptions) or `"inline"` (comments, notes, answers), Edit/Source tabs. The Source view is a
  plain `Textarea` with `aria-label="Body"`, always mounted (hidden by class), so tests type there and a
  Human can always see the text as an Agent wrote it. `⌘Enter` submits in both views (`onSubmit`).
- **`components/tiptap-editor.tsx`** (lazy) is Tiptap 3.31 with `@tiptap/markdown` (GFM), StarterKit,
  `TableKit`, `TaskList`/`TaskItem`, lowlight code blocks, Placeholder. It emits `editor.getMarkdown()` only
  on a user transaction; a `value` changed from outside is loaded with `emitUpdate: false`, so an untouched
  load never re-serializes. `editorExtensions()` and `toMarkdown()` are exported so a test round-trips
  through a headless `Editor` with exactly the component's extensions.
- **Mentions are text.** `@` opens a `@tiptap/suggestion` popup (`role="listbox" aria-label="Mentions"`)
  fed by `useMentionables()` (`lib/mentions.ts`: Members and Teams by handle) and inserts `@handle ` as plain
  text — no Mention node, so markdown round-trips exactly and the server resolves handles as before. `/` at a
  line start opens the block menu (`aria-label="Commands"`) the same way. Two suggestion plugins need two
  `PluginKey`s or ProseMirror throws.
- **Highlighting is lowlight in both places**: `rehype-highlight` in `components/markdown.tsx`, the code
  block extension in the editor, colours from the palette in `index.css` (`.hljs-*`). Not shiki: its rehype
  plugin is async and `react-markdown` runs its pipeline synchronously. `proseClassName` is shared by the
  reader and the editor so switching does not reflow.
- **jsdom** needs `Range.prototype.getClientRects/getBoundingClientRect` and `document.elementFromPoint`
  stubbed for ProseMirror to mount (`tests/setup.ts`).

## What slice 4 settled (the Issue view)

- **One component, two shapes.** `routes/issues/issue.tsx` renders the Issue page and the peek. The root is
  `@container`; the grid is one column below `@3xl` (the 720px peek) and `minmax(0,1fr) 300px` above. In one
  column the rail comes first (`-order-1`), so the Gate ruling is still the first thing seen.
- **The Gate ruling card is the top of the rail, always** — `GateControls` inside `role="group"
aria-label="<State> Gate|State"`, with `data-focused` and a `role="status"` banner ("Waiting on your
  ruling…", button "Rule now") when `?gate=` names the current State. Then Assignee (a `Select` of
  `MemberChip`s, `aria-label="Assignee"`), `LabelPicker` (`role="group" aria-label="Labels"`, toggles named
  by label text), children, `IssueLinks` (lists named by kind, `Add a link`).
- **`components/activity-stream.tsx`** folds `comments.list` and `events.list` (subject issue) into one
  `<ol aria-label="Activity">` in time order, skipping `comment.*` Events; a filter All / Comments / Changes;
  the composer is the inline `MarkdownEditor` with `id="new-comment"` and `aria-label="Comment"`, button
  "Comment". The lists once named "Timeline" and "Comments" are gone; tests query within "Activity".
- **Mentions in Source too.** `MarkdownEditor` given `mentions` shows the same `role="listbox"
aria-label="Mentions"` under its textarea when `@handle` is being typed there, so the Source view and the
  comments test both have it.
- **Sheet width.** shadcn's `SheetContent` sets `data-[side=right]:sm:max-w-sm`; to widen it, use the same
  variant chain (`data-[side=right]:sm:max-w-[720px]`) or the narrower class wins.

## What slice 5 settled (Runs)

- **`components/run-card.tsx`** exports `IssueRuns` (the section on an Issue) and `RunCard`. Each card is
  an `article` named by the Run id: the Agent's `MemberChip`, `RunStatus` (label "Waiting for approval"
  when the Run waits on a Gate), "started by <trigger>", elapsed time, the summary, and the Activity feed as
  `<ol aria-label="Activity of <id>">` with `li[data-kind]` per Activity — thought (muted italic), action,
  elicitation (gate hue), response (agent hue), error (destructive, mono), prompt (human hue). Feeds fold to
  the last three unless pinned or expanded.
- **The Run owed a Human comes first** (`data-pinned`), open, with a "Needs your answer" band and a plain
  `Textarea` named "Answer this Run" (⌘Enter sends) — a textarea, not the editor, because the runs test asks
  for one textbox and a reply to an Agent is a sentence. A Run waiting on a Gate shows "Open the Gate" and
  no answer box: the ruling card is the only place a Gate is decided (ADR-0004).
- `MarkdownEditor`'s Source textarea is hidden with the HTML attribute, so it is never a second textbox to a
  role query while a label still finds it.

## What slice 6 settled (the Inbox)

- **Two panes** (`ui/resizable`, `orientation="horizontal"`, sizes in percent) above 1024px: the list on the
  left, the selected Notification's Issue on the right as the full `IssuePage` with `focusGate` when the
  kind is `gate_awaiting`, so the ruling card and its banner are in front. Below 1024px the preview is the
  `SidePeek`. The selection and the Unread filter ride in the URL (`?n=`, `?unread=1`).
- **Opening marks read** — reading is what was owed — and `e` / `⇧E` / `j` / `k` / `o` work on the list.
  Rows keep `Notifications for <key>` lists, `Mark read` (unread only, `stopPropagation` so it does not also
  open) and `Mark all read`; the kind glyph is coloured by what is owed (Gate, Agent, Human).
- **Search parsing**: TanStack Router parses a raw URL's `?unread=1` / `?open=0` as numbers and `navigate()`
  hands strings; every `parse*Search` reads both.
- **`Shortcut` hints are `aria-hidden`** (`data-slot="shortcut"`, `data-keys`), so a hint inside a button
  never joins its accessible name. Tests reach one by `data-slot`, never by label.

## What slice 7 settled (the Board)

- **`components/reui/kanban.tsx`** is `@reui/kanban` (Base UI build, MIT, header says so), edited once:
  `process.env.NODE_ENV` became `import.meta.env.DEV` because the browser tsconfig has no Node types. Registry
  files live under `components/<registry>/`, not `ui/`, so a re-add cannot clobber shadcn's own.
- **The Board** (`routes/projects/board.tsx`) gives the kanban `value` (a `Record<stateId, Issue[]>`) and an
  `onMove` callback, so it never applies a move itself: a card leaving a Gate column opens the ruling dialog
  ("Decide the <State> Gate on <key>", dialog with Approve/Reject) and anything else is `issues.move`.
  Columns are `KanbanColumn render={<section data-slot="board-column" aria-label={state.name}/>}` with the
  `StateBadge` header (visible "Gate"), `disabled` so columns do not reorder. A click on a card opens the
  peek (`?peek=`); the peek is `modal={false}` here and `onDragStart` closes it.
- **Filters** are the shared `IssueFilters` with `hideProject` and `nativeAssignee` — the Assignee is a plain
  `<select>` on the Board because its test drives it with a change event.

## What slice 8 settled (the Project)

- **`/projects/$key` is a layout route** (`ProjectLayout`: header, `ul aria-label="Workflow"` strip of
  `StateBadge`s, `nav aria-label="Project"` tabs) with children `/` (Issues: quick-add "New Issue"/"Add
  Issue" + the Issues home `embedded` and `fixedProject`), `board`, `workflow`, `settings`
  (`projects.update`/`archive`), and `settings/workflow` redirecting to `workflow`. The Issue filters and
  `?peek=` validate on the layout, so the tabs share them.
- **A tab writes its search with the router's `useNavigate()` and `to: "."`**, never the layout route's
  `useNavigate()`: a route's navigate takes its own path as `from`, and the Board lost `/board` the moment a
  peek opened.
- **`components/diceui/sortable.tsx`** is `@diceui/sortable` (MIT, dnd-kit) with `radix-ui`'s `Slot`
  replaced by `lib/slot.tsx` (twenty lines: clone the child with merged props and composed refs) — the CLI
  had added `radix-ui` to the catalog, which the no-Radix rule forbids; it also wrote `lib/compose-refs.ts`.
  The Workflow editor's States are `SortableItem asChild` around each `<li>` with a "Drag <State>" handle;
  the "Move up/down" buttons stay for the keyboard and the tests. New draft States carry a `uid`.
- Under a Project the Workflow editor's heading is an `h2`: the Project's name is the page's `h1`.

## What slice 9 settled (Settings)

- **`components/settings-page.tsx`**: `SettingsPage` (the h1 via `PageHeader`, a description, the page's
  action on the right) and `SettingsSection` (a card with an optional title/description, `aria-label` for
  a landmark, `tone="danger"` for what suspends, revokes or archives). All eleven pages use them; their
  h1s and control names are unchanged.
- **Native selects stay in Settings** where a test drives them with a change event (schedules, routing
  rules, providers, approvers). Members and Agents tables show `MemberChip`s; the Sponsor is a chip.
- **The Agent detail** has Projects and API keys (regions kept), a Schedule section (`Wake`), Recent Runs
  (`runs.list({ agentMemberId })`), a danger section to Suspend/Reinstate, and — for an admin — a
  `Change Sponsor` select in the header (`agents.setSponsor`). The Agents table keeps its own
  `Schedule for <name>` select, which its test drives.

## What slice 10 settled (the Event log)

- **`events.list` takes `before` and `order`** (`asc` default, the stream's; `desc` for a log). The cursor
  is the last row's seq either way. `routes/settings/events.tsx` reads `order: "desc"`, pages back with
  `before`, filters by Project and subject on the server and by kind prefix on the page, and shows a row's
  payload as JSON when clicked. It is under Settings › Workspace › Event log; admins' reading.
- `DataTable` without groups is the plain table with a keyboard row; the Event log is its first flat use.

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
