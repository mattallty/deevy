/**
 * The palette candidates of the round-3 review: what src/dev/palette-candidates.css
 * defines, plus each palette's Label swatches (hex, since a Label stores hex).
 * `current` is index.css as it stands.
 */
export interface Palette {
  id: string;
  label: string;
  note: string;
  /** Eight Label colours a Human may choose from, white text on each. */
  swatches: string[];
}

export const palettes: Palette[] = [
  {
    id: "current",
    label: "Current",
    note: "index.css as it stands: copper, teal, amber",
    swatches: [
      "#b3562c",
      "#1f7a6d",
      "#b7791f",
      "#4f46e5",
      "#2f855a",
      "#a63d2f",
      "#64748b",
      "#a855f7",
    ],
  },
  {
    id: "triad",
    label: "Triad — copper & teal",
    note: "today's hues, chroma pulled down to sit beside indigo; the classic three-way split",
    swatches: [
      "#b95c3a",
      "#008781",
      "#be8700",
      "#6265ed",
      "#249057",
      "#d73337",
      "#63718f",
      "#a059b1",
    ],
  },
  {
    id: "split",
    label: "Split complement — orange & green",
    note: "the two colours facing indigo on the wheel: warm orange for Humans, green for Agents",
    swatches: [
      "#cb6620",
      "#348f4f",
      "#c28f00",
      "#6265ed",
      "#00906f",
      "#d73246",
      "#63718f",
      "#c4576d",
    ],
  },
  {
    id: "analogous",
    label: "Analogous — rose & sky",
    note: "stays in indigo's family: rose for Humans, sky blue for Agents; amber alone is warm, so a Gate is the one thing that jumps",
    swatches: [
      "#c34e97",
      "#008fba",
      "#c88b00",
      "#6265ed",
      "#179765",
      "#d73246",
      "#63718f",
      "#8f5fc0",
    ],
  },
  {
    id: "jewel",
    label: "Jewel — plum & jade",
    note: "deeper and quieter: plum for Humans, jade for Agents, gold for Gates; indigo stays the brightest thing",
    swatches: [
      "#8e4088",
      "#007560",
      "#b37903",
      "#5a5edd",
      "#3b834e",
      "#c53637",
      "#5b6986",
      "#a14d2f",
    ],
  },
  {
    id: "cool",
    label: "Cool — steel & violet",
    note: "all cool but the Gate: steel blue for Humans, violet for Agents, both a step from indigo; the calmest screen",
    swatches: [
      "#4675a4",
      "#926abe",
      "#c28f00",
      "#6265ed",
      "#19966e",
      "#d73240",
      "#63718f",
      "#b9579c",
    ],
  },
  {
    id: "earth",
    label: "Earth — terracotta & olive",
    note: "the warm counterpart to a cool primary: terracotta for Humans, olive for Agents, warm grays for the backlog",
    swatches: [
      "#c35141",
      "#728426",
      "#ca8a00",
      "#6265ed",
      "#3b9555",
      "#cc3336",
      "#7e6f57",
      "#008388",
    ],
  },
];

export const DEFAULT_PALETTE = "current";

export function isPalette(value: unknown): value is string {
  return palettes.some((palette) => palette.id === value);
}

/** The swatches of the palette on <html data-palette>, or the current one's. */
export function currentSwatches(): string[] {
  const id = typeof document === "undefined" ? undefined : document.documentElement.dataset.palette;
  return (palettes.find((palette) => palette.id === id) ?? palettes[0]!).swatches;
}
