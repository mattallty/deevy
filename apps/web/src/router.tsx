import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  createMemoryHistory,
} from "@tanstack/react-router";
import { ProjectsPage } from "./routes/index.tsx";
import { IssuePage } from "./routes/issues/issue.tsx";
import { BoardPage } from "./routes/projects/board.tsx";
import { ProjectPage } from "./routes/projects/project.tsx";
import { WorkflowPage } from "./routes/projects/workflow.tsx";
import { LabelsPage } from "./routes/settings/labels.tsx";
import { RepositoriesPage } from "./routes/settings/repositories.tsx";
import { TeamsPage } from "./routes/settings/teams.tsx";
import { AllowlistPage } from "./routes/settings/allowlist.tsx";
import { MembersPage } from "./routes/settings/members.tsx";
import { AppShell, type ShellProps } from "./routes/shell.tsx";

/**
 * Routes are declared in code rather than by file convention, so every page is
 * a plain exported component the SPA tests can render on its own.
 */
const rootRoute = createRootRouteWithContext<ShellProps>()({
  component: function Root() {
    return <AppShell {...rootRoute.useRouteContext()} />;
  },
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ProjectsPage,
});
const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$key",
  component: function Project() {
    return <ProjectPage projectKey={projectRoute.useParams().key} />;
  },
});
const boardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$key/board",
  component: function Board() {
    return <BoardPage projectKey={boardRoute.useParams().key} />;
  },
});
const workflowRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$key/settings/workflow",
  component: function Workflow() {
    return <WorkflowPage projectKey={workflowRoute.useParams().key} />;
  },
});
const issueRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/issues/$issueKey",
  component: function Issue() {
    return <IssuePage issueKey={issueRoute.useParams().issueKey} />;
  },
});
const teamsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings/teams",
  component: TeamsPage,
});
const labelsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings/labels",
  component: LabelsPage,
});
const repositoriesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings/repositories",
  component: RepositoriesPage,
});
const membersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings/members",
  component: MembersPage,
});
const allowlistRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings/allowlist",
  component: AllowlistPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  projectRoute,
  boardRoute,
  workflowRoute,
  issueRoute,
  teamsRoute,
  labelsRoute,
  repositoriesRoute,
  membersRoute,
  allowlistRoute,
]);

export interface AppRouterOptions {
  /** Tests drive the routes without a browser URL bar. */
  memory?: boolean;
  initialEntries?: string[];
}

export function createAppRouter(context: ShellProps, options: AppRouterOptions = {}) {
  const memory = options.memory || options.initialEntries !== undefined;
  return createRouter({
    routeTree,
    context,
    ...(memory
      ? { history: createMemoryHistory({ initialEntries: options.initialEntries ?? ["/"] }) }
      : {}),
  });
}

export type AppRouterInstance = ReturnType<typeof createAppRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouterInstance;
  }
}
