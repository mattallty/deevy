import { apiKey } from "@better-auth/api-key";
import { cimd } from "@better-auth/cimd";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { mcp } from "@better-auth/mcp";
import { allowlistRule, member, workspace, type Db } from "@deevy/db";
import { eq } from "drizzle-orm";
import { allocateHandle, slugify } from "./handles.ts";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { fetchClientMetadataResource, type MetadataResourceFetch } from "./cimd.ts";
import { appendEvent } from "./events.ts";
import { authId, newId } from "./ids.ts";

/**
 * Both halves of an OAuth client. Half a pair is not a provider: a `clientId`
 * of `""` still registers one with Better Auth, and the failure then arrives
 * as a redirect to the provider's own error page rather than as a sign-in page
 * that can say this instance offers nothing (docs/plans/sign-in.md).
 */
export interface OAuthClient {
  clientId: string;
  clientSecret: string;
}

/**
 * What a deployment configures: one optional entry per provider deevy offers.
 * A provider is configuration, not a constant, so offering another one is an
 * entry here and in `signInProviders` rather than an edit to the sign-in page
 * (docs/plans/sign-in.md).
 */
export interface AuthProviders {
  github?: OAuthClient;
}

/**
 * How the SPA starts a sign-in with a provider. `social` is Better Auth's own
 * `signIn.social`; a generic OIDC provider is posted differently and brings
 * the second value with it (docs/plans/sign-in.md).
 */
export type SignInProviderKind = "social";

/** One provider, as the sign-in page needs it: what to call, and what to say. */
export interface SignInProvider {
  id: string;
  label: string;
  kind: SignInProviderKind;
}

