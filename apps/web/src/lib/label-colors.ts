import { currentSwatches } from "@/dev/palettes";

/**
 * The colours a Label may take: eight, in harmony with the palette, white text
 * on each (docs/plans/ui-redesign-2.md, "Palette"). During the round-3 review
 * they follow the palette candidate on <html>; the pick bakes them here.
 */
export function labelColors(): string[] {
  return currentSwatches();
}
