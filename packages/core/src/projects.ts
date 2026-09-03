import { project as projectTable, workflowState, type Db, type Project } from "@deevy/db";
import { defaultWorkflow } from "./workflow.ts";

/**
 * The prefix of every Issue key, as in `DEV-42`. Two to six uppercase letters
 * keeps keys readable and leaves the number room.
 */
export const ProjectKeyPattern = /^[A-Z]{2,6}$/;

export interface CreateProjectInput {
  workspaceId: string;
  key: string;
  name: string;
  description?: string | null;
  teamId?: string | null;
}

/**
 * Inserts the Project and its six default States. D1 has no interactive
 * transactions (ADR-0006) and its driver is the only one with `batch`, so the
 * States go in as one multi-row statement rather than six writes in a loop.
 */
export async function createProject(db: Db, input: CreateProjectInput): Promise<Project> {
  const id = crypto.randomUUID();
  const [row] = await db
    .insert(projectTable)
    .values({
      id,
      workspaceId: input.workspaceId,
      key: input.key,
      name: input.name,
      description: input.description ?? null,
      teamId: input.teamId ?? null,
    })
    .returning();
  if (!row) throw new Error("createProject: the insert returned no row");

  await db.insert(workflowState).values(
    defaultWorkflow().map((state) => ({
      id: crypto.randomUUID(),
      projectId: id,
      ...state,
    })),
  );
  return row;
}
