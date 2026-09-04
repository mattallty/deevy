import { Link, Outlet } from "@tanstack/react-router";
import {
  FolderKanban,
  GitBranch,
  Inbox,
  Bell,
  Radio,
  Settings,
  ShieldCheck,
  Tags,
  Users,
  Bot,
  Plug,
  UsersRound,
  Webhook,
} from "lucide-react";
import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { NewIssueButton } from "@/components/new-issue";
import { useQuery } from "@tanstack/react-query";
import { useLiveEvents } from "@/lib/live";
import { orpc } from "@/lib/orpc";

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Placeholders until the slice that fills them in (docs/plans/m1.md). */
  soon?: boolean;
}

const work: NavItem[] = [
  { to: "/", label: "Projects", icon: FolderKanban },
  { to: "/inbox", label: "Inbox", icon: Inbox },
];

const settings: NavItem[] = [
  { to: "/settings/workspace", label: "Workspace", icon: Settings },
  { to: "/settings/teams", label: "Teams", icon: UsersRound },
  { to: "/settings/labels", label: "Labels", icon: Tags },
  { to: "/settings/repositories", label: "Repositories", icon: GitBranch },
  { to: "/settings/channels", label: "Channels", icon: Radio },
  { to: "/settings/webhooks", label: "Webhooks", icon: Webhook },
  { to: "/settings/notifications", label: "Notifications", icon: Bell },
  { to: "/settings/members", label: "Members", icon: Users },
  { to: "/settings/agents", label: "Agents", icon: Bot },
  { to: "/settings/mcp-clients", label: "MCP clients", icon: Plug },
  { to: "/settings/allowlist", label: "Allowlist", icon: ShieldCheck },
];

export interface ShellProps {
  workspaceName: string;
  memberName: string;
}

/** The frame every signed-in page sits in: the Workspace sidebar, a header, and the route. */
export function AppShell({ workspaceName, memberName }: ShellProps) {
  // Mounted once for the whole signed-in app, so one stream serves every page.
  useLiveEvents(true);

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1">
            <span className="truncate font-semibold">{workspaceName}</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <NavGroup label="Work" items={work} withInboxBadge />
          <NavGroup label="Settings" items={settings} />
        </SidebarContent>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <span className="flex-1" />
          {/* In the header rather than on a Project, so it is one click from
              anywhere and `c` from anywhere (components/new-issue.tsx). */}
          <NewIssueButton />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm">{memberName}</span>
          <SignOutButton />
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 p-6">
          <Outlet />
        </main>
      </SidebarInset>
      <Toaster />
    </SidebarProvider>
  );
}

function NavGroup({
  label,
  items,
  withInboxBadge = false,
}: {
  label: string;
  items: NavItem[];
  withInboxBadge?: boolean;
}) {
  // useLiveEvents invalidates this on any Event, so the badge follows the log.
  const unread = useQuery({
    ...orpc.inbox.unreadCount.queryOptions({ input: {} }),
    enabled: withInboxBadge,
  });

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map(({ to, label: text, icon: Icon, soon }) => (
            <SidebarMenuItem key={to}>
              {soon ? (
                <SidebarMenuButton disabled tooltip={`${text} arrives in a later slice`}>
                  <Icon />
                  <span>{text}</span>
                  <span className="ml-auto text-xs text-muted-foreground">soon</span>
                </SidebarMenuButton>
              ) : (
                <SidebarMenuButton
                  tooltip={text}
                  render={<Link to={to} activeOptions={{ exact: to === "/" }} />}
                >
                  <Icon />
                  <span>{text}</span>
                  {to === "/inbox" && (unread.data?.unread ?? 0) > 0 ? (
                    <span
                      aria-label={`${unread.data?.unread} unread`}
                      className="ml-auto rounded-full bg-primary px-1.5 text-xs text-primary-foreground"
                    >
                      {unread.data?.unread}
                    </span>
                  ) : null}
                </SidebarMenuButton>
              )}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function SignOutButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        const { authClient } = await import("@/lib/auth");
        await authClient.signOut();
      }}
    >
      Sign out
    </Button>
  );
}
