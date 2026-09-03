import { event, type Db, type Event, type Member, type Workspace } from "@deevy/db";

/**
 * The Event log is the audit trail (docs/PLAN.md): every write appends one
 * immutable Event in the same handler, and Notifications, the live stream, and
 * the Issue timeline read it back rather than keeping a second source.
 */

/**
 * Dotted `<subject>.<verb>`. The union grows one slice at a time; the payload
 * shape each kind carries is documented by the operation that appends it.
 */
export type EventKind = "workspace.created" | "member.joined";

export type EventPayload = Record<string, unknown>;

export interface EventInput {
  kind: EventKind;
  subjectType: string;
  subjectId: string;
  /** Set when the Event belongs to a Project, so a Project stream is one index scan. */
  projectId?: string | null;
  payload?: EventPayload;
}

/**
 * Who is appending. An operation's member context satisfies this as it stands;
 * writes deevy makes on its own pass `member: null` and the Workspace directly.
 */
export interface EventSource {
  db: Db;
  workspace: Pick<Workspace, "id">;
  member?: Pick<Member, "id"> | null;
}

/** Appends one Event and returns the stored row, including its `seq` cursor. */
export async function appendEvent(source: EventSource, input: EventInput): Promise<Event> {
  const [row] = await source.db
    .insert(event)
    .values({
      workspaceId: source.workspace.id,
      actorMemberId: source.member?.id ?? null,
      kind: input.kind,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      projectId: input.projectId ?? null,
      payload: input.payload ?? null,
    })
    .returning();
  if (!row) throw new Error("appendEvent: the insert returned no row");
  return row;
}
