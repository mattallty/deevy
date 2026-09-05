import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { useMemo, useState, type ReactNode } from "react";
import { Markdown } from "@/components/markdown";
import { MarkdownEditor } from "@/components/markdown-editor";
import { MemberChip, type ChipMember } from "@/components/member-chip";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useMentionables } from "@/lib/mentions";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";

/**
 * What an Event says, in a sentence with the actor as its subject. Unknown
 * kinds still render as their name, so the stream never goes blank on an
 * Event it has not met.
 */
function phrase(kind: string, payload: Record<string, unknown> | null): string {
  const p = payload ?? {};
  switch (kind) {
    case "issue.created":
      return "created this Issue";
    case "issue.updated":
      return "edited this Issue";
    case "issue.assigned":
      return "changed the Assignee";
    case "issue.reparented":
      return "changed the parent";
    case "issue.moved":
      return typeof p.from === "string" && typeof p.to === "string"
        ? `moved it from ${p.from} to ${p.to}`
        : "moved this Issue";
    case "issue.labels_changed":
      return "changed the Labels";
    case "issue.link_added":
      return "added a link";
    case "issue.link_removed":
      return "removed a link";
    case "document.created":
      return typeof p.name === "string" ? `opened the ${p.name} Document` : "opened a Document";
    case "document.updated":
      return typeof p.name === "string"
        ? `wrote ${p.name}${typeof p.version === "number" ? ` v${String(p.version)}` : ""}`
        : "wrote a Document";
    case "gate.approved":
      return "approved the Gate";
    case "gate.rejected":
      return "rejected the Gate";
    case "gate.requested":
      return "asked for a ruling";
    case "run.started":
      return "started a Run";
    case "run.awaiting_input":
      return "is waiting on a Human";
    case "run.answered":
      return "answered the Run";
    case "run.finished":
      return "finished the Run";
    case "run.failed":
      return "failed the Run";
    case "run.stale":
      return "went quiet";
    default:
      return kind;
  }
}

function ago(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Date.now() - date.getTime() < 60_000) return "just now";
  return formatDistanceToNowStrict(date, { addSuffix: true });
}

type Entry =
  | {
      id: string;
      at: Date;
      kind: "comment";
      author: ChipMember | null;
      body: string;
      deleted: boolean;
      edited: boolean;
    }
  | { id: string; at: Date; kind: "event"; actor: ChipMember | null; text: string };

type Filter = "all" | "comments" | "changes";

/**
 * One stream for what was said and what happened, in time order: comments
 * and Events read from the log and folded together (docs/plans/ui-redesign.md
 * slice 4). Comment Events are left out, since the comment itself is here.
 * The composer at the bottom is the inline editor with `@` mentions.
 */
