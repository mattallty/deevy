import type { Db, Member, Workspace } from "@deevy/db";
import { member, user, workspace } from "@deevy/db";
import { openDatabase } from "@deevy/adapters/node";
import type { Session } from "../src/auth.ts";
import type { AppContext } from "../src/operations/registry.ts";

export const migrationsFolder = new URL("../../db/drizzle", import.meta.url).pathname;

export function testDb() {
  return openDatabase({ path: ":memory:", migrationsFolder });
}

/** An AppContext whose caller is a Member of the Workspace, for createRouterClient. */
export type MemberContext = AppContext & {
  session: Session;
  member: Member;
  workspace: Workspace;
};

/** The context an operation sees for a Member that already exists. */
export function contextFor(db: Db, member: Member, workspace: Workspace): MemberContext {
  const session = {
    session: {
      id: crypto.randomUUID(),
      userId: member.userId,
      token: "test",
      expiresAt: new Date(),
    },
    user: {
      id: member.userId,
      name: "Test",
      email: "test@example.com",
      image: null,
      kind: member.kind,
    },
  } as unknown as Session;
  return { db, session, member, workspace };
}

export interface MemberContextOptions {
  role?: Member["role"];
  kind?: Member["kind"];
  name?: string;
  email?: string;
}

/**
 * Inserts a user, the Workspace when there is none yet, and a Member, and
 * returns the context an operation sees for that caller.
 */
export async function memberContext(
  db: Db,
  options: MemberContextOptions = {},
): Promise<MemberContext> {
  const name = options.name ?? "Ada";
  const email = options.email ?? `${name.toLowerCase()}@example.com`;
  const userId = crypto.randomUUID();
  await db.insert(user).values({ id: userId, name, email });

  let found = await db.query.workspace.findFirst();
  if (!found) {
    const id = crypto.randomUUID();
    await db.insert(workspace).values({ id, name: "deevy", slug: "deevy" });
    found = await db.query.workspace.findFirst({ where: { id } });
  }
  const ws = found as Workspace;

  const memberId = crypto.randomUUID();
  await db.insert(member).values({
    id: memberId,
    workspaceId: ws.id,
    userId,
    role: options.role ?? "member",
    kind: options.kind ?? "human",
  });
  const row = (await db.query.member.findFirst({ where: { id: memberId } })) as Member;

  return contextFor(db, row, ws);
}
