import type { Db, Member, Workspace } from "@deevy/db";
import { eq } from "drizzle-orm";
import { agent, member, projectGrant, user, workspace } from "@deevy/db";
import { openDatabase } from "@deevy/adapters/node";
import type { Session } from "../src/auth.ts";
import type { AppContext } from "../src/operations/registry.ts";
import type { ApiKeys, ApiKeySummary } from "../src/keys.ts";

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

export interface AgentContextOptions extends MemberContextOptions {
  /** The Human accountable for this Agent (ADR-0001). */
  sponsor?: Member;
  /** The Projects it may see. Absent means none, which is the safe default. */
  grants?: string[];
}

/**
 * An Agent Member with a Sponsor and its Project grants, and the context an
 * operation sees when its API key authenticated the request.
 */
export async function agentContext(
  db: Db,
  options: AgentContextOptions = {},
): Promise<MemberContext> {
  const context = await memberContext(db, {
    ...options,
    kind: "agent",
    name: options.name ?? "Planner",
  });
  await db.insert(agent).values({ memberId: context.member.id });
  if (options.sponsor) {
    await db
      .update(member)
      .set({ sponsorId: options.sponsor.id })
      .where(eq(member.id, context.member.id));
  }
  for (const projectId of options.grants ?? []) {
    await db.insert(projectGrant).values({ memberId: context.member.id, projectId });
  }
  const row = (await db.query.member.findFirst({ where: { id: context.member.id } })) as Member;
  return { ...contextFor(db, row, context.workspace), grantedProjectIds: options.grants ?? [] };
}

export interface FakeApiKeys extends ApiKeys {
  /** Every key this store has minted, plaintext included, for a test to compare against. */
  issued: Array<{ userId: string; name: string; plaintext: string }>;
}

/**
 * A store the `agents.keys.*` operations can talk to while the Better Auth
 * `apiKey` plugin is not wired in behind the seam (packages/core/src/keys.ts).
 */
export function fakeApiKeys(): FakeApiKeys {
  const rows = new Map<string, ApiKeySummary & { userId: string }>();
  const issued: FakeApiKeys["issued"] = [];
  return {
    issued,
    async issue({ userId, name }) {
      const id = `key-${rows.size + 1}`;
      const plaintext = `deevy_sk_${id}_secret`;
      const summary = {
        id,
        userId,
        name,
        start: plaintext.slice(0, 12),
        createdAt: new Date(),
        lastRequestAt: null,
        expiresAt: null,
        enabled: true,
      };
      rows.set(id, summary);
      issued.push({ userId, name, plaintext });
      return { ...summary, key: plaintext };
    },
    async list({ userId }) {
      return [...rows.values()].filter((row) => row.userId === userId);
    },
    async revoke({ userId, keyId }) {
      const found = rows.get(keyId);
      if (!found || found.userId !== userId) return false;
      rows.delete(keyId);
      return true;
    },
  };
}