export interface AuthEnv {
  /** Public URL of the server; callbacks derive from it. */
  baseURL?: string;
  /** At least 32 random characters in production. */
  secret?: string;
  /** Browser origins allowed to use the session cookie (the Vite dev server). */
  trustedOrigins?: string[];
  /** Which sign-in providers this deployment offers. Absent offers none. */
  providers?: AuthProviders;
  /** The first sign-in with this email creates the Workspace and becomes admin. */
  adminEmail?: string;
  workspaceName?: string;
  /**
   * How a Client ID Metadata Document is dereferenced. Defaults to the
   * web-standard transport in `cimd.ts`; a deployment that can pin a resolved
   * address supplies a stricter one here.
   */
  fetchClientMetadataResource?: MetadataResourceFetch;
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
  const auth = betterAuth({
    baseURL: env.baseURL,
    secret: env.secret,
    basePath: AUTH_BASE_PATH,
    trustedOrigins: env.trustedOrigins,
    database: drizzleAdapter(db, { provider: "sqlite" }),
    // Its rows get deevy's prefixed ids too (ids.ts, ADR-0015): usr_, ses_, acct_, key_…
    advanced: { database: { generateId: ({ model }) => authId(model) } },
    emailAndPassword: { enabled: false },
    plugins: [...apiKeyPlugins(), ...oauthServerPlugins(env)],
    socialProviders: socialProvidersOf(env.providers ?? {}),
    account: { accountLinking: accountLinkingOf(env) },
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
  // Better Auth starts initialising the moment it is constructed, and the
  // OAuth provider seeds its resource rows there, so the context is a promise
  // that touches the database before anyone has awaited it. This handler only
  // marks that promise as observed: every real `await auth.$context` still
  // sees a failure, but a caller that builds an instance and never uses it
  // does not turn one into an unhandled rejection.
  void auth.$context.catch(() => {});
  return auth;
}

/**
 * The providers this deployment offers, in the order the sign-in page renders
 * them. Public through `health.ping`: an instance that cannot say what it
 * offers cannot render its own sign-in page (docs/plans/sign-in.md).
 */
export function signInProviders(env: Pick<AuthEnv, "providers">): SignInProvider[] {
  const providers = env.providers ?? {};
  const offered: SignInProvider[] = [];
  if (configuredClient(providers.github))
    offered.push({ id: "github", label: "GitHub", kind: "social" });
  return offered;
}

/**
 * One Human, one Member (docs/plans/sign-in.md). A teammate who signed in with
 * one provider in March and another in April is one user row with two accounts
 * — one handle, one inbox, one Member — rather than two strangers who share an
 * address. Better Auth links that way by default; this says so, because what a
 * Workspace's identity model is should not be inherited from a minor release.
 *
 * **No provider is trusted by name.** Better Auth's `trustedProviders` does not
 * mean "a provider this deployment offers"; it means "link this provider's
 * sign-in without reading whether it says the address is verified". Every
 * provider deevy ships reports a verified address when it has one — GitHub and
 * Google always do, GitLab through the `confirmed_at` its profile carries — so
 * naming them buys no case that works and costs the one refusal that matters:
 * an IdP with open self-registration, telling the truth about an address it has
 * not verified, would otherwise link a stranger onto the Member who holds it
 * (docs/OPERATIONS.md).
 *
 * The cost of the empty list is a provider that reports nothing at all. An
 * OpenID Connect IdP that omits `email_verified` — Entra does — cannot become
 * somebody's second provider, and says so with `account_not_linked` rather than
 * linking on a claim nobody made.
 *
 * The gate that stays is Better Auth's `requireLocalEmailVerified`, left at its
 * default `true` — the row already holding the address must itself have proved
 * it, so nobody collects somebody else's next sign-in by registering an
 * unverified account at their address first. It is set nowhere here because the
 * option is deprecated on its way to being unconditional, and a value written
 * down now is a value to delete later.
 *
 * `allowDifferentEmails: false`: a link is one address at both ends. Two
 * addresses are two Humans until deevy has a screen that says otherwise.
 */
export function accountLinkingOf(_env: Pick<AuthEnv, "providers">) {
  return {
    enabled: true,
    trustedProviders: [],
    allowDifferentEmails: false,
  };
}

/**
 * The social providers Better Auth registers: the configured entries, and only
 * those. What `signInProviders` reports and what `createAuth` registers are
 * decided by the same predicate, so a button on the page is a provider the
 * server will actually start a sign-in with.
 */
function socialProvidersOf(providers: AuthProviders) {
  const github = configuredClient(providers.github);
  return github
    ? {
        github: {
          ...github,
          // The organizations a github_org allowlist rule matches are only
          // listable with this scope (docs/plans/m1.md).
          scope: ["read:org"],
        },
      }
    : {};
}

/** An entry with both halves of its pair, or nothing. */
function configuredClient(client: OAuthClient | undefined): OAuthClient | null {
  const clientId = client?.clientId.trim();
  const clientSecret = client?.clientSecret.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** The prefix every deevy API key carries, and the discriminator resolvePrincipal reads. */
export const apiKeyPrefix = "deevy_sk_";

/**
 * How an Agent authenticates (ADR-0007). The plugin's default header is
 * x-api-key; MCP clients send a bearer, and so does curl, so the key is read
 * from Authorization instead. Rate limiting is off: it would silently 429 an
 * agent loop, and rate limits belong at the edge (docs/plans/m2.md). Mirrored
 * in packages/db/auth.generate.config.ts, which the schema generator reads.
 */
export function apiKeyPlugins() {
  return [
    apiKey({
      defaultPrefix: apiKeyPrefix,
      rateLimit: { enabled: false },
      customAPIKeyGetter: (ctx) => bearerApiKey(ctx.headers),
    }),
  ];
}

/** Where the MCP endpoint is mounted. RFC 8707 and RFC 9728 both build on it. */
export const MCP_PATH = "/mcp";

/** Where Better Auth's own routes are mounted, and so where `/jwks` lives. */
export const AUTH_BASE_PATH = "/api/auth";

/** The SPA route the OAuth provider sends a Human to for consent. */
export const CONSENT_PATH = "/consent";

/**
 * deevy as an OAuth 2.1 authorization server for a Human's own MCP client
 * (ADR-0007, docs/plans/m2.md). `mcp()` *is* the provider, so no separate
 * `oauthProvider` sits beside it, and `jwt()` supplies the signing keys the
 * access tokens and the JWKS come from.
 *
 * The issuer is pinned to the instance origin rather than left to default to
 * Better Auth's base path. RFC 8414 builds a metadata URL by inserting the
 * well-known segment after the issuer's host, so an issuer of `…/api/auth`
 * would publish the document at `/.well-known/oauth-authorization-server/api/auth`
 * and nowhere a client looking at the origin would find it.
 *
 * Nothing is enabled without a configured `baseURL`: a resource identifier is
 * an absolute URL (RFC 8707) and guessing it per request would mint tokens
 * bound to whatever host the caller sent (docs/OPERATIONS.md).
 *
 * Mirrored in packages/db/auth.generate.config.ts, which the schema generator
 * reads; only the plugin list shapes the schema, and `cimd()` adds no tables.
 */
export function oauthServerPlugins(env: AuthEnv) {
  const baseURL = env.baseURL?.replace(/\/+$/, "");
  if (!baseURL) return [];
  return [
    jwt({ jwt: { issuer: baseURL } }),
    mcp({
      loginPage: "/",
      consentPage: CONSENT_PATH,
      // RFC 8707: every token this server mints is bound to this audience, and
      // one minted for anything else is refused at /mcp (principal.ts).
      resource: `${baseURL}${MCP_PATH}`,
      // MCP 2026-07-28 prefers a Client ID Metadata Document and deprecates
      // dynamic registration, but the clients that only speak DCR are the ones
      // deevy cannot ask to change, so both stay open.
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
    }),
    cimd({
      fetchClientMetadataResource: env.fetchClientMetadataResource ?? fetchClientMetadataResource,
      // The revision pins CIMD draft-00, which the profile enforces on top of
      // the plugin's generic draft-02 validation.
      metadataProfile: "mcp-2026-07-28",
    }),
  ];
}

/** The Authorization bearer of a request, whatever kind of credential it is. */
export function bearerToken(headers: Headers | undefined): string | null {
  const [scheme, token] = (headers?.get("authorization") ?? "").split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

/**
 * The bearer, only when it is a deevy API key. A Human MCP client's OAuth
 * access token arrives on the same header, and the plugin must not try to look
 * it up as a key.
 */
export function bearerApiKey(headers: Headers | undefined): string | null {
  const token = bearerToken(headers);
  return token?.startsWith(apiKeyPrefix) ? token : null;
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

export { allocateHandle, slugify } from "./handles.ts";

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
    workspaceId = newId("workspace");
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
  const memberId = newId("member");
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

  const memberId = newId("member");
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
