import { issue as issueTable, project as projectTable, type Db, type Issue } from "@deevy/db";
import { eq, sql } from "drizzle-orm";

/** `DEV-42`: the Project's key and the Issue's number, derived and never stored twice. */
export function issueKey(projectKey: string, number: number): string {
  return `${projectKey}-${number}`;
}

const KEY_PATTERN = /^([A-Za-z]{2,6})-(\d+)$/;

/** Splits `DEV-42` into its Project key and number, or null when it is not a key at all. */
export function parseIssueKey(key: string): { projectKey: string; number: number } | null {
  const match = KEY_PATTERN.exec(key.trim());
  if (!match) return null;
  return { projectKey: match[1]!.toUpperCase(), number: Number(match[2]) };
}

/**
 * Hands out the next Issue number for a Project. One statement, so it is safe
 * on D1 and under concurrency without a transaction (docs/plans/m1.md); a read
 * followed by a write would hand the same number to two callers.
 */
export async function nextIssueNumber(db: Db, projectId: string): Promise<number> {
  const [row] = await db
    .update(projectTable)
    .set({ nextIssueNumber: sql`${projectTable.nextIssueNumber} + 1` })
    .where(eq(projectTable.id, projectId))
    .returning({ number: projectTable.nextIssueNumber });
  if (!row) throw new Error("nextIssueNumber: no such Project");
  return row.number - 1;
}

export interface CreateIssueInput {
  projectId: string;
  number: number;
  title: string;
  description?: string | null;
  stateId: string;
  assigneeMemberId?: string | null;
  parentId?: string | null;
  createdBy: string;
}

export async function insertIssue(db: Db, input: CreateIssueInput): Promise<Issue> {
  const [row] = await db
    .insert(issueTable)
    .values({
      id: crypto.randomUUID(),
      projectId: input.projectId,
      number: input.number,
      title: input.title,
      description: input.description ?? null,
      stateId: input.stateId,
      assigneeMemberId: input.assigneeMemberId ?? null,
      parentId: input.parentId ?? null,
      createdBy: input.createdBy,
    })
    .returning();
  if (!row) throw new Error("insertIssue: the insert returned no row");
  return row;
}

/**
 * Whether `candidate` is `issueId` itself or one of its descendants. Walked
 * upward from the candidate, so the query count is the depth of the tree
 * rather than its size.
 */
export async function isSelfOrDescendant(
  db: Db,
  issueId: string,
  candidate: string,
): Promise<boolean> {
  let at: string | null = candidate;
  const seen = new Set<string>();
  while (at) {
    if (at === issueId) return true;
    if (seen.has(at)) return false;
    seen.add(at);
    const parent: { parentId: string | null } | undefined = await db.query.issue.findFirst({
      where: { id: at },
      columns: { parentId: true },
    });
    at = parent?.parentId ?? null;
  }
  return false;
}
