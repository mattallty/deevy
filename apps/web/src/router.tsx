import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  createMemoryHistory,
  redirect,
  useNavigate,
} from "@tanstack/react-router";

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /** The page owns its padding and height — the Inbox's two panes — so the shell adds none. */
    bleed?: boolean;
  }
}
import { parseIssuesSearch, type IssuesSearch } from "./components/issue-filters.tsx";
import { IssuesPage } from "./routes/issues/list.tsx";
import { ProjectsPage } from "./routes/projects/projects.tsx";
import { ConsentPage } from "./routes/consent.tsx";
import { TokensPage } from "./routes/dev/tokens.tsx";
import { InboxPage, parseInboxSearch } from "./routes/inbox.tsx";
import { IssuePage } from "./routes/issues/issue.tsx";
import { BoardPage } from "./routes/projects/board.tsx";
import { ProjectIssuesTab, ProjectLayout } from "./routes/projects/project.tsx";
import { ProjectSettingsPage } from "./routes/projects/project-settings.tsx";
import { WorkflowPage } from "./routes/projects/workflow.tsx";
import { ChannelsPage } from "./routes/settings/channels.tsx";
import { EventLogPage } from "./routes/settings/events.tsx";
import { LabelsPage } from "./routes/settings/labels.tsx";
import { SettingsLayout } from "./routes/settings/layout.tsx";
import { NotificationsPage } from "./routes/settings/notifications.tsx";
import { RepositoriesPage } from "./routes/settings/repositories.tsx";
import { TeamsPage } from "./routes/settings/teams.tsx";
import { WebhooksPage } from "./routes/settings/webhooks.tsx";
import { WorkspacePage } from "./routes/settings/workspace.tsx";
import { AllowlistPage } from "./routes/settings/allowlist.tsx";
import { McpClientsPage } from "./routes/settings/mcp-clients.tsx";
import { MembersPage } from "./routes/settings/members.tsx";
import { AgentsPage } from "./routes/settings/agents.tsx";
import { AgentPage } from "./routes/settings/agent.tsx";
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

// Home is the Issues you may see; the filters and the peek ride in the URL, so
// a view is a link and Back undoes a filter (docs/plans/ui-redesign.md slice 2).
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  validateSearch: (search: Record<string, unknown>) => parseIssuesSearch(search),
  component: function Issues() {
    const search = indexRoute.useSearch();
    const navigate = indexRoute.useNavigate();
    return (
      <IssuesPage
        search={search}
        onSearch={(patch) =>
          void navigate({
            search: (previous) => parseIssuesSearch({ ...previous, ...patch }),
          })
        }
      />
    );
  },
});
const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects",
  component: ProjectsPage,
});
// A Project is a layout route: header and tabs, with each tab a child so it is
// linkable alone. The Issue filters and the peek ride on the layout's search,
// so the Issues tab and the Board share them (docs/plans/ui-redesign.md).
const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$key",
  validateSearch: (search: Record<string, unknown>) => parseIssuesSearch(search),
  component: function Project() {
    return <ProjectLayout projectKey={projectRoute.useParams().key} />;
  },
});
function useProjectSearch() {
  const search = projectRoute.useSearch();
  // The router's own navigate, not the layout route's: a route's navigate takes
  // its path as `from`, and a tab writing its search would land on the layout —
  // the Board losing "/board" the moment a peek opened. `to: "."` is where we are.
  const navigate = useNavigate();
  const onSearch = (patch: Partial<IssuesSearch>) =>
    void navigate({
      to: ".",
      search: (previous) =>
        parseIssuesSearch({ ...(previous as Record<string, unknown>), ...patch }) as never,
    });
  return { search, onSearch };
}
const projectIssuesRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "/",
  component: function ProjectIssues() {
    const { search, onSearch } = useProjectSearch();
    return (
      <ProjectIssuesTab
        projectKey={projectRoute.useParams().key}
        search={search}
        onSearch={onSearch}
      />
    );
  },
});
const inboxRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/inbox",
  staticData: { bleed: true },
  validateSearch: (search: Record<string, unknown>) => parseInboxSearch(search),
  component: function InboxRoute() {
    const search = inboxRoute.useSearch();
    const navigate = inboxRoute.useNavigate();
    return (
      <InboxPage
        search={search}
        onSearch={(patch) =>
          void navigate({ search: (previous) => parseInboxSearch({ ...previous, ...patch }) })
        }
      />
    );
  },
});
const boardRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "board",
  component: function Board() {
    const { search, onSearch } = useProjectSearch();
    return (
      <BoardPage projectKey={projectRoute.useParams().key} search={search} onSearch={onSearch} />
    );
  },
});
const workflowRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "workflow",
  component: function Workflow() {
    return <WorkflowPage projectKey={projectRoute.useParams().key} />;
  },
});
const projectSettingsRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "settings",
  component: function ProjectSettings() {
    return <ProjectSettingsPage projectKey={projectRoute.useParams().key} />;
  },
});
// Where the Workflow editor used to live; links in the wild keep working.
const oldWorkflowRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "settings/workflow",
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/projects/$key/workflow", params: { key: params.key } });
  },
});
const issueRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/issues/$issueKey",
  component: function Issue() {
    return <IssuePage issueKey={issueRoute.useParams().issueKey} />;
  },
});

// The Settings area: one layout route with its own navigation, and the pages
// as its children so `/settings/<page>` keeps every URL it had.
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsLayout,
});
const settingsIndexRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/settings/workspace" });
  },
});
// Each declared with its literal path, so the router's types know every `to`.
const workspaceRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "workspace",
  component: WorkspacePage,
});
const teamsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "teams",
  component: TeamsPage,
});
const labelsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "labels",
  component: LabelsPage,
});
const repositoriesRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "repositories",
  component: RepositoriesPage,
});
const membersRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "members",
  component: MembersPage,
});
const agentsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "agents",
  component: AgentsPage,
});
const channelsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "channels",
  component: ChannelsPage,
});
const webhooksRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "webhooks",
  component: WebhooksPage,
});
const notificationsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "notifications",
  component: NotificationsPage,
});
const allowlistRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "allowlist",
  component: AllowlistPage,
});
const mcpClientsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "mcp-clients",
  component: McpClientsPage,
});
const eventLogRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "events",
  component: EventLogPage,
});
const agentRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "agents/$memberId",
  component: function AgentRoute() {
    return <AgentPage memberId={agentRoute.useParams().memberId} />;
  },
});

// Where the OAuth provider sends a Human mid-authorization (packages/core/src/auth.ts).
const consentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/consent",
  component: ConsentPage,
});
// The design tokens, drawn: a page for reviewing the palette and the type
// scale in both themes. Not linked from anywhere; a developer knows the URL.
const tokensRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dev/tokens",
  component: TokensPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  projectsRoute,
  inboxRoute,
  projectRoute.addChildren([
    projectIssuesRoute,
    boardRoute,
    workflowRoute,
    projectSettingsRoute,
    oldWorkflowRoute,
  ]),
  issueRoute,
  settingsRoute.addChildren([
    settingsIndexRoute,
    workspaceRoute,
    teamsRoute,
    labelsRoute,
    repositoriesRoute,
    membersRoute,
    agentsRoute,
    agentRoute,
    channelsRoute,
    webhooksRoute,
    notificationsRoute,
    allowlistRoute,
    mcpClientsRoute,
    eventLogRoute,
  ]),
  consentRoute,
  tokensRoute,
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
