import type { Db } from "@deevy/db";

/**
 * `@handle` tokens in a body. A handle is preceded by whitespace or the start
 * of the text, so an email address is not a mention. Duplicates are dropped and
 * order is kept, since the first mention is the one a reader sees first.
 */
export function extractHandles(body: string): string[] {
  const found = body.matchAll(/(?:^|[^\w@/])@([a-z0-9][a-z0-9-]{0,59})/gi);
  const handles: string[] = [];
  for (const match of found) {
    const handle = match[1]!.toLowerCase();
    if (!handles.includes(handle)) handles.push(handle);
  }
  return handles;
}

/**
 * The Members a body mentions. A Team handle expands to its Members, since
 * mentioning a Team is how you reach everyone on it (CONTEXT.md). Members and
 * Teams share one handle namespace, so a handle resolves to one or the other.
 */
export async function resolveMentions(
  db: Db,
  workspaceId: string,
  body: string,
): Promise<string[]> {
  const handles = extractHandles(body);
  if (handles.length === 0) return [];

  // Two queries rather than one per handle, since D1 charges per round trip.
  const [members, teams] = await Promise.all([
    db.query.member.findMany({
      where: { workspaceId, handle: { in: handles } },
      columns: { id: true },
    }),
    db.query.team.findMany({
      where: { workspaceId, handle: { in: handles } },
      with: { members: { columns: { id: true } } },
    }),
  ]);

  const mentioned = new Set(members.map((member) => member.id));
  for (const team of teams) {
    for (const member of team.members) mentioned.add(member.id);
  }
  return [...mentioned];
}
