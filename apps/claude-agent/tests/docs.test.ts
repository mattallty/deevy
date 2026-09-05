import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vite-plus/test";

const operations = new URL("../../../docs/OPERATIONS.md", import.meta.url);
const config = new URL("../src/config.ts", import.meta.url);

/** The runtime's own table, so deevy's rows in the same file are not read as its. */
async function section(): Promise<string> {
  const doc = await readFile(operations, "utf8");
  const start = doc.indexOf("### Its configuration");
  expect(start).toBeGreaterThan(-1);
  const end = doc.indexOf("###", start + 1);
  return doc.slice(start, end);
}

/**
 * The configuration table, kept honest mechanically.
 *
 * A knob that exists and is not written down is the failure this catches, and
 * it is the one that happens: adding a variable is a line of code, and
 * documenting it is a different file (docs/plans/m4.md, convention 22).
 */
describe("the documented configuration", () => {
  it("names every variable the runtime reads, and reads every one it names", async () => {
    const source = await readFile(config, "utf8");
    // Every name in the file, however it is read: some arrive as `env.NAME` and
    // the two the runtime cannot start without are named as strings.
    const read = [...source.matchAll(/\bDEEVY_[A-Z_]+\b/g)].map((match) => match[0]);
    const documented = [...(await section()).matchAll(/\|\s*`(DEEVY_[A-Z_]+)`/g)].map((m) => m[1]);

    expect([...new Set(read)].sort()).toEqual([...new Set(documented)].sort());
  });

  it("says what the Agent SDK reads too, which the runtime never touches", async () => {
    // It is not in `readConfig` and a runtime without it fails every session,
    // so the check above would never have found it missing.
    expect(await section()).toContain("`ANTHROPIC_API_KEY`");
  });
});
