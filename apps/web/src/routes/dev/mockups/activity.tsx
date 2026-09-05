import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { MemberChip } from "@/components/member-chip";
import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/reui/timeline";
import { Button } from "@/components/ui/button";
import { activity, type FixtureActivity } from "@/dev/fixtures";
import { cn } from "@/lib/utils";
import { Variant } from "../mockups";

const dot: Record<FixtureActivity["tone"], string> = {
  human: "border-human bg-human/15",
  agent: "border-agent bg-agent/15",
  gate: "border-gate bg-gate/25",
  muted: "border-border bg-muted",
  destructive: "border-destructive bg-destructive/15",
};

function Who({ item }: { item: FixtureActivity }) {
  return item.actor ? (
    <MemberChip member={item.actor} size="xs" />
  ) : (
    <span className="text-muted-foreground">deevy</span>
  );
}

function Item({
  item,
  step,
  indent = false,
  card = false,
}: {
  item: FixtureActivity;
  step: number;
  indent?: boolean;
  card?: boolean;
}) {
  return (
    <TimelineItem step={step} className={cn(indent && "ms-14")}>
      <TimelineHeader>
        <TimelineSeparator className="bg-border" />
        <TimelineTitle className="flex flex-wrap items-baseline gap-x-1.5 text-sm font-normal">
          <Who item={item} />
          <span className={cn(item.kind === "gate" ? "font-medium" : "text-muted-foreground")}>
            {item.text}
          </span>
          <TimelineDate className="mb-0 font-mono text-xs text-muted-foreground/70">
            {item.at}
          </TimelineDate>
        </TimelineTitle>
        <TimelineIndicator className={cn(dot[item.tone])} />
      </TimelineHeader>
      {item.body ? (
        <TimelineContent className="mt-1 rounded-md border bg-card px-3 py-2 text-sm text-foreground">
          {item.body}
        </TimelineContent>
      ) : item.detail ? (
        <TimelineContent
          className={cn(
            "mt-1 text-sm",
            card
              ? "rounded-md border border-gate/40 bg-gate/5 px-3 py-2 text-foreground"
              : "text-muted-foreground italic",
          )}
        >
          “{item.detail}”
        </TimelineContent>
      ) : null}
    </TimelineItem>
  );
}

/** One rail, one dot per item; comments are cards on the rail. */
function Continuous() {
  return (
    <Timeline value={0} orientation="vertical" className="max-w-2xl">
      {activity.map((item, index) => (
        <Item key={item.id} item={item} step={index + 1} />
      ))}
    </Timeline>
  );
}

type Chunk = { day: string; items: (FixtureActivity | FixtureActivity[])[] };
function chunk(): Chunk[] {
  const days: Chunk[] = [];
  for (const item of activity) {
    let day = days.at(-1);
    if (!day || day.day !== item.day) {
      day = { day: item.day, items: [] };
      days.push(day);
    }
    const last = day.items.at(-1);
    // Consecutive plain Run actions by the same Agent fold into one entry.
    const foldable = item.kind === "run" && !item.detail;
    if (foldable && Array.isArray(last) && last[0]!.actor?.id === item.actor?.id) last.push(item);
    else if (
      foldable &&
      last &&
      !Array.isArray(last) &&
      last.kind === "run" &&
      !last.detail &&
      last.actor?.id === item.actor?.id
    )
      day.items[day.items.length - 1] = [last, item];
    else day.items.push(item);
  }
  return days;
}

function Folded({ items, step }: { items: FixtureActivity[]; step: number }) {
  const [open, setOpen] = useState(false);
  const first = items[0]!;
  return (
    <TimelineItem step={step}>
      <TimelineHeader>
        <TimelineSeparator className="bg-border" />
        <TimelineTitle className="flex flex-wrap items-baseline gap-x-1.5 text-sm font-normal">
          <Who item={first} />
          <button
            type="button"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(!open)}
          >
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            {items.length} actions
          </button>
          <TimelineDate className="mb-0 font-mono text-xs text-muted-foreground/70">
            {first.at}–{items.at(-1)!.at}
          </TimelineDate>
        </TimelineTitle>
        <TimelineIndicator className={dot.agent} />
      </TimelineHeader>
      {open ? (
        <TimelineContent className="mt-1 flex flex-col gap-0.5 text-sm text-muted-foreground">
          {items.map((item) => (
            <span key={item.id}>
              {item.text} <span className="font-mono text-xs">{item.at}</span>
            </span>
          ))}
        </TimelineContent>
      ) : null}
    </TimelineItem>
  );
}

/** Day separators; an Agent's run of plain actions folds into one expandable entry. */
function ByDay() {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {chunk().map((day) => (
        <div key={day.day} className="flex flex-col gap-2">
          <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
            <span>{day.day}</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <Timeline value={0} orientation="vertical">
            {day.items.map((entry, index) =>
              Array.isArray(entry) ? (
                <Folded key={entry[0]!.id} items={entry} step={index + 1} />
              ) : (
                <Item key={entry.id} item={entry} step={index + 1} />
              ),
            )}
          </Timeline>
        </div>
      ))}
    </div>
  );
}

/** Two-tone: Humans on the rail, Agents indented beside it, Gate rulings as full-width amber cards. */
function TwoTone() {
  return (
    <Timeline value={0} orientation="vertical" className="max-w-2xl">
      {activity.map((item, index) => (
        <Item
          key={item.id}
          item={item}
          step={index + 1}
          indent={item.actor?.kind === "agent"}
          card={item.kind === "gate"}
        />
      ))}
    </Timeline>
  );
}

export function ActivityMockups() {
  return (
    <>
      <p className="max-w-2xl text-sm text-muted-foreground">
        The same seventeen items each time: the sentences are what slice D will produce (which Gate,
        which Labels, the note quoted). Amber is a Gate, teal an Agent, copper a Human.
      </p>
      <Variant
        n={1}
        title="One continuous rail"
        note="A dot per item, comments as cards, notes as quotes. The simplest; a long Issue gets long."
      >
        <Continuous />
      </Variant>
      <Variant
        n={2}
        title="Days, and Agents folded"
        note="A separator per day; an Agent's consecutive plain actions fold into “n actions” that expands. Questions, answers and rulings never fold."
      >
        <ByDay />
      </Variant>
      <Variant
        n={3}
        title="Two-tone"
        note="Humans on the rail; Agents indented beside it; a Gate ruling is a full-width amber card. Who did what is readable from the silhouette."
      >
        <TwoTone />
      </Variant>
      <div className="max-w-2xl rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        Then, whichever is picked: the <em>All · Comments · Changes · Runs</em> filter stays above
        it, the composer below it.
        <Button variant="ghost" size="xs" className="ml-2" disabled>
          as today
        </Button>
      </div>
    </>
  );
}
