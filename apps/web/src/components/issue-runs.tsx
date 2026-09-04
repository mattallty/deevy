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

/** A ruling on a Gate, as the Issue page already has it loaded. */
export interface GateDecisionView {
  id: string;
  stateId: string;
  decision: string;
  note: string | null;
  memberId: string | null;
  createdAt: string | Date;
}

interface RunView {
  id: string;
  status: string;
  trigger: string;
  summary: string | null;
}

/** The Gate an Agent asked about, out of the `elicitation` Activity that asked. */
interface GateRequest {
  gateStateId: string;
  url: string;
  askedAt: Date;
}

interface ActivityView {
  kind: string;
  payload?: unknown;
  createdAt: string | Date;
}

/**
 * The last Gate this Run asked about. The Activity feed is the record — the
 * server writes one `elicitation` carrying the Gate and its URL — so nothing
 * here keeps a second copy (docs/plans/m2.md).
 */
function lastGateRequest(activities: ActivityView[] | undefined): GateRequest | null {
  for (const row of [...(activities ?? [])].reverse()) {
    if (row.kind !== "elicitation") continue;
    const payload = row.payload as { gateStateId?: unknown; url?: unknown } | null;
    if (typeof payload?.gateStateId !== "string" || typeof payload.url !== "string") continue;
    return {
      gateStateId: payload.gateStateId,
      url: payload.url,
      askedAt: new Date(row.createdAt),
    };
  }
  return null;
}

export interface IssueRunsProps {
  issueKey: string;
  /** The Issue's Gate history, so a Run that asked can say who answered. */
  decisions?: GateDecisionView[];
}

/**
 * What an Agent did on this Issue. A Run that is waiting gets an answer box,
 * because a Human answering is the only thing that moves it on — unless it is
 * waiting on a Gate, which is decided in the Gate panel and nowhere else
 * (ADR-0004), and then it gets the link to that Gate instead.
 */
export function IssueRuns({ issueKey, decisions = [] }: IssueRunsProps) {
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
        <RunBlock
          key={run.id}
          run={run as RunView}
          decisions={decisions}
          answering={answer.isPending}
          onAnswer={(body) => answer.mutate({ runId: run.id, body })}
        />
      ))}
      {answer.error ? <p className="text-sm text-destructive">{answer.error.message}</p> : null}
    </section>
  );
}

interface RunBlockProps {
  run: RunView;
  decisions: GateDecisionView[];
  answering: boolean;
  onAnswer: (body: string) => void;
}

function RunBlock({ run, decisions, answering, onAnswer }: RunBlockProps) {
  // The feed says what this Run asked for; the Issue's own Gate history says
  // whether anyone has answered. Only fetched when there is something to say.
  const detail = useQuery({
    ...orpc.runs.get.queryOptions({ input: { runId: run.id } }),
    enabled: run.status === "awaiting_input" || decisions.length > 0,
  });
  const members = useQuery(orpc.members.list.queryOptions({ input: {} }));

  const asked = lastGateRequest(detail.data?.activities as ActivityView[] | undefined);
  const decided = asked
    ? decisions
        .filter(
          (row) => row.stateId === asked.gateStateId && new Date(row.createdAt) >= asked.askedAt,
        )
        .at(-1)
    : undefined;
  const waitingOnGate = run.status === "awaiting_input" && asked !== null && !decided;
  const decidedBy = decided
    ? (members.data?.members.find((member) => member.id === decided.memberId)?.user.name ??
      "a Human")
    : null;

  return (
    <article key={run.id} aria-label={run.id} className="flex flex-col gap-2 rounded-md border p-3">
      <header className="flex items-center gap-2">
        <Badge variant={run.status === "failed" ? "destructive" : "secondary"}>
          {waitingOnGate ? "Waiting for approval" : statusLabels[run.status as Status]}
        </Badge>
        <span className="text-sm text-muted-foreground">
          started by {triggerLabels[run.trigger as keyof typeof triggerLabels]}
        </span>
      </header>

      {run.summary ? <p className="text-sm">{run.summary}</p> : null}

      {waitingOnGate && asked ? (
        <p className="text-sm text-muted-foreground">
          This Run is waiting for a Human to decide a Gate.{" "}
          <a className="underline" href={asked.url}>
            Open the Gate
          </a>
        </p>
      ) : null}

      {decided ? (
        <p className="text-sm">
          <Badge variant={decided.decision === "approved" ? "default" : "destructive"}>
            {decided.decision} by {decidedBy}
          </Badge>
          {decided.note ? <span className="ml-2">{decided.note}</span> : null}
        </p>
      ) : null}

      {run.status === "awaiting_input" && !waitingOnGate ? (
        <AnswerBox pending={answering} onAnswer={onAnswer} />
      ) : null}
    </article>
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
