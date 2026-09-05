import { MemberChip } from "@/components/member-chip";
import { StateBadge } from "@/components/state-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { issues, states, type FixtureIssue, type FixtureState } from "@/dev/fixtures";
import { cn } from "@/lib/utils";
import { Variant } from "../mockups";

function Card({ issue, project }: { issue: FixtureIssue; project: boolean }) {
  return (
    <article className="flex flex-col gap-1.5 rounded-md border bg-card p-2.5 text-sm shadow-xs">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-muted-foreground">{issue.key}</span>
        {project ? (
          <span className="truncate text-xs text-muted-foreground">· {issue.project.name}</span>
        ) : null}
        {issue.state.isGate ? (
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto"
            aria-label={`Decide the ${issue.state.name} Gate on ${issue.key}`}
          >
            Decide
          </Button>
        ) : null}
      </div>
      <p className="line-clamp-2 font-medium">{issue.title}</p>
      {issue.labels.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {issue.labels.slice(0, 3).map((label) => (
            <Badge key={label.id} variant="outline" className="font-normal">
              {label.scope ? `${label.scope}: ${label.name}` : label.name}
            </Badge>
          ))}
        </div>
      ) : null}
      {issue.assignee ? <MemberChip member={issue.assignee} size="xs" /> : null}
    </article>
  );
}

function Board({
  projectsInHeader,
  projectOnCard,
  dragging,
}: {
  projectsInHeader: boolean;
  projectOnCard: boolean;
  dragging?: FixtureIssue;
}) {
  const columnOf = (state: FixtureState) =>
    issues.filter((issue) => issue.state.name === state.name);
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {states.map((state) => {
        const refuses = dragging ? !state.projects.includes(dragging.project.key) : false;
        return (
          <section
            key={state.id}
            data-slot="board-column"
            aria-label={state.name}
            {...(refuses ? { "data-refuses": "true" } : {})}
            className={cn(
              "flex w-64 shrink-0 flex-col gap-2 rounded-lg border bg-muted/30 p-2",
              state.isGate && "border-gate/40 bg-gate/5",
              refuses && "cursor-not-allowed opacity-40",
            )}
          >
            <header className="flex flex-col gap-0.5 px-1">
              <div className="flex items-center gap-2">
                <StateBadge state={state} />
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {columnOf(state).length}
                </span>
              </div>
              {projectsInHeader ? (
                <span className="font-mono text-[11px] text-muted-foreground/70">
                  {state.projects.join(" · ")}
                </span>
              ) : null}
            </header>
            <div className="flex flex-col gap-2">
              {columnOf(state).map((issue) => (
                <Card key={issue.key} issue={issue} project={projectOnCard} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function KanbanMockups() {
  return (
    <>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Columns are State names folded across Projects: DEV has Intent → Spec → Build → Review →
        Done, OPS has Todo → Build → Done. Static here; the real one drags.
      </p>
      <Variant
        n={1}
        title="Header: State and count"
        note="The Project Board's header as it is. Below: the same board while OPS-4 is being dragged — the columns OPS has no State for dim before the drop."
      >
        <Board projectsInHeader={false} projectOnCard={false} />
        <div className="mt-3 text-xs text-muted-foreground">While dragging OPS-4:</div>
        <Board
          projectsInHeader={false}
          projectOnCard={false}
          dragging={issues.find((issue) => issue.key === "OPS-4")}
        />
      </Variant>
      <Variant
        n={2}
        title="Header names the Projects that have this State"
        note="A faint line under the State: DEV · OPS. Tells you where a drop can land before you drag."
      >
        <Board projectsInHeader={true} projectOnCard={false} />
      </Variant>
      <Variant
        n={3}
        title="Project on the card"
        note="Each card names its Project beside the key. Redundant with the key's prefix, explicit for a Workspace with many Projects."
      >
        <Board projectsInHeader={false} projectOnCard={true} />
      </Variant>
    </>
  );
}
