import { describe, expect, it } from "vite-plus/test";
import { crumbsFor } from "../src/components/app-breadcrumb.tsx";

const name = {
  project: (key: string) => ({ DEV: "deevy", OPS: "Operations" })[key],
  member: (id: string) => ({ "m-1": "Planner" })[id],
};

describe("crumbsFor", () => {
  it("titles the Issues home by its filters", () => {
    expect(crumbsFor("/", {}, name).map((c) => c.label)).toEqual(["All Issues"]);
    expect(crumbsFor("/", { assignee: "me" }, name).map((c) => c.label)).toEqual(["My Issues"]);
    expect(crumbsFor("/", { view: "board" }, name).map((c) => c.label)).toEqual([
      "All Issues",
      "Board",
    ]);
  });

  it("walks Projects, the Project and its tab", () => {
    expect(crumbsFor("/projects/OPS/workflow", {}, name).map((c) => c.label)).toEqual([
      "Projects",
      "Operations",
      "Workflow",
    ]);
    expect(crumbsFor("/projects/NEW", {}, name).map((c) => c.label)).toEqual(["Projects", "NEW"]);
  });

  it("places an Issue under its Project", () => {
    const crumbs = crumbsFor("/issues/DEV-12", {}, name);
    expect(crumbs.map((c) => c.label)).toEqual(["Projects", "deevy", "DEV-12"]);
    expect(crumbs[1]).toMatchObject({ to: "/projects/$key", params: { key: "DEV" } });
  });

  it("walks Settings to the page, and below it", () => {
    expect(crumbsFor("/settings/members", {}, name).map((c) => c.label)).toEqual([
      "Settings",
      "Members",
    ]);
    // A detail page is named after the thing, never its id.
    expect(crumbsFor("/settings/agents/m-1", {}, name).map((c) => c.label)).toEqual([
      "Settings",
      "Agents",
      "Planner",
    ]);
    expect(crumbsFor("/settings/agents/unknown", {}, name).map((c) => c.label)).toEqual([
      "Settings",
      "Agents",
      "Unknown",
    ]);
    expect(crumbsFor("/inbox", {}, name).map((c) => c.label)).toEqual(["Inbox"]);
  });
});
