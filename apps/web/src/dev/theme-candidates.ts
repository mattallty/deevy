/**
 * The theme candidates of the round-2 review (docs/plans/ui-redesign-2.md, slice A):
 * what src/dev/theme-candidates.css defines, described for the switcher and the
 * tokens page. Round one chose the clean-slate direction; these are its
 * variations. `plex-warm` is index.css as it stands, kept for reference.
 */
export const themeCandidates = [
  {
    id: "plex-warm",
    label: "Today (Plex warm)",
    font: "IBM Plex Sans",
    mono: "IBM Plex Mono",
    radiusPx: 6,
    note: "for reference: warm neutrals, ink-blue action",
  },
  {
    id: "slate-indigo-roomy",
    label: "Indigo · roomy",
    font: "Inter",
    mono: "JetBrains Mono",
    radiusPx: 8,
    note: "clean slate as published: indigo action, blue-gray neutrals; 8px corners, 5% roomier scale",
  },
  {
    id: "slate-indigo-compact",
    label: "Indigo · compact",
    font: "Inter",
    mono: "JetBrains Mono",
    radiusPx: 6,
    note: "clean slate as published: indigo action, blue-gray neutrals; 6px corners, 5% denser scale",
  },
  {
    id: "slate-cobalt-roomy",
    label: "Cobalt · roomy",
    font: "Inter",
    mono: "JetBrains Mono",
    radiusPx: 8,
    note: "a clearer blue action, same neutrals; 8px corners, 5% roomier scale",
  },
  {
    id: "slate-cobalt-compact",
    label: "Cobalt · compact",
    font: "Inter",
    mono: "JetBrains Mono",
    radiusPx: 6,
    note: "a clearer blue action, same neutrals; 6px corners, 5% denser scale",
  },
  {
    id: "slate-quiet-roomy",
    label: "Quiet · roomy",
    font: "Inter",
    mono: "JetBrains Mono",
    radiusPx: 8,
    note: "ink-blue action, grayer neutrals, the least colour; 8px corners, 5% roomier scale",
  },
  {
    id: "slate-quiet-compact",
    label: "Quiet · compact",
    font: "Inter",
    mono: "JetBrains Mono",
    radiusPx: 6,
    note: "ink-blue action, grayer neutrals, the least colour; 6px corners, 5% denser scale",
  },
] as const;

export type ThemeCandidateId = (typeof themeCandidates)[number]["id"];

export const DEFAULT_CANDIDATE: ThemeCandidateId = "plex-warm";

export function isThemeCandidate(value: unknown): value is ThemeCandidateId {
  return themeCandidates.some((candidate) => candidate.id === value);
}
