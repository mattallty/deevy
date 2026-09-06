// The stories for ScrollArea and its parts. Kept under lib/ with a non-component
// file name: a sibling named like an export is shimmed to the package by the
// story-imports plugin, so `export * from "./ScrollArea"` would re-export all of it.
import { LabelBadge, MemberChip, ScrollArea, ScrollBar, StateBadge } from "@deevy/design-system";
import { ada, builder, grace, issues, labels, planner, states } from "./fixtures";

// More Issues than fit, so the scrollbar has something to do.
const backlog = [
  ...issues,
  {
    key: "DEV-36",
    title: "Inbox keeps the read filter across reloads",
    state: states.todo,
    assignee: grace,
    labels: [labels.backend],
    updated: "6d",
  },
  {
    key: "DEV-35",
    title: "Agent key rotation without a restart",
    state: states.backlog,
    assignee: null,
    labels: [labels.backend],
    updated: "1w",
  },
  {
    key: "DEV-34",
    title: "Run log folds routine steps",
    state: states.done,
    assignee: builder,
    labels: [labels.epic],
    updated: "1w",
  },
  {
    key: "DEV-33",
    title: "Planner drafts the Spec from the Issue title",
    state: states.done,
    assignee: planner,
    labels: [labels.epic, labels.docs],
    updated: "2w",
  },
  {
    key: "DEV-32",
    title: "Suspend an Agent when its Sponsor leaves",
    state: states.done,
    assignee: ada,
    labels: [],
    updated: "2w",
  },
];

/** A list taller than its frame: the vertical scrollbar is the thumb in `border` on the right. */
export const IssueList = () => (
  <ScrollArea className="h-48 w-full rounded-md border bg-card">
    <ul className="flex flex-col divide-y">
      {backlog.map((issue) => (
        <li key={issue.key} className="flex items-center gap-3 px-3 py-2 text-sm">
          <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">{issue.key}</span>
          <span className="min-w-0 flex-1 truncate font-medium">{issue.title}</span>
          <StateBadge state={issue.state} size="sm" />
        </li>
      ))}
    </ul>
  </ScrollArea>
);

/** A row wider than its frame — the Board's columns — with the horizontal ScrollBar along the bottom. */
export const Horizontal = () => (
  <ScrollArea className="w-full rounded-md border bg-muted/30">
    <div className="flex w-max gap-3 p-3">
      {[states.backlog, states.todo, states.inProgress, states.review, states.done].map((state) => (
        <div
          key={state.name}
          className="flex w-56 shrink-0 flex-col gap-2 rounded-md border bg-card p-2"
        >
          <StateBadge state={state} />
          {issues
            .filter((issue) => issue.state === state)
            .map((issue) => (
              <div
                key={issue.key}
                className="flex flex-col gap-1 rounded-md border bg-background p-2 text-sm"
              >
                <span className="font-mono text-xs text-muted-foreground">{issue.key}</span>
                <span className="line-clamp-2 font-medium">{issue.title}</span>
              </div>
            ))}
        </div>
      ))}
    </div>
    <ScrollBar orientation="horizontal" />
  </ScrollArea>
);

/** The Members list in the sidebar: a short frame with avatars, scrolling. */
export const Members = () => (
  <ScrollArea className="h-32 w-64 rounded-md border bg-card">
    <ul className="flex flex-col gap-0.5 p-2">
      {[ada, grace, planner, builder, ada, grace, planner, builder].map((member, index) => (
        <li
          key={`${member.id}-${String(index)}`}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
        >
          <MemberChip member={member} size="sm" />
          {member.kind === "agent" ? <LabelBadge label={labels.epic} className="ml-auto" /> : null}
        </li>
      ))}
    </ul>
  </ScrollArea>
);
