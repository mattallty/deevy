# Grouping the Issue views: vertical slices

Breakdown of the Issue-view rework, 2026-09-07. Vocabulary is [CONTEXT.md](../../CONTEXT.md); the views this
changes were built by slices 2 and 7 of [ui-redesign.md](./ui-redesign.md) and slice F of
[ui-redesign-2.md](./ui-redesign-2.md), and the design rules they follow are the `deevy-ui` skill.

The rework is done when **the list and the board are the same view in two shapes**: both grouped by the same
choice, both offering that choice from the same control, and both taking a new grouping by adding one object
rather than by editing either view.

Four slices, in dependency order. Each is one PR on `main`, carries its own tests, and leaves the app working.
**All four are built** (2026-09-07); what each turned up is under it.

## What is wrong today

- **Only one grouping exists, and it is written twice.** `routes/issues/list.tsx` builds `DataGroup[]` by
  State in ~45 lines, and the same file builds `BoardColumn[]` by State in ~25 more. Neither is reusable and
  the two disagree about what an unknown State is.
- **The Group by control disappears on a board.** `IssueFilters` takes `hideGroup`, and the board passes it,
  because grouping by State was the only grouping and a board is already columns of it. So the one screen
  where grouping is most visible is the one that cannot choose it.
- **`?group=` only says `state | none`**, so a view that groups by anything else is not a link.
- **The board knows one kind of drop.** `BoardColumn.resolveTarget` returns a State id, and `planDrop` turns
  that into a move or a Gate ruling. Nothing else can be dropped into.

## Decisions taken

- **A grouping is an object, not a branch.** One `Grouping` describes how to bucket rows, how to order and
  name the buckets, and — for a board — what a drop into one means. The list renders buckets as `DataGroup`s,
  the board renders the same buckets as columns. Adding a grouping is a new object in one file.
- **What ships: State, Assignee, Project, and one entry per Label scope** (Matt, 2026-09-07). Parent and a
  coarse Human/Agent split were considered and left out; they are a new object each if ever wanted.
