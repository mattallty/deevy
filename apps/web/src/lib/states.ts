/**
 * States seen across Projects (docs/plans/ui-redesign-2.md slice F). A Workspace-wide
 * list or board groups Issues by State *name*: every Project's "Build" is one
 * column, and a drop into it moves an Issue to the Build of its own Project —
 * `byProject` says which State id that is, or that the Project has none.
 */
export const categoryOrder = { backlog: 0, active: 1, done: 2 } as const;
export type StateCategory = keyof typeof categoryOrder;

export interface FoldedState {
  name: string;
  isGate: boolean;
  category: StateCategory;
  /** Project id → that Project's State of this name. */
  byProject: Map<string, string>;
}

interface ProjectLike {
  id: string;
  key: string;
  states?: Array<{ id: string; name: string; isGate: boolean; category: string }> | null;
}

/**
 * Every State name across the given Projects (or the one named), in Workflow
 * order within each category, backlog before active before done. The first
 * Project seen decides a name's Gate flag and category, as the list's group
 * header always has.
 */
export function foldStates(projects: ProjectLike[], projectKey?: string): FoldedState[] {
  const seen = new Map<string, FoldedState>();
  for (const project of projects) {
    if (projectKey && project.key !== projectKey) continue;
    for (const state of project.states ?? []) {
      const folded = seen.get(state.name);
      if (folded) {
        folded.byProject.set(project.id, state.id);
      } else {
        seen.set(state.name, {
          name: state.name,
          isGate: state.isGate,
          category: (state.category in categoryOrder ? state.category : "active") as StateCategory,
          byProject: new Map([[project.id, state.id]]),
        });
      }
    }
  }
  return [...seen.values()].sort((a, b) => categoryOrder[a.category] - categoryOrder[b.category]);
}
