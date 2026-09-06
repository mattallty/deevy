import { MemberChip } from "@/components/member-chip";
import { RunStatus, runStatusLabels, type RunStatusValue } from "@/components/run-status";
import { Shortcut } from "@/components/kbd-hint";
import { StateBadge } from "@/components/state-badge";
import { Button } from "@/components/ui/button";
import { palettes } from "@/dev/palettes";
import { cn } from "@/lib/utils";

const slots = [
  ["background", "paper"],
  ["foreground", "ink"],
  ["primary", "the one action colour"],
  ["human", "a Human Member"],
  ["agent", "an Agent"],
  ["gate", "a Gate, and anything owed a ruling"],
  ["state-backlog", "a State before the work"],
  ["state-active", "a State in the work"],
  ["state-done", "a State after it"],
  ["destructive", "reject, revoke, delete"],
  ["muted", "quiet surfaces"],
  ["border", "rules"],
] as const;

const ada = { id: "a", kind: "human" as const, handle: "ada", user: { name: "Ada Lovelace" } };
const planner = { id: "p", kind: "agent" as const, handle: "planner", user: { name: "Planner" } };

function Sheet({ theme, palette }: { theme: "light" | "dark"; palette: string }) {
  const swatches = palettes.find((candidate) => candidate.id === palette)?.swatches ?? [];
  return (
    <section
      {...(palette === "current" ? {} : { "data-palette": palette })}
      className={cn(theme, "flex flex-col gap-6 bg-background p-6 text-foreground")}
      aria-label={`${theme} theme`}
    >
      <h2 className="text-base font-semibold">{theme === "dark" ? "Dark" : "Light"}</h2>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {slots.map(([slot, meaning]) => (
          <li key={slot} className="flex items-center gap-3">
            <span
              aria-hidden
              className="size-8 shrink-0 rounded-md border"
              style={{ background: `var(--${slot})` }}
            />
            <span className="flex flex-col leading-tight">
              <span className="font-mono text-xs">--{slot}</span>
              <span className="text-xs text-muted-foreground">{meaning}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-1">
        <p className="text-[28px] font-semibold tracking-tight">Ship the Event log view</p>
        <p className="text-xl font-semibold tracking-tight">Twenty for a page title</p>
        <p className="text-base">Sixteen for prose a person reads for a while.</p>
        <p className="text-sm">Fourteen is the interface: labels, rows, buttons.</p>
        <p className="text-[13px]">Thirteen in dense lists.</p>
        <p className="text-xs text-muted-foreground">Twelve for what is said once and small.</p>
        <p className="font-mono text-sm">
          DEV-42 · @planner · run.awaiting_input · 0123456789 tabular
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <MemberChip member={ada} />
        <MemberChip member={planner} showHandle sponsorName="Ada Lovelace" />
        <MemberChip member={{ ...ada, suspendedAt: new Date() }} />
        <MemberChip member={planner} size="lg" />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <StateBadge state={{ name: "Intent", isGate: true, category: "backlog" }} />
        <StateBadge state={{ name: "Build", isGate: false, category: "active" }} />
        <StateBadge state={{ name: "Done", isGate: false, category: "done" }} />
        <StateBadge state={{ name: "Todo", isGate: false, category: "backlog" }} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(runStatusLabels) as RunStatusValue[]).map((status) => (
          <RunStatus key={status} status={status} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2" aria-label="Label swatches">
        {swatches.map((hex, index) => (
          <span
            key={hex}
            className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
            style={{ background: hex }}
          >
            label {index + 1}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button>Approve</Button>
        <Button variant="outline">Reject</Button>
        <Button variant="ghost">Cancel</Button>
        <Button variant="destructive">Revoke</Button>
        <Shortcut keys="mod+k" />
        <Shortcut keys="g i" />
        <Shortcut keys="shift+a" />
      </div>
    </section>
  );
}

/**
 * The tokens, drawn side by side in both themes — once per palette candidate
 * during the round-3 review, so the colours beside the primary can be judged
 * together with the Label swatches each palette proposes.
 */
export function TokensPage() {
  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Tokens</h1>
        <p className="text-sm text-muted-foreground">
          The palette and the type scale, as the browser draws them, per palette candidate. Human,
          Agent and Gate are the only saturated colours on a screen besides the primary.
        </p>
      </header>
      {palettes.map((palette) => (
        <section key={palette.id} aria-label={palette.label} className="flex flex-col gap-3">
          <h2 className="flex flex-wrap items-baseline gap-x-3 text-base font-semibold">
            {palette.label}
            <span className="text-sm font-normal text-muted-foreground">{palette.note}</span>
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="overflow-hidden rounded-lg border">
              <Sheet theme="light" palette={palette.id} />
            </div>
            <div className="overflow-hidden rounded-lg border">
              <Sheet theme="dark" palette={palette.id} />
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
