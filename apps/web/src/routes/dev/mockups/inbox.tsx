import {
  AtSign,
  Bot,
  CircleCheck,
  CircleX,
  Diamond,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { MemberChip } from "@/components/member-chip";
import { StateBadge } from "@/components/state-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { notifications, type FixtureNotification } from "@/dev/fixtures";
import { cn } from "@/lib/utils";
import { Variant } from "../mockups";

const glyph: Record<FixtureNotification["kind"], LucideIcon> = {
  mention: AtSign,
  assignment: UserPlus,
  gate_awaiting: Diamond,
  run_awaiting_input: Bot,
  run_finished: CircleCheck,
  run_answered: CircleCheck,
};
const tone: Record<FixtureNotification["tone"], string> = {
  human: "text-human",
  agent: "text-agent",
  gate: "text-gate-foreground dark:text-gate",
  muted: "text-muted-foreground",
  destructive: "text-destructive",
};

function Glyph({ row }: { row: FixtureNotification }) {
  const Icon = row.tone === "destructive" ? CircleX : glyph[row.kind];
  return <Icon className={cn("size-4 shrink-0", tone[row.tone])} aria-hidden />;
}

function Sentence({
  row,
  withKey = true,
  nowrap = false,
}: {
  row: FixtureNotification;
  withKey?: boolean;
  nowrap?: boolean;
}) {
  return (
    <span
      className={cn(
        "flex min-w-0 items-baseline gap-x-1.5",
        nowrap ? "shrink-0 whitespace-nowrap" : "flex-wrap",
      )}
    >
      {row.actor ? <MemberChip member={row.actor} size="xs" /> : <span>deevy</span>}
      <span className={cn(!row.read && "font-medium")}>{row.verb}</span>
      {withKey ? (
        <>
          <span className="text-muted-foreground">on</span>
          <span className="font-mono text-xs">{row.issue.key}</span>
        </>
      ) : null}
    </span>
  );
}

function useSelection() {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(["n1", "n3"]));
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return { selected, toggle, clear: () => setSelected(new Set()) };
}

