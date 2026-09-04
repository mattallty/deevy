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
      "labels_create",
      "labels_list",
      "links_add",
      "links_list",
      // Removing one is bounded by the rule that an Agent may only take back
      // what its own Run attached (docs/plans/m3.md, slice 1).
      "links_remove",
      "runs_finish",
      // Without it an Agent cannot read its own Activity feed, so a Human's
      // answer to a free-form elicitation never reaches the loop that asked.
      "runs_get",
      // Not in PLAN.md's list, and needed: an Agent whose Run a trigger opened
      // has no other way to find it, and its inbox is always empty because
      // Notifications are derived for Humans. Without this the polling
      // fallback ADR-0003 promises does not work (docs/plans/m2.md, slice 9).
      "runs_list",
      "runs_post_activity",
      "runs_request_approval",
      "runs_start",
    ]);
  });

  it("widens Labels and Links no further than that", async () => {
    const names = (await toolManifest()).map((tool) => tool.name);

    // A Label is Workspace-scoped, so a granted Agent renaming or deleting one
    // reaches Projects it was never granted (docs/plans/m2.md), and a Gate is a
    // Human's to rule on. Creating a Label is additive, so it ships.
    expect(names).not.toContain("labels_update");
    expect(names).not.toContain("labels_delete");
    expect(names).not.toContain("gates_approve");
  });
});
