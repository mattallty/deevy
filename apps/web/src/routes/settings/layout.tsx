import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export interface SettingsNavPage {
  label: string;
  to: string;
}

/**
 * The Settings area's own navigation: four groups for what were eleven flat
 * links (docs/plans/ui-redesign.md). Shared with the command palette, so a
 * page is reachable by the same name from either.
 */
export const settingsNav: Array<{ group: string; pages: SettingsNavPage[] }> = [
  {
    group: "Workspace",
    pages: [
      { label: "General", to: "/settings/workspace" },
      { label: "Members", to: "/settings/members" },
      { label: "Teams", to: "/settings/teams" },
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
 * the page. It leaves the primary sidebar alone — this nav's own border, group
 * headings and active tint already read as the second level, and folding
 * somebody's sidebar for them was a jolt on the way in and again on the way
 * out (Matt, 2026-09-07).
 */
export function SettingsLayout() {
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
        {/* Below md the sidebar above is gone; the same pages, as one strip of tabs that scrolls. */}
        <nav
          aria-label="Settings pages"
          className="-mx-6 -mt-6 mb-6 flex overflow-x-auto border-b px-6 md:hidden"
        >
          {settingsNav.flatMap(({ pages }) =>
            pages.map((page) => {
              const active = pathname === page.to || pathname.startsWith(`${page.to}/`);
              return (
                <Link
                  key={page.to}
                  to={page.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm whitespace-nowrap hover:text-foreground",
                    active
                      ? "border-primary font-medium text-foreground"
                      : "border-transparent text-muted-foreground",
                  )}
                >
                  {page.label}
                </Link>
              );
            }),
          )}
        </nav>
        <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
