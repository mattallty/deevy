import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceStrict } from "date-fns";
import {
  Brain,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  Reply,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Markdown } from "@/components/markdown";
import { MemberChip } from "@/components/member-chip";
import { RunStatus, type RunStatusValue } from "@/components/run-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useMembersById } from "@/lib/mentions";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";

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
  agentMemberId?: string;
  triggeredByMemberId?: string | null;
  startedAt?: string | Date | null;
  finishedAt?: string | Date | null;
  lastActivityAt?: string | Date;
  createdAt?: string | Date;
  /** What `runs.list` carries of the feed: the last few, and how many there are. */
  lastActivities?: ActivityView[];
  activityCount?: number;
}

interface ActivityView {
  id?: string;
  kind: string;
  body?: string;
  payload?: unknown;
  createdAt: string | Date;
}

/** The Gate an Agent asked about, out of the `elicitation` Activity that asked. */
interface GateRequest {
  gateStateId: string;
  url: string;
  askedAt: Date;
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

/** One glyph and one colour per kind of Activity (CONTEXT.md). */
const kinds: Record<string, { icon: LucideIcon; label: string; className: string }> = {
  thought: { icon: Brain, label: "thought", className: "text-muted-foreground italic" },
  action: { icon: Wrench, label: "did", className: "" },
  elicitation: {
    icon: CircleHelp,
    label: "asked",
    className: "text-gate-foreground dark:text-gate",
  },
  response: { icon: CircleCheck, label: "reported", className: "text-agent" },
  error: { icon: TriangleAlert, label: "failed", className: "text-destructive font-mono text-xs" },
  prompt: { icon: Reply, label: "a Human answered", className: "text-human" },
};

function elapsed(run: RunView): string | null {
  if (!run.startedAt) return null;
  const from = new Date(run.startedAt);
  const to = run.finishedAt ? new Date(run.finishedAt) : new Date();
  return formatDistanceStrict(from, to);
}

export interface IssueRunsProps {
  issueKey: string;
  /** The Issue's Gate history, so a Run that asked can say who answered. */
  decisions?: GateDecisionView[];
}

/**
 * What Agents did on this Issue, one card per Run, the one waiting on a Human
 * first and open. A Run that is waiting gets an answer box, because a Human
 * answering is the only thing that moves it on — unless it is waiting on a
 * Gate, which is decided in the ruling card and nowhere else (ADR-0004), and
 * then it points there instead.
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

  // The Run owed a Human comes first, open; the rest keep their order.
  const ordered = [...(runs.data.runs as RunView[])].sort(
    (a, b) => Number(b.status === "awaiting_input") - Number(a.status === "awaiting_input"),
  );

  return (
    <section className="flex flex-col gap-2" aria-labelledby="runs-heading">
      <h2 id="runs-heading" className="text-sm font-medium text-muted-foreground">
        Runs
      </h2>
      {ordered.map((run) => (
        <RunCard
          key={run.id}
          run={run}
          decisions={decisions}
          pinned={run.status === "awaiting_input"}
          answering={answer.isPending}
          onAnswer={(body) => answer.mutate({ runId: run.id, body })}
        />
      ))}
      {answer.error ? <p className="text-sm text-destructive">{answer.error.message}</p> : null}
    </section>
  );
}

export interface RunCardProps {
  run: RunView;
  decisions: GateDecisionView[];
  /** Open, with a band, because it is waiting on the person reading. */
  pinned?: boolean;
  answering: boolean;
  onAnswer: (body: string) => void;
}

/**
 * One Run: who ran, how it stands, what it did, and — when it is waiting on a
 * Human — the way to answer it. Folded, the card shows what the list already
 * carries (the last three Activities); the whole feed is read only when it
 * is opened, when the Run is waiting (the Gate it asked about is in the
 * feed), or when there are rulings to match a question against.
 */
