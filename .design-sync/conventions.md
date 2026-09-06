# Building with deevy's design system

deevy is project management where Humans and Agents are peers on the same Issues. The UI has one memorable idea: **you can always tell who is a Human and who is an Agent, and what is waiting on a Human.** Everything else is quiet. Use the vocabulary: Member, Human, Agent, Sponsor, Workspace, Project, Issue, State, Gate, Run, Document, Event, Notification, Channel, Label. Never "ticket", "task", "status", "user", "bot".

## Setup

- No provider is needed: components style themselves from `styles.css` (tokens on `:root`, fonts, every utility). Wrap `Sidebar*` in `SidebarProvider`; `Tooltip` needs its `TooltipTrigger` inside it. Theme is a class: add `dark` on `<html>` for dark mode; never a media query.
- Base UI, not Radix: a custom trigger takes `render={<a href="…" />}` (plus `nativeButton={false}` on a Button that renders a link), never `asChild`. Every `SelectItem` sits in a `SelectGroup`; a `DropdownMenuLabel` sits in a `DropdownMenuGroup`.
- Icons are `lucide-react`; inside a Button mark them `data-icon="inline-start"` / `"inline-end"`.

## Styling idiom: Tailwind utilities on the app's tokens

Style your own layout with Tailwind classes; never write CSS or inline colours. Colours are the semantic tokens only — `bg-background text-foreground`, `bg-card`, `bg-popover`, `bg-muted text-muted-foreground`, `bg-accent`, `bg-primary text-primary-foreground` (indigo, the one action colour), `text-destructive bg-destructive/10`, `border-border`, `ring-ring`, `bg-sidebar text-sidebar-foreground`. The three saturated slots that carry the idea: `text-human` / `ring-human` / `bg-human/15` (sky, a Human), `text-agent` / `ring-agent` / `bg-agent/15` (rose, an Agent), `text-gate` / `border-gate` / `bg-gate/20` (amber, a Gate and anything waiting on a ruling); other States use `bg-state-backlog`, `bg-state-active`, `bg-state-done`. Opacity steps `/5 /10 /15 /20 /30 /40 /50` exist on those. Nothing else on a screen is saturated.

Type: `text-xs` (12px) for meta and badges, `text-sm` (14px) for anything a person operates or reads in a row, `text-base` (16px) prose, `text-xl` (20px) a page title; `font-medium` / `font-semibold`; `font-mono` (JetBrains Mono) for Issue keys, `@handles`, Event kinds, API keys, shortcut hints; `tabular-nums` on times and counts. Spacing utilities (`gap-2`, `p-4`, `px-3`, `space-y-3`) use the app's unit (5% roomier than Tailwind's). Rows are `h-8` compact or `h-10` comfortable; the sidebar is `w-60` collapsing to `w-12`; radius is `rounded-md` (8px). Cards (`Card`, `rounded-lg border bg-card`) only for things that are cards (a Run, a Channel); lists are edge-to-edge `DataTable`s under a `PageHeader` with a 40px filter bar; an Issue page is `grid grid-cols-1 gap-8 @3xl:grid-cols-[minmax(0,1fr)_300px]` (a container query on the page) — main plus a 300px rail with the Gate ruling card always on top; a side peek is `max-w-[720px]`.

## Compose with the real pieces

- A Member is always `MemberChip` (round sky ring = Human, square rose ring = Agent); a State is `StateBadge` (dot, or the amber diamond for a Gate); a Label is `LabelBadge` (`[[scope] name]`, `outline` on rows, `solid` in Settings); a Run's status is `RunStatus`; a shortcut hint is `Shortcut keys="mod+k"`.
- A page starts with `PageHeader` (title, description, actions); a Settings page is `SettingsPage` › `SettingsSection`s; an empty list is `Empty` whose words say what emptied it ("No Issues match your filters" with a Clear filters action).
- Toggling buttons are a `ToggleGroup variant="outline" spacing={0}`; buttons that act are a `ButtonGroup`; views of one thing are `Tabs`. Delete, Remove, Revoke, Archive are `variant="destructive"`; Suspend and Reinstate are `outline`.
- Body text a Member wrote is `Markdown` (markdown in) and is edited in `MarkdownEditor`; `⌘Enter` is the only submit key.

## Where the truth lives

Read `styles.css` and the `_ds_bundle.css` it imports for the compiled utilities and tokens; `components/<group>/<Name>/<Name>.prompt.md` for how each component is composed (with worked examples) and `<Name>.d.ts` for its props. Groups: Actions, Forms, Overlays, Navigation, Data display, Members States and Runs.

## An idiomatic screen

```tsx
const { PageHeader, Button, DataTable, MemberChip, StateBadge, LabelBadge } = window.Deevy;

<div className="flex min-h-svh flex-col bg-background text-foreground">
  <div className="px-6 pt-5">
    <PageHeader
      title="All Issues"
      description="Every Issue in the Workspace, newest change first."
      actions={<Button>New Issue</Button>}
    />
  </div>
  <DataTable
    aria-label="Issues"
    columns={[
      {
        id: "key",
        header: "Key",
        cell: (row) => <span className="font-mono text-xs text-muted-foreground">{row.key}</span>,
        className: "w-24",
      },
      {
        id: "title",
        header: "Title",
        cell: (row) => (
          <span className="flex items-center gap-2">
            <span className="truncate font-medium">{row.title}</span>
            <LabelBadge label={row.label} />
          </span>
        ),
        className: "max-w-0 w-full",
      },
      {
        id: "state",
        header: "State",
        cell: (row) => <StateBadge state={row.state} />,
        className: "w-36",
      },
      {
        id: "assignee",
        header: "Assignee",
        cell: (row) => <MemberChip member={row.assignee} size="xs" />,
        className: "w-44",
      },
    ]}
    rows={issues}
    getRowId={(row) => row.key}
  />
</div>;
```
