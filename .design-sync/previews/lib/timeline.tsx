// The stories for Timeline and its parts. Kept under lib/ with a non-component
// file name: a sibling named like an export is shimmed to the package by the
// story-imports plugin, so `export * from "./Timeline"` would re-export all of it.
import {
  Button,
  Markdown,
  MemberChip,
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@deevy/design-system";
import { ChevronRight } from "lucide-react";
import { ada, builder, grace, planner } from "./fixtures";

// The dot on the rail says who did it: sky for a Human, rose for an Agent, amber for a Gate.
const dot = {
  human: "border-human bg-human/15",
  agent: "border-agent bg-agent/15",
  gate: "border-gate bg-gate/25",
  muted: "border-border bg-muted",
  destructive: "border-destructive bg-destructive/15",
} as const;

type Member = typeof ada;

function Day({ label }: { label: string }) {
  return (
    <li
      role="presentation"
      className="flex items-center gap-3 pt-2 pb-3 text-xs font-medium text-muted-foreground"
    >
      <span>{label}</span>
      <span aria-hidden className="h-px flex-1 bg-border" />
    </li>
  );
}

function Event({
  step,
  actor,
  text,
  ago,
  tone = "muted",
  strong = false,
  detail,
}: {
  step: number;
  actor: Member | null;
  text: string;
  ago: string;
  tone?: keyof typeof dot;
  strong?: boolean;
  detail?: string;
}) {
  return (
    <TimelineItem step={step} render={<li />} className="not-last:pb-4">
      <TimelineHeader>
        <TimelineSeparator className="bg-border" />
        <TimelineTitle
          render={<div />}
          className="flex flex-wrap items-baseline gap-x-1.5 text-sm font-normal"
        >
          {actor ? (
            <MemberChip member={actor} size="xs" />
          ) : (
            <span className="text-muted-foreground">deevy</span>
          )}
          <span className={strong ? "font-medium" : "text-muted-foreground"}>{text}</span>
          <span className="font-mono text-xs text-muted-foreground/70">{ago}</span>
        </TimelineTitle>
        <TimelineIndicator className={dot[tone]} />
      </TimelineHeader>
      {detail ? (
        <TimelineContent
          className={
            strong
              ? "mt-1 rounded-md border border-gate/40 bg-gate/5 px-3 py-2 text-sm text-foreground"
              : "mt-1 text-sm text-muted-foreground italic"
          }
        >
          “{detail}”
        </TimelineContent>
      ) : null}
    </TimelineItem>
  );
}

function Comment({
  step,
  author,
  ago,
  body,
}: {
  step: number;
  author: Member;
  ago: string;
  body: string;
}) {
  return (
    <TimelineItem step={step} render={<li />} className="not-last:pb-4">
      <TimelineHeader>
        <TimelineSeparator className="bg-border" />
        <TimelineTitle
          render={<div />}
          className="flex flex-wrap items-baseline gap-x-1.5 text-sm font-normal"
        >
          <MemberChip member={author} size="xs" />
          <span className="text-muted-foreground">commented</span>
          <span className="font-mono text-xs text-muted-foreground/70">{ago}</span>
          <span className="flex-1" />
          <Button variant="destructive" size="xs">
            Delete
          </Button>
        </TimelineTitle>
        <TimelineIndicator className={dot[author.kind]} />
      </TimelineHeader>
      <TimelineContent className="mt-1 rounded-md border bg-card px-3 py-2 text-sm text-foreground">
        <Markdown>{body}</Markdown>
      </TimelineContent>
    </TimelineItem>
  );
}

/** An Issue's activity: what was said and what happened, by day, on one rail. The dot says who — Human, Agent, Gate. */
export const Activity = () => (
  <Timeline
    value={0}
    orientation="vertical"
    render={<ol aria-label="Activity" />}
    className="w-full max-w-xl pl-1"
  >
    <Day label="Yesterday" />
    <Event step={1} actor={ada} text="created DEV-42" ago="1d" tone="human" />
    <Event step={2} actor={ada} text="assigned planner" ago="1d" tone="human" />
    <Event step={3} actor={planner} text="started a Run" ago="23h" tone="agent" />
    <Event
      step={4}
      actor={planner}
      text="asked a question"
      ago="22h"
      tone="agent"
      detail="Should the ruling default to any Human, or refuse until a list is set?"
    />
    <Comment
      step={5}
      author={grace}
      ago="21h"
      body="Default to `any-human` — every old Gate keeps working, and we tighten later."
    />
    <Day label="Today" />
    <Event step={6} actor={planner} text="wrote Document “Spec”" ago="3h" tone="agent" />
    <Event step={7} actor={planner} text="moved to Review" ago="3h" tone="gate" strong />
    <Event
      step={8}
      actor={ada}
      text="approved the Review Gate"
      ago="2h"
      tone="gate"
      strong
      detail="Spec is clear. Builder, take it from here."
    />
    <Event step={9} actor={builder} text="started a Run" ago="2h" tone="agent" />
  </Timeline>
);

/** An Agent's run of routine steps folds into one line, so a Human's words are not lost among them. */
export const FoldedSteps = () => (
  <Timeline
    value={0}
    orientation="vertical"
    render={<ol aria-label="Activity" />}
    className="w-full max-w-xl pl-1"
  >
    <Day label="Today" />
    <TimelineItem step={1} render={<li />} className="not-last:pb-4">
      <TimelineHeader>
        <TimelineSeparator className="bg-border" />
        <TimelineTitle
          render={<div />}
          className="flex flex-wrap items-baseline gap-x-1.5 text-sm font-normal"
        >
          <MemberChip member={builder} size="xs" />
          <button
            type="button"
            aria-expanded={false}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="size-3.5" />4 steps
          </button>
          <span className="font-mono text-xs text-muted-foreground/70">40m</span>
        </TimelineTitle>
        <TimelineIndicator className={dot.agent} />
      </TimelineHeader>
    </TimelineItem>
    <Comment
      step={2}
      author={ada}
      ago="12m"
      body="@builder the test for the 403 is missing — see the Acceptance list."
    />
    <Event
      step={3}
      actor={builder}
      text="answered"
      ago="5m"
      tone="agent"
      detail="Added it in packages/core/tests/gates.test.ts."
    />
  </Timeline>
);

/** The stepper the kit ships: numbered steps with a date, the rail filled up to the active one. */
export const Steps = () => (
  <Timeline defaultValue={2} orientation="vertical" className="w-full max-w-md pl-1">
    {[
      {
        title: "Issue created",
        date: "Mon 1 Sep",
        content: "By Ada, in DEV, assigned to Planner.",
      },
      {
        title: "Spec written",
        date: "Tue 2 Sep",
        content: "Planner's Run wrote the Document and moved it to Review.",
      },
      { title: "Review Gate", date: "Wed 3 Sep", content: "Waiting on Ada or Grace." },
      { title: "Shipped", date: "—", content: "Builder's Run, once the Gate is approved." },
    ].map((step, index) => (
      <TimelineItem key={step.title} step={index + 1}>
        <TimelineHeader>
          <TimelineSeparator />
          <TimelineDate>{step.date}</TimelineDate>
          <TimelineTitle>{step.title}</TimelineTitle>
          <TimelineIndicator />
        </TimelineHeader>
        <TimelineContent>{step.content}</TimelineContent>
      </TimelineItem>
    ))}
  </Timeline>
);

/** The withdrawn, the destructive, and the anonymous: what deevy itself did, and what was undone. */
export const Tones = () => (
  <Timeline
    value={0}
    orientation="vertical"
    render={<ol aria-label="Activity" />}
    className="w-full max-w-xl pl-1"
  >
    <Day label="Today" />
    <Event
      step={1}
      actor={null}
      text="suspended reviewer — its Sponsor left the Workspace"
      ago="2h"
      tone="destructive"
      strong
    />
    <Event
      step={2}
      actor={grace}
      text="rejected the Review Gate"
      ago="1h"
      tone="gate"
      strong
      detail="The migration note is still missing."
    />
    <TimelineItem step={3} render={<li />} className="not-last:pb-4">
      <TimelineHeader>
        <TimelineSeparator className="bg-border" />
        <TimelineTitle
          render={<div />}
          className="flex flex-wrap items-baseline gap-x-1.5 text-sm font-normal"
        >
          <MemberChip member={planner} size="xs" />
          <span className="text-muted-foreground">commented</span>
          <span className="font-mono text-xs text-muted-foreground/70">30m</span>
        </TimelineTitle>
        <TimelineIndicator className={dot.agent} />
      </TimelineHeader>
      <TimelineContent className="mt-1 rounded-md border bg-card px-3 py-2 text-sm">
        <p className="text-sm text-muted-foreground italic">This comment was withdrawn.</p>
      </TimelineContent>
    </TimelineItem>
    <Event
      step={4}
      actor={ada}
      text="changed the title"
      ago="10m"
      tone="muted"
      detail="Add ruling authority to Gate"
    />
  </Timeline>
);
