import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isToday, isYesterday } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Markdown } from "@/components/markdown";
import { MarkdownEditor } from "@/components/markdown-editor";
import { MemberChip, type ChipMember } from "@/components/member-chip";
import {
  Timeline,
  TimelineContent,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/reui/timeline";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { describeEvent, type EventText, type EventTone } from "@/lib/event-text";
import { useMentionables } from "@/lib/mentions";
import { orpc } from "@/lib/orpc";
import { ago } from "@/lib/time";
import { cn } from "@/lib/utils";

function dayLabel(date: Date): string {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "EEEE d MMMM");
}

type CommentEntry = {
  id: string;
  at: Date;
  kind: "comment";
  author: ChipMember | null;
  body: string;
  deleted: boolean;
  edited: boolean;
};
type EventEntry = {
  id: string;
  at: Date;
  kind: "event";
  actor: ChipMember | null;
  said: EventText;
};
type Entry = CommentEntry | EventEntry;
type Row =
  | { type: "day"; id: string; label: string }
  | { type: "entry"; entry: Entry }
  | { type: "fold"; id: string; entries: EventEntry[] };

type Filter = "all" | "comments" | "changes";

/** The dot's colour by what the item is: a Gate amber, an Agent teal, a Human copper. */
const dot: Record<EventTone, string> = {
  human: "border-human bg-human/15",
  agent: "border-agent bg-agent/15",
  gate: "border-gate bg-gate/25",
  muted: "border-border bg-muted",
  destructive: "border-destructive bg-destructive/15",
};

/**
 * Fold an Agent's run of routine steps — a Run started, a Document written —
 * into one line, so a Human's comment and a ruling are not lost among them.
 * A question, an answer, a ruling and anything with words in it stays whole.
 */
function fold(entries: Entry[]): Row[] {
  const rows: Row[] = [];
  let day = "";
  let run: EventEntry[] = [];
  const flush = () => {
    if (run.length >= 2) rows.push({ type: "fold", id: `fold-${run[0]!.id}`, entries: run });
    else for (const entry of run) rows.push({ type: "entry", entry });
    run = [];
  };
  for (const entry of entries) {
    const label = dayLabel(entry.at);
    if (label !== day) {
      flush();
      day = label;
      rows.push({ type: "day", id: `day-${label}`, label });
    }
    const routine =
      entry.kind === "event" &&
      entry.actor?.kind === "agent" &&
      entry.said.routine &&
      entry.said.detail === null;
    if (routine) {
      if (run.length > 0 && run[0]!.actor?.id !== entry.actor?.id) flush();
      run.push(entry);
    } else {
      flush();
      rows.push({ type: "entry", entry });
    }
  }
  flush();
  return rows;
}

/**
 * One stream for what was said and what happened, in time order, on a
 * timeline (docs/plans/ui-redesign-2.md slice D): comments and Events read
 * from the log, grouped by day, an Agent's routine steps folded. Comment
 * Events are left out, since the comment itself is here. The composer at the
 * bottom is the inline editor with `@` mentions.
 */
