import { Link, Outlet } from "@tanstack/react-router";
import { FolderKanban, Inbox, ShieldCheck, Tags, Users, UsersRound } from "lucide-react";
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
import { useLiveEvents } from "@/lib/live";

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Placeholders until the slice that fills them in (docs/plans/m1.md). */
  soon?: boolean;
}

const work: NavItem[] = [
  { to: "/", label: "Projects", icon: FolderKanban },
  { to: "/inbox", label: "Inbox", icon: Inbox, soon: true },
];

const settings: NavItem[] = [
  { to: "/settings/teams", label: "Teams", icon: UsersRound },
  { to: "/settings/labels", label: "Labels", icon: Tags },
  { to: "/settings/members", label: "Members", icon: Users },
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
          <NavGroup label="Work" items={work} />
          <NavGroup label="Settings" items={settings} />
        </SidebarContent>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <span className="flex-1" />
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

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
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
