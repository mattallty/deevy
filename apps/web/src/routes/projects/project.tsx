import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { IssuesSearch } from "@/components/issue-filters";
import { Badge } from "@/components/ui/badge";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { IssuesPage } from "@/routes/issues/list";
import { isNotFound, NotFoundPage } from "@/routes/not-found";

const tabs = [
  { label: "Issues", to: "" },
  { label: "Board", to: "/board" },
  { label: "Workflow", to: "/workflow" },
] as const;

/**
 * A Project's frame: its header, its Workflow as a strip of States, and the
 * tabs — Issues, Board, Workflow — each a route of its own so it is
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

  const { key, name, description, archivedAt } = project.data;
  const base = `/projects/${key}`;
  const current = tabs.find((tab) => tab.to !== "" && pathname.startsWith(base + tab.to))?.to ?? "";

  return (
    <section className="flex flex-1 flex-col gap-5 md:min-h-0">
      <header className="flex flex-col gap-3 border-b">
        {/*
         * The key is in every Issue key below and in the sidebar, and the Team
         * that owns a Project is a column on the Projects list, under a heading
         * that says so. Above a title it was a bare word — "Platform" — that
         * named nothing, so what is left here is the one thing this page has to
         * say about itself before its name.
         */}
        {archivedAt ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge variant="outline">Archived</Badge>
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">{name}</h1>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
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
  // No form of its own: the top bar's New Issue (and `c`) already knows this Project.
  return <IssuesPage search={search} onSearch={onSearch} fixedProject={projectKey} embedded />;
}
