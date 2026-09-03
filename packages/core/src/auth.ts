import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { allowlistRule, member, workspace, type Db } from "@deevy/db";
import { eq, like } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { appendEvent } from "./events.ts";

export interface AuthEnv {
  /** Public URL of the server; callbacks derive from it. */
  baseURL?: string;
  /** At least 32 random characters in production. */
  secret?: string;
  /** Browser origins allowed to use the session cookie (the Vite dev server). */
  trustedOrigins?: string[];
  github: { clientId: string; clientSecret: string };
  /** The first sign-in with this email creates the Workspace and becomes admin. */
  adminEmail?: string;
  workspaceName?: string;
}

export interface CreateAuthOptions {
  db: Db;
  env: AuthEnv;
}

/**
 * Better Auth is identity for Humans and, from M2, Agents (ADR-0007). Every
 * Member is a Better Auth user; deevy keeps its own workspace and member tables.
 */
export function createAuth({ db, env }: CreateAuthOptions) {
  return betterAuth({
    baseURL: env.baseURL,
    secret: env.secret,
    basePath: "/api/auth",
    trustedOrigins: env.trustedOrigins,
    database: drizzleAdapter(db, { provider: "sqlite" }),
    emailAndPassword: { enabled: false },
    socialProviders: {
      github: {
        clientId: env.github.clientId,
        clientSecret: env.github.clientSecret,
        // The organizations a github_org allowlist rule matches are only
        // listable with this scope (docs/plans/m1.md).
        scope: ["read:org"],
      },
    },
    user: {
      additionalFields: {
        kind: {
          type: ["human", "agent"],
          required: false,
          defaultValue: "human",
          input: false,
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await admit(db, env, { userId: user.id, email: user.email, name: user.name });
          },
        },
      },
      // Also on every new session, so an admin email configured after the
      // first sign-in still bootstraps the Workspace. Idempotent.
      session: {
        create: {
          after: async (session) => {
            const user = await db.query.user.findFirst({ where: { id: session.userId } });
            if (user) {
              await admit(db, env, { userId: user.id, email: user.email, name: user.name });
            }
          },
        },
      },
    },
  });
}

/**
 * The two ways a sign-in becomes a Member, in order: the configured admin
 * bootstraps the Workspace, anyone else joins when an allowlist rule matches.
 * Both are idempotent, so the two Better Auth hooks may run either or both.
 */
async function admit(db: Db, env: AuthEnv, user: JoiningUser): Promise<void> {
  await bootstrapWorkspace(db, user, env);
  await joinWorkspace(db, user, githubPorts(db, user.userId));
}

/**
 * The GitHub half of a join, read through the account's stored access token.
 * Both ports are lazy: `github_org` rules are the only reason to spend a round
 * trip, and `joinWorkspace` skips them when an email domain already matched.
 */
function githubPorts(db: Db, userId: string): JoinOptions {
  const token = async () => {
    const account = await db.query.account.findFirst({
      where: { userId, providerId: "github" },
    });
    return account?.accessToken ?? null;
  };
  const get = async <T>(path: string): Promise<T | null> => {
    const accessToken = await token();
    if (!accessToken) return null;
    const res = await fetch(`https://api.github.com${path}`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/vnd.github+json",
        "user-agent": "deevy",
      },
    });
    return res.ok ? ((await res.json()) as T) : null;
  };
  return {
    listOrgs: async () => {
      const orgs = await get<Array<{ login: string }>>("/user/orgs");
      return orgs?.map((org) => org.login) ?? [];
    },
  };
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"];

/**
 * Deterministic first-admin bootstrap (ADR-0007): when the configured admin
 * email signs in and no Workspace exists yet, create the Workspace and the
 * admin Member; if the Workspace exists but the admin has no Member row yet,
 * add it. Each write appends its Event with no actor, since deevy itself is
 * doing the writing. Sequential writes, no transaction (ADR-0006). Anyone else
 * gets a user row and no Member until M1's allowlist.
 */
