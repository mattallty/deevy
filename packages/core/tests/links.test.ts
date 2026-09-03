import { createRouterClient } from "@orpc/server";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { parseLink } from "../src/links.ts";
import { router } from "../src/operations/index.ts";
import { memberContext, testDb, type MemberContext } from "./helpers.ts";

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

const repositories = [
  {
    id: "r1",
    url: "https://github.com/mattallty/deevy",
    provider: "github" as const,
    name: "mattallty/deevy",
  },
  {
    id: "r2",
    url: "https://gitlab.com/acme/widgets",
    provider: "gitlab" as const,
    name: "acme/widgets",
  },
];

describe("parseLink", () => {
  it("recognises a GitHub pull request, commit and branch", () => {
    expect(parseLink("https://github.com/mattallty/deevy/pull/12", repositories)).toMatchObject({
      kind: "pull_request",
      ref: "12",
      repositoryId: "r1",
    });
    expect(
      parseLink("https://github.com/mattallty/deevy/commit/abc123def456", repositories),
    ).toMatchObject({ kind: "commit", ref: "abc123def456", repositoryId: "r1" });
    expect(
      parseLink("https://github.com/mattallty/deevy/tree/feature/live-events", repositories),
    ).toMatchObject({ kind: "branch", ref: "feature/live-events", repositoryId: "r1" });
  });

  it("recognises a GitLab merge request as a pull request", () => {
    expect(
      parseLink("https://gitlab.com/acme/widgets/-/merge_requests/7", repositories),
    ).toMatchObject({ kind: "pull_request", ref: "7", repositoryId: "r2" });
    expect(
      parseLink("https://gitlab.com/acme/widgets/-/commit/deadbeef", repositories),
    ).toMatchObject({ kind: "commit", ref: "deadbeef", repositoryId: "r2" });
  });

  it("falls back to a plain url with no Repository", () => {
    expect(parseLink("https://example.com/design", repositories)).toMatchObject({
      kind: "url",
      ref: null,
      repositoryId: null,
    });
    // A GitHub URL in a Repository nobody registered is still just a URL.
    expect(parseLink("https://github.com/other/repo/pull/1", repositories)).toMatchObject({
      kind: "pull_request",
      ref: "1",
      repositoryId: null,
    });
  });
});

async function withIssue(db: MemberContext["db"]) {
  const admin = await memberContext(db, { role: "admin", name: "Ada" });
  const client = createRouterClient(router, { context: admin });
  await client.projects.create({ name: "deevy", key: "DEV" });
  await client.issues.create({ projectKey: "DEV", title: "Ship it" });
  return { admin, client };
}

describe("links.add", () => {
  it("derives the kind and matches the Repository", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withIssue(db);
    const repo = await client.repositories.create({
      provider: "github",
      name: "mattallty/deevy",
      url: "https://github.com/mattallty/deevy",
    });

    const link = await client.links.add({
      issueKey: "DEV-1",
      url: "https://github.com/mattallty/deevy/pull/12",
    });

    expect(link).toMatchObject({
      kind: "pull_request",
      ref: "12",
      repositoryId: repo.id,
    });
    const page = await client.events.list({ subjectType: "issue" });
    expect(page.events.findLast((e) => e.kind === "issue.link_added")).toBeTruthy();
  });

  it("lets an explicit kind override what was derived", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withIssue(db);

    const link = await client.links.add({
      issueKey: "DEV-1",
      url: "https://example.com/design",
      kind: "branch",
      title: "The design",
    });

    expect(link).toMatchObject({ kind: "branch", title: "The design" });
  });
});

describe("links.remove", () => {
  it("drops the Link and records it", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withIssue(db);
    const link = await client.links.add({
      issueKey: "DEV-1",
      url: "https://example.com/design",
    });

    await client.links.remove({ linkId: link.id });

    expect((await client.links.list({ issueKey: "DEV-1" })).links).toEqual([]);
    const page = await client.events.list({ subjectType: "issue" });
    expect(page.events.findLast((e) => e.kind === "issue.link_removed")).toBeTruthy();
  });
});

describe("repositories", () => {
  it("refuses a non-admin creating one, and reports a duplicate url", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const { client } = await withIssue(db);
    const bob = await memberContext(db, { name: "Bob", email: "bob@flippable.net" });
    await client.repositories.create({
      provider: "github",
      name: "mattallty/deevy",
      url: "https://github.com/mattallty/deevy",
    });

    await expect(
      client.repositories.create({
        provider: "github",
        name: "mattallty/deevy",
        url: "https://github.com/mattallty/deevy",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const asBob = createRouterClient(router, { context: bob });
    await expect(
      asBob.repositories.create({
        provider: "github",
        name: "a/b",
        url: "https://github.com/a/b",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
