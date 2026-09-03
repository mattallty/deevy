import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc.ts";

/**
 * The Issue's history, read straight from the Event log rather than from a
 * second source (docs/PLAN.md). Later slices add kinds; unknown ones still
 * render, so the timeline never goes blank on an Event it has not met.
 */
const phrasing: Record<string, string> = {
  "issue.created": "created this Issue",
  "issue.updated": "edited this Issue",
  "issue.assigned": "changed the Assignee",
  "issue.reparented": "changed the parent",
  "issue.moved": "moved this Issue",
  "gate.approved": "approved the Gate",
  "gate.rejected": "rejected the Gate",
};

export function IssueTimeline({ issueId }: { issueId: string }) {
  const events = useQuery(
    orpc.events.list.queryOptions({ input: { subjectType: "issue", subjectId: issueId } }),
  );

  if (events.isPending) return <p className="text-sm text-muted-foreground">Loading timeline…</p>;
  if (events.isError) return <p className="text-sm text-destructive">{events.error.message}</p>;

  return (
    <ul aria-label="Timeline" className="flex flex-col gap-2">
      {events.data.events.map((event) => (
        <li key={event.seq} className="flex items-baseline gap-2 text-sm">
          <span>{phrasing[event.kind] ?? event.kind}</span>
          <span className="text-xs text-muted-foreground">
            {new Date(event.createdAt).toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  );
}
