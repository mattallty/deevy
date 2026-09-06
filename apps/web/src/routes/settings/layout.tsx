import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export interface SettingsPage {
  label: string;
  to: string;
}

/**
 * The Settings area's own navigation: four groups for what were eleven flat
 * links (docs/plans/ui-redesign.md). Shared with the command palette, so a
 * page is reachable by the same name from either.
 */
export const settingsNav: Array<{ group: string; pages: SettingsPage[] }> = [
  {
    group: "Workspace",
    pages: [
      { label: "General", to: "/settings/workspace" },
      { label: "Members", to: "/settings/members" },
      { label: "Teams", to: "/settings/teams" },
      { label: "Allowlist", to: "/settings/allowlist" },
      { label: "Event log", to: "/settings/events" },
    ],
  },
  {
    group: "Work",
    pages: [
      { label: "Labels", to: "/settings/labels" },
      { label: "Repositories", to: "/settings/repositories" },
    ],
  },
  {
    group: "Agents and delivery",
    pages: [
      { label: "Agents", to: "/settings/agents" },
      { label: "Channels", to: "/settings/channels" },
      { label: "Webhooks", to: "/settings/webhooks" },
    ],
  },
  {
    group: "You",
    pages: [
      { label: "Notifications", to: "/settings/notifications" },
      { label: "MCP clients", to: "/settings/mcp-clients" },
    ],
  },
];

/**
 * The frame every Settings page sits in: a second, narrower navigation beside
 * the page, with the primary sidebar folded to its icons so the two levels
 * read as two levels.
 */
export function SettingsLayout() {
  const { open, setOpen } = useSidebar();
  // Folded while here, and put back the way it was found on the way out — a
  // Human who keeps the sidebar folded does not get it unfolded by visiting.
  const before = useRef(open);
  useEffect(() => {
    const was = before.current;
    setOpen(false);
    return () => setOpen(was);
  }, [setOpen]);

  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="flex min-h-full">
      <nav
        aria-label="Settings"
        className="hidden w-56 shrink-0 flex-col gap-5 border-r px-3 py-5 md:flex"
      >
        {settingsNav.map(({ group, pages }) => (
          <div key={group} className="flex flex-col gap-1">
            <div className="px-2 text-xs font-medium text-muted-foreground">{group}</div>
            <ul className="flex flex-col gap-0.5">
              {pages.map((page) => {
                const active = pathname === page.to || pathname.startsWith(`${page.to}/`);
                return (
                  <li key={page.to}>
                    <Link
                      to={page.to}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-8 items-center rounded-md px-2.5 text-sm hover:bg-accent",
                        active ? "bg-accent font-medium" : "text-foreground/80",
                      )}
                    >
                      {page.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col p-6">
        <div className="mx-auto flex w-full max-w-[880px] flex-1 flex-col">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
