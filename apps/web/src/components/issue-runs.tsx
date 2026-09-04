import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { orpc } from "@/lib/orpc";

/** What each Run status means to a Human reading the Issue. */
const statusLabels = {
  pending: "Waiting to start",
  active: "Working",
  awaiting_input: "Waiting for input",
  completed: "Finished",
  failed: "Failed",
  stale: "Gone quiet",
} as const;

type Status = keyof typeof statusLabels;

const triggerLabels = {
  assignment: "assignment",
  mention: "mention",
  state_rule: "a workflow rule",
  schedule: "a schedule",
  manual: "by hand",
} as const;

/**
 * What an Agent did on this Issue. A Run that is waiting gets an answer box,
 * because a Human answering is the only thing that moves it on; every other
 * status is a record to read (docs/plans/m2.md).
 */
export function IssueRuns({ issueKey }: { issueKey: string }) {
  const queryClient = useQueryClient();
  const runs = useQuery(orpc.runs.list.queryOptions({ input: { issueKey } }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.runs.key() });
  const answer = useMutation(orpc.runs.answer.mutationOptions({ onSuccess: refresh }));

  if (runs.isPending) return <Skeleton className="h-20 w-full" />;
  if (runs.isError) {
    return <p className="text-sm text-destructive">Could not load Runs: {runs.error.message}</p>;
  }
  if (runs.data.runs.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-medium">Runs</h2>
      {runs.data.runs.map((run) => (
        <article
          key={run.id}
          aria-label={run.id}
          className="flex flex-col gap-2 rounded-md border p-3"
        >
          <header className="flex items-center gap-2">
            <Badge variant={run.status === "failed" ? "destructive" : "secondary"}>
              {statusLabels[run.status as Status]}
            </Badge>
            <span className="text-sm text-muted-foreground">
              started by {triggerLabels[run.trigger as keyof typeof triggerLabels]}
            </span>
          </header>

          {run.summary ? <p className="text-sm">{run.summary}</p> : null}

          {run.status === "awaiting_input" ? (
            <AnswerBox
              pending={answer.isPending}
              onAnswer={(body) => answer.mutate({ runId: run.id, body })}
            />
          ) : null}
        </article>
      ))}
      {answer.error ? <p className="text-sm text-destructive">{answer.error.message}</p> : null}
    </section>
  );
}

function AnswerBox({ pending, onAnswer }: { pending: boolean; onAnswer: (body: string) => void }) {
  const [body, setBody] = useState("");
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!body.trim()) return;
        onAnswer(body.trim());
        setBody("");
      }}
    >
      <Textarea
        aria-label="Answer this Run"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Answer so the Agent can carry on"
      />
      <Button type="submit" size="sm" className="self-start" disabled={pending || !body.trim()}>
        Answer
      </Button>
    </form>
  );
}
