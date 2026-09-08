/**
 * The stub that stands in for every sign-in provider (docs/plans/sign-in.md
 * slice 2), exercised the way the acceptance walk and the dev loop use it.
 *
 * The file replaces `globalThis.fetch` for this process, so it is imported in
 * a test file of its own and the real one is put back afterwards. What is
 * under test is Better Auth's own OAuth dance — this drives a sign-in through
 * the operations and ends holding a session cookie — and the endpoints the
 * providers of slices 4 to 6 will be pointed at.
 */
import { afterAll, describe, expect, it } from "vite-plus/test";
import { account, allowlistRule, user } from "@deevy/db";
import { newId, signInProviders } from "@deevy/core";
import { readEnv } from "../src/env.ts";
import { buildServer } from "../src/server.ts";

const migrationsFolder = new URL("../../../packages/db/drizzle", import.meta.url).pathname;
const origin = "http://localhost:3000";
const secret = "test-secret-test-secret-test-secret-1234";

const realFetch = globalThis.fetch;
await import("../../web/scripts/stub-oauth.js");
afterAll(() => {
  globalThis.fetch = realFetch;
});

const stubbedEnv = {
  DEEVY_DEV_STUB_OAUTH: "1",
  GITHUB_CLIENT_ID: "stub-client",
  GITHUB_CLIENT_SECRET: "stub-secret",
  GOOGLE_CLIENT_ID: "stub-client",
  GOOGLE_CLIENT_SECRET: "stub-secret",
};

function stubbedServer(overrides: { adminEmail?: string } = {}) {
  return buildServer({
    ...readEnv(stubbedEnv),
    databasePath: ":memory:",
    migrationsFolder,
    baseURL: origin,
    secret,
    ...overrides,
  });
}

function cookiesOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

/** One Human through the whole dance, exactly as the dev form drives it. */
async function signIn(
  app: ReturnType<typeof stubbedServer>["app"],
  provider: string,
  email: string,
): Promise<string> {
  return cookiesOf(await callbackFor(app, provider, email));
}

/**
 * The same dance, stopping at the callback's own response — which is where a
 * sign-in that Better Auth refuses says so, in a redirect rather than a body.
 */
async function callbackFor(
  app: ReturnType<typeof stubbedServer>["app"],
  provider: string,
  email: string,
): Promise<Response> {
  const started = await app.request("/api/auth/sign-in/social", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider, callbackURL: "/" }),
  });
  const { url } = (await started.json()) as { url?: string };
  if (!url) throw new Error(`sign-in did not start for ${provider}: ${String(started.status)}`);
  const state = new URL(url).searchParams.get("state") ?? "";
  return app.request(
    `/api/auth/callback/${provider}?state=${encodeURIComponent(state)}&code=${encodeURIComponent(email)}`,
    { headers: { cookie: cookiesOf(started) }, redirect: "manual" },
  );
}

describe("a sign-in through the stub", () => {
  it("ends with a session, for every provider the environment configures", async () => {
    const offered = signInProviders({ providers: readEnv(stubbedEnv).providers });
    expect(offered.length).toBeGreaterThan(0);

    for (const provider of offered) {
      const { app, close } = stubbedServer();
      const email = `ada+${provider.id}@example.com`;
      const cookie = await signIn(app, provider.id, email);
      expect(cookie).toContain("session_token");

      const session = (await (
        await app.request("/api/auth/get-session", { headers: { cookie } })
      ).json()) as { user?: { email?: string } } | null;
      expect(session?.user?.email).toBe(email);
      close();
    }
  });
});

/**
 * One Human, one Member (docs/plans/sign-in.md slice 3): the linking policy
 * `createAuth` states, decided by Better Auth's real callback rather than by a
 * test of the options object.
 *
 * The provider that signed the Human up first is a seeded `account` row — a row
 * written by one provider is the same row whichever one wrote it — and what is
 * under test is what happens when a *second* provider arrives on an address a
 * first one already holds.
 */
