import { useState } from "react";
import { useShortcut } from "@/lib/shortcuts";

/**
 * The keyboard on a list or a board: `j`/`k` and the arrows move the selection
 * through the rows as they are on screen, Enter opens the selected one beside
 * the list, `o` opens its page, Escape clears it (docs/plans/ui-redesign.md
 * slice 2; the sheet's "In a list, or on a board"). The Issues home and the
 * Project Board call it with their visible keys and pass what it returns to
 * the table or the board, which draw `aria-selected` and set the selection on
 * hover. The bindings are the page's (lib/shortcuts.ts), so an open Sheet or
 * Dialog takes them over.
 */
export function useRowSelection(
  visibleKeys: string[],
  { peek, openFull }: { peek: (key: string) => void; openFull: (key: string) => void },
) {
  const [selected, setSelected] = useState<string | null>(null);
  const move = (delta: number) => {
    if (visibleKeys.length === 0) return;
    const index = selected ? visibleKeys.indexOf(selected) : -1;
    const next = Math.min(visibleKeys.length - 1, Math.max(0, index + delta));
    setSelected(visibleKeys[next] ?? null);
  };

  useShortcut("j", () => move(1));
  useShortcut("k", () => move(-1));
  useShortcut("arrowdown", () => move(1));
  useShortcut("arrowup", () => move(-1));
  useShortcut("enter", () => selected && peek(selected));
  useShortcut("o", () => selected && openFull(selected));
  useShortcut("escape", () => setSelected(null));

  return { selected, select: setSelected };
}
