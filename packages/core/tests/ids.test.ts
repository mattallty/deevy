import { createRouterClient } from "@orpc/server";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { authId, idPrefixes, isId, newId } from "../src/ids.ts";
import { router } from "../src/operations/index.ts";
import { memberContext, testDb } from "./helpers.ts";

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

describe("newId", () => {
  it("is the prefix, an underscore, and twelve lowercase alphanumerics", () => {
    for (const kind of Object.keys(idPrefixes) as Array<keyof typeof idPrefixes>) {
      const id = newId(kind);
      expect(id).toMatch(new RegExp(`^${idPrefixes[kind]}_[0-9a-z]{12}$`));
      expect(isId(id, kind)).toBe(true);
      expect(isId(id)).toBe(true);
    }
    expect(isId("iss_k3xr8v2m9qpw", "run")).toBe(false);
    expect(isId("k3xr8v2m9qpw")).toBe(false);
  });

  it("does not repeat itself", () => {
    const ids = new Set(Array.from({ length: 5_000 }, () => newId("issue")));
    expect(ids.size).toBe(5_000);
  });

  it("gives Better Auth's models their prefixes, and refuses one it does not know", () => {
    expect(authId("user")).toMatch(/^usr_[0-9a-z]{12}$/);
    expect(authId("session")).toMatch(/^ses_[0-9a-z]{12}$/);
    expect(authId("apikey")).toMatch(/^key_[0-9a-z]{12}$/);
    expect(authId("oauthClient")).toMatch(/^oacl_[0-9a-z]{12}$/);
    // A new plugin table must fail loudly, not mint a prefix isId rejects.
    expect(() => authId("somethingNew")).toThrow(/somethingNew/);
    // generateId receives the camelCase schema key, never the table name.
    expect(() => authId("oauth_client")).toThrow();
  });

  it("knows every model Better Auth creates on this instance", () => {
    // The auth core, the api-key and jwt plugins, and the oauth-provider
    // plugin's tables (auth.ts). oauthClientAssertion is created with the
    // plugin's own jti as its id, but the map keeps the prefix reserved.
    const models = [
      "user",
      "session",
      "account",
      "verification",
      "apikey",
      "jwks",
      "oauthClient",
      "oauthResource",
      "oauthClientResource",
      "oauthRefreshToken",
      "oauthAccessToken",
      "oauthConsent",
      "oauthClientAssertion",
    ];
    for (const model of models) {
      expect(isId(authId(model)), model).toBe(true);
    }
  });
});

describe("the rows deevy creates", () => {
  it("carry ids that say what they are", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const alice = await memberContext(db, { role: "admin", name: "Alice" });
    const client = createRouterClient(router, { context: alice });
    const project = await client.projects.create({ name: "deevy", key: "DEV" });
    const issue = await client.issues.create({ projectKey: "DEV", title: "Ship it" });
    const label = await client.labels.create({ name: "backend", color: "#333" });
    const comment = await client.comments.create({ issueKey: issue.key, body: "Hello" });

    expect(alice.member.id).toMatch(/^mem_/);
    expect(alice.workspace.id).toMatch(/^ws_/);
    expect(project.id).toMatch(/^proj_/);
    expect(project.states[0]?.id).toMatch(/^st_/);
    expect(issue.id).toMatch(/^iss_/);
    expect(label.id).toMatch(/^lbl_/);
    expect(comment.id).toMatch(/^cmt_/);
  });
});
