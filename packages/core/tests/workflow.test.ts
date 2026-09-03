import { describe, expect, it } from "vite-plus/test";
import { defaultWorkflow } from "../src/workflow.ts";

describe("defaultWorkflow", () => {
  it("is the template from PLAN.md: Intent to Done, Gates on all but Build and Done", () => {
    expect(defaultWorkflow()).toEqual([
      { name: "Intent", position: 0, isGate: true, category: "backlog" },
      { name: "Spec", position: 1, isGate: true, category: "active" },
      { name: "Plan", position: 2, isGate: true, category: "active" },
      { name: "Build", position: 3, isGate: false, category: "active" },
      { name: "Review", position: 4, isGate: true, category: "active" },
      { name: "Done", position: 5, isGate: false, category: "done" },
    ]);
  });

  it("hands back a fresh array, so a caller cannot corrupt the template", () => {
    const first = defaultWorkflow();
    first[0]!.name = "Mangled";
    expect(defaultWorkflow()[0]?.name).toBe("Intent");
  });
});
