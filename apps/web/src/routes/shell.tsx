import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronsUpDown,
  FolderKanban,
  Inbox,
  LogOut,
  Monitor,
  Moon,
  Search,
  Settings,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { CommandPalette } from "@/components/command-palette";
import { Shortcut } from "@/components/kbd-hint";
import { MemberChip } from "@/components/member-chip";
import { NewIssueButton, NewIssueProvider } from "@/components/new-issue";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { useLiveEvents } from "@/lib/live";
import { orpc } from "@/lib/orpc";
import { useShortcut } from "@/lib/shortcuts";

export interface ShellProps {
  workspaceName: string;
  memberName: string;
  /** The signed-in Member, for the chip in the footer. Absent, the name alone is shown. */
  member?: {
    id: string;
    kind: "human" | "agent";
    handle: string | null;
    role: "admin" | "member";
    image: string | null;
  };
}

/**
 * The frame every signed-in page sits in (docs/plans/ui-redesign.md, slice 1):
 * a sidebar that folds to its icons, with the Inbox as its only badge, the
 * Projects listed rather than hidden behind a page, and Settings as a door to
 * its own area; the command palette on ⌘K; and the page, full width.
 */
export function AppShell({ workspaceName, memberName, member }: ShellProps) {
  // Mounted once for the whole signed-in app, so one stream serves every page.
  useLiveEvents(true);
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const projects = useQuery(orpc.projects.list.queryOptions({ input: {} }));

  useShortcut("mod+k", () => setPaletteOpen((open) => !open), { global: true });
  useShortcut("g i", () => void navigate({ to: "/inbox" }));
  useShortcut("g p", () => void navigate({ to: "/" }));
  useShortcut("g s", () => void navigate({ to: "/settings/workspace" }));

  const me = {
    id: member?.id ?? "me",
    kind: member?.kind ?? ("human" as const),
    handle: member?.handle ?? null,
    user: { name: memberName, image: member?.image ?? null },
  };

  return (
    <SidebarProvider>
      <NewIssueProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="lg"
                  tooltip={workspaceName}
                  render={<Link to="/" />}
                  className="font-semibold"
                >
                  <span
                    aria-hidden
                    className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary font-mono text-xs text-primary-foreground"
                  >
                    {workspaceName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="truncate">{workspaceName}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Search or jump" onClick={() => setPaletteOpen(true)}>
                  <Search />
                  <span className="text-muted-foreground">Search or jump…</span>
                  <Shortcut keys="mod+k" className="ml-auto" />
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <NewIssueButton variant="outline" size="sm" withShortcut />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton tooltip="Inbox" render={<Link to="/inbox" />}>
                      <Inbox />
                      <span>Inbox</span>
                    </SidebarMenuButton>
                    <InboxBadge />
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip="Projects"
                      render={<Link to="/" activeOptions={{ exact: true }} />}
                    >
                      <FolderKanban />
                      <span>Projects</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {projects.data && projects.data.projects.length > 0 ? (
              <SidebarGroup>
                <SidebarGroupLabel>Projects</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {projects.data.projects.map((project) => (
                      <SidebarMenuItem key={project.id}>
                        <SidebarMenuButton
                          tooltip={project.name}
                          render={<Link to="/projects/$key" params={{ key: project.key }} />}
                        >
                          <span className="flex size-4 shrink-0 items-center justify-center font-mono text-[10px] font-medium text-muted-foreground">
                            {project.key.slice(0, 3)}
                          </span>
                          <span className="truncate">{project.name}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ) : null}
          </SidebarContent>

          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Settings" render={<Link to="/settings/workspace" />}>
                  <Settings />
                  <span>Settings</span>
                  <Shortcut keys="g s" className="ml-auto" />
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <MemberMenu me={me} />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>

        <SidebarInset>
          <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-4" />
            <span className="flex-1" />
          </div>
          {/* SidebarInset is the <main>; this is the page inside it. */}
          <div className="min-w-0 flex-1 p-6">
            <Outlet />
          </div>
        </SidebarInset>

        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          projects={(projects.data?.projects ?? []).map(({ key, name }) => ({ key, name }))}
        />
        <Toaster />
      </NewIssueProvider>
    </SidebarProvider>
  );
}

/** The unread count, live: useLiveEvents re-reads the inbox on every Event that could owe one. */
function InboxBadge() {
  const unread = useQuery(orpc.inbox.unreadCount.queryOptions({ input: {} }));
  const count = unread.data?.unread ?? 0;
  if (count === 0) return null;
  return (
    <SidebarMenuBadge
      aria-label={`${String(count)} unread`}
      className="bg-gate text-gate-foreground rounded-full px-1.5 font-mono text-[11px] font-medium"
    >
      {count}
    </SidebarMenuBadge>
  );
}

function MemberMenu({
  me,
}: {
  me: {
    id: string;
    kind: "human" | "agent";
    handle: string | null;
    user: { name: string; image: string | null };
  };
}) {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<SidebarMenuButton size="lg" tooltip={me.user.name} className="min-w-0" />}
      >
        <MemberChip member={me} size="md" className="min-w-0 flex-1" />
        <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span>{me.user.name}</span>
          {me.handle ? (
            <span className="font-mono text-xs font-normal text-muted-foreground">
              @{me.handle}
            </span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground">Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
            <DropdownMenuRadioItem value="system">
              <Monitor />
              System
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="light">
              <Sun />
              Light
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon />
              Dark
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            const { authClient } = await import("@/lib/auth");
            await authClient.signOut();
          }}
        >
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
