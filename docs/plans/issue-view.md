# The Issue view: five layouts to choose between

A spike, 2026-09-11. Five arrangements of the Issue detail view, clickable on a stubbed dev instance at
`/dev/issue-layouts?issue=DEV-2&v=<id>` (`apps/web/src/routes/dev/issue-layouts.tsx`), the way round 2 chose
its Inbox, Activity, Kanban and Workflow mockups (`docs/plans/ui-redesign-2.md`). Pick one; the route and the
other four get deleted.

The palette, the type and the components are deevy's own and do not vary. What varies is the one thing the
current layout does not decide.

## What is wrong with the layout today

An Issue in deevy is five things at once: a **ruling** a Human owes, the **Documents** an Agent writes, the
**Runs** it made writing them, the **conversation**, and the **facts** (assignee, labels, parent, links).
Today they are a single column in that order with a 300px rail of facts beside it — so:

- **Nothing leads.** A Human opening an Issue at a Gate and a Sponsor reading a failed Run get the same
  page, and neither is served first. The ruling card is in the rail, the same width as the Labels.
- **The artifact ranks below the chat.** A Document is the output of an Intent, Spec or Plan State — the
  reason the Issue exists at that point — and it sits between the description and the Runs, at the same
  weight as a comment thread.
- **Long Runs bury everything.** A Run with forty Activities pushes the conversation off the screen; an
  Issue worked three times is mostly Run feeds.
- **Context scrolls away.** Once you are in the Activity, nothing on screen says which Issue you are in or
  what State it is in.
- **The rail mixes acting with referring.** The ruling and the Assignee are things you do; children and
  links are things you look up. They are the same column.

Each layout below answers _what is this page centred on_, and pays for that answer somewhere.

## 1. Ruling first (`v=ruling`)

The decision is the opening move, full width, before the Issue's own title. Everything else is one reading
column under it; the facts are a strip rather than a rail.

```
┌──────────────────────────────────────────────┐
│  Spec is a Gate — Note, Approve, Reject      │  ← full width, first
└──────────────────────────────────────────────┘
        ┌───────────────────────────┐
        │ DEV-2 · Spec · Ada        │
        │ Checkout rewrite          │
        │ Assignee · Labels · Parent│  ← facts as one line
        │ description               │
        │ Documents                 │
        │ Runs                      │
        │ Activity                  │
        └───────────────────────────┘
```

**For** a Workspace where Gates are the point: the thing owed is unmissable and the same width as the page.
**Against** it spends the best real estate on a card that is empty for every Issue not at a Gate, and the
facts in a strip are harder to scan than a column.

## 2. Workbench (`v=workbench`)

An Issue an Agent has worked is a desk with things on it. The left rail navigates the artifacts, the centre
shows the one you picked, the right holds the ruling and the facts. Nothing scrolls past anything else.

```
┌────────────┬───────────────────────────┬──────────────┐
│ The Issue  │ DEV-2 · Spec · Ada        │ Spec is a    │
│ Documents 2│ Checkout rewrite          │ Gate         │
│ Runs      3│                           │ [Approve]    │
│ Conversat.5│ (the pane you picked)     │ Assignee     │
│            │                           │ Labels       │
│ Latest Runs│                           │ Parent       │
└────────────┴───────────────────────────┴──────────────┘
```

**For** Issues with several Documents and Runs — deevy's own case once Agents are working. Each thing has a
place; none of them push the others down.
**Against** three columns need width (it stacks under ~900px), and a conversation you have to _choose_ is a
conversation people stop reading.

## 3. One story (`v=story`)

The Issue as what happened to it: the description is the first entry, Documents, Runs, rulings and comments
follow in time. The ruling is a bar that never scrolls away, the way a pull request's merge box does not.

```
┌───────────────────────────────┬──────────┐
│ DEV-2 · Spec · Ada            │ Assignee │
│ Checkout rewrite              │ Labels   │
│ ┌─ Opened with ────────────┐  │ Parent   │
│ │ description              │  │ Children │
│ └──────────────────────────┘  │ Links    │
│ Documents · Runs · comments   │          │
│ …in time order…               │          │
├───────────────────────────────┴──────────┤
│  Spec is a Gate — Note, Approve, Reject  │  ← sticky
└──────────────────────────────────────────┘
```

**For** catching up: one thread, no hunting, and the ruling is always to hand.
**Against** the true version is work — `ActivityStream` already folds Events and comments, and this asks it
to fold Document versions and Runs too. A sticky bar also costs a strip of every screen.

## 4. Document canvas (`v=canvas`)

In Intent, Spec and Plan the Document _is_ the work. It takes the page, at a reading measure, with the
ruling and the links in a narrow column beside it; the Runs and the conversation are below a divider.

```
┌──────────────────────────────────────────────┐
│ DEV-2 · Spec · Ada   Checkout rewrite        │
│ Assignee · Labels · Parent · Children        │
├───────────────────────────────┬──────────────┤
│ description                   │ Spec is a    │
│ Documents (intent, spec…)     │ Gate         │
│ the Document, full measure    │ Links        │
├───────────────────────────────┴──────────────┤
│ Runs · Activity                              │
└──────────────────────────────────────────────┘
```

**For** the States where writing is the work, and it reads like a document rather than a ticket.
**Against** it is the wrong page for a Build or Review Issue, where the Runs are what you came for and they
are below the fold.

## 5. Panels (`v=panels`)

Every section folded to one line that says what is inside it, so the whole Issue fits on a screen and you
open only what you came for. The ruling is the one thing never folded. Built on `<details>`, so the keyboard
and the screen reader get it for nothing.

```
┌──────────────────────────────────────────────┐
│ DEV-2 · Spec · Ada  Checkout rewrite         │ ← sticky
│ ┌ Spec is a Gate — Note, Approve, Reject ──┐ │
│ Description  DEV-2                    open   │
│ Documents    intent v1 · spec v1      open   │
│ Runs         1, latest awaiting_input open   │
│ Activity     5 comments               open   │
│ Facts        assignee, labels, links  open   │
└──────────────────────────────────────────────┘
```

**For** working a queue: scan, act, move on. Every Issue looks the same size whatever is in it.
**Against** everything is one click away rather than there, and a summary line has to be written for each
section — a panel that says "Runs 3" and nothing else is worse than the Runs.

## Choosing

They are not mutually exclusive in the long run: 5's summary lines could fold into 2's rail, and 1's
full-width ruling is a change any of the others could take on its own. What to decide now is the spine.

A question worth answering first, because it decides between them: **what is the commonest reason somebody
opens an Issue in deevy?** If it is to rule, 1. If it is to see what an Agent produced, 2. If it is to catch
up, 3. If it is to write, 4. If it is to triage a queue, 5.
