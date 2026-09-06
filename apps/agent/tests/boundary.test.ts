import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vite-plus/test";

interface Manifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

async function manifest(): Promise<Manifest> {
  return JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as Manifest;
}

/**
 * The rule that makes this package a test of deevy's surfaces rather than a
 * second view of its objects (docs/plans/m4.md). It is in the workspace so
 * `vp check` and `vp run -r test` cover it, and it talks to deevy the way a
 * stranger would: over HTTP and MCP, with an API key and nothing else.
 */
describe("the boundary", () => {
  it("takes nothing from the workspace at runtime, and since ADR-0018 nothing at all", async () => {
    const { dependencies = {} } = await manifest();

    // The harness is a CLI the image installs and the runtime finds on PATH;
    // the runtime itself is `node:` and nothing else.
    expect(dependencies).toEqual({});
  });

  it("lets its tests reach in, because standing a real deevy up is what they are for", async () => {
    const { devDependencies = {} } = await manifest();

    expect(Object.keys(devDependencies)).toContain("@deevy/core");
  });

  it("imports nothing from deevy outside its tests", async () => {
    const sources = [
      "config.ts",
      "deevy.ts",
      "harness/claude-code.ts",
      "harness/contract.ts",
      "harness/run.ts",
      "proxy.ts",
      "session.ts",
      "tools.ts",
      "work.ts",
      "index.ts",
    ];

    for (const name of sources) {
      const source = await readFile(new URL(`../src/${name}`, import.meta.url), "utf8");
      expect({ name, deevy: source.includes('from "@deevy/') }).toEqual({ name, deevy: false });
    }
  });
});
