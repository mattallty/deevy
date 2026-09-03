import {
  document as documentTable,
  documentVersion as documentVersionTable,
  type Db,
  type Document,
  type WorkflowState,
} from "@deevy/db";
import { and, eq } from "drizzle-orm";

/**
 * Documents are append-only: a write is a new version, never an overwrite, so
 * an Issue's intent can be read as it stood when a Gate was approved.
 */
export async function writeVersion(
  db: Db,
  document: Document,
  body: string,
  authorMemberId: string | null,
): Promise<number> {
  const version = document.currentVersion + 1;
  await db.insert(documentVersionTable).values({
    id: crypto.randomUUID(),
    documentId: document.id,
    version,
    body,
    authorMemberId,
  });
  await db
    .update(documentTable)
    .set({ currentVersion: version, updatedAt: new Date() })
    .where(eq(documentTable.id, document.id));
  return version;
}

/**
 * Creates the Document a State asks for, at version 1 holding its template.
 * Returns null when the State asks for nothing or the Issue already has it, so
 * an Issue that returns to a State does not get a second copy.
 */
export async function ensureStateDocument(
  db: Db,
  issueId: string,
  state: Pick<WorkflowState, "documentName" | "documentTemplate">,
  authorMemberId: string | null,
): Promise<Document | null> {
  const name = state.documentName;
  if (!name) return null;

  const existing = await db
    .select()
    .from(documentTable)
    .where(and(eq(documentTable.issueId, issueId), eq(documentTable.name, name)))
    .limit(1);
  if (existing.length > 0) return null;

  const id = crypto.randomUUID();
  const [created] = await db
    .insert(documentTable)
    .values({ id, issueId, name, currentVersion: 1 })
    .returning();
  if (!created) throw new Error("ensureStateDocument: the insert returned no row");
  await db.insert(documentVersionTable).values({
    id: crypto.randomUUID(),
    documentId: id,
    version: 1,
    body: state.documentTemplate ?? "",
    authorMemberId,
  });
  return created;
}
