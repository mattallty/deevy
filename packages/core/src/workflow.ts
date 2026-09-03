import type { WorkflowState } from "@deevy/db";

/** A State as the default template describes it, before it belongs to a Project. */
export type WorkflowStateTemplate = Pick<
  WorkflowState,
  "name" | "position" | "isGate" | "category"
>;

/**
 * The default Workflow every new Project starts with (docs/PLAN.md): Intent,
 * Spec, Plan, Build, Review, Done, with Gates on leaving Intent, Spec, Plan and
 * Review. A team that wants Todo, Doing, Done deletes the middle.
 *
 * `category` is what tells a board and a list which Issues are open: an Issue
 * is active from the moment someone writes its Spec, since reaching Spec means
 * the Intent Gate accepted the work.
 */
export function defaultWorkflow(): WorkflowStateTemplate[] {
  return [
    { name: "Intent", position: 0, isGate: true, category: "backlog" },
    { name: "Spec", position: 1, isGate: true, category: "active" },
    { name: "Plan", position: 2, isGate: true, category: "active" },
    { name: "Build", position: 3, isGate: false, category: "active" },
    { name: "Review", position: 4, isGate: true, category: "active" },
    { name: "Done", position: 5, isGate: false, category: "done" },
  ];
}
