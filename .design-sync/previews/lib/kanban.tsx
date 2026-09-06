// The stories for Kanban and its parts. Kept under lib/ with a non-component
// file name: a sibling named like an export is shimmed to the package by the
// story-imports plugin, so `export * from "./Kanban"` would re-export all of it.
import {
  Button,
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanColumnContent,
  KanbanItem,
  KanbanItemHandle,
  KanbanOverlay,
  LabelBadge,
  MemberChip,
  StateBadge,
} from "@deevy/design-system";
import { useState } from "react";
import { issues, states, type IssueRow } from "./fixtures";

// Three of the five States, at w-60: the card captures at 900px, and the app's four w-72 columns would clip at Review.
const columns = [states.todo, states.inProgress, states.review];

function group(rows: IssueRow[]): Record<string, IssueRow[]> {
  const grouped: Record<string, IssueRow[]> = {};
  for (const column of columns) grouped[column.name] = rows.filter((row) => row.state === column);
  return grouped;
}

function Card({
  issue,
  selected = false,
  ghost = false,
}: {
  issue: IssueRow;
  selected?: boolean;
  ghost?: boolean;
}) {
  return (
    <article
      {...(selected ? { "data-selected": "true", "aria-selected": true } : {})}
      className={[
        "flex cursor-default flex-col gap-1.5 rounded-md border bg-card p-2.5 text-sm shadow-xs",
        selected ? "ring-2 ring-ring/50" : "",
        ghost ? "rotate-1 shadow-md" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">{issue.key}</span>
        {issue.state.isGate ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="ml-auto text-gate-foreground dark:text-gate"
            aria-label={`Decide the ${issue.state.name} Gate on ${issue.key}`}
          >
            Decide
          </Button>
        ) : null}
      </div>
      <span className="line-clamp-2 font-medium">{issue.title}</span>
      {issue.labels.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {issue.labels.slice(0, 3).map((label) => (
            <LabelBadge key={label.id} label={label} />
          ))}
        </div>
      ) : null}
      {issue.assignee ? <MemberChip member={issue.assignee} size="xs" /> : null}
    </article>
  );
}

function Board({
  initial,
  selectedKey,
  refusing,
}: {
  initial: Record<string, IssueRow[]>;
  selectedKey?: string;
  refusing?: string[];
}) {
  const [value, setValue] = useState(initial);
  const byId = new Map(
    Object.values(value)
      .flat()
      .map((row) => [row.key, row]),
  );
  return (
    <Kanban value={value} onValueChange={setValue} getItemValue={(issue) => issue.key}>
      <KanbanBoard className="flex auto-rows-auto items-start gap-3 overflow-x-auto pb-4 sm:grid-cols-none">
        {columns.map((column) => {
          const refuses = refusing?.includes(column.name) ?? false;
          return (
            <KanbanColumn
              key={column.name}
              value={column.name}
              render={
                <section
                  aria-label={column.name}
                  {...(refuses ? { "data-refuses": "true" } : {})}
                />
              }
              className={[
                "flex w-60 shrink-0 flex-col gap-2 rounded-lg border bg-muted/30 p-2 transition-opacity",
                column.isGate ? "border-gate/40 bg-gate/5" : "",
                refuses ? "cursor-not-allowed opacity-40" : "",
              ].join(" ")}
            >
              <header className="flex items-center gap-2 px-1 py-0.5">
                <StateBadge state={column} />
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {value[column.name]?.length ?? 0}
                </span>
              </header>
              <KanbanColumnContent value={column.name} className="flex flex-col gap-2">
                {(value[column.name] ?? []).map((issue) => (
                  <KanbanItem key={issue.key} value={issue.key}>
                    <KanbanItemHandle cursor={false}>
                      <Card issue={issue} selected={issue.key === selectedKey} />
                    </KanbanItemHandle>
                  </KanbanItem>
                ))}
              </KanbanColumnContent>
            </KanbanColumn>
          );
        })}
      </KanbanBoard>
      <KanbanOverlay>
        {({ value: id }) => {
          const issue = byId.get(String(id));
          return issue ? <Card issue={issue} ghost /> : null;
        }}
      </KanbanOverlay>
    </Kanban>
  );
}

/** The Board: a column per State, a StateBadge and a count in each header, the Gate column tinted amber, cards with key, title, Labels, assignee. */
export const IssueBoard = () => <Board initial={group(issues)} selectedKey="DEV-41" />;

/** Mid-drag, on the Workspace board: a column the dragged Issue's Project has no State for is dimmed before the drop. */
export const RefusingColumns = () => <Board initial={group(issues)} refusing={["Review"]} />;

/** A Project just started: most columns empty, and the empty column is still a drop target. */
export const MostlyEmpty = () => (
  <Board
    initial={group(issues.filter((row) => row.state === states.todo || row.key === "DEV-38"))}
  />
);
