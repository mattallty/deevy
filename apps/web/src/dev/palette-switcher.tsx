import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { orpc } from "@/lib/orpc";
import { DEFAULT_PALETTE, isPalette, palettes } from "./palettes";

const STORAGE_KEY = "deevy.palette";

function readPalette(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isPalette(stored) ? stored : DEFAULT_PALETTE;
  } catch {
    return DEFAULT_PALETTE;
  }
}

export function applyPalette(id: string) {
  const root = document.documentElement;
  if (id === DEFAULT_PALETTE) delete root.dataset.palette;
  else root.dataset.palette = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // A browser that blocks storage still gets the palette for this page.
  }
}

/**
 * The round-3 palette review: a floating select that applies one candidate's
 * Human, Agent, Gate, State and destructive colours — and its Label swatches —
 * to the real app while browsing. Development only, and only where GitHub is
 * the stub, so it never reaches a Human at work.
 */
export function PaletteSwitcher() {
  const health = useQuery(orpc.health.ping.queryOptions());
  const shown = import.meta.env.DEV && health.data?.devSignIn === true;
  const [current, setCurrent] = useState(readPalette);
  useEffect(() => {
    if (shown) applyPalette(current);
  }, [shown, current]);
  if (!shown) return null;
  const chosen = palettes.find((palette) => palette.id === current);
  return (
    <div className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-md border bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-md">
      <span className="text-muted-foreground">Palette</span>
      <Select value={current} onValueChange={(next) => next !== null && setCurrent(next)}>
        <SelectTrigger aria-label="Palette candidate" className="h-7 w-64 text-xs">
          <SelectValue>
            {(selected: string) => palettes.find((p) => p.id === selected)?.label}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {palettes.map((palette) => (
              <SelectItem key={palette.id} value={palette.id}>
                {palette.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {chosen ? (
        <span className="flex items-center gap-1" aria-hidden>
          {chosen.swatches.map((hex) => (
            <span key={hex} className="size-3 rounded-sm" style={{ background: hex }} />
          ))}
        </span>
      ) : null}
    </div>
  );
}
