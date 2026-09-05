import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ActivityMockups } from "./mockups/activity";
import { InboxMockups } from "./mockups/inbox";
import { KanbanMockups } from "./mockups/kanban";
import { WorkflowMockups } from "./mockups/workflow";

const screens = [
  { id: "inbox", label: "Inbox rows", View: InboxMockups },
  { id: "activity", label: "Activity timeline", View: ActivityMockups },
  { id: "kanban", label: "Kanban", View: KanbanMockups },
  { id: "workflow", label: "Workflow editor", View: WorkflowMockups },
] as const;

/** A numbered proposal on a mockup page; its name is what Matt answers with. */
export function Variant({
  n,
  title,
  note,
  children,
}: {
  n: number;
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={`Variant ${n}: ${title}`} className="flex flex-col gap-3">
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">
          <span className="mr-2 font-mono text-muted-foreground">{n}.</span>
          {title}
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">{note}</p>
      </header>
      {children}
    </section>
  );
}

/**
 * The round-2 mockups (docs/plans/ui-redesign-2.md, checkpoint 2): for each of
 * four screens, two or three variants rendered with the real components from
 * fixture data (src/dev/fixtures.ts). Development only, unlinked, deleted with
 * the fixtures once Matt has chosen.
 */
export function MockupsPage({ screen }: { screen: string }) {
  const current = screens.find((candidate) => candidate.id === screen) ?? screens[0];
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Mockups</h1>
        <nav aria-label="Mockup screens" className="flex flex-wrap gap-1">
          {screens.map((candidate) => (
            <Link
              key={candidate.id}
              to="/dev/mockups/$screen"
              params={{ screen: candidate.id }}
              aria-current={candidate.id === current.id ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm hover:bg-accent",
                candidate.id === current.id ? "bg-accent font-medium" : "text-muted-foreground",
              )}
            >
              {candidate.label}
            </Link>
          ))}
        </nav>
      </header>
      <current.View key={current.id} />
    </div>
  );
}
