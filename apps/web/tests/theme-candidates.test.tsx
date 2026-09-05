import { describe, expect, it } from "vite-plus/test";
import css from "../src/dev/theme-candidates.css?raw";
import { themeCandidates } from "../src/dev/theme-candidates.ts";

/**
 * A theme candidate is the whole palette or it is not a candidate: the six
 * semantic slots the UI's one idea rests on must be defined, light and dark,
 * beside the shadcn ones, and the type, radius and density it proposes.
 */
const semantic = [
  "--human",
  "--human-foreground",
  "--agent",
  "--agent-foreground",
  "--gate",
  "--gate-foreground",
  "--state-backlog",
  "--state-active",
  "--state-done",
];
const surfaces = [
  "--background",
  "--foreground",
  "--primary",
  "--border",
  "--sidebar",
  "--muted-foreground",
];

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) return "";
  return css.slice(start, css.indexOf("}", start));
}

describe("theme candidates", () => {
  const candidates = themeCandidates.filter((candidate) => candidate.id !== "plex-warm");

  it("has a light and a dark block per candidate", () => {
    for (const { id } of candidates) {
      expect(block(`[data-theme-candidate="${id}"]`), id).not.toBe("");
      expect(block(`[data-theme-candidate="${id}"].dark`), id).not.toBe("");
    }
  });

  it("defines every semantic and surface slot in both", () => {
    for (const { id } of candidates) {
      for (const selector of [
        `[data-theme-candidate="${id}"]`,
        `[data-theme-candidate="${id}"].dark`,
      ]) {
        const text = block(selector);
        for (const slot of [...semantic, ...surfaces]) {
          expect(text, `${selector} ${slot}`).toContain(`${slot}:`);
        }
      }
    }
  });

  it("proposes type, radius, density and tracking", () => {
    for (const { id } of candidates) {
      const text = block(`[data-theme-candidate="${id}"]`);
      for (const slot of ["--face-sans", "--face-mono", "--radius", "--density", "--tracking"]) {
        expect(text, `${id} ${slot}`).toContain(`${slot}:`);
      }
    }
  });
});
