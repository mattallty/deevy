import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { orpc } from "@/lib/orpc";

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

/** What needs you, derived from the Event log and grouped by Issue. */
export function InboxPage() {
  const queryClient = useQueryClient();
  const inbox = useQuery(orpc.inbox.list.queryOptions({ input: {} }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.inbox.key() });

  const markRead = useMutation(orpc.inbox.markRead.mutationOptions({ onSuccess: refresh }));
  const markAllRead = useMutation(orpc.inbox.markAllRead.mutationOptions({ onSuccess: refresh }));

  if (inbox.isPending) return <Skeleton className="h-64 w-full" />;
  if (inbox.isError) {
    return <p className="text-destructive">Could not load your inbox: {inbox.error.message}</p>;
  }

  // Grouped by Issue, because that is the thing you act on.
  const groups = new Map<string, typeof inbox.data.notifications>();
  for (const notification of inbox.data.notifications) {
    const key = notification.issue?.key ?? "Elsewhere";
    groups.set(key, [...(groups.get(key) ?? []), notification]);
  }

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
          <p className="text-sm text-muted-foreground">
            Mentions, assignments, and Gates waiting on a Human.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={markAllRead.isPending || inbox.data.notifications.length === 0}
          onClick={() => markAllRead.mutate({})}
        >
          Mark all read
        </Button>
      </header>

      {inbox.data.notifications.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Nothing waiting</EmptyTitle>
            <EmptyDescription>
              Mentions, assignments and Gates land here as they happen.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {[...groups.entries()].map(([issueKey, notifications]) => (
        <article key={issueKey} className="flex flex-col gap-2 rounded-lg border p-4">
          <header className="flex items-center gap-2">
            {notifications[0]?.issue ? (
              <Link
                to="/issues/$issueKey"
                params={{ issueKey }}
                className="font-medium hover:underline"
              >
                <span className="text-muted-foreground">{issueKey}</span>{" "}
                {notifications[0].issue.title}
              </Link>
            ) : (
              <span className="font-medium">{issueKey}</span>
            )}
          </header>
          <ul aria-label={`Notifications for ${issueKey}`} className="flex flex-col gap-1">
            {notifications.map((notification) => (
              <li key={notification.id} className="flex items-center gap-2 text-sm">
                <Badge variant={notification.readAt ? "outline" : "default"}>
                  {kindText[notification.kind]}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(notification.createdAt).toLocaleString()}
                </span>
                <span className="flex-1" />
                {notification.readAt ? null : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2"
                    disabled={markRead.isPending}
                    onClick={() => markRead.mutate({ ids: [notification.id] })}
                  >
                    Mark read
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </article>
      ))}
    </section>
  );
}