- **Labels group by scope, never by Label.** An Issue carries at most one Label per scope (that rule is
  already the product's), so a scope is single-valued: every Issue lands in exactly one bucket, `No epic`
  included, counts are counts, and a board drop can set it. Grouping by individual Labels would put one Issue
  in several columns and was rejected for that.
- **A grouping may refuse drops, and says why.** There is no operation to move an Issue between Projects and
  its key is tied to one, so Project columns take no cards — `planDrop` already has a refusal path with a
  reason, and this uses it rather than inventing a disabled state.
- **The board always groups.** `group=none` is a list-only choice; a board with no columns is not a board, so
  the control drops "No grouping" in board mode rather than offering something that cannot apply.
- **No operation changes.** Every grouping buckets from what `issues.list` already returns, and every drop is
  an operation that already exists. This is entirely `apps/web`.

## What each grouping is made of

```ts
interface Grouping {
  id: string; // "state" | "assignee" | "project" | "label:epic"
  label: string; // "State", "Assignee", "Project", "epic"
  /** Ordered buckets. `rows` is what the page has; `context` carries States, Members, Projects, Labels. */
  bucketsOf(rows: IssueRow[], context: GroupingContext): Bucket[];
  /** Absent, the board refuses every drop and says so. */
  dropInto?(bucket: Bucket, issue: BoardIssue): DropPlan;
}

interface Bucket {
  id: string;
  header: ReactNode; // StateBadge, MemberChip, a Project key, a LabelBadge
  rows: IssueRow[];
  /** A board shows an empty bucket; a list hides one, unless the grouping says otherwise. */
  keepWhenEmpty?: boolean;
  collapsedByDefault?: boolean; // Done is the past
}
```

| Grouping        | Buckets                                        | Order                                | Drop                                       |
| --------------- | ---------------------------------------------- | ------------------------------------ | ------------------------------------------ |
| `state`         | folded State names + any State a row is in     | Workflow order, backlog→active→done  | `issues.move`, or the Gate ruling dialog   |
| `assignee`      | one per Member with Issues, plus Unassigned    | Humans, then Agents, then Unassigned | `issues.update({ assigneeMemberId })`      |
| `project`       | one per Project the rows touch                 | Project key                          | refused: "An Issue belongs to its Project" |
| `label:<scope>` | one per Label in that scope, plus `No <scope>` | the scope's Labels, then No          | `issues.setLabels`, swapping that scope    |

`state` keeps its existing folding: a Workspace-wide board shows one `Build` column across Projects and a drop
resolves to the Build of the card's own Project (`lib/states.ts`). No other grouping needs folding — Member,
Project and Label ids are already Workspace-wide.

## Slice 1: The grouping seam (M)

Move what exists behind the interface, changing nothing on screen.

- New `apps/web/src/lib/groupings.ts`: the types above, `stateGrouping`, and `groupingsFor(context)` returning
  the list a screen may offer.
- `routes/issues/list.tsx` builds its `DataGroup[]` and its `BoardColumn[]` from `bucketsOf` instead of its
  own two loops. The State-specific ordering, the unknown-State column, and the Done-is-collapsed rule move
  into `stateGrouping` with them.
- `routes/projects/board.tsx` takes its columns from the same place, with `projectKey` in the context so the
  States are that Project's and unfolded.
- `components/issue-board.tsx` keeps `planDrop`, which becomes the `state` grouping's `dropInto`; `BoardColumn`
  gains nothing yet.

Done when: the Issues home, the Workspace board and a Project's Board tab are pixel-identical and every
existing test passes untouched. A unit test on `stateGrouping` asserts Workflow order, the unknown-State
bucket, and that Done starts collapsed.

### Found by building the slice

- **The Gate rule is not the board's.** `planDrop` refused to move a card out of a Gate for every column,
  which is right while every column is a State and wrong the moment one is a Member: reassigning an Issue
  that happens to sit at a Gate is a reassignment, not a move. The rule moved into the State grouping's own
  plan, and slice 3 has a test that grouping by Assignee does not inherit it.
- **The collapsed-group bookkeeping got smaller.** It was a set of names plus `!name` entries to invert
  Done's default. One set of buckets toggled away from whatever their default is says the same thing and
  works for a grouping whose defaults have nothing to do with categories.

## Slice 2: The control, in both shapes (S)

- `IssuesSearch.group` widens to `string`, parsed against the groupings the screen offers and falling back to
  `state`; `group=none` stays valid for a list. `parseIssuesSearch` keeps accepting today's two values, so
  every link anybody has still opens.
- `IssueFilters` loses `hideGroup` and gains the full list. In board mode it omits "No grouping". The trigger
  reads "Group by State" / "Group by Assignee" / "Group by epic".
- The board reads `search.group` for its columns instead of assuming State.

Done when: switching Group by on the board re-columns it, switching on the list re-groups it, both survive a
reload and Back, and the tab strip's `group "Filters"` still names everything it did.

### Found by building the slice

- **A Project's Board should not fold.** Putting it on `stateGrouping` made it ask the Workspace's Projects
  for States it had already loaded from its own `workflow.get`, and a thin test stub caught it immediately.
  `projectStateGrouping` takes a Workflow directly: buckets are States by id, nothing folded, and a drop
  lands in exactly the State the column is. `groupingsFor` picks between the two on `workflowStates`.

## Slice 3: Assignee and Project (M)

- `assigneeGrouping`: buckets headed by `MemberChip`, Humans before Agents before Unassigned, `dropInto`
  calling `issues.update({ assigneeMemberId })` — and null for the Unassigned column, which unassigns.
- `projectGrouping`: buckets headed by the Project key and name, ordered by key, no `dropInto`. Not offered on
  a Project's own Board tab, where every Issue is that Project's.
- The board's refusal already renders; check the copy reads as a sentence and not an error.

Done when: a card dragged between Assignee columns is reassigned and the Event log says so, a card dragged
into a Project column is refused with a reason, and `?group=assignee` is a link somebody can send.

### Found by building the slice

- **The table was repeating the group header.** It dropped the State column whenever _anything_ was grouped,
  which was indistinguishable from "grouped by State" until there was a second grouping. It now drops
  whichever column the grouping already states: by Assignee the State column comes back and the Assignee
  column goes.
- **A Member nobody lists may still hold Issues.** A suspended Member keeps their work until somebody takes
  it off them, so the grouping gives them a bucket from the rows rather than from the Member list.

## Slice 4: Label scopes (M)

- `labels.list` is already fetched by `LabelPicker`; scopes come from `label.scope`, deduplicated.
- One grouping per scope in use, so a Workspace with `epic` and `area` Labels offers both, each with its
  `No <scope>` bucket. Headers are `LabelBadge`.
- `dropInto` sets the card's Labels to its current ones minus that scope's, plus the column's, through
  `issues.setLabels`.

Done when: dropping a card into `epic: Agent loop` gives it that Label and takes the other epic off, and
`No epic` takes the scope off entirely.

### Found by building the slice

- **Nothing needed to know which scopes exist.** They are read off `labels.list`, which both screens already
  had reason to fetch, so a Workspace that invents an `area` scope gets "Group by area" without a line of
  code or a migration.

## Deferred

- **Grouping by Parent, and by Human-or-Agent.** One object each when wanted; nothing in these slices
  forecloses them.
- **Sub-grouping, and per-column ordering inside a group.** One axis is the ask.
- **Server-side grouping.** Every bucket is derived from the page the server already sent. Past `ISSUE_PAGE`
  the counts are the page's, not the Workspace's — which is what the list's "Showing the first 200" already
  says, and grouping does not make it more wrong.
- **Saved views.** The URL is the view; naming one is a separate feature.

## Test contracts these slices add

`combobox "Group by"` in `group "Filters"`, present in both list and board; `region "<bucket>"` for a board
column named by whatever it groups (already true for States); `Unassigned` and `No <scope>` as bucket names.
Existing names are unchanged: `button "List"`, `button "Board"`, `region "<State>"`,
`Decide the <State> Gate on <key>`.