export function RunCard({ run, decisions, pinned = false, answering, onAnswer }: RunCardProps) {
  const [expanded, setExpanded] = useState(pinned);
  const wantsDetail = expanded || run.status === "awaiting_input" || decisions.length > 0;
  const detail = useQuery(
    orpc.runs.get.queryOptions({ input: { runId: run.id }, enabled: wantsDetail }),
  );
  const memberById = useMembersById();

  const activities = (detail.data?.activities ?? run.lastActivities ?? []) as ActivityView[];
  const total = detail.data?.activities.length ?? run.activityCount ?? activities.length;
  const asked = lastGateRequest(activities);
  const decided = asked
    ? decisions
        .filter(
          (row) => row.stateId === asked.gateStateId && new Date(row.createdAt) >= asked.askedAt,
        )
        .at(-1)
    : undefined;
  const waitingOnGate = run.status === "awaiting_input" && asked !== null && !decided;
  const agent = run.agentMemberId ? memberById.get(run.agentMemberId) : undefined;
  const decidedBy = decided
    ? (memberById.get(decided.memberId ?? "")?.user.name ?? "a Human")
    : null;
  const shown = expanded ? activities : activities.slice(-3);
  const time = elapsed(run);

  return (
    <article
      aria-label={run.id}
      data-pinned={pinned ? "true" : undefined}
      className={cn(
        "flex flex-col rounded-md border bg-card",
        pinned && !waitingOnGate && "border-gate/50",
        run.status === "failed" && "border-destructive/40",
      )}
    >
      <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        {agent ? (
          <MemberChip member={{ ...agent, kind: agent.kind ?? "agent" }} size="sm" />
        ) : (
          <span className="text-sm font-medium">Agent</span>
        )}
        <RunStatus
          status={run.status as RunStatusValue}
          {...(waitingOnGate ? { label: "Waiting for approval" } : {})}
        />
        <span className="text-xs text-muted-foreground">
          started by {triggerLabels[run.trigger as keyof typeof triggerLabels] ?? run.trigger}
        </span>
        {time ? <span className="font-mono text-xs text-muted-foreground">{time}</span> : null}
        <span className="flex-1" />
        {total > 3 ? (
          <Button variant="ghost" size="xs" onClick={() => setExpanded((open) => !open)}>
            {expanded ? <ChevronDown /> : <ChevronRight />}
            {expanded ? "Fewer" : `All ${String(total)}`}
          </Button>
        ) : null}
      </header>

      {run.summary ? <p className="px-3 pt-2 text-sm">{run.summary}</p> : null}

      {waitingOnGate && asked ? (
        <p className="mx-3 mt-2 rounded-sm border border-gate/40 bg-gate/10 px-2 py-1.5 text-sm">
          Waiting for a Human to decide a Gate.{" "}
          <a className="font-medium underline underline-offset-4" href={asked.url}>
            Open the Gate
          </a>
        </p>
      ) : null}

      {decided ? (
        <p className="flex flex-wrap items-baseline gap-2 px-3 pt-2 text-sm">
          <Badge variant={decided.decision === "approved" ? "default" : "destructive"}>
            {decided.decision} by {decidedBy}
          </Badge>
          {decided.note ? <span className="text-muted-foreground">{decided.note}</span> : null}
        </p>
      ) : null}

      {wantsDetail && detail.isPending ? <Skeleton className="m-3 h-10" /> : null}
      {shown.length > 0 ? (
        <ol aria-label={`Activity of ${run.id}`} className="flex flex-col gap-1.5 px-3 py-2">
          {shown.map((activity, index) => {
            const look = kinds[activity.kind] ?? {
              icon: Wrench,
              label: activity.kind,
              className: "",
            };
            const Icon = look.icon;
            const rich = activity.kind === "response" || activity.kind === "elicitation";
            return (
              <li
                key={activity.id ?? `${run.id}-${String(index)}`}
                data-kind={activity.kind}
                className="flex gap-2 text-sm"
              >
                <Icon className={cn("mt-0.5 size-4 shrink-0", look.className)} aria-hidden />
                <span className="sr-only">{look.label}</span>
                <div className={cn("min-w-0 flex-1", look.className)}>
                  {rich && activity.body ? (
                    <Markdown className="gap-1">{activity.body}</Markdown>
                  ) : (
                    <span className="whitespace-pre-wrap">{activity.body}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}

      {run.status === "awaiting_input" && !waitingOnGate ? (
        <div
          role="status"
          className="flex flex-col gap-2 border-t border-gate/40 bg-gate/5 px-3 py-2"
        >
          <p className="text-xs font-medium text-gate-foreground dark:text-gate">
            Needs your answer
          </p>
          <AnswerBox pending={answering} onAnswer={onAnswer} />
        </div>
      ) : null}
    </article>
  );
}

function AnswerBox({ pending, onAnswer }: { pending: boolean; onAnswer: (body: string) => void }) {
  const [body, setBody] = useState("");
  const send = () => {
    if (!body.trim()) return;
    onAnswer(body.trim());
    setBody("");
  };
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <Textarea
        aria-label="Answer this Run"
        value={body}
        rows={3}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(pressed) => {
          if (pressed.key === "Enter" && (pressed.metaKey || pressed.ctrlKey)) {
            pressed.preventDefault();
            send();
          }
        }}
        placeholder="Answer so the Agent can carry on. ⌘Enter sends."
      />
      <Button type="submit" size="sm" className="self-start" disabled={pending || !body.trim()}>
        Answer
      </Button>
    </form>
  );
}
