import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ExternalLink, GitBranch, GitPullRequest, FileText, Bot } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { MemberChip } from "@/components/member-chip";
import { RailHeading } from "@/components/rail-heading";
import { RunStatus, type RunStatusValue } from "@/components/run-status";
import { StateBadge } from "@/components/state-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import type { Parts } from "./issue-layouts";

/**
 * The second pass of the Issue-view spike, after the first five turned out to
 * be one idea — a column with a rail — arranged five ways.
 *
 * These start from what comparable software settled on in 2026. Linear pins the
 * diff to the top of the issue's sidebar so the code is reachable from anywhere
 * on the page, and marks which text an Agent wrote, with version history to
 * restore from. Devin's command centre groups a session by what it is waiting
 * on — in progress, blocked, ready for review. Cursor keeps the agent session
 * itself on screen beside the work rather than behind a tab.
 *
 * deevy has all three of those nouns already — Links to a branch and a pull
 * request, Documents with versions and an author per version, Runs with a live
 * feed — and shows none of them where they can be reached. That is what these
 * five are about, rather than where the Labels sit.
 */

/* ------------------------------------------------------------------ 6 of 10 */

/**
 * **Review.** An Issue at a Gate is a review, and a review screen shows what
 * changed next to the decision about it. Left: the Document as it stands beside
 * the version before it, so a Human rules on a difference rather than on a
 * whole. Right, and staying put: the ruling.
 *
 * Both versions are real — `documents.get` takes a version and says who wrote
 * it — so this is what the screen would be, not a picture of it.
 */
export function ReviewScreen({ parts }: { parts: Parts }) {
  const { issueKey } = parts.artifacts();
  const documents = useQuery(orpc.documents.list.queryOptions({ input: { issueKey } }));
  const list = documents.data?.documents ?? [];
  const [name, setName] = useState<string | null>(null);
  const chosen = list.find((document) => document.name === name) ?? list[0] ?? null;

  const current = useQuery(
    orpc.documents.get.queryOptions({
      input: { issueKey, name: chosen?.name ?? "" },
      enabled: Boolean(chosen),
    }),
  );
  const previous = useQuery(
    orpc.documents.get.queryOptions({
      input: {
        issueKey,
        name: chosen?.name ?? "",
        version: Math.max(1, (chosen?.currentVersion ?? 1) - 1),
      },
      enabled: Boolean(chosen) && (chosen?.currentVersion ?? 1) > 1,
    }),
  );

  return (
    <article className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3">{parts.identity("sm")}</header>

      <PinnedArtifacts parts={parts} />

      <div className="grid gap-6 @4xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {list.map((document) => (
              <button
                key={document.id}
                type="button"
                onClick={() => setName(document.name)}
                aria-current={document.name === chosen?.name ? "true" : undefined}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs hover:bg-accent",
                  document.name === chosen?.name && "border-primary/30 bg-primary/10 text-primary",
                )}
              >
                {document.name} <span className="font-mono">v{document.currentVersion}</span>
              </button>
            ))}
            {list.length === 0 ? (
              <p className="text-sm text-muted-foreground">No Documents on this Issue.</p>
            ) : null}
          </div>

          {chosen ? (
            <div className="grid gap-4 @3xl:grid-cols-2">
              <section className="flex flex-col gap-2">
                <RailHeading>
                  Before {previous.data ? `· v${previous.data.version}` : "· nothing"}
                </RailHeading>
                <div className="rounded-lg border bg-muted/20 p-4 opacity-80">
                  {previous.isPending && (chosen.currentVersion ?? 1) > 1 ? (
                    <Skeleton className="h-40 w-full" />
                  ) : previous.data ? (
                    <Markdown>{previous.data.body}</Markdown>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      The first version: there is nothing behind it.
                    </p>
                  )}
                </div>
              </section>
              <section className="flex flex-col gap-2">
                <RailHeading>
                  Now · v{current.data?.version ?? chosen.currentVersion}
                  {current.data ? <Author memberId={current.data.authorMemberId} /> : null}
                </RailHeading>
                <div className="rounded-lg border p-4">
                  {current.isPending ? (
                    <Skeleton className="h-40 w-full" />
                  ) : current.data ? (
                    <Markdown>{current.data.body}</Markdown>
                  ) : null}
                </div>
              </section>
            </div>
          ) : null}
        </div>

        <aside className="@4xl:sticky @4xl:top-4 flex h-fit flex-col gap-4">
          {parts.gate()}
          <details className="rounded-lg border p-3">
            <summary className="cursor-default text-sm text-muted-foreground">
              The Issue itself
            </summary>
            <div className="pt-3">{parts.description()}</div>
          </details>
        </aside>
      </div>

      <div className="border-t pt-5">{parts.activity()}</div>
    </article>
  );
}

