/**
 * The palette candidates of the round-3 review: what src/dev/palette-candidates.css
 * defines, plus each palette's Label swatches (hex, since a Label stores hex).
 * All six are analogous to the indigo primary; `current` is index.css as it stands.
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
    id: "rose-sky",
    label: "Rose & sky",
    note: "Humans rose, Agents sky blue, either side of indigo; amber alone is warm, so a Gate is the one thing that jumps",
    swatches: [
      "#c34e97",
      "#008fba",
      "#c88b00",
      "#6265ed",
      "#239d6a",
      "#d73246",
      "#63718f",
      "#8f5fc0",
    ],
  },
  {
    id: "magenta-cyan",
    label: "Magenta & cyan",
    note: "the same idea spread wider: magenta Humans, cyan Agents, both further from indigo and from each other",
    swatches: [
      "#bb4cb5",
      "#009bab",
      "#c28f00",
      "#6265ed",
      "#029e72",
      "#d73246",
      "#63718f",
      "#816dd2",
    ],
  },
  {
    id: "violet-azure",
    label: "Violet & azure",
    note: "tighter around indigo: violet Humans, azure Agents; the most monochrome of the six, shape does more of the telling",
    swatches: [
      "#975ac0",
      "#1a89c5",
      "#c88b00",
      "#6265ed",
      "#109d7b",
      "#d73246",
      "#63718f",
      "#c05296",
    ],
  },
  {
    id: "rose-periwinkle",
    label: "Rose & periwinkle",
    note: "rose Humans against a periwinkle that is indigo's own lighter cousin; Agents read as part of the system",
    swatches: [
      "#c65b93",
      "#7190d6",
      "#c88b00",
      "#6265ed",
      "#239d6a",
      "#d73246",
      "#63718f",
      "#008aaf",
    ],
  },
  {
    id: "sky-rose",
    label: "Sky & rose (swapped)",
    note: "the first palette with the roles swapped: Humans sky blue, Agents rose — cooler Humans, warmer machines",
    swatches: [
      "#008fba",
      "#c34e97",
      "#c88b00",
      "#6265ed",
      "#239d6a",
      "#d73246",
      "#63718f",
      "#8f5fc0",
    ],
  },
  {
    id: "dusk",
    label: "Dusk — muted rose & steel",
    note: "rose and steel with the chroma halved and gold for Gates: the quietest, for screens read all day",
    swatches: [
      "#985383",
      "#407599",
      "#b48226",
      "#6265ed",
      "#3c8c66",
      "#d73246",
      "#63718f",
      "#7b63a3",
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
