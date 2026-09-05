import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import {
  AtSign,
  Bot,
  CircleCheck,
  CircleHelp,
  ExternalLink,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Shortcut } from "@/components/kbd-hint";
import { PageHeader } from "@/components/page-header";
import { SidePeek } from "@/components/side-peek";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { orpc } from "@/lib/orpc";
import { useShortcut } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import { IssuePage } from "@/routes/issues/issue";

/** How the Inbox reads its URL: the selected Notification, and whether only unread are shown. */
export interface InboxSearch {
  n?: string;
  unread?: "1";
}

export function parseInboxSearch(search: Record<string, unknown>): InboxSearch {
  // A raw URL's `unread=1` parses as the number 1; navigate() hands over "1".
  const raw = search.unread;
  const unread = typeof raw === "string" || typeof raw === "number" ? String(raw) : "";
  return {
    ...(typeof search.n === "string" && search.n ? { n: search.n } : {}),
    ...(unread === "1" || unread === "true" ? { unread: "1" as const } : {}),
  };
}

const kindText = {
  mention: "mentioned you",
  assignment: "assigned this to you",
  gate_awaiting: "a Gate is waiting",
  run_awaiting_input: "a Run is waiting on you",
  run_finished: "a Run finished",
  // A Human never receives this one — it is owed to the Agent that asked, and
  // an Agent reads its inbox over MCP rather than here. The map covers it
  // because `inbox.list` answers both audiences with the same shape.
  run_answered: "a Gate your Agent asked about was decided",
} as const;

/** One glyph per kind, in the hue of what is owed: a Gate, an Agent, a Human. */
const kindLook: Record<string, { icon: LucideIcon; className: string }> = {
  mention: { icon: AtSign, className: "text-human" },
  assignment: { icon: UserPlus, className: "text-human" },
  gate_awaiting: { icon: CircleHelp, className: "text-gate-foreground dark:text-gate" },
  run_awaiting_input: { icon: Bot, className: "text-agent" },
  run_finished: { icon: CircleCheck, className: "text-agent" },
  run_answered: { icon: CircleCheck, className: "text-muted-foreground" },
};

function ago(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Date.now() - date.getTime() < 60_000) return "just now";
  return formatDistanceToNowStrict(date, { addSuffix: true });
}

