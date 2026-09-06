import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { IssuesSearch } from "@/components/issue-filters";
import { StateBadge } from "@/components/state-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { IssuesPage } from "@/routes/issues/list";
import { isNotFound, NotFoundPage } from "@/routes/not-found";

const tabs = [
  { label: "Issues", to: "" },
  { label: "Board", to: "/board" },
  { label: "Workflow", to: "/workflow" },
  { label: "Settings", to: "/settings" },
] as const;

/**
 * A Project's frame: its header, its Workflow as a strip of States, and the
 * tabs — Issues, Board, Workflow, Settings — each a route of its own so it is
 * linkable and testable alone (docs/plans/ui-redesign.md slice 8).
 */
export function ProjectLayout({ projectKey }: { projectKey: string }) {
  const project = useQuery(orpc.projects.get.queryOptions({ input: { key: projectKey } }));
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (project.isPending) return <p className="text-muted-foreground">Loading Project…</p>;
  if (project.isError) {
    if (isNotFound(project.error)) {
      return <NotFoundPage what={`Project ${projectKey}`} detail={project.error.message} />;
    }
    return (
      <p className="text-destructive">
        Could not load {projectKey}: {project.error.message}
      </p>
    );
  }

  const { key, name, description, team, states, archivedAt } = project.data;
  const base = `/projects/${key}`;
  const current = tabs.find((tab) => tab.to !== "" && pathname.startsWith(base + tab.to))?.to ?? "";

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-3 border-b">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-mono text-muted-foreground">{key}</span>
          {team ? <span className="text-muted-foreground">{team.name}</span> : null}
          {archivedAt ? <Badge variant="outline">Archived</Badge> : null}
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">{name}</h1>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        <ul aria-label="Workflow" className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {states.map((state) => (
            <li key={state.id}>
              <StateBadge
                state={{
                  name: state.name,
                  isGate: state.isGate,
                  category: state.category as "backlog" | "active" | "done",
                }}
              />
            </li>
          ))}
        </ul>
        <nav aria-label="Project" className="-mb-px flex gap-1">
          {tabs.map((tab) => {
            const active = tab.to === current;
            return (
              <Link
                key={tab.label}
                to={`${base}${tab.to}` as "/"}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px border-b-2 px-3 py-2 text-sm hover:text-foreground",
                  active
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <Outlet />
    </section>
  );
}

/**
 * The Issues tab: a one-line form that adds one, then the same list as the
 * home, fixed to this Project. The form stays because it is the right thing
 * when you are already looking at a Project and know the answer.
 */
export function ProjectIssuesTab({
  projectKey,
  search,
  onSearch,
}: {
  projectKey: string;
  search: IssuesSearch;
  onSearch: (patch: Partial<IssuesSearch>) => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const create = useMutation(
    orpc.issues.create.mutationOptions({
      onSuccess: async () => {
        setTitle("");
        await queryClient.invalidateQueries({ queryKey: orpc.issues.key() });
      },
    }),
  );

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex items-end gap-3"
        onSubmit={(submitted) => {
          submitted.preventDefault();
          if (title.trim()) create.mutate({ projectKey, title: title.trim() });
        }}
      >
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="new-issue">New Issue</Label>
          <Input
            id="new-issue"
            value={title}
            placeholder="What needs doing?"
            onChange={(changed) => setTitle(changed.target.value)}
          />
        </div>
        <Button type="submit" disabled={create.isPending || !title.trim()}>
          Add Issue
        </Button>
      </form>
      {create.error ? <p className="text-sm text-destructive">{create.error.message}</p> : null}
      <IssuesPage search={search} onSearch={onSearch} fixedProject={projectKey} embedded />
    </div>
  );
}