export function ActivityStream({ issueId, issueKey }: { issueId: string; issueKey: string }) {
  const queryClient = useQueryClient();
  const comments = useQuery(orpc.comments.list.queryOptions({ input: { issueKey } }));
  const events = useQuery(
    orpc.events.list.queryOptions({
      input: { subjectType: "issue", subjectId: issueId, limit: 500 },
    }),
  );
  const members = useQuery(orpc.members.list.queryOptions({ input: {} }));
  const mentionables = useMentionables();
  const [filter, setFilter] = useState<Filter>("all");
  const [body, setBody] = useState("");

  const create = useMutation(
    orpc.comments.create.mutationOptions({
      onSuccess: async () => {
        setBody("");
        await queryClient.invalidateQueries({ queryKey: orpc.comments.key() });
      },
    }),
  );
  const remove = useMutation(
    orpc.comments.delete.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.comments.key() }),
    }),
  );

  const memberById = useMemo(
    () => new Map((members.data?.members ?? []).map((member) => [member.id, member])),
    [members.data],
  );

  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = [];
    for (const comment of comments.data?.comments ?? []) {
      list.push({
        id: `comment-${comment.id}`,
        at: new Date(comment.createdAt),
        kind: "comment",
        author: comment.author ?? null,
        body: comment.body,
        deleted: Boolean(comment.deletedAt),
        edited: Boolean(comment.editedAt),
      });
    }
    for (const event of events.data?.events ?? []) {
      if (event.kind.startsWith("comment.")) continue;
      list.push({
        id: `event-${String(event.seq)}`,
        at: new Date(event.createdAt),
        kind: "event",
        actor: event.actorMemberId ? (memberById.get(event.actorMemberId) ?? null) : null,
        text: phrase(
          event.kind,
          event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
            ? (event.payload as Record<string, unknown>)
            : null,
        ),
      });
    }
    return list.sort((a, b) => a.at.getTime() - b.at.getTime());
  }, [comments.data, events.data, memberById]);

  const shown = entries.filter((entry) =>
    filter === "all"
      ? true
      : filter === "comments"
        ? entry.kind === "comment"
        : entry.kind === "event",
  );

  const submit = () => {
    if (body.trim()) create.mutate({ issueKey, body: body.trim() });
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="activity-heading">
      <div className="flex items-center gap-3">
        <h2 id="activity-heading" className="text-sm font-medium text-muted-foreground">
          Activity
        </h2>
        <span className="flex-1" />
        <ToggleGroup
          value={[filter]}
          onValueChange={(next: string[]) => {
            const picked = next[0];
            if (picked === "all" || picked === "comments" || picked === "changes")
              setFilter(picked);
          }}
          aria-label="Show"
          variant="outline"
          size="sm"
          spacing={0}
        >
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="comments">Comments</ToggleGroupItem>
          <ToggleGroupItem value="changes">Changes</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {comments.isPending || events.isPending ? <Skeleton className="h-24 w-full" /> : null}
      {comments.isError ? (
        <p className="text-sm text-destructive">
          Could not load comments: {comments.error.message}
        </p>
      ) : null}
      {events.isError ? (
        <p className="text-sm text-destructive">Could not load the log: {events.error.message}</p>
      ) : null}

      {comments.data && events.data ? (
        <ol aria-label="Activity" className="flex flex-col">
          {shown.length === 0 ? (
            <li className="py-2 text-sm text-muted-foreground">Nothing yet.</li>
          ) : null}
          {shown.map((entry) =>
            entry.kind === "comment" ? (
              <li key={entry.id} className="flex gap-3 py-3">
                <Rail>
                  {entry.author ? (
                    <MemberChip
                      member={entry.author}
                      size="md"
                      className="[&>span:last-child]:sr-only"
                    />
                  ) : (
                    <span className="size-7 rounded-full bg-muted" aria-hidden />
                  )}
                </Rail>
                <div className="flex min-w-0 flex-1 flex-col gap-1 rounded-md border bg-card px-3 py-2">
                  <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
                    <span className="text-sm font-medium text-foreground">
                      {entry.author?.user.name ?? "Someone"}
                    </span>
                    <span>{ago(entry.at)}</span>
                    {entry.edited ? <span>edited</span> : null}
                    <span className="flex-1" />
                    {entry.deleted ? null : (
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={remove.isPending}
                        onClick={() =>
                          remove.mutate({ commentId: entry.id.replace(/^comment-/, "") })
                        }
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                  {entry.deleted ? (
                    <p className="text-sm italic text-muted-foreground">
                      This comment was withdrawn.
                    </p>
                  ) : (
                    <Markdown>{entry.body}</Markdown>
                  )}
                </div>
              </li>
            ) : (
              <li key={entry.id} className="flex items-center gap-3 py-1.5 text-sm">
                <Rail>
                  <span aria-hidden className="block size-1.5 rounded-full bg-border" />
                </Rail>
                <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5">
                  {entry.actor ? (
                    <MemberChip member={entry.actor} size="xs" />
                  ) : (
                    <span className="text-muted-foreground">deevy</span>
                  )}
                  <span className="text-muted-foreground">{entry.text}</span>
                  <span className="font-mono text-xs text-muted-foreground/70">
                    {ago(entry.at)}
                  </span>
                </span>
              </li>
            ),
          )}
        </ol>
      ) : null}

      <form
        className="flex flex-col gap-2 border-t pt-4"
        onSubmit={(submitted) => {
          submitted.preventDefault();
          submit();
        }}
      >
        <Label htmlFor="new-comment">Comment</Label>
        <MarkdownEditor
          id="new-comment"
          aria-label="Comment"
          mode="inline"
          value={body}
          onChange={setBody}
          mentions={mentionables}
          rows={4}
          placeholder="Say something. @ mentions a Member or a Team; ⌘Enter sends."
          onSubmit={submit}
        />
        <div>
          <Button type="submit" disabled={create.isPending || !body.trim()}>
            Comment
          </Button>
        </div>
        {create.error ? <p className="text-sm text-destructive">{create.error.message}</p> : null}
      </form>
    </section>
  );
}

function Rail({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("flex w-7 shrink-0 items-start justify-center pt-0.5", className)}>
      {children}
    </span>
  );
}