/** Whether the window is too narrow for two panes; the preview is a peek then. */
function useNarrow(breakpoint = 1024): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${String(breakpoint - 1)}px)`);
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [breakpoint]);
  return narrow;
}

/**
 * What needs you, and the Issue it is about, side by side (docs/plans/
 * ui-redesign.md slice 6). Selecting a Notification opens its Issue in the
 * right pane — with the ruling card in front when a Gate is waiting, the
 * waiting Run first when an Agent asked — and marks it read, because reading
 * is what was owed. Grouped by Issue, because that is the thing you act on.
 */
export function InboxPage({
  search,
  onSearch,
}: {
  search: InboxSearch;
  onSearch: (patch: Partial<InboxSearch>) => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const narrow = useNarrow();
  const inbox = useQuery(orpc.inbox.list.queryOptions({ input: {} }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.inbox.key() });
  const markRead = useMutation(orpc.inbox.markRead.mutationOptions({ onSuccess: refresh }));
  const markAllRead = useMutation(orpc.inbox.markAllRead.mutationOptions({ onSuccess: refresh }));

  const all = inbox.data?.notifications ?? [];
  const shown = useMemo(
    () => (search.unread === "1" ? all.filter((row) => !row.readAt) : all),
    [all, search.unread],
  );
  // Grouped by Issue, in the order the newest Notification of each arrives.
  const groups = useMemo(() => {
    const map = new Map<string, typeof shown>();
    for (const notification of shown) {
      const key = notification.issue?.key ?? "Elsewhere";
      map.set(key, [...(map.get(key) ?? []), notification]);
    }
    return [...map.entries()];
  }, [shown]);
  const flat = useMemo(() => groups.flatMap(([, rows]) => rows), [groups]);
  const selected =
    flat.find((row) => row.id === search.n) ?? all.find((row) => row.id === search.n);

  const open = (id: string) => {
    onSearch({ n: id });
    const row = all.find((candidate) => candidate.id === id);
    if (row && !row.readAt) markRead.mutate({ ids: [id] });
  };
  const move = (delta: number) => {
    if (flat.length === 0) return;
    const index = selected ? flat.findIndex((row) => row.id === selected.id) : -1;
    const next = flat[Math.min(flat.length - 1, Math.max(0, index + delta))];
    if (next) open(next.id);
  };
  useShortcut("j", () => move(1));
  useShortcut("k", () => move(-1));
  useShortcut("arrowdown", () => move(1));
  useShortcut("arrowup", () => move(-1));
  useShortcut("e", () => selected && !selected.readAt && markRead.mutate({ ids: [selected.id] }));
  useShortcut("shift+e", () => markAllRead.mutate({}));
  useShortcut(
    "o",
    () =>
      selected?.issue &&
      void navigate({ to: "/issues/$issueKey", params: { issueKey: selected.issue.key } }),
  );

  if (inbox.isError) {
    return <p className="text-destructive">Could not load your inbox: {inbox.error.message}</p>;
  }

  const list = (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="inbox-heading">
      <PageHeader
        className="px-4 pt-4"
        title={<span id="inbox-heading">Inbox</span>}
        description="Mentions, assignments, and Gates waiting on a Human."
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={markAllRead.isPending || all.every((row) => row.readAt)}
            onClick={() => markAllRead.mutate({})}
          >
            Mark all read
            <Shortcut keys="shift+e" />
          </Button>
        }
      >
        <ToggleGroup
          value={[search.unread === "1" ? "unread" : "all"]}
          onValueChange={(next: string[]) =>
            onSearch({ unread: next[0] === "unread" ? "1" : undefined })
          }
          aria-label="Show"
          variant="outline"
          size="sm"
          spacing={0}
        >
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="unread">Unread</ToggleGroupItem>
        </ToggleGroup>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {inbox.isPending ? <Skeleton className="m-4 h-64" /> : null}
        {inbox.data && shown.length === 0 ? (
          <Empty className="m-4">
            <EmptyHeader>
              <EmptyTitle>Nothing waiting</EmptyTitle>
              <EmptyDescription>
                Mentions, assignments and Gates land here as they happen.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        {groups.map(([issueKey, notifications]) => (
          <article key={issueKey} className="flex flex-col border-b py-2">
            <header className="flex items-baseline gap-2 px-4 py-1 text-sm">
              {notifications[0]?.issue ? (
                <Link
                  to="/issues/$issueKey"
                  params={{ issueKey }}
                  className="min-w-0 truncate font-medium hover:underline"
                >
                  <span className="font-mono text-xs text-muted-foreground">{issueKey}</span>{" "}
                  {notifications[0].issue.title}
                </Link>
              ) : (
                <span className="font-medium">{issueKey}</span>
              )}
            </header>
            <ul aria-label={`Notifications for ${issueKey}`} className="flex flex-col">
              {notifications.map((notification) => {
                const look = kindLook[notification.kind] ?? kindLook.run_answered!;
                const Icon = look.icon;
                const isSelected = notification.id === search.n;
                return (
                  <li
                    key={notification.id}
                    data-selected={isSelected ? "true" : undefined}
                    className={cn(
                      "flex items-center gap-1 pr-2 text-sm hover:bg-accent/60",
                      isSelected && "bg-accent",
                    )}
                  >
                    {/* The whole row opens the Notification; "Mark read" sits beside it. */}
                    <button
                      type="button"
                      aria-current={isSelected ? "true" : undefined}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-4 py-1.5 text-left outline-none focus-visible:bg-accent"
                      onClick={() => open(notification.id)}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          notification.readAt ? "bg-transparent" : "bg-gate",
                        )}
                      />
                      <Icon className={cn("size-4 shrink-0", look.className)} aria-hidden />
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate",
                          !notification.readAt && "font-medium",
                        )}
                      >
                        {kindText[notification.kind as keyof typeof kindText] ?? notification.kind}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {ago(notification.createdAt)}
                      </span>
                    </button>
                    {notification.readAt ? null : (
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={markRead.isPending}
                        onClick={() => markRead.mutate({ ids: [notification.id] })}
                      >
                        Mark read
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );

  const preview = selected?.issue ? (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-2 text-sm">
        <span className="font-mono text-muted-foreground">{selected.issue.key}</span>
        <span className="truncate font-medium">{selected.issue.title}</span>
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link to="/issues/$issueKey" params={{ issueKey: selected.issue.key }} />}
        >
          <ExternalLink />
          Open full page
          <Shortcut keys="o" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <IssuePage
          key={selected.issue.key}
          issueKey={selected.issue.key}
          focusGate={selected.kind === "gate_awaiting"}
        />
      </div>
    </div>
  ) : (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyTitle>Pick a Notification</EmptyTitle>
        <EmptyDescription>
          The Issue it is about opens here, with what it asks of you in front.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  if (narrow) {
    return (
      <>
        {list}
        <SidePeek
          issueKey={selected?.issue?.key ?? null}
          onClose={() => onSearch({ n: undefined })}
          onOpenFull={(key) =>
            void navigate({ to: "/issues/$issueKey", params: { issueKey: key } })
          }
        />
      </>
    );
  }

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-[calc(100vh-2.75rem)]">
      <ResizablePanel defaultSize={34} minSize={24} className="min-w-0">
        {list}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={66} minSize={40} className="min-w-0">
        {preview}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
