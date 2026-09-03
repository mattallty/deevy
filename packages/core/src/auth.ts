import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { member, workspace, type Db } from "@deevy/db";
import { betterAuth } from "better-auth";

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
            await bootstrapWorkspace(db, { userId: user.id, email: user.email }, env);
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"];

/**
 * Deterministic first-admin bootstrap (ADR-0007): when the configured admin
 * email signs in and no Workspace exists yet, create the Workspace and the
 * admin Member. Sequential writes, no transaction (ADR-0006). Anyone else
 * gets a user row and no Member until M1's allowlist and invitations.
 */
export async function bootstrapWorkspace(
  db: Db,
  user: { userId: string; email: string },
  env: Pick<AuthEnv, "adminEmail" | "workspaceName">,
): Promise<void> {
  if (!env.adminEmail || user.email.toLowerCase() !== env.adminEmail.toLowerCase()) return;
  const existing = await db.query.workspace.findFirst();
  if (existing) return;
  const name = env.workspaceName?.trim() || "deevy";
  const workspaceId = crypto.randomUUID();
  await db.insert(workspace).values({ id: workspaceId, name, slug: slugify(name) });
  await db.insert(member).values({
    id: crypto.randomUUID(),
    workspaceId,
    userId: user.userId,
    role: "admin",
    kind: "human",
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