function SelectionBar({ count, onClear }: { count: number; onClear: () => void }) {
  if (count === 0) {
    return (
      <div className="flex h-9 items-center gap-2 border-b px-4 text-xs text-muted-foreground">
        <span>Select rows to act on several at once</span>
        <span className="flex-1" />
        <Button variant="outline" size="sm">
          Mark all read
        </Button>
      </div>
    );
  }
  return (
    <div className="flex h-9 items-center gap-2 border-b bg-accent/50 px-4 text-sm">
      <span className="font-medium">{count} selected</span>
      <Button size="sm">Mark read</Button>
      <Button variant="ghost" size="sm" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}

function Frame({ children, bar }: { children: React.ReactNode; bar: React.ReactNode }) {
  return (
    <div className="w-full max-w-xl overflow-hidden rounded-lg border bg-background">
      {bar}
      {children}
    </div>
  );
}

/** One line per row; the excerpt rides inline and is cut where the row ends. */
function OneLine() {
  const { selected, toggle, clear } = useSelection();
  return (
    <Frame bar={<SelectionBar count={selected.size} onClear={clear} />}>
      <ul className="flex flex-col divide-y">
        {notifications.map((row) => (
          <li
            key={row.id}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-sm",
              selected.has(row.id) && "bg-accent/40",
            )}
          >
            <Checkbox
              aria-label={`Select ${row.verb}`}
              checked={selected.has(row.id)}
              onCheckedChange={() => toggle(row.id)}
            />
            <span
              aria-hidden
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                row.read ? "bg-transparent" : "bg-gate",
              )}
            />
            <Glyph row={row} />
            <span className="flex min-w-0 flex-1 items-baseline gap-1.5 overflow-hidden whitespace-nowrap">
              <Sentence row={row} nowrap />
              {row.excerpt ? (
                <span className="truncate text-muted-foreground">— “{row.excerpt}”</span>
              ) : null}
            </span>
            <span className="font-mono text-xs text-muted-foreground">{row.ago}</span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

/** Two lines per row: who did what where, then what they wrote. */
function TwoLines() {
  const { selected, toggle, clear } = useSelection();
  return (
    <Frame bar={<SelectionBar count={selected.size} onClear={clear} />}>
      <ul className="flex flex-col divide-y">
        {notifications.map((row) => (
          <li
            key={row.id}
            className={cn(
              "flex items-start gap-2 px-3 py-2 text-sm",
              selected.has(row.id) && "bg-accent/40",
            )}
          >
            <Checkbox
              className="mt-0.5"
              aria-label={`Select ${row.verb}`}
              checked={selected.has(row.id)}
              onCheckedChange={() => toggle(row.id)}
            />
            <span className="mt-0.5">
              <Glyph row={row} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-baseline gap-2">
                <Sentence row={row} />
                <span className="ml-auto font-mono text-xs text-muted-foreground">{row.ago}</span>
              </span>
              <span className="truncate text-xs text-muted-foreground">{row.issue.title}</span>
              {row.excerpt ? (
                <span className="line-clamp-2 text-muted-foreground">“{row.excerpt}”</span>
              ) : null}
            </span>
            {row.read ? null : (
              <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gate" />
            )}
          </li>
        ))}
      </ul>
    </Frame>
  );
}

/** Grouped by Issue; the group header carries the Issue's State and Assignee, the rows drop the key. */
function Grouped() {
  const { selected, toggle, clear } = useSelection();
  const groups = new Map<string, FixtureNotification[]>();
  for (const row of notifications)
    groups.set(row.issue.key, [...(groups.get(row.issue.key) ?? []), row]);
  return (
    <Frame bar={<SelectionBar count={selected.size} onClear={clear} />}>
      <div className="flex flex-col divide-y">
        {[...groups.entries()].map(([key, rows]) => {
          const issue = rows[0]!.issue;
          return (
            <section key={key} className="flex flex-col py-1.5">
              <header className="flex items-center gap-2 px-3 py-1 text-sm">
                <Checkbox
                  aria-label={`Select all on ${key}`}
                  checked={rows.every((row) => selected.has(row.id))}
                  onCheckedChange={() => rows.forEach((row) => toggle(row.id))}
                />
                <span className="font-mono text-xs text-muted-foreground">{key}</span>
                <span className="min-w-0 truncate font-medium">{issue.title}</span>
                <span className="ml-auto flex items-center gap-2">
                  <StateBadge state={issue.state} size="sm" />
                  {issue.assignee ? <MemberChip member={issue.assignee} size="xs" /> : null}
                </span>
              </header>
              <ul className="flex flex-col">
                {rows.map((row) => (
                  <li
                    key={row.id}
                    className={cn(
                      "flex items-start gap-2 py-1.5 pr-3 pl-9 text-sm",
                      selected.has(row.id) && "bg-accent/40",
                    )}
                  >
                    <span className="mt-0.5">
                      <Glyph row={row} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-baseline gap-2">
                        <Sentence row={row} withKey={false} />
                        <span className="ml-auto font-mono text-xs text-muted-foreground">
                          {row.ago}
                        </span>
                      </span>
                      {row.excerpt ? (
                        <span className="line-clamp-2 text-muted-foreground">“{row.excerpt}”</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Frame>
  );
}

export function InboxMockups() {
  return (
    <>
      <Variant
        n={1}
        title="One line"
        note="Densest. The excerpt is inline and cut at the row's end; the Issue title is not shown, the key is. Two rows are pre-selected to show the selection bar."
      >
        <OneLine />
      </Variant>
      <Variant
        n={2}
        title="Two lines"
        note="Who did what where, then the Issue title, then what they wrote, up to two lines. The unread dot moves right."
      >
        <TwoLines />
      </Variant>
      <Variant
        n={3}
        title="Grouped by Issue"
        note="Today's grouping kept; the group header carries State and Assignee and a checkbox for the whole group; rows drop the key."
      >
        <Grouped />
      </Variant>
    </>
  );
}
