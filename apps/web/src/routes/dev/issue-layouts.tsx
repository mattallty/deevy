import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ActivityStream } from "@/components/activity-stream";
import { GateControls } from "@/components/gate-controls";
import { IssueDocuments } from "@/components/issue-documents";
import { IssueLinks } from "@/components/issue-links";
import { IssueRuns } from "@/components/run-card";
import { LabelBadge } from "@/components/label-badge";
import { Markdown } from "@/components/markdown";
import { MemberChip } from "@/components/member-chip";
import { RailHeading } from "@/components/rail-heading";
import { RunStatus, type RunStatusValue } from "@/components/run-status";
import { StateBadge } from "@/components/state-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";

/**
 * A spike, not a screen: five ways the Issue could be laid out, side by side on
 * the same Issue, so one can be picked and the other four deleted. Linked from
 * nowhere — `/dev/issue-layouts?issue=DEV-2&v=workbench` — the way `/dev/tokens`
 * is (docs/plans/ui-redesign-2.md picked its mockups the same way).
 *
 * The palette, the type and the components are deevy's own: what varies is
 * **what the page is centred on**, which is the thing today's layout does not
 * decide. It lists five things down one column — the ruling, the Documents, the
 * Runs, the conversation, the metadata — so a Human at a Gate and an Agent's
 * Sponsor reading a Run are given the same page, and neither is served first.
 *
 * Everything here reads and writes the real Issue: the Gate really rules, the
 * Document editor really saves. Only the Assignee is read-only, because a spike
 * about arrangement does not need a second copy of a Select.
 */

type VariantId = "ruling" | "workbench" | "story" | "canvas" | "panels";

const variants: Array<{ id: VariantId; name: string; centred: string; best: string }> = [
  {
    id: "ruling",
    name: "Ruling first",
    centred: "What is owed a Human, at the top and full width.",
    best: "A Workspace where Gates are the point and most Issues are waiting on somebody.",
  },
  {
    id: "workbench",
    name: "Workbench",
    centred: "The Issue's artifacts as navigation: pick a Document, a Run, the conversation.",
    best: "Issues an Agent has worked several times, where Documents and Runs pile up.",
  },
  {
    id: "story",
    name: "One story",
    centred: "Everything that happened, in order, in a single stream.",
    best: "Reading an Issue you have not seen before, or catching up after a week.",
  },
  {
    id: "canvas",
    name: "Document canvas",
    centred: "The Document being written; everything else is beside it.",
    best: "Intent, Spec and Plan States, where the writing is the work.",
  },
  {
    id: "panels",
    name: "Panels",
    centred: "One screen: every section folded to a line that says what is inside it.",
    best: "Working a queue — scan, act, move on — and keyboards over scrollbars.",
  },
];

export function IssueLayoutsPage() {
  const navigate = useNavigate();
  const search = useRouterState({ select: (state) => state.location.search }) as Record<
    string,
    unknown
  >;
  const issueKey = typeof search.issue === "string" && search.issue ? search.issue : "DEV-2";
  const chosen = variants.find((variant) => variant.id === search.v) ?? variants[0]!;
  const [draftKey, setDraftKey] = useState(issueKey);

  const go = (next: Partial<{ issue: string; v: VariantId }>) =>
    void navigate({
      to: "/dev/issue-layouts",
      search: { issue: next.issue ?? issueKey, v: next.v ?? chosen.id },
    });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 border-b pb-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Issue layouts</h1>
            <p className="text-sm text-muted-foreground">
              Five arrangements of the same Issue. Pick one; the rest get deleted.
            </p>
          </div>
          <form
            className="flex items-end gap-2"
            onSubmit={(submitted) => {
              submitted.preventDefault();
              go({ issue: draftKey.trim().toUpperCase() });
            }}
          >
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Issue
              <input
                value={draftKey}
                onChange={(changed) => setDraftKey(changed.target.value)}
                className="h-8 w-28 rounded-md border bg-card px-2 font-mono text-sm"
              />
            </label>
            <Button type="submit" variant="outline" size="sm">
              Show
            </Button>
          </form>
        </div>

        <nav aria-label="Layouts" className="flex flex-wrap gap-2">
          {variants.map((variant) => (
            <button
              key={variant.id}
              type="button"
              aria-current={variant.id === chosen.id ? "true" : undefined}
              onClick={() => go({ v: variant.id })}
              className={cn(
                "rounded-md border px-3 py-1.5 text-left text-sm hover:bg-accent",
                variant.id === chosen.id && "border-primary/30 bg-primary/10 text-primary",
              )}
            >
              {variant.name}
            </button>
          ))}
        </nav>
        <p className="text-sm">
          <span className="font-medium">{chosen.name}.</span>{" "}
          <span className="text-muted-foreground">{chosen.centred} </span>
          <span className="text-muted-foreground italic">Best for: {chosen.best}</span>
        </p>
      </header>

      <Variant id={chosen.id} issueKey={issueKey} />
    </div>
  );
}

