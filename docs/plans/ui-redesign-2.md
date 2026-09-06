# deevy UI, round 2: Matt's critique of the redesign

Status: slice A done — Matt picked _Indigo · roomy_, now baked into `index.css`; the switcher and candidates are gone. Slices B–H follow. Slices B–H
follow in the order below. The approved plan of 2026-09-05, kept here as the record; each slice's
"what shipped differently" is appended to it as it lands.

## Context

The twelve-slice redesign (`docs/plans/ui-redesign.md`, branch `ui-redesign`, last commit `0cbf42a`) is
complete and verified, and Matt walked the seeded instance and is "not fully satisfied". His critique
(2026-09-05) is twenty concrete points, from one-line polish (Settings nav spacing, Inbox padding) to
three real features (a Kanban view over any Issue list, a Parent-style combobox for Labels, autosave on
Project settings) and one open design question (the colour theme itself). Decisions already taken with him:

- **Theme**: a **wide spread of 5–6 candidates, live in the app**, switchable from a dev-only control
  while browsing the seeded instance; he picks one, it is baked in, the rest deleted.
- **Kanban over All Issues / My Issues**: **columns by State name folded across Projects** (as the
  list's Group by State); a drop moves the Issue to the same-named State in its own Project, refused with a
  message when its Project has none; Gate columns open the ruling dialog as on the Project Board.
- **Mockups before code** for four screens — the Issue's Activity timeline, the Workflow editor, Inbox rows,
  the Kanban view — as **dev routes in the app** (`/dev/mockups/<screen>`) rendering 2–3 variants side by side
  from fixture data with the real components; deleted once chosen. Everything else goes straight to code.

Vocabulary is CONTEXT.md's. The `deevy-ui` skill (`.claude/skills/deevy-ui/SKILL.md`) holds the ground
rules this round keeps: Base UI only, MIT registries vetted with `shadcn view`, markdown as the Document
format, accessible names as the test contract.

## The critique, mapped

| #   | Matt said                                                                                           | Kind             |
| --- | --------------------------------------------------------------------------------------------------- | ---------------- |
| 1   | ⌘K popover not wide enough; items have no space between them                                        | polish           |
| 2   | Inbox main content lacks the padding other pages have                                               | polish           |
| 3   | Inbox: the whole row should be clickable                                                            | polish           |
| 4   | "a Gate is waiting" is too vague — say which, with the Human's/Agent's comment when there is one    | data + mockup    |
| 5   | Inbox: select several rows and mark them read, not only "Mark all read"                             | feature          |
| 6   | Toggle/button groups are smaller than buttons and not rounded                                       | polish (ui kit)  |
| 7   | Colours are not great — propose alternatives with visual preview                                    | theme spread     |
| 8   | A custom shadcn theme for deevy — several to choose from (fonts, spacing, colours), maybe generated | theme spread     |
| 9   | Issue Activity should be a timeline; items must say what changed (which Gate, which Labels)         | data + mockup    |
| 10  | Labels picked through a combobox, not all Labels shown                                              | feature          |
| 11  | Settings left nav items need spacing                                                                | polish           |
| 12  | Event log lacks detail about what changed                                                           | data             |
| 13  | Notifications table: checkboxes misaligned with headers                                             | polish           |
| 14  | In Settings the avatar is shrunk with two vertical arrows above it                                  | polish           |
| 15  | Issues lists (My / My Agents' / All) toggle between list and Kanban                                 | feature + mockup |
| 16  | Projects list: whole rows clickable                                                                 | polish           |
| 17  | Workflow tab: Documents in the markdown editor; approvers in a combobox; ordering more visual       | feature + mockup |
| 18  | Project settings: no Save button, autosave                                                          | feature          |

## What the research found (facts the slices rest on)

- **Palette width**: `CommandDialog` sets no width, so it inherits `DialogContent`'s `sm:max-w-sm` (384px);
  items are `min-h-8 px-2.5 py-1.5` with no gap between them (`components/ui/command.tsx`).
- **Inbox padding**: `routes/inbox.tsx:322` wraps the two panes in `-m-6` to cancel the shell's `p-6`, then
  the list pane adds none back; its `PageHeader` sits at x=0 while rows are `px-4`. The narrow branch keeps
  the shell padding, so the two layouts disagree.
- **Inbox row**: the `<li>` carries the `onClick` (no role, no tabIndex, `cursor-default`); the only real
  button is "Mark read". Wording is a constant per kind (`kindText`), never reading `notification.event`.
- **What Events carry** (`packages/core/src/operations/*`): `gate.approved|rejected` → `{ state, to, note }`
  (names + note); `issue.moved` → `{ from, to }` names; `issue.assigned` → member ids; `issue.labels_changed`
  → `{ added, removed }` **label ids only**; `issue.reparented` → issue **ids**; `issue.updated` → full
  before/after title/description + `mentionedMemberIds`; `comment.created` → `{ commentId,
mentionedMemberIds }` **no body**; `run.awaiting_input` → `question` text (and `gateStateId` when a Gate);
  `run.completed|failed` → `summary`; `document.updated` → `{ name, version }`.
- **`inbox.list`** already returns each row's `event` (with payload) and `issue`; not the actor Member, not
  the comment body. `inbox.markRead` takes `ids: string[]` — bulk is there, the SPA sends one id.
- **Activity wording** is one `phrase()` in `components/activity-stream.tsx` reading only `from/to/name/
version`; it phrases three kinds that do not exist (`gate.requested`, `run.finished`, `run.stale`) and
  lets `run.completed`, `run.went_stale`, `label.*` fall through to the raw dotted kind. It resolves the
  actor from `members.list` and nothing else (no labels, no states, no parent key).
- **Event log** (`routes/settings/events.tsx`) has no "what changed" column; payload is a `<pre>` on click.
- **Notifications table**: `TableCell` has `[&:has([role=checkbox])]:pr-0`, the header cell does not, so a
  centred checkbox sits 6px right of its header (`components/ui/table.tsx`).
- **Settings nav**: the `<ul>` is `flex flex-col` with no gap (`routes/settings/layout.tsx:69-105`).
- **Avatar in Settings**: the layout folds the sidebar to icons; `MemberMenu`'s trigger keeps both the
  `MemberChip` and the `ChevronsUpDown` inside a `size-8 p-0` button — nothing in it hides at icon width.
- **Theme**: all tokens are `oklch()` in `:root`/`.dark` with `@theme inline` mapping `--color-*: var(--*)`;
  fonts are literals in `@theme inline`; `--radius` in `:root`; no shadow/tracking/spacing tokens; next-themes
  toggles `.dark` with the default storage key. `/dev/tokens` is unlinked and ungated.
- **tweakcn** (tweakcn.com, Apache-2.0): 42 `registry:style` presets at `https://tweakcn.com/r/themes/
<name>.json`, each with `cssVars.light|dark|theme` covering the shadcn slots, `sidebar-*`, fonts, radius,
  letter-spacing, `spacing`, shadow primitives — and none of deevy's `--human/--agent/--gate/--state-*`.
- **Timeline**: `@reui/timeline` is the only Base UI one (MIT, one file, `useRender` + `mergeProps`, no
  Radix, hard-codes `--primary` for the rail); `@diceui/timeline` imports `radix-ui` (out); no `@shadcn`,
  `@kibo-ui`, `@coss` timeline. `@originui` is gone (folded into `@coss`).

## Slices

Each is one commit on `ui-redesign`, `vp check` + `vp run -r test` green, verified in the seeded `dev:stub`
instance (and `vp run web#screens` regenerated at the end of the round). Order: the theme spread first,
because every mockup after it should be judged in the chosen theme; the polish batch second because it is
cheap and Matt sees it everywhere; then the data-backed screens with their mockups; the features last.

### A — Theme spread (points 7, 8) — shipped, picked, baked

A dev-only **theme switcher** that applies a whole candidate — colours, fonts, radius, letter-spacing,
density — to the real, seeded app while browsing, so Matt compares screens, not swatches.

- `src/index.css` becomes candidate-ready: `@theme inline` fonts point at variables (`--font-sans:
var(--face-sans)`, `--font-mono: var(--face-mono)`), `--spacing: var(--density)` so a candidate can tighten
  the whole scale, and shadow/tracking slots are added so tweakcn presets can be pasted whole. The current
  look becomes candidate **`plex-warm`** (baseline), expressed in the same form.
- `src/dev/theme-candidates.css` (imported only when `import.meta.env.DEV`): each candidate is
  `html[data-theme-candidate="<name>"] { … }` + `html[data-theme-candidate="<name>"].dark { … }`, with
  **deevy's six semantic slots re-tuned for its neutrals** (Human copper, Agent teal, Gate amber keep their
  hues; chroma and lightness follow the candidate's contrast). Six candidates, deliberately far apart:
  1. `plex-warm` — today's warm neutrals, Plex, 6px radius (the control).
  2. `graphite` — tweakcn _graphite_: cool neutral grays, higher contrast, Geist + Geist Mono, 6px.
  3. `mono` — tweakcn _vercel/mono_: near-black primary on white, Geist, 4px radius, tighter tracking.
  4. `clean-slate` — tweakcn _clean-slate_: cool blue-gray, Inter, 8px radius, roomier spacing.
  5. `caffeine` — tweakcn _caffeine_: warm brown/cream, DM Sans + JetBrains Mono, 6px.
  6. `modern-minimal` — tweakcn _modern-minimal_: blue primary, Inter, 10px radius (the "friendlier" pole).
     Fonts self-hosted through fontsource for the evaluation (`@fontsource-variable/geist`, `geist-mono`,
     `inter`, `dm-sans`, `@fontsource/jetbrains-mono`; losers removed with the losing candidates).
- **The switcher**: a small floating control (bottom-right, `aria-label="Theme candidate"`) mounted from the
  shell only when `health.ping.devSignIn` is true, listing the six with their font and radius; it writes
  `data-theme-candidate` on `<html>` and `localStorage`, beside the Light/Dark toggle it already has.
  `/dev/tokens` shows all six side by side (light and dark) for the swatch view.
- **Choosing**: Matt picks in the app. The pick is then hand-merged into `:root`/`.dark` in `index.css`
  (tweakcn's values credited in a comment, Apache-2.0), the candidates file and the switcher are deleted,
  the losing fonts dropped from the catalog. If he wants to tune further, tweakcn's editor exports the same
  CSS shape (paste into `:root`/`.dark`, keep deevy's six slots).
- Tests: `kit.test.tsx` asserts the semantic slots exist under every candidate (a candidate that forgets
  `--gate` fails); `shell.test.tsx` asserts the switcher is absent when `devSignIn` is false.

What shipped differently:

- The candidates are `src/dev/theme-candidates.css`, generated from the preset JSON, keyed
  `[data-theme-candidate="<id>"]` (not `html[...]`) so `/dev/tokens` can scope one to a single sheet; the
  third candidate is tweakcn's _vercel_, named `vercel` (its _mono_ preset sets the whole UI in a monospace
  face, which is a different proposal). `--density` drives Tailwind's `--spacing` through `@theme inline`,
  which works because every spacing utility is `calc(var(--spacing) * n)` at the point of use; fonts moved
  behind `--face-sans`/`--face-mono` the same way; `--tracking` lands on `body`.
- The tests live in `theme-candidates.test.tsx` (the CSS read as text — Vitest blanks CSS imports, so
  `vite.config.ts` lets that one file through) and `theme-switcher.test.tsx`, not in `kit`/`shell`.
- The evaluation fonts are `devDependencies` of `apps/web`, in the catalog under a comment saying they
  leave with the review.
- **Round one of the pick (2026-09-05):** Matt chose the _clean slate_ direction "but not as is" and asked
  for variations on colours and spacing. The six far-apart candidates were replaced by six variations of
  clean slate — three action-colour treatments (indigo as published; a clearer cobalt; a quiet ink-blue on
  neutrals with half the chroma) crossed with two scales (roomy: 8px corners, `--density` 0.2625rem;
  compact: 6px, 0.2375rem) — all on Inter + JetBrains Mono. Geist and DM Sans left with the losers; Plex
  stayed as the reference row until the winner was merged.
- **The pick (2026-09-05): Indigo · roomy** — clean slate as published (indigo action, blue-gray neutrals,
  Inter + JetBrains Mono) at `--density: 0.2625rem` and `--radius: 0.5rem`, with deevy's six semantic slots.
  Merged into `index.css` as the one `:root`/`.dark` pair; `--face-*`, `--density` and `--tracking` stay as
  the variables a future review would retune. The candidates file, the switcher, their tests, the
  `vite.config.ts` exception and Plex are gone; Inter and JetBrains Mono are dependencies.

### B — Polish batch (points 1, 2, 3, 6, 11, 13, 14, 16) — shipped

One commit of small, certain fixes; no mockups.

- **⌘K**: `CommandDialog` gets `sm:max-w-2xl`; `CommandItem` grows to `min-h-9 px-3 gap-2.5` with
  `space-y-0.5` in the group; `CommandList` `max-h-[60vh]`. Palette rows with key + title stop cramping.
- **Inbox padding**: drop the `-m-6` hack; the shell's page wrapper learns one opt-out — the Inbox route
  renders full-bleed (`routes/shell.tsx` exposes `PageFrame` or the route sets `data-bleed`) and the list
  pane adds `px-4`/`pt-4` so its header lines up with its rows and with other pages' headers.
- **Inbox row**: the row becomes a `<button>` filling the `<li>` (`role="option"` inside `role="listbox"`
  is what `aria-selected` needs), keyboard-focusable, `cursor-pointer`; "Mark read" stays a nested action
  (moved to the right, `stopPropagation` kept). Slice C restyles the row again — this one only fixes the
  target.
- **Groups**: `ui/toggle.tsx` sizes align with `ui/button.tsx` (default `h-8 px-3 text-sm rounded-md`,
  `sm` `h-7`), `ToggleGroup` keeps `rounded-md` on the group and its first/last children; `ButtonGroup`
  and `TabsList/TabsTrigger` get the same pass. The filter bar (`issue-filters.tsx`), Activity filter and
  Inbox Unread/All are the visible users.
- **Settings nav**: `gap-0.5` on the `<ul>`, `h-8` rows.
- **Notifications table**: the checkbox cells get `pr-3!` (or the `:has([role=checkbox])` rule is scoped
  to a leading selection column only, which is what shadcn meant it for) and `w-24` moves to both header
  and cell.
- **Avatar in Settings**: `MemberMenu`'s trigger hides the name and the chevron at icon width
  (`group-data-[collapsible=icon]:hidden` on the chevron, `MemberChip` gets `nameless` under the same
  group), keeps the avatar centred, and gains the `Tooltip` the other footer items have.
- **Projects list**: `DataTable` rows get `onOpen` → navigate to the Project (whole row clickable, cursor
  pointer, Enter opens); the name stays a Link for middle-click.

What shipped differently:

- **The checkbox misalignment was not the padding rule.** Base UI's Checkbox root is a block-level button,
  so `text-center` on the cell never centred it; the fix is a `flex justify-center` wrapper per cell. The
  `:has([role=checkbox])` padding rule in `ui/table.tsx` was still scoped to a first column, which is what
  shadcn meant by it.
- **Full-bleed pages** are declared, not hacked: `inboxRoute` carries `staticData: { bleed: true }` (typed by
  a `StaticDataRouteOption` augmentation in `router.tsx`) and the shell's page wrapper reads it through
  `useMatches()`; the Inbox lost its `-m-6` and pads its own header (`PageHeader className="px-4 pt-4"`), so
  the header, the rows and every other page's header share one left edge.
- **The Projects page was not on `DataTable`** (a raw `ui/table`); it is now, with `aria-label="Projects"`,
  sortable Project and Team columns, the shared loading and empty states, and the row opening on click.
- **Sizes**: `Toggle` is `text-sm` with `h-8`/`h-7`/`h-9` sizes matching `Button`; `TabsTrigger` is
  `text-sm px-2.5`. Under the roomy density these all measure 34px beside 34px selects.
- **The folded avatar**: `MemberChip` gained `avatarOnly` (tooltip then carries the name), and the member
  menu passes it when `useSidebar().state === "collapsed"`; the chevron hides at icon width.

### B′ — Select popovers (point 19) — shipped

Matt reported every Select's popover lacking spacing. Against the upstream `@shadcn/select` (Base UI build):
the component tree was right — Positioner → Popup → scroll arrows around `List` — but in that build the `p-1`
lives on **`SelectGroup`**, and the docs always wrap items in one; seven of our screens put `SelectItem`s
straight into `SelectContent`, so they sat flush against the popup edge. Every `SelectContent` now wraps its
items in `SelectGroup` (a ground rule in `deevy-ui`). Also seen in the diff and left alone: upstream's
newest style carries `cn-menu-target cn-menu-translucent` on the popup, which ours predates.

A second pass (2026-09-06) replaced every remaining native select — seventeen, in ten files: Document
version, the Board's Assignee filter, New Issue's Project, the State's category and Agent, the Agents
table's schedule, the Event log's three filters, the routing rules' three, the Repository provider, the
Project's Team, the Workflow's Move-Issues-to — with the shadcn parts composed directly at each site (Matt
refused a wrapper: a page must be able to group and separate its items), `SelectGroup` + `SelectLabel` where
the options have families and `SelectSeparator` after a "none" item. `ui/native-select.tsx` is deleted. Tests drive a Base UI
Select with `tests/select.ts` (`pickOption`: ArrowDown, then Enter on the highlighted option).

### B″ — Breadcrumb (point 20) — shipped

`components/app-breadcrumb.tsx` on the vendored shadcn `ui/breadcrumb` (Base UI `useRender`, already in the
kit): `crumbsFor(pathname, search, projectName)` derives the trail — the Issues view by its filters (plus
"Board" in board view), Inbox, Projects › Project › tab, Projects › Project › KEY for an Issue, Settings ›
page › detail — and `AppBreadcrumb` renders it in the top bar between the sidebar trigger and New Issue,
Project names from the `projects.list` the shell already holds.

### Mockups — picked (checkpoint 2, 2026-09-06): Inbox 2, Activity 2, Kanban 1, Workflow 3

`/dev/mockups/{inbox,activity,kanban,workflow}` from `src/dev/fixtures.ts`, variants numbered per screen.
Groundwork that shipped with them: `components/workflow-state-fields.tsx` (`StateFields`, `DraftState`,
`newDraftState`) extracted from the Workflow editor with its tests untouched, and `@reui/timeline` vendored
as `components/reui/timeline.tsx` (MIT, Base UI).

### C — Inbox that says what happened (points 4, 5; mockup first) — shipped

**Data.** `inbox.list` (core) additionally returns, per row, `comment: { id, body } | null` (joined when the
Event is `comment.created|edited`) and `actor: MemberWithUser | null` (the Event's actor), so a row can quote
the comment and name who did it without N queries. Snapshot regenerated; `packages/core/tests/inbox.test.ts`
covers both. Everything else a precise row needs is already in `event.payload` (Gate name + note, from/to
State names, the Run's question and summary).

**Wording** moves from `kindText` to `describeNotification(row, { labelsById })` in
`src/lib/notification-text.ts` (unit-tested): actor + verb + object + excerpt, e.g.

- gate_awaiting from `gate.rejected`: **Grace** rejected the _Spec_ Gate on **DEV-12** — "Refund path is
  missing the ledger write" · from `issue.moved`: **Planner** moved **DEV-12** into the _Intent_ Gate ·
  from `run.awaiting_input` with a Gate: **Builder** is waiting at the _Intent_ Gate on **DEV-12**.
- run_awaiting_input: **Builder** asks on **DEV-9**: "Which retry policy: exponential or fixed?"
- run_finished: **Builder** finished a Run on **DEV-9** — "Wrote plan v2; two open questions" (failed: in
  destructive hue).
- mention: **Ada** mentioned you on **DEV-4**: "@matthias can you rule on this before Friday?"
- assignment: **Ada** assigned **DEV-6** to you.

**Mockups** (`/dev/mockups/inbox`, 3 variants from fixture rows): (1) one-line rows, excerpt truncated
inline; (2) two-line rows, excerpt on the second line in muted type, actor chip left; (3) two-line rows
grouped by Issue with the Issue header carrying State and Assignee. Matt picks; the pick lands in
`routes/inbox.tsx`.

**Multi-select.** A checkbox per row (`aria-label="Select <text>"`), a header checkbox per Issue group,
`x` toggles the focused row, `shift+click` ranges; a selection bar replaces the header actions while any
row is selected: "N selected · Mark read · Clear". Calls the existing `inbox.markRead({ ids })`. "Mark all
read" and `⇧E` stay. Tests in `inbox.test.tsx`: precise text for each kind, select two → mark read sends
both ids.

What shipped differently in C:

- Matt picked the **two-line flat list**, not the grouped one, so the Inbox is one `ul aria-label=
"Notifications"` newest first; each row says actor · verb · on KEY, then the Issue title, then the quote.
  The tests moved from "Notifications for DEV-1" to that one list.
- `describeNotification` takes no label map (nothing in a Notification names a Label); it reads the Event
  kind and payload, the Issue's State name, and the joined `comment`. A withdrawn comment reads "(the
  comment was withdrawn)".
- The selection toolbar is `role="toolbar" aria-label="Selection"` in the page header's action slot; `x`
  toggles the focused row; ranges with shift-click were not built.
- Core: `inbox.list` rows gain `actor` (the Event's Member with user) and `comment` (`{ id, body | null }`)
  through two batched lookups, no N+1; snapshots regenerated.

### D — Activity timeline and a truthful Event log (points 9, 12; mockup first) — shipped

**Data (core, additive, self-describing Events).** New Events carry names beside ids so the log needs no
lookups: `issue.labels_changed` payload adds `addedNames`/`removedNames`; `issue.reparented` adds
`fromKey`/`toKey`; `issue.assigned` adds `fromName`/`toName`. Old Events keep working through the maps the
UI already has. `events.test.ts` asserts the new fields. `phrase()`'s dead kinds are removed and the real
ones (`run.completed`, `run.went_stale`, `label.*`, `issue.link_*`) get sentences.

**Wording** becomes `describeEvent(event, ctx)` in `src/lib/event-text.ts`, shared by the Activity stream,
the Event log and the Inbox (slice C imports it): returns `{ verb, object, detail?, tone }` — e.g. "approved
the **Intent** Gate → _Spec_" + note as detail; "added Labels **backend**, **priority: high**; removed
**docs**"; "assigned to **Builder** (was Ada)"; "moved **Build → Review**"; "set the parent to **DEV-3**";
"wrote **spec** v3". Unit-tested per kind.

**Timeline component**: `@reui/timeline` (MIT, Base UI, vetted) added as `components/reui/timeline.tsx`
with the header comment; its rail colour made a prop so Gate items run amber, Run items teal, Human
comments copper. **Mockups** (`/dev/mockups/activity`, 3 variants): (1) a single continuous rail, one dot
per item, comments as cards on the rail; (2) rail with day separators and same-actor runs collapsed ("Builder
· 4 actions" expandable); (3) two-tone: Human items left-aligned, Agent items indented, Gate rulings as
full-width amber cards. Matt picks; `activity-stream.tsx` is rebuilt on it, keeping `ol aria-label=
"Activity"`, the `Comment` composer and the Mentions listbox names.

**Event log**: a **What** column from `describeEvent` (actor already there) replaces the click-to-see JSON
as the first thing you read; the payload `<pre>` stays behind a "Payload" toggle per row for the audit case.

What shipped differently in D:

- `describeEvent` returns `{ text, detail, tone, routine }` (not `verb/object`): one sentence, the words
  someone wrote as detail, and `routine` marking the steps an Agent's day is made of (Run started, Document
  written, a link added) so the stream can fold them. `run.activity` describes to `null` — the Run card
  shows those — and the stream and the log skip it.
- Matt picked **by day, Agents folded**: the stream is a ReUI `Timeline` rendered as `ol aria-label=
"Activity"`, day separators as `li role="presentation"` so `listitem` counts hold, and consecutive
  routine Events by one Agent fold into "n steps" behind `aria-expanded`. A ruling or a failure is a
  card on the rail with its note; a comment is a card with its Markdown.
- Core payloads gained `addedNames`/`removedNames`, `fromName`/`toName`, `fromKey`/`toKey` (also on the
  State-rule assignment and the Label-deletion cascade); `events.test.ts` "self-describing payloads" pins
  them. Older Events resolve through the members and labels maps the screens already load.
- The Event log's **What** column sits between Actor and Subject; Subject is narrow; the payload still
  opens on click for the audit case.

### E — Labels through a combobox (point 10) — shipped

`components/label-picker.tsx` stops listing every Label. The rail shows the Issue's Labels as chips and one
control: a **multi-select Base UI Combobox** (`ui/combobox.tsx`, already vendored, imported nowhere yet;
`Combobox multiple` with `ComboboxChips` / `ComboboxChipsInput`, options from `labels.list`, typed filter,
scoped Labels grouped by scope with `ComboboxGroup`/`ComboboxLabel`). Picking one sends the whole selection
through `issues.setLabels` as today (chosen one last, so it wins its scope — the comment in the file stays).
`l` focuses the input. Accessible structure: input `aria-label="Labels"` inside the existing `role="group"
aria-label="Labels"`, options named by `labelText(label)`, chips with `aria-label="Remove <label>"`.
`labels.test.tsx` migrates from `getByRole("button", { name: "epic: Checkout" })` to typing "epic" and
choosing the option; the assertion on `labelIds: ["l1","l2"]` stays. The same Combobox pattern is what slice
H reuses for approvers.

What shipped differently in E: the options are one flat list sorted by scope then name (the `scope: name`
text groups them visibly; Base UI's grouped collections were not needed); each chip carries its Label's
colour as a left rule and each option a dot. Under jsdom, typing filters but `ArrowDown` opens the popup —
the recipe `labels.test.tsx` and `deevy-ui` now record. `ComboboxChip` gained `removeLabel` so the remove
button has a name ("Remove backend").

### G — Project settings autosave (point 18) — shipped

`routes/projects/project-settings.tsx` loses Save/Cancel. Each field saves itself: text inputs on blur (and
`Enter` for the name), the Team select on change, through `projects.update` with only the changed field;
a per-form status line (`role="status"`) reads "Saving…", "Saved" for two seconds, or the error with a
"Retry" button that resends the last value. An empty name is refused inline ("A Project needs a name") and
the last saved value restored on blur. `useAutosave(value, save)` in `src/lib/autosave.ts` (debounced,
last-write-wins, unit-tested) so Workspace and Agent settings can adopt it later; this slice converts only
the Project form. `projects.test.tsx` "edits the Project's name" becomes: change, blur, expect the update
call — no "Save" button.

What shipped differently in G: `useAutosave(save)` in `lib/autosave.ts` gives `saveNow`, `schedule`,
`flush`, `retry` and a status; the form uses `saveNow` on blur and Enter (a debounced `schedule` exists for a
later field that types continuously). Each save sends only the changed field, so the test now expects
`{ key, name }` alone. An empty name is refused inline ("A Project needs a name") and the field snaps back.

### Sizes the groups fix aligns to (slice B detail)

`Button` default is `h-8 px-2.5 text-sm rounded-md`, `sm` is `h-7`; `SelectTrigger`/`NativeSelect` are `h-8`.
`Toggle` default is `h-7 text-xs` (so the filter bar's toggles sit 4px short of the selects beside them) and
`ToggleGroup spacing={0}` squares every middle item (`rounded-none`, only first/last get `rounded-l/r-md`).
The fix: `Toggle` default → `h-8 px-3 text-sm`, `sm` → `h-7 text-sm`; `ToggleGroup` keeps `spacing={0}`
but wraps in `overflow-hidden rounded-md` so the group has one radius and interior items need none; `Tabs`
triggers → `text-sm`. `issues-home.test.tsx` pins `getByRole("button", { name: "All", pressed: false })`,
so the items stay buttons with `aria-pressed`.

### F — List or Board, on any Issue list (point 15; mockup first) — shipped

**URL**: `view=board` joins `IssuesSearch` (absent = list); a `ToggleGroup aria-label="View"` with icon items
"List" / "Board" sits at the right of the filter bar on the Workspace lists only (the Project's Issues tab
already has a Board tab). In board view "Group by" is hidden (`hideGroup`, which the Project Board also
passes, removing today's stray select there). URL only, no localStorage: a view is a link and Back undoes a
filter, as everywhere in the app.

**Shared component** `components/issue-board.tsx`, extracted from `routes/projects/board.tsx` so both boards
are one code path:

```ts
interface BoardColumn { id; name; isGate; category; resolveTarget: (issue) => string | null }
type DropPlan = { kind: "none" } | { kind: "gate" } | { kind: "refused"; message } | { kind: "move"; stateId };
planDrop(issue, fromColumnId, column): DropPlan   // pure, unit-tested
```

`IssueBoardView` (pure: columns, grouped value, `onDrop`, `onOpen`, `onDecide`, selection) renders the ReUI
Kanban as today (`section[data-slot=board-column][aria-label=State]`, Gate tint, `StateBadge` header with a
count, `KanbanOverlay` ghost). While a card is dragged, every column whose `resolveTarget(card)` is null gets
`data-refuses` (dimmed, not-allowed cursor), so a refusal is visible before the drop. `IssueBoard` (connected)
owns `issues.move`, the `GateDialog` (moved verbatim), and `onDrop → planDrop`: `gate` → dialog; `refused` →
`toast.warning("OPS has no \"Spec\" State")`; `move` → mutate. **Project Board**: columns from
`workflow.get` with `resolveTarget: () => state.id`; markup, filters and `board.test.tsx` unchanged.
**Workspace board**: `lib/states.ts` `foldStates(projects)` — the dedupe now inline in `list.tsx:107-122`,
returning each folded State with `byProject: Map<projectId, stateId>`; columns are the folded names with
`resolveTarget: (issue) => byProject.get(issue.projectId) ?? null`. Header and tint follow the first Project's
State (as the list's group header does); the card's own `state.isGate` decides its Decide button and the
drop rule. Done columns are **shown, not folded**: on a board Done is one column at the right and the most
used drop target, and under the default Open filter it is empty — Open/All is the fold.

**Card**: key (mono), title (two lines), up to three Labels, `MemberChip`; a "Decide the <State> Gate on
<KEY>" ghost button on Gate cards. **Keyboard**: `j`/`k` walk cards in reading order (columns left to right),
`Enter` peeks, `o` opens, `Esc` clears — the same four keys as the list, no new ones; the peek is non-modal
in board view and closes on drag start. Edge: a card whose State name no Workflow knows gets a trailing
column of its own (as the list does) instead of crashing the Kanban.

**Mockups** (`/dev/mockups/kanban`, fixtures: two Projects, five States, eight Issues including a Gate card
and an OPS card in a column OPS lacks): (A) header = StateBadge + count; (B) header adds the Project keys
that have this State, faint; (C) cards carry a muted Project name line vs key only. Matt picks header and
card. **Tests**: `issues-home.test.tsx` — the toggle writes `view=board`, hides Group by, folds same-named
States into one column with OPS-1 in Todo, a Gate card offers the ruling, `j`/`Enter` work on cards; new
`issue-board.test.tsx` for `planDrop`, `foldStates`, `groupIntoColumns`.

What shipped differently in F: as designed, with `lib/states.ts` (`foldStates`) replacing the list's inline
dedupe and `components/issue-board.tsx` carrying `planDrop`, `groupIntoColumns`, `IssueBoardView`,
`IssueBoard`, `BoardCard` and the Gate dialog; the Project Board is now forty lines of data plumbing over
it, its tests untouched. The seeded Workspace shows the fold at work: Intent · Todo · Spec · Plan · Build ·
Review · Doing · Done, OPS cards in Todo and Doing. The refusal path is covered by `planDrop`'s unit tests
and the dimming by the mockup; a synthetic pointer drag did not activate dnd-kit in the Browser pane, so
the toast was not exercised end to end.

### H — Workflow editor: visible order, real editor, real picker (point 17; mockup first) — shipped

**Groundwork (behaviour-preserving, lands before the mockups)**: `routes/projects/workflow.tsx` splits into
the thin data-bound `WorkflowPage` and a pure `components/workflow-editor.tsx` (`WorkflowEditor` with
`draft`, `humans`, `agents`, `onDraft`, `onSave`…; `toDraft`, `toUpdateInput`, `draftChanges` exported), so
the mockup route can render it from fixtures and the losing variants are deleted, not rewritten. Field
controls live in one `StateFields`, shared by every variant. Native selects for "Counts as" and "Assign an
Agent on entering" stay (tests drive them with change events).

**Approvers** → `components/approvers-picker.tsx`: Base UI `Combobox multiple` over the Workspace's Humans,
chips of `MemberChip size="xs"` with `aria-label="Remove <name>"` (`ui/combobox.tsx`'s `ComboboxChip` gains a
`removeLabel` prop — its remove button has no accessible name today), the input labelled `Approvers for
<State>` so the contract name survives, option text is the name only, hint "Nobody named: any Human may
decide." when empty; rendered for Gates only. `workflow.test.tsx`'s approvers block migrates from
`HTMLSelectElement` to open-type-pick (`ArrowDown`, `screen.findByRole("option", { name: "Bob" })` — the popup
is portalled — then the `Remove Bob` chip); a small `approvers-picker.test.tsx` pins the jsdom recipe first.

**Document template** → `MarkdownEditor mode="block"` with `aria-label="Template for <State>"` passed to the
editor (it lands on the Source textarea, which is what the test types into today; the Tiptap textbox stays
unlabelled so `getByLabelText` never finds two), shown only when a Document name is set, `max-h-80` scroll on
the body so a long template does not swallow the page.

**Mockups** (`/dev/mockups/workflow`, fixtures: six States with two long markdown templates, Humans Ada and
Grace plus a suspended Bob and an Agent to prove filtering; a Tabs switcher, one theme at a time — Tiptap is
heavy):

1. **Vertical stepper (recommended)** — a live **Order strip** under the heading (`ol aria-label="Order"`:
   `1 Intent ◆ → 2 Spec ◆ → 3 Plan …` as StateBadges, re-rendering as you drag), then the `ul aria-label=
"States"` with a numbered rail down the left (number pill, continuous line, drag handle), one card per
   State: header row StateBadge + "Step n" ("was step 3" once moved), Name, Counts as, Gate, Agent, ↑↓ and
   Delete; a second row only when relevant (Document name + editor; approvers on Gates). Gate cards tinted
   amber like Board columns. A plain State is one 40px row, so eight States fit in two screens with three
   templates open. Keeps both Workflow test files green apart from the combobox migration.
2. **Horizontal pipeline** — Board-like columns with connectors, `Sortable orientation="horizontal"`; the
   template opens in a Sheet because a block editor in 288px is unusable; eight columns never fit at 1280.
3. **Master–detail** — compact reorderable list left, the selected State's full form right; densest, best
   for long templates, hides seven of eight States' rules and forces every Workflow test to "select, then
   query".

**Save model**: explicit `Save Workflow` stays (a rewrite with deletions and Issue moves must not autosave),
but a sticky footer makes the pending change visible: "3 unsaved changes · Save Workflow · Reset", per-card
`data-dirty`/`data-new`, the "Move Issues in deleted States to" select when a State is removed. Tests added:
reorder by keyboard shows the new step numbers, typing a template saves `documentTemplate`, the footer count.

What shipped differently in H: Matt picked **master–detail** over the recommended stepper. The left list
(`ul aria-label="States"`) has a drag handle, the step number and the StateBadge per row, an unsaved dot,
and a row button named `Edit <State>`; the right side is `form aria-label="<State>"` with the arrows and
Delete in its header and `StateFields` inside, the template in the markdown editor (`Template for <State>`
on its Source textarea) and approvers in `components/approvers-picker.tsx`. A sticky footer counts unsaved
changes (edited, added, removed, or a reorder) beside Add State, Reset and Save Workflow. The tests moved to
select-then-query (`open("Plan")`), the approvers test to the combobox recipe, and the Gate test's display
value to the page. No separate `WorkflowEditor` extraction was needed beyond `StateFields`.

## Order, checkpoints, records

1. **A** theme spread → **checkpoint 1**: Matt picks a candidate in the app (and may tune it in tweakcn).
   Baked in before anything else, so every later screenshot and mockup is judged in the chosen theme.
2. **B** polish batch (one commit).
3. **Mockups** for C, D, F, H land together as `/dev/mockups/{inbox,activity,kanban,workflow}` (one commit,
   fixtures under `src/dev/fixtures.ts`) → **checkpoint 2**: Matt picks a variant per screen.
4. **C**, **D**, **E**, **F**, **G**, **H** in that order, one commit each; C and D share `lib/event-text.ts`,
   E and H share the multi-select Combobox pattern, F reuses the Board.
5. Close: delete the mockup routes and the losing theme candidates, regenerate `docs/screens/`, append "What
   round 2 settled" to `.claude/skills/deevy-ui/SKILL.md`, and write `docs/plans/ui-redesign-2.md` (this
   plan, in the house style, with what shipped differently).

Core changes are three and additive: `inbox.list` joins `comment` and `actor` (C); Event payloads gain
names beside ids for Labels, parent and Assignee (D); nothing else. Each regenerates `openapi.json` and
`mcp-tools.json`.

## Verification

- Every slice: `vp check`, `vp run -r test`, `vp run web#build:workers && vp run web#check:workers`; the
  touched screens walked in the seeded `dev:stub` instance at 1280px and 390px, light and dark, with the
  Browser pane; `read_console_messages` clean.
- A: all six candidates render every screen without an unstyled slot (a candidate missing `--gate` fails
  `kit.test.tsx`); the switcher is absent when `devSignIn` is false.
- C: an Inbox row for each of the six kinds reads as a sentence with actor, object and excerpt; selecting
  two rows and marking read sends both ids (`inbox.test.tsx`).
- D: the Activity of the seeded DEV-21 shows which Gate was rejected with the note, which Labels changed by
  name; the Event log's What column reads without opening a payload.
- F: on `/?view=board`, drag OPS-4 into "Spec" (OPS has none) shows the refusal toast and moves nothing;
  drag DEV-9 from Build to Review moves it; a card in Intent opens the ruling dialog.
- G: rename a Project, blur, see "Saved"; empty name refused inline.
- H: reorder by drag and by keyboard, pick approvers by typing, write a template in the editor, save once.
- Close: `vp run web#screens` regenerated; `vp run claude-agent#acceptance` still passes.

## Palette (round 3, opened 2026-09-06)

Matt keeps the indigo primary but finds the colours beside it — Human copper, Agent teal, Gate amber, the
State dots — out of tune with it, and wants Labels to choose from a limited, harmonious set instead of a
free colour picker. Six palette candidates live in `src/dev/palette-candidates.css` behind a dev-only
switcher (`src/dev/palette-switcher.tsx`, "Palette candidate"), each redefining `--human`, `--agent`,
`--gate`, `--state-*` and `--destructive` in both themes and proposing eight Label swatches
(`src/dev/palettes.ts`, hex, white text on each): _Triad_ (copper & teal, chroma pulled down), _Split
complement_ (orange & green), _Analogous_ (rose & sky), _Jewel_ (plum & jade), _Cool_ (steel & violet),
_Earth_ (terracotta & olive). `/dev/tokens` draws all six with their swatches. The Labels settings form is
a `radiogroup "Colour"` of the active palette's eight swatches (`lib/label-colors.ts`), no picker. The pick
bakes the winner into `index.css` and the swatches into `lib/label-colors.ts`, and reseeds the Labels.