describe("a second provider on an address deevy already knows", () => {
  const email = "ada@example.com";

  /** The Human as the provider that signed them up first left them. */
  async function signedUpElsewhere(
    db: ReturnType<typeof stubbedServer>["db"],
    emailVerified: boolean,
    address: string = email,
  ) {
    await db
      .insert(user)
      .values({ id: "usr_stubada00001", name: "Ada Lovelace", email: address, emailVerified });
    await db.insert(account).values({
      id: "acct_stubada0001",
      accountId: address,
      providerId: "google",
      userId: "usr_stubada00001",
      updatedAt: new Date(),
    });
  }

  it("links onto the Human who holds it, and leaves one Member", async () => {
    const { app, db, close } = stubbedServer({ adminEmail: email });
    await signedUpElsewhere(db, true);

    const cookie = await signIn(app, "github", email);
    expect(cookie).toContain("session_token");
    // Again, because a Human signs in more than once and a repeat must not
    // collect a second Member: `admit` runs from the session hook every time.
    await signIn(app, "github", email);

    expect(await db.query.user.findMany()).toMatchObject([{ id: "usr_stubada00001", email }]);
    const accounts = await db.query.account.findMany({ where: { userId: "usr_stubada00001" } });
    expect(accounts.map((row) => row.providerId).sort()).toEqual(["github", "google"]);
    expect(await db.query.member.findMany()).toMatchObject([
      { userId: "usr_stubada00001", role: "admin", handle: "ada-lovelace" },
    ]);
    close();
  });

  it("refuses the link when the row holding the address never proved it", async () => {
    const { app, db, close } = stubbedServer({ adminEmail: email });
    await signedUpElsewhere(db, false);

    const callback = await callbackFor(app, "github", email);

    // Better Auth's `requireLocalEmailVerified`: an unverified row is not
    // proof of ownership, so the sign-in fails rather than linking — and
    // fails rather than starting a second Human on the same address.
    expect(callback.headers.get("location")).toContain("error=account_not_linked");
    expect(cookiesOf(callback)).not.toContain("session_token");
    expect(await db.query.user.findMany()).toHaveLength(1);
    expect(await db.query.account.findMany()).toHaveLength(1);
    expect(await db.query.member.findMany()).toHaveLength(0);
    close();
  });

  /**
   * The half no provider deevy ships can drive, and the reason `trustedProviders`
   * is empty: a provider that says out loud it has not verified the address does
   * not get to link onto the Human who holds it. An IdP with open registration
   * is where this is not hypothetical (docs/plans/sign-in.md).
   */
  it("refuses a second provider that will not say the address is verified", async () => {
    const unverified = "mallory+unverified@example.com";
    const { app, db, close } = stubbedServer({ adminEmail: unverified });
    await signedUpElsewhere(db, true, unverified);

    const callback = await callbackFor(app, "github", unverified);

    expect(callback.headers.get("location")).toContain("error=account_not_linked");
    expect(cookiesOf(callback)).not.toContain("session_token");
    // One user, one account: the sign-in neither linked nor started a second
    // Human on the address.
    expect(await db.query.user.findMany()).toHaveLength(1);
    expect(await db.query.account.findMany()).toHaveLength(1);
    close();
  });
});

/**
 * Google (docs/plans/sign-in.md slice 4). What decides whether a teammate on
 * the Workspace's domain becomes a Member is the allowlist, not the provider:
 * `hd` is deliberately unset, so a Google Workspace is admitted as the email
 * domain it is, by a rule an admin can see in deevy's own UI.
 */
describe("a Google sign-in", () => {
  const admin = "ada@example.com";

  /** The Workspace, as the configured admin's own sign-in creates it. */
  async function seeded() {
    const server = stubbedServer({ adminEmail: admin });
    await signIn(server.app, "google", admin);
    const workspace = await server.db.query.workspace.findFirst();
    if (!workspace) throw new Error("the admin sign-in created no Workspace");
    return { ...server, workspaceId: workspace.id };
  }

  async function rule(
    db: ReturnType<typeof stubbedServer>["db"],
    workspaceId: string,
    value: string,
  ) {
    await db
      .insert(allowlistRule)
      .values({ id: newId("allowlistRule"), workspaceId, kind: "email_domain", value });
  }

  it("makes a Member of a teammate an email_domain rule matches", async () => {
    const { app, db, workspaceId, close } = await seeded();
    await rule(db, workspaceId, "example.com");

    const cookie = await signIn(app, "google", "grace@example.com");
    expect(cookie).toContain("session_token");

    const joined = await db.query.user.findFirst({ where: { email: "grace@example.com" } });
    expect(joined).toBeTruthy();
    expect(await db.query.member.findMany({ where: { userId: joined?.id } })).toMatchObject([
      { role: "member", kind: "human" },
    ]);
    close();
  });

  it("leaves a teammate no rule matches signed in and not a Member", async () => {
    const { app, db, workspaceId, close } = await seeded();
    await rule(db, workspaceId, "elsewhere.example");

    const cookie = await signIn(app, "google", "grace@example.com");
    expect(cookie).toContain("session_token");

    const joined = await db.query.user.findFirst({ where: { email: "grace@example.com" } });
    expect(joined).toBeTruthy();
    expect(await db.query.member.findMany({ where: { userId: joined?.id } })).toEqual([]);
    close();
  });
});

// --------------------------------------------------------- the stub's own ends

/** The claims of a JWT, without trusting it. */
function claimsOf(token: string): Record<string, unknown> {
  const payload = token.split(".")[1] ?? "";
  return JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<string, unknown>;
}

/**
 * The signature, against the JWKS the stub served. This is the slice's bet:
 * a provider that verifies an `id_token` against its issuer's keys is
 * satisfied by keys the stub published, so no provider needs a second seam.
 */
async function verifies(token: string, jwksUrl: string): Promise<boolean> {
  const { keys } = (await (await fetch(jwksUrl)).json()) as { keys: JsonWebKey[] };
  const jwk = keys[0];
  if (!jwk) throw new Error(`no key at ${jwksUrl}`);
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const [header, payload, signature] = token.split(".");
  return crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    Buffer.from(signature ?? "", "base64url"),
    new TextEncoder().encode(`${header}.${payload}`),
  );
}