/* ------------------------------------------------------------------ 7 of 10 */

/**
 * **Console.** What an Agent is doing is not a section of the Issue, it is the
 * other half of the room: Cursor and Devin both keep the session on screen
 * beside the work rather than behind a tab. The Issue reads on the left, the
 * Agent's Run runs on the right and stays there while you scroll.
 */
export function SessionConsole({ parts }: { parts: Parts }) {
  const { issueKey } = parts.artifacts();
  const runs = useQuery(orpc.runs.list.queryOptions({ input: { issueKey } }));
  const open = (runs.data?.runs ?? [])[0] ?? null;

  return (
    <article className="grid gap-6 @4xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="flex min-w-0 flex-col gap-6">
        {parts.identity()}
        {parts.stripProperties()}
        {parts.description()}
        {parts.documents()}
        {parts.activity()}
      </div>

      <aside className="@4xl:sticky @4xl:top-4 flex h-fit max-h-[calc(100svh-8rem)] flex-col gap-3 overflow-y-auto rounded-lg border bg-muted/20 p-3">
        <div className="flex items-center gap-2">
          <Bot aria-hidden className="size-4 text-agent" />
          <RailHeading className="flex-1">The Agent</RailHeading>
          {open ? <RunStatus status={open.status as RunStatusValue} /> : null}
        </div>
        {parts.gate({ framed: true })}
        {runs.isPending ? <Skeleton className="h-40 w-full" /> : null}
        {!runs.isPending && !open ? (
          <p className="text-sm text-muted-foreground">
            No Run yet. Assign this Issue to an Agent, or mention one in a comment, and its work
            appears here.
          </p>
        ) : null}
        {open ? parts.runs() : null}
      </aside>
    </article>
  );
}

/* ------------------------------------------------------------------ 8 of 10 */

/**
 * **Split.** Linear ships split as a view of its own, and mail clients have
 * worked this way for twenty years: the queue does not disappear because you
 * opened something in it. The list stays on the left and the Issue fills the
 * rest, so ruling on six Gates is six clicks and no navigation.
 */
