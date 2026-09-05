import { cn } from "@/lib/utils";

export interface BadgeState {
  name: string;
  isGate: boolean;
  category: "backlog" | "active" | "done";
}

const dots = {
  backlog: "bg-state-backlog",
  active: "bg-state-active",
  done: "bg-state-done",
} as const;

/**
 * A State, as a dot coloured by its category; a Gate, as an amber diamond and
 * the word — visible, because a Gate is the one State a Human is owed, and
 * because the Board's tests look for it (CONTEXT.md, .claude/skills/deevy-ui).
 */
export function StateBadge({
  state,
  size = "sm",
  className,
}: {
  state: BadgeState;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      data-slot="state-badge"
      data-gate={state.isGate ? "true" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap",
        size === "sm" ? "text-sm" : "text-base",
        className,
      )}
    >
      {state.isGate ? (
        <span
          aria-hidden
          className="inline-block size-2 rotate-45 rounded-[1px] border-[1.5px] border-gate bg-gate/20"
        />
      ) : (
        <span
          aria-hidden
          className={cn("inline-block size-2 rounded-full", dots[state.category])}
        />
      )}
      <span>{state.name}</span>
      {state.isGate ? <span className="text-xs font-medium text-gate">Gate</span> : null}
    </span>
  );
}