export function ActivityStream({ issueId, issueKey }: { issueId: string; issueKey: string }) {
  const queryClient = useQueryClient();
  const comments = useQuery(orpc.comments.list.queryOptions({ input: { issueKey } }));
  const events = useQuery(
    orpc.events.list.queryOptions({
      // Newest first, so a long history keeps its latest 500; the stream re-sorts.
      input: { subjectType: "issue", subjectId: issueId, limit: 500, order: "desc" },
    }),
  );
  const eventsTruncated = (events.data?.events.length ?? 0) >= 500;
  const members = useQuery(orpc.members.list.queryOptions({ input: {} }));
  const labels = useQuery(orpc.labels.list.queryOptions({ input: {} }));
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
  const labelById = useMemo(
    () =>
      new Map(
        (labels.data?.labels ?? []).map((label) => [
          label.id,
          label.scope ? `${label.scope}: ${label.name}` : label.name,
        ]),
      ),
    [labels.data],
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
      const actor = event.actorMemberId ? (memberById.get(event.actorMemberId) ?? null) : null;
      const said = describeEvent(
        { kind: event.kind, payload: event.payload, actorKind: actor?.kind ?? null },
        {
          memberName: (id) => memberById.get(id)?.user.name,
          labelName: (id) => labelById.get(id),
        },
      );
      if (!said) continue;
      list.push({
        id: `event-${String(event.seq)}`,
        at: new Date(event.createdAt),
        kind: "event",
        actor,
        said,
      });
    }
    return list.sort((a, b) => a.at.getTime() - b.at.getTime());
  }, [comments.data, events.data, memberById, labelById]);

  const rows = useMemo(
    () =>
      fold(
        entries.filter((entry) =>
          filter === "all"
            ? true
            : filter === "comments"
              ? entry.kind === "comment"
              : entry.kind === "event",
        ),
      ),
    [entries, filter],
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

      {eventsTruncated ? (
        <p className="text-xs text-muted-foreground">Showing the latest changes</p>
      ) : null}
      {comments.data && events.data ? (
        <Timeline
          value={0}
          orientation="vertical"
          render={<ol aria-label="Activity" />}
          className="pl-1"
        >
          {rows.length === 0 ? (
            <li className="py-2 text-sm text-muted-foreground">Nothing yet.</li>
          ) : null}
          {rows.map((row, index) =>
            row.type === "day" ? (
              <li
                key={row.id}
                role="presentation"
                className="flex items-center gap-3 pt-2 pb-3 text-xs font-medium text-muted-foreground"
              >
                <span>{row.label}</span>
                <span aria-hidden className="h-px flex-1 bg-border" />
              </li>
            ) : row.type === "fold" ? (
              <FoldedSteps key={row.id} step={index + 1} entries={row.entries} />
            ) : row.entry.kind === "comment" ? (
              <CommentItem
                key={row.entry.id}
                step={index + 1}
                entry={row.entry}
                onDelete={() => remove.mutate({ commentId: row.entry.id.replace(/^comment-/, "") })}
                deleting={remove.isPending}
              />
            ) : (
              <EventItem key={row.entry.id} step={index + 1} entry={row.entry} />
            ),
          )}
        </Timeline>
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

function Who({ member }: { member: ChipMember | null }) {
  return member ? (
    <MemberChip member={member} size="xs" />
  ) : (
    <span className="text-muted-foreground">deevy</span>
  );
}

function EventItem({ step, entry }: { step: number; entry: EventEntry }) {
  const { said } = entry;
  return (
    <TimelineItem step={step} render={<li />} className="not-last:pb-4">
      <TimelineHeader>
        <TimelineSeparator className="bg-border" />
        <TimelineTitle
          render={<div />}
          className="flex flex-wrap items-baseline gap-x-1.5 text-sm font-normal"
        >
          <Who member={entry.actor} />
          <span
            className={cn(
              said.tone === "gate" || said.tone === "destructive"
                ? "font-medium"
                : "text-muted-foreground",
            )}
          >
            {said.text}
          </span>
          <span className="font-mono text-xs text-muted-foreground/70">{ago(entry.at)}</span>
        </TimelineTitle>
        <TimelineIndicator className={dot[said.tone]} />
      </TimelineHeader>
      {said.detail ? (
        <TimelineContent
          className={cn(
            "mt-1 text-sm",
            said.tone === "gate" || said.tone === "destructive"
              ? "rounded-md border border-gate/40 bg-gate/5 px-3 py-2 text-foreground"
              : "text-muted-foreground italic",
          )}
        >
          “{said.detail}”
        </TimelineContent>
      ) : null}
    </TimelineItem>
  );
}

function FoldedSteps({ step, entries }: { step: number; entries: EventEntry[] }) {
  const [open, setOpen] = useState(false);
  const first = entries[0]!;
  const last = entries[entries.length - 1]!;
  return (
    <TimelineItem step={step} render={<li />} className="not-last:pb-4">
      <TimelineHeader>
        <TimelineSeparator className="bg-border" />
        <TimelineTitle
          render={<div />}
          className="flex flex-wrap items-baseline gap-x-1.5 text-sm font-normal"
        >
          <Who member={first.actor} />
          <button
            type="button"
            aria-expanded={open}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            onClick={() => setOpen((current) => !current)}
          >
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            {entries.length} steps
          </button>
          <span className="font-mono text-xs text-muted-foreground/70">{ago(last.at)}</span>
        </TimelineTitle>
        <TimelineIndicator className={dot.agent} />
      </TimelineHeader>
      {open ? (
        <TimelineContent className="mt-1 flex flex-col gap-0.5 text-sm text-muted-foreground">
          {entries.map((entry) => (
            <span key={entry.id}>
              {entry.said.text}{" "}
              <span className="font-mono text-xs text-muted-foreground/70">{ago(entry.at)}</span>
            </span>
          ))}
        </TimelineContent>
      ) : null}
    </TimelineItem>
  );
}

function CommentItem({
  step,
  entry,
  onDelete,
  deleting,
}: {
  step: number;
  entry: CommentEntry;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <TimelineItem step={step} render={<li />} className="not-last:pb-4">
      <TimelineHeader>
        <TimelineSeparator className="bg-border" />
        <TimelineTitle
          render={<div />}
          className="flex flex-wrap items-baseline gap-x-1.5 text-sm font-normal"
        >
          <Who member={entry.author} />
          <span className="text-muted-foreground">commented</span>
          <span className="font-mono text-xs text-muted-foreground/70">{ago(entry.at)}</span>
          {entry.edited ? <span className="text-xs text-muted-foreground">edited</span> : null}
          <span className="flex-1" />
          {entry.deleted ? null : (
            <Button variant="destructive" size="xs" disabled={deleting} onClick={onDelete}>
              Delete
            </Button>
          )}
        </TimelineTitle>
        <TimelineIndicator className={dot[entry.author?.kind === "agent" ? "agent" : "human"]} />
      </TimelineHeader>
      <TimelineContent className="mt-1 rounded-md border bg-card px-3 py-2 text-sm text-foreground">
        {entry.deleted ? (
          <p className="text-sm text-muted-foreground italic">This comment was withdrawn.</p>
        ) : (
          <Markdown>{entry.body}</Markdown>
        )}
      </TimelineContent>
    </TimelineItem>
  );
}
