import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vite-plus/test";
import { toolManifest } from "../src/mcp/manifest.ts";
import { projectTools } from "../src/mcp/tools.ts";
import { router } from "../src/operations/index.ts";

describe("projecting operations to MCP tools", () => {
  it("takes only the operations that opt in, and names them so a client accepts them", () => {
    const tools = projectTools(router);

    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) expect(tool.name).toMatch(/^[a-z]+(_[a-z]+)+$/);
    expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
    expect(tools.map((t) => t.name)).toContain("issues_get");
  });

  it("leaves out anything a Human must do in deevy's own UI", () => {
    const names = projectTools(router).map((t) => t.name);

    expect(names).not.toContain("gates_approve");
    expect(names).not.toContain("gates_reject");
    expect(names).not.toContain("agents_create");
  });
});

describe("the committed tool manifest", () => {
  it("matches what the router projects, so CI catches a surface change", async () => {
    const snapshot = JSON.parse(
      await readFile(new URL("../mcp-tools.json", import.meta.url), "utf8"),
    ) as unknown;

    expect(await toolManifest()).toEqual(snapshot);
  });

  it("carries the v1 tool set PLAN.md names", async () => {
    const names = (await toolManifest()).map((tool) => tool.name);

    expect(names).toEqual([
      "comments_create",
      "documents_get",
      "documents_write",
      "inbox_list",
      "issues_create",
      "issues_get",
      "issues_list",
      "issues_set_labels",
      "issues_update",
      "labels_list",
      "links_add",
      "runs_finish",
      "runs_post_activity",
      "runs_start",
    ]);
  });
});