async function tokenFrom(endpoint: string, email: string, clientId: string) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: email,
      client_id: clientId,
      client_secret: "stub-secret",
      redirect_uri: `${origin}/api/auth/callback/stub`,
    }),
  });
  return (await response.json()) as { access_token: string; id_token?: string };
}

describe("the stub's providers", () => {
  it("signs Google's id_token with the key its certificates publish", async () => {
    const { id_token } = await tokenFrom(
      "https://oauth2.googleapis.com/token",
      "ada@example.com",
      "google-client",
    );
    expect(id_token).toBeTruthy();
    const claims = claimsOf(id_token ?? "");
    expect(claims.iss).toBe("https://accounts.google.com");
    expect(claims.aud).toBe("google-client");
    expect(claims.email).toBe("ada@example.com");
    expect(claims.email_verified).toBe(true);
    expect(await verifies(id_token ?? "", "https://www.googleapis.com/oauth2/v3/certs")).toBe(true);
  });

  it("answers GitLab wherever the operator's issuer is", async () => {
    const issuer = "https://gitlab.example.test";
    const { access_token } = await tokenFrom(`${issuer}/oauth/token`, "ada@example.com", "gitlab");
    const profile = (await (
      await fetch(`${issuer}/api/v4/user`, { headers: { authorization: `Bearer ${access_token}` } })
    ).json()) as { email: string; username: string; state: string };
    expect(profile).toMatchObject({ email: "ada@example.com", username: "ada", state: "active" });
    expect(await (await fetch(`${issuer}/api/v4/groups?min_access_level=10`)).json()).toEqual([]);
  });

  it("discovers a generic OIDC issuer and signs for it, path and all", async () => {
    const issuer = "https://idp.example.test/realms/deevy";
    const discovered = (await (
      await fetch(`${issuer}/.well-known/openid-configuration`)
    ).json()) as { issuer: string; token_endpoint: string; jwks_uri: string };
    expect(discovered.issuer).toBe(issuer);

    const { id_token } = await tokenFrom(discovered.token_endpoint, "ada@example.com", "oidc");
    expect(claimsOf(id_token ?? "").iss).toBe(issuer);
    expect(await verifies(id_token ?? "", discovered.jwks_uri)).toBe(true);
  });

  it("leaves loopback alone, because that is deevy answering for itself", async () => {
    // Nothing is listening, so a request that reached the network is a
    // connection error — and one the stub had answered would be a document.
    await expect(fetch("http://127.0.0.1:1/.well-known/openid-configuration")).rejects.toThrow();
    // Every form of it, not the four literals this used to list: deevy on
    // 127.0.0.2 or 0.0.0.0 is still deevy, and the stub in front of its own
    // .well-known routes would answer for the authorization server.
    await expect(fetch("http://127.0.0.2:1/.well-known/openid-configuration")).rejects.toThrow();
    await expect(fetch("http://0.0.0.0:1/.well-known/openid-configuration")).rejects.toThrow();
  });

  /**
   * A self-hosted GitLab under a relative URL root builds every endpoint under
   * that prefix. An exact path match let those requests through to the real
   * network from a dev loop, silently (docs/plans/sign-in.md).
   */
  it("answers a GitLab that lives under a URL root", async () => {
    const issuer = "https://example.test/gitlab";
    const { access_token } = await tokenFrom(`${issuer}/oauth/token`, "ada@example.com", "gitlab");
    expect(access_token).toBeTruthy();
    const profile = (await (
      await fetch(`${issuer}/api/v4/user`, { headers: { authorization: `Bearer ${access_token}` } })
    ).json()) as { username: string };
    expect(profile.username).toBe("ada");
  });

  /**
   * The stub reported every address verified, which is what let a linking rule
   * that turns on the claim look tested when nothing drove it. An address
   * marked `+unverified` is the one a provider says it has not proved.
   */
  it("reports an address the providers have not verified", async () => {
    const unverified = "mallory+unverified@example.com";
    const { id_token } = await tokenFrom(
      "https://oauth2.googleapis.com/token",
      unverified,
      "google-client",
    );
    expect(claimsOf(id_token ?? "").email_verified).toBe(false);

    const emails = (await (
      await fetch("https://api.github.com/user/emails", {
        headers: { authorization: `Bearer gho_${unverified}` },
      })
    ).json()) as Array<{ verified: boolean }>;
    expect(emails[0]?.verified).toBe(false);

    // GitLab has no such claim at all: an unconfirmed address is a null stamp.
    const issuer = "https://gitlab.example.test";
    const { access_token } = await tokenFrom(`${issuer}/oauth/token`, unverified, "gitlab");
    const profile = (await (
      await fetch(`${issuer}/api/v4/user`, { headers: { authorization: `Bearer ${access_token}` } })
    ).json()) as { confirmed_at: string | null; email_verified?: unknown };
    expect(profile.confirmed_at).toBeNull();
    expect(profile.email_verified).toBeUndefined();
  });
});
