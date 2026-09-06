/**
 * The colours a Label may take: eight, in harmony with the palette, white text
 * on each (docs/plans/ui-redesign-2.md, "Palette"). Derived from the sky & rose
 * palette Matt picked: the Human sky, the Agent rose, the Gate amber, the indigo
 * primary, done green, destructive red, a slate, a violet. Not a picker: a Label
 * reads beside Humans, Agents and Gates, and must not pass for one of them.
 */
export const LABEL_COLORS: readonly string[] = [
  "#008fba",
  "#c34e97",
  "#c88b00",
  "#6265ed",
  "#239d6a",
  "#d73246",
  "#63718f",
  "#8f5fc0",
];

export function labelColors(): readonly string[] {
  return LABEL_COLORS;
}
