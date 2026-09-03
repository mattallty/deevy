import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { IssueList } from "./issue-list.tsx";
import { Badge } from "@/components/ui/badge";
import { orpc } from "@/lib/orpc.ts";

/** A Project's header and its Workflow. The Issue list arrives in slice 4. */
export function ProjectPage({ projectKey }: { projectKey: string }) {
  const project = useQuery(orpc.projects.get.queryOptions({ input: { key: projectKey } }));

  if (project.isPending) return <p className="text-muted-foreground">Loading Project…</p>;
  if (project.isError) {
    return (
      <p className="text-destructive">
        Could not load {projectKey}: {project.error.message}
      </p>
    );
  }

  const { key, name, description, team, states, archivedAt } = project.data;
  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{key}</Badge>
          {team ? <span className="text-sm text-muted-foreground">{team.name}</span> : null}
          {archivedAt ? <Badge variant="outline">Archived</Badge> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="flex-1 text-2xl font-semibold">{name}</h1>
          <Button
            variant="outline"
            size="sm"
            render={<Link to="/projects/$key/board" params={{ key }} />}
          >
            Board
          </Button>
          <Button
            variant="ghost"
            size="sm"
            render={<Link to="/projects/$key/settings/workflow" params={{ key }} />}
          >
            Workflow
          </Button>
        </div>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </header>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Workflow</h2>
        <ul aria-label="Workflow" className="flex flex-wrap gap-2">
          {states.map((state) => (
            <li
              key={state.id}
              className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
            >
              {state.name}
              {state.isGate ? <Badge variant="outline">Gate</Badge> : null}
            </li>
          ))}
        </ul>
      </div>

      <IssueList projectKey={key} />
    </section>
  );
}
