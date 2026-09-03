import { Link, Outlet } from "@tanstack/react-router";
import { FolderKanban, Inbox, Settings, ShieldCheck, Users } from "lucide-react";
import type { ComponentType } from "react";
import { Button } from "@/components/ui/button.tsx";
import { authClient } from "@/lib/auth.ts";

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Placeholders until the slice that fills them in (docs/plans/m1.md). */
  soon?: boolean;
}

const nav: NavItem[] = [
  { to: "/", label: "Projects", icon: FolderKanban },
  { to: "/inbox", label: "Inbox", icon: Inbox, soon: true },
  { to: "/settings/members", label: "Members", icon: Users },
  { to: "/settings/allowlist", label: "Allowlist", icon: ShieldCheck },
];

export interface ShellProps {
  workspaceName: string;
  memberName: string;
}

/** The frame every signed-in page sits in: a sidebar, a header, and the route. */
export function AppShell({ workspaceName, memberName }: ShellProps) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col gap-1 border-r bg-sidebar p-4 sm:flex">
        <div className="mb-4 flex items-center gap-2 px-2">
          <Settings className="size-4 text-muted-foreground" />
          <span className="truncate font-semibold">{workspaceName}</span>
        </div>
        <nav className="flex flex-col gap-1">
          {nav.map(({ to, label, icon: Icon, soon }) =>
            soon ? (
              <span
                key={to}
                className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground/60"
              >
                <Icon className="size-4" />
                {label}
                <span className="ml-auto text-xs">soon</span>
              </span>
            ) : (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent [&.active]:bg-sidebar-accent [&.active]:font-medium"
                activeOptions={{ exact: to === "/" }}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            ),
          )}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b px-6 py-3">
          <span className="text-sm text-muted-foreground sm:hidden">{workspaceName}</span>
          <span className="flex-1" />
          <span className="text-sm">{memberName}</span>
          <Button variant="outline" size="sm" onClick={() => authClient.signOut()}>
            Sign out
          </Button>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