/** Everything a layout arranges, loaded once. */
function Variant({ id, issueKey }: { id: VariantId; issueKey: string }) {
  const issue = useQuery(orpc.issues.get.queryOptions({ input: { key: issueKey } }));
  if (issue.isPending) return <Skeleton className="h-96 w-full" />;
  if (issue.isError) {
    return (
      <p className="text-destructive">
        Could not load {issueKey}: {issue.error.message}
      </p>
    );
  }

  const parts = partsOf(issue.data);
  // The container every variant lays itself out against: a grid on the same
  // element as `@container` would be asking itself how wide it is.
  return (
    <div className="@container">
      {id === "ruling" ? <RulingFirst parts={parts} /> : null}
      {id === "workbench" ? <Workbench parts={parts} /> : null}
      {id === "story" ? <OneStory parts={parts} /> : null}
      {id === "canvas" ? <DocumentCanvas parts={parts} /> : null}
      {id === "panels" ? <Panels parts={parts} /> : null}
    </div>
  );
}

type IssueData = Awaited<ReturnType<typeof import("@/lib/orpc").client.issues.get>>;
type Parts = ReturnType<typeof partsOf>;

/**
 * The pieces every layout is made of, so a layout is a decision about
 * arrangement and nothing else.
 */
function partsOf(issue: IssueData) {
  const atGate = issue.state.isGate;
  const stateName = issue.state.name;

  /** The key, the State and the title: who this is. */
  function identity(size: "lg" | "sm" = "lg") {
    const { key, title, state } = issue;
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-mono text-muted-foreground">{key}</span>
          <StateBadge
            state={{
              name: state.name,
              isGate: state.isGate,
              category: state.category as "backlog" | "active" | "done",
            }}
          />
          {issue.assignee ? (
            <MemberChip member={issue.assignee} size="inline" />
          ) : (
            <span className="text-xs text-muted-foreground">Unassigned</span>
          )}
        </div>
        <h2 className={cn("font-semibold tracking-tight", size === "lg" ? "text-2xl" : "text-lg")}>
          {title}
        </h2>
      </div>
    );
  }

  function description() {
    return issue.description ? (
      <Markdown>{issue.description}</Markdown>
    ) : (
      <p className="text-sm text-muted-foreground">No description yet.</p>
    );
  }

  /** The ruling, exactly as the Issue page rules. */
  function gate({ framed = true }: { framed?: boolean } = {}) {
    return (
      <div
        role="group"
        aria-label={atGate ? `${stateName} Gate` : `${stateName} State`}
        className={cn("rounded-lg", framed && atGate && "border border-gate/40 bg-gate/5 p-3")}
      >
        <GateControls
          issueKey={issue.key}
          projectKey={issue.project.key}
          state={issue.state}
          decisions={issue.gateDecisions}
          standing={issue.gate}
          shortcutScope="page"
        />
      </div>
    );
  }

  function documents() {
    return <IssueDocuments issueKey={issue.key} />;
  }
  function runs() {
    return <IssueRuns issueKey={issue.key} decisions={issue.gateDecisions} />;
  }
  function activity() {
    return <ActivityStream issueId={issue.id} issueKey={issue.key} />;
  }
  function links() {
    return <IssueLinks issueKey={issue.key} />;
  }

  /** Metadata as a rail: a column of labelled sections. */
  function railProperties() {
    const { labels, parent, children } = issue;
    return (
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-2">
          <RailHeading>Assignee</RailHeading>
          {issue.assignee ? (
            <MemberChip member={issue.assignee} size="sm" />
          ) : (
            <p className="text-sm text-muted-foreground">Unassigned</p>
          )}
        </section>
        <section className="flex flex-col gap-2">
          <RailHeading>Labels</RailHeading>
          <div className="flex flex-wrap gap-1">
            {labels.length === 0 ? (
              <p className="text-sm text-muted-foreground">None</p>
            ) : (
              labels.map((label) => <LabelBadge key={label.id} label={label} />)
            )}
          </div>
        </section>
        <section className="flex flex-col gap-2">
          <RailHeading>Parent</RailHeading>
          {parent ? (
            <Link
              to="/issues/$issueKey"
              params={{ issueKey: parent.key }}
              className="text-sm hover:underline"
            >
              <span className="font-mono text-xs text-muted-foreground">{parent.key}</span>{" "}
              {parent.title}
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">None</p>
          )}
        </section>
        {children.length > 0 ? (
          <section className="flex flex-col gap-2">
            <RailHeading>Children</RailHeading>
            <ul className="flex flex-col gap-1">
              {children.map((child) => (
                <li key={child.id} className="text-sm">
                  <Link
                    to="/issues/$issueKey"
                    params={{ issueKey: child.key }}
                    className="hover:underline"
                  >
                    <span className="font-mono text-xs text-muted-foreground">{child.key}</span>{" "}
                    {child.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {links()}
      </div>
    );
  }

  /**
   * The same metadata as one line of the page rather than a column of it: the
   * trade every layout without a rail has to make.
   */
  function stripProperties() {
    const { labels, parent, children } = issue;
    const cell = (name: string, value: ReactNode) => (
      <div className="flex min-w-0 flex-col gap-1">
        <RailHeading>{name}</RailHeading>
        <div className="truncate text-sm">{value}</div>
      </div>
    );
    return (
      <div className="flex flex-wrap items-start gap-x-8 gap-y-3 border-y py-3">
        {cell(
          "Assignee",
          issue.assignee ? (
            <MemberChip member={issue.assignee} size="inline" />
          ) : (
            <span className="text-muted-foreground">Unassigned</span>
          ),
        )}
        {cell(
          "Labels",
          labels.length === 0 ? (
            <span className="text-muted-foreground">None</span>
          ) : (
            <span className="flex flex-wrap gap-1">
              {labels.map((label) => (
                <LabelBadge key={label.id} label={label} />
              ))}
            </span>
          ),
        )}
        {cell(
          "Parent",
          parent ? (
            <Link
              to="/issues/$issueKey"
              params={{ issueKey: parent.key }}
              className="hover:underline"
            >
              {parent.key}
            </Link>
          ) : (
            <span className="text-muted-foreground">None</span>
          ),
        )}
        {children.length > 0
          ? cell(
              "Children",
              <span className="flex flex-wrap gap-2">
                {children.map((child) => (
                  <Link
                    key={child.id}
                    to="/issues/$issueKey"
                    params={{ issueKey: child.key }}
                    className="font-mono text-xs hover:underline"
                  >
                    {child.key}
                  </Link>
                ))}
              </span>,
            )
          : null}
      </div>
    );
  }

  /** What the workbench navigates: the artifacts this Issue has produced. */
  function artifacts() {
    return { issueKey: issue.key };
  }

  return {
    key: issue.key,
    atGate,
    stateName,
    identity,
    description,
    gate,
    documents,
    runs,
    activity,
    links,
    railProperties,
    stripProperties,
    artifacts,
  };
}

/* ------------------------------------------------------------------ 1 of 5 */

/**
 * **Ruling first.** The decision is the page's opening move, full width, before
 * anything else — not a card in a rail competing with the Labels. Everything
 * else is one reading column under it, with the metadata as a strip rather than
 * a column, because a rail beside a decision splits the attention the decision
 * is asking for.
 */
function RulingFirst({ parts }: { parts: Parts }) {
  return (
    <article className="flex flex-col gap-6">
      <section
        className={cn(
          "rounded-xl border p-5",
          parts.atGate ? "border-gate/40 bg-gate/5" : "bg-muted/30",
        )}
      >
        {parts.gate({ framed: false })}
      </section>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {parts.identity()}
        {parts.stripProperties()}
        {parts.description()}
        {parts.documents()}
        {parts.runs()}
        {parts.activity()}
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ 2 of 5 */

/**
 * **Workbench.** An Issue an Agent has worked is not a document, it is a desk
 * with things on it: two Documents, three Runs, a conversation. The left rail
 * navigates them, the centre shows the one you picked, and the right holds the
 * ruling and the metadata. Nothing scrolls past anything else.
 */
function Workbench({ parts }: { parts: Parts }) {
  const { issueKey } = parts.artifacts();
  const documents = useQuery(orpc.documents.list.queryOptions({ input: { issueKey } }));
  const runs = useQuery(orpc.runs.list.queryOptions({ input: { issueKey } }));
  const comments = useQuery(orpc.comments.list.queryOptions({ input: { issueKey } }));
  const [pane, setPane] = useState<"issue" | "documents" | "runs" | "activity">("issue");

  const panes = [
    { id: "issue" as const, name: "The Issue", count: null },
    { id: "documents" as const, name: "Documents", count: documents.data?.documents.length ?? 0 },
    { id: "runs" as const, name: "Runs", count: runs.data?.runs.length ?? 0 },
    { id: "activity" as const, name: "Conversation", count: comments.data?.comments.length ?? 0 },
  ];

  return (
    <article className="grid gap-6 @4xl:grid-cols-[13rem_minmax(0,1fr)_17rem]">
      <nav aria-label="Artifacts" className="flex flex-col gap-1 @4xl:border-r @4xl:pr-4">
        {panes.map((one) => (
          <button
            key={one.id}
            type="button"
            aria-current={pane === one.id ? "true" : undefined}
            onClick={() => setPane(one.id)}
            className={cn(
              "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-accent",
              pane === one.id && "bg-accent font-medium",
            )}
          >
            <span className="flex-1 truncate">{one.name}</span>
            {one.count !== null ? (
              <span className="font-mono text-xs text-muted-foreground">{one.count}</span>
            ) : null}
          </button>
        ))}

        {(runs.data?.runs ?? []).length > 0 ? (
          <div className="mt-4 flex flex-col gap-1">
            <RailHeading>Latest Runs</RailHeading>
            {(runs.data?.runs ?? []).slice(0, 4).map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => setPane("runs")}
                className="flex items-center gap-2 rounded-md px-2.5 py-1 text-left hover:bg-accent"
              >
                <RunStatus status={run.status as RunStatusValue} />
              </button>
            ))}
          </div>
        ) : null}
      </nav>

      <div className="flex min-w-0 flex-col gap-6">
        {parts.identity("sm")}
        {pane === "issue" ? parts.description() : null}
        {pane === "documents" ? parts.documents() : null}
        {pane === "runs" ? parts.runs() : null}
        {pane === "activity" ? parts.activity() : null}
      </div>

      <aside className="flex flex-col gap-5 @4xl:border-l @4xl:pl-4">
        {parts.gate()}
        {parts.railProperties()}
      </aside>
    </article>
  );
}

/* ------------------------------------------------------------------ 3 of 5 */

/**
 * **One story.** The Issue read as what happened to it: the description is the
 * first entry, the Runs and the conversation follow in time, and the ruling is
 * a bar that stays on screen the way a pull request's merge box does. The rail
 * keeps the facts that are not events.
 *
 * In the spike the stream is three sections in time order; the real thing would
 * fold Runs and Document versions into `ActivityStream`'s own list, which is
 * already a merge of Events and comments.
 */
function OneStory({ parts }: { parts: Parts }) {
  return (
    <article className="grid gap-8 @3xl:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="flex min-w-0 flex-col gap-6 pb-20">
        {parts.identity()}
        <section className="rounded-lg border p-4">
          <RailHeading className="mb-2">Opened with</RailHeading>
          {parts.description()}
        </section>
        {parts.documents()}
        {parts.runs()}
        {parts.activity()}
      </div>

      <aside className="flex flex-col gap-5">{parts.railProperties()}</aside>

      {/* The one thing that must never scroll away. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-6 py-3 backdrop-blur supports-backdrop-filter:bg-background/80">
        <div className="mx-auto max-w-5xl">{parts.gate({ framed: false })}</div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ 4 of 5 */

/**
 * **Document canvas.** In Intent, Spec and Plan the Document _is_ the work, and
 * today it is a section two scrolls down. Here it is the page: a reading measure
 * in the middle, the ruling and the facts in a narrow column beside it, and the
 * Runs and the conversation under a divider for when the writing is done.
 */
function DocumentCanvas({ parts }: { parts: Parts }) {
  return (
    <article className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        {parts.identity()}
        {parts.stripProperties()}
      </div>

      <div className="grid gap-8 @3xl:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {parts.description()}
          {parts.documents()}
        </div>
        <aside className="flex flex-col gap-5">
          {parts.gate()}
          {parts.links()}
        </aside>
      </div>

      <div className="flex flex-col gap-6 border-t pt-6">
        {parts.runs()}
        {parts.activity()}
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ 5 of 5 */

/**
 * **Panels.** Everything the Issue has, folded to one line each, so the whole
 * Issue fits on a screen and you open only what you came for. The ruling is the
 * one thing never folded. Built on `<details>`, so the keyboard and the screen
 * reader get it for free.
 */
function Panels({ parts }: { parts: Parts }) {
  const { issueKey } = parts.artifacts();
  const documents = useQuery(orpc.documents.list.queryOptions({ input: { issueKey } }));
  const runs = useQuery(orpc.runs.list.queryOptions({ input: { issueKey } }));
  const comments = useQuery(orpc.comments.list.queryOptions({ input: { issueKey } }));

  const summary = (name: string, says: string) => (
    <summary className="flex cursor-default list-none items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent">
      <span className="font-medium">{name}</span>
      <span className="flex-1 truncate text-muted-foreground">{says}</span>
      <span className="text-xs text-muted-foreground">open</span>
    </summary>
  );

  const documentsSay = (documents.data?.documents ?? [])
    .map((document) => `${document.name} v${String(document.currentVersion)}`)
    .join(" · ");
  const runsSay = (runs.data?.runs ?? []).length
    ? `${String((runs.data?.runs ?? []).length)}, latest ${runs.data?.runs[0]?.status ?? ""}`
    : "none yet";

  return (
    <article className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="sticky top-0 z-30 flex flex-col gap-3 border-b bg-background/95 pb-3 backdrop-blur">
        {parts.identity("sm")}
      </div>

      {parts.gate()}

      <div className="flex flex-col divide-y rounded-lg border">
        <details open>
          {summary("Description", parts.key)}
          <div className="px-3 pb-3">{parts.description()}</div>
        </details>
        <details>
          {summary("Documents", documentsSay || "none yet")}
          <div className="px-3 pb-3">{parts.documents()}</div>
        </details>
        <details>
          {summary("Runs", runsSay)}
          <div className="px-3 pb-3">{parts.runs()}</div>
        </details>
        <details>
          {summary("Activity", `${String((comments.data?.comments ?? []).length)} comments`)}
          <div className="px-3 pb-3">{parts.activity()}</div>
        </details>
        <details>
          {summary("Facts", "assignee, labels, parent, links")}
          <div className="px-3 pb-3">{parts.railProperties()}</div>
        </details>
      </div>
    </article>
  );
}