export function SplitQueue({ parts }: { parts: Parts }) {
  const navigate = useNavigate();
  const issues = useQuery(orpc.issues.list.queryOptions({ input: { limit: 40 } }));
  const rows = issues.data?.issues ?? [];

  return (
    <article className="grid gap-6 @4xl:grid-cols-[20rem_minmax(0,1fr)]">
      <nav
        aria-label="The queue"
        className="flex max-h-[calc(100svh-12rem)] flex-col gap-0.5 overflow-y-auto @4xl:border-r @4xl:pr-3"
      >
        {issues.isPending ? <Skeleton className="h-64 w-full" /> : null}
        {rows.map((row) => (
          <button
            key={row.key}
            type="button"
            aria-current={row.key === parts.key ? "true" : undefined}
            onClick={() =>
              void navigate({
                to: "/dev/issue-layouts",
                search: { issue: row.key, v: "split" },
              })
            }
            className={cn(
              "flex flex-col gap-1 rounded-md px-2.5 py-2 text-left hover:bg-accent",
              row.key === parts.key && "bg-accent",
            )}
          >
            <span className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{row.key}</span>
              <StateBadge
                state={{
                  name: row.state.name,
                  isGate: row.state.isGate,
                  category: row.state.category as "backlog" | "active" | "done",
                }}
              />
            </span>
            <span className="truncate text-sm">{row.title}</span>
          </button>
        ))}
      </nav>

      <div className="flex min-w-0 flex-col gap-5">
        {parts.identity("sm")}
        {parts.gate()}
        {parts.stripProperties()}
        {parts.description()}
        {parts.documents()}
        {parts.runs()}
        {parts.activity()}
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ 9 of 10 */

/**
 * **Hub.** One line at the top that says what this Issue is waiting on — the
 * question Devin's command centre sorts by — and beside it the things the work
 * produced, pinned the way Linear pins a diff: the current Document, the
 * branch, the pull request, the last Run. Both stay while the page scrolls, so
 * "what is owed" and "what came out of it" are never more than a glance away.
 */
export function StatusHub({ parts }: { parts: Parts }) {
  const { issueKey } = parts.artifacts();
  const runs = useQuery(orpc.runs.list.queryOptions({ input: { issueKey } }));
  const latest = (runs.data?.runs ?? [])[0] ?? null;

  const waiting = parts.atGate
    ? `Waiting on a Human at the ${parts.stateName} Gate`
    : latest?.status === "awaiting_input"
      ? "Waiting on an answer from a Human"
      : latest?.status === "active"
        ? "An Agent is working on it now"
        : latest?.status === "failed"
          ? "The last Run failed"
          : "Nobody is waiting on anything";

  return (
    <article className="flex flex-col gap-5">
      <div className="sticky top-0 z-30 flex flex-col gap-3 border-b bg-background/95 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cn(
              "rounded-md px-2.5 py-1 text-sm",
              parts.atGate ? "bg-gate/15 text-gate-foreground" : "bg-muted",
            )}
          >
            {waiting}
          </span>
          {latest ? <RunStatus status={latest.status as RunStatusValue} /> : null}
          <span className="flex-1" />
          <PinnedArtifacts parts={parts} compact />
        </div>
        {parts.identity("sm")}
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {parts.gate()}
        {parts.stripProperties()}
        {parts.description()}
        {parts.documents()}
        {parts.runs()}
        {parts.activity()}
      </div>
    </article>
  );
}

/* ----------------------------------------------------------------- 10 of 10 */

/**
 * **Provenance.** Half the words on a deevy Issue were written by an Agent, and
 * the page never says which half. Linear shipped author indicators and
 * agent-edit highlighting for exactly this. Here the Document is the page and
 * its versions are the spine: every version says who wrote it and when, reading
 * one is a click, and the ruling sits beside the version you are reading.
 */
