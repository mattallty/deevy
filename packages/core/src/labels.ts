import { issueLabel, type Db, type Label } from "@deevy/db";
import { and, eq, inArray } from "drizzle-orm";

/**
 * An Issue carries at most one Label per scope (CONTEXT.md). When two ids share
 * a scope, the last one given wins, so a picker can send its whole selection
 * and the newest choice replaces the older one.
 */
export function oneLabelPerScope(labels: Label[]): Label[] {
  const byScope = new Map<string, Label>();
  const plain: Label[] = [];
  for (const label of labels) {
    if (label.scope === null) plain.push(label);
    else byScope.set(label.scope, label);
  }
  return [...plain, ...byScope.values()];
}

/** Index-signature shaped so it can be an Event payload directly. */
export interface LabelChange {
  added: string[];
  removed: string[];
  [key: string]: unknown;
}

/**
 * Replaces an Issue's Labels with the given set and reports the difference.
 * The writes are two statements rather than one per Label, since D1 charges
 * per round trip (docs/plans/m1.md).
 */
export async function replaceIssueLabels(
  db: Db,
  issueId: string,
  labelIds: string[],
): Promise<LabelChange> {
  const current = await db
    .select({ labelId: issueLabel.labelId })
    .from(issueLabel)
    .where(eq(issueLabel.issueId, issueId));
  const before = new Set(current.map((row) => row.labelId));
  const after = new Set(labelIds);

  const removed = [...before].filter((id) => !after.has(id));
  const added = [...after].filter((id) => !before.has(id));

  if (removed.length > 0) {
    await db
      .delete(issueLabel)
      .where(and(eq(issueLabel.issueId, issueId), inArray(issueLabel.labelId, removed)));
  }
  if (added.length > 0) {
    await db.insert(issueLabel).values(added.map((labelId) => ({ issueId, labelId })));
  }
  return { added, removed };
}
