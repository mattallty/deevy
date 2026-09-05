/**
 * The theme candidates of the round-2 review (docs/plans/ui-redesign-2.md, slice A):
 * what src/dev/theme-candidates.css defines, described for the switcher and the
 * tokens page. `plex-warm` is index.css as it stands, the control.
 */
export const themeCandidates = [
  {
    id: "plex-warm",
    label: "Plex warm",
    font: "IBM Plex Sans",
    mono: "IBM Plex Mono",
    radiusPx: 6,
    note: "today: warm neutrals, ink-blue action",
  },
  {
    id: "graphite",
    label: "Graphite",
    font: "Geist",
    mono: "Geist Mono",
    radiusPx: 6,
    note: "cool neutral grays, higher contrast",
  },
  {
    id: "vercel",
    label: "Vercel",
    font: "Geist",
    mono: "Geist Mono",
    radiusPx: 4,
    note: "near-black action on white, dense, tight tracking",
  },
  {
    id: "clean-slate",
    label: "Clean slate",
    font: "Inter",
    mono: "JetBrains Mono",
    radiusPx: 8,
    note: "cool blue-gray, indigo action, roomier",
  },
  {
    id: "caffeine",
    label: "Caffeine",
    font: "DM Sans",
    mono: "JetBrains Mono",
    radiusPx: 6,
    note: "warm cream and brown",
  },
  {
    id: "modern-minimal",
    label: "Modern minimal",
    font: "Inter",
    mono: "JetBrains Mono",
    radiusPx: 10,
    note: "white, blue action, the friendliest pole",
  },
] as const;

export type ThemeCandidateId = (typeof themeCandidates)[number]["id"];

export const DEFAULT_CANDIDATE: ThemeCandidateId = "plex-warm";

export function isThemeCandidate(value: unknown): value is ThemeCandidateId {
  return themeCandidates.some((candidate) => candidate.id === value);
}