export function Provenance({ parts }: { parts: Parts }) {
  const { issueKey } = parts.artifacts();
  const documents = useQuery(orpc.documents.list.queryOptions({ input: { issueKey } }));
  const list = documents.data?.documents ?? [];
  const [name, setName] = useState<string | null>(null);
  const chosen = list.find((document) => document.name === name) ?? list[0] ?? null;
  const [version, setVersion] = useState<number | null>(null);
  const showing = version ?? chosen?.currentVersion ?? 1;

  const body = useQuery(
    orpc.documents.get.queryOptions({
      input: { issueKey, name: chosen?.name ?? "", version: showing },
      enabled: Boolean(chosen),
    }),
  );

  return (
    <article className="grid gap-6 @4xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="flex min-w-0 flex-col gap-4">
        {parts.identity()}
        <div className="flex flex-wrap items-center gap-2">
          {list.map((document) => (
            <button
              key={document.id}
              type="button"
              onClick={() => {
                setName(document.name);
                setVersion(null);
              }}
              aria-current={document.name === chosen?.name ? "true" : undefined}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs hover:bg-accent",
                document.name === chosen?.name && "border-primary/30 bg-primary/10 text-primary",
              )}
            >
              {document.name}
            </button>
          ))}
        </div>

        {chosen ? (
          <section className="flex flex-col gap-3 rounded-lg border p-5">
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">v{showing}</span>
              <span>·</span>
              {body.data ? <Author memberId={body.data.authorMemberId} /> : <span>…</span>}
              {showing !== chosen.currentVersion ? (
                <Button size="xs" variant="outline" onClick={() => setVersion(null)}>
                  Back to current
                </Button>
              ) : null}
            </p>
            {body.isPending ? <Skeleton className="h-64 w-full" /> : null}
            {body.data ? <Markdown>{body.data.body}</Markdown> : null}
          </section>
        ) : (
          <p className="text-sm text-muted-foreground">No Documents on this Issue yet.</p>
        )}

        {parts.activity()}
      </div>

      <aside className="flex flex-col gap-5">
        {parts.gate()}
        {chosen ? (
          <section className="flex flex-col gap-2">
            <RailHeading>Versions</RailHeading>
            <ul className="flex flex-col gap-1">
              {Array.from(
                { length: chosen.currentVersion },
                (_, index) => chosen.currentVersion - index,
              ).map((candidate) => (
                <li key={candidate}>
                  <button
                    type="button"
                    onClick={() => setVersion(candidate)}
                    aria-current={candidate === showing ? "true" : undefined}
                    className={cn(
                      "w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-accent",
                      candidate === showing && "bg-accent",
                    )}
                  >
                    <span className="font-mono text-xs">v{candidate}</span>{" "}
                    {candidate === chosen.currentVersion ? "current" : "older"}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {parts.railProperties()}
      </aside>
    </article>
  );
}

/* ------------------------------------------------------------------- shared */

/** Who wrote a version: the thing the page never said. */
function Author({ memberId }: { memberId: string | null }) {
  const members = useQuery(orpc.members.list.queryOptions({ input: {} }));
  const member = (members.data?.members ?? []).find((one) => one.id === memberId);
  if (!member) return <span className="text-muted-foreground">deevy</span>;
  return <MemberChip member={member} size="inline" />;
}

/**
 * What the work produced, pinned: Linear puts the diff at the top of the
 * sidebar because that is what everybody on the Issue is actually looking for.
 * deevy's equivalent is its Links — a branch, a pull request, a commit.
 */
function PinnedArtifacts({ parts, compact = false }: { parts: Parts; compact?: boolean }) {
  const { issueKey } = parts.artifacts();
  const links = useQuery(orpc.links.list.queryOptions({ input: { issueKey } }));
  const rows = links.data?.links ?? [];
  if (rows.length === 0) {
    return compact ? null : (
      <p className="text-xs text-muted-foreground">Nothing linked to this Issue yet.</p>
    );
  }
  const icon = (kind: string) =>
    kind === "pull_request" ? (
      <GitPullRequest aria-hidden className="size-3.5" />
    ) : kind === "branch" ? (
      <GitBranch aria-hidden className="size-3.5" />
    ) : (
      <FileText aria-hidden className="size-3.5" />
    );

  return (
    <div className={cn("flex flex-wrap items-center gap-2", !compact && "rounded-lg border p-2")}>
      {rows.slice(0, compact ? 3 : 8).map((link) => (
        <a
          key={link.id}
          href={link.url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex max-w-56 items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-accent"
        >
          {icon(link.kind)}
          <span className="truncate">{link.title ?? link.ref ?? link.url}</span>
          <ExternalLink aria-hidden className="size-3 text-muted-foreground" />
        </a>
      ))}
    </div>
  );
}

/** The Issue's own page, for comparison, one click away from every variant. */
export function FullPageLink({ issueKey }: { issueKey: string }) {
  return (
    <Link
      to="/issues/$issueKey"
      params={{ issueKey }}
      className="text-xs text-muted-foreground hover:underline"
    >
      open the real page
    </Link>
  );
}