export async function bootstrapWorkspace(
  db: Db,
  user: JoiningUser,
  env: Pick<AuthEnv, "adminEmail" | "workspaceName">,
): Promise<void> {
  if (!env.adminEmail || user.email.toLowerCase() !== env.adminEmail.toLowerCase()) return;
  if (await db.query.member.findFirst({ where: { userId: user.userId } })) return;
  let workspaceId = (await db.query.workspace.findFirst())?.id;
  const source = { db, workspace: { id: "" }, member: null };
  if (!workspaceId) {
    const name = env.workspaceName?.trim() || "deevy";
    workspaceId = crypto.randomUUID();
    await db.insert(workspace).values({ id: workspaceId, name, slug: slugify(name) });
    source.workspace.id = workspaceId;
    await appendEvent(source, {
      kind: "workspace.created",
      subjectType: "workspace",
      subjectId: workspaceId,
      payload: { name },
    });
  }
  source.workspace.id = workspaceId;
  const memberId = crypto.randomUUID();
  await db.insert(member).values({
    id: memberId,
    workspaceId,
    userId: user.userId,
    role: "admin",
    kind: "human",
    handle: await allocateHandle(db, user.name ?? user.email),
  });
  await appendEvent(source, {
    kind: "member.joined",
    subjectType: "member",
    subjectId: memberId,
    payload: { role: "admin", kind: "human" },
  });
}

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "workspace";
}

/** The sign-in a join decision is made about. */
export interface JoiningUser {
  userId: string;
  email: string;
  name?: string | null;
}

export interface JoinOptions {
  /** The GitHub login of the sign-in, preferred over a slug of the name as the handle. */
  githubLogin?: string;
  /**
   * The GitHub organizations this sign-in belongs to, for `github_org` rules.
   * A port rather than a fetch so the rule can be decided without a network
   * call; production supplies the sign-in's access token (needs `read:org`).
   */
  listOrgs?: () => Promise<string[]>;
}

/**
 * The M1 allowlist (docs/plans/m1.md): a sign-in that is not yet a Member joins
 * the Workspace as a `member` when any rule matches. Runs from the same two
 * Better Auth hooks as `bootstrapWorkspace` and is idempotent, so a repeat
 * sign-in changes nothing. Sequential writes, no transaction (ADR-0006).
 */
export async function joinWorkspace(
  db: Db,
  user: JoiningUser,
  options: JoinOptions = {},
): Promise<void> {
  if (await db.query.member.findFirst({ where: { userId: user.userId } })) return;
  const ws = await db.query.workspace.findFirst();
  if (!ws) return;
  if (!(await matchesAllowlist(db, ws.id, user, options))) return;

  const memberId = crypto.randomUUID();
  await db.insert(member).values({
    id: memberId,
    workspaceId: ws.id,
    userId: user.userId,
    role: "member",
    kind: "human",
    handle: await allocateHandle(db, options.githubLogin ?? user.name ?? user.email),
  });
  await appendEvent(
    { db, workspace: ws, member: null },
    {
      kind: "member.joined",
      subjectType: "member",
      subjectId: memberId,
      payload: { role: "member", kind: "human" },
    },
  );
}

async function matchesAllowlist(
  db: Db,
  workspaceId: string,
  user: JoiningUser,
  options: JoinOptions,
): Promise<boolean> {
  const domain = user.email.toLowerCase().split("@").at(-1) ?? "";
  const rules = await db
    .select()
    .from(allowlistRule)
    .where(eq(allowlistRule.workspaceId, workspaceId));
  if (rules.some((rule) => rule.kind === "email_domain" && rule.value === domain)) return true;

  // The organizations cost a round trip to GitHub, so they are only asked for
  // when a github_org rule exists and no email domain matched.
  const orgRules = rules.filter((rule) => rule.kind === "github_org");
  if (orgRules.length === 0 || !options.listOrgs) return false;
  const orgs = new Set((await options.listOrgs()).map((org) => org.toLowerCase()));
  return orgRules.some((rule) => orgs.has(rule.value));
}

/**
 * A handle unique across the Workspace. The taken ones are read in a single
 * statement rather than probed one suffix at a time, since D1 charges per
 * round trip (docs/plans/m1.md).
 */
export async function allocateHandle(db: Db, from: string): Promise<string> {
  const base = slugify(from.split("@")[0] ?? from);
  const taken = new Set(
    (
      await db
        .select({ handle: member.handle })
        .from(member)
        .where(like(member.handle, `${base}%`))
    ).map((row) => row.handle),
  );
  if (!taken.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}
