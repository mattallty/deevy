import { createRouterClient, Procedure } from "@orpc/server";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { router } from "../src/operations/index.ts";
import type { OperationMeta } from "../src/operations/registry.ts";
import { getOperationMeta } from "../src/operations/registry.ts";
import { agentContext, memberContext, testDb } from "./helpers.ts";

/** Every operation in the router, as the registry describes it. */
function operations(node: unknown, found: OperationMeta[] = []): OperationMeta[] {
  if (node instanceof Procedure) {
    const meta = getOperationMeta(node);
    if (meta) found.push(meta);
    return found;
  }
  if (node && typeof node === "object") {
    for (const child of Object.values(node)) operations(child, found);
  }
  return found;
}

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

describe("the Agent capability rule", () => {
  it("refuses an Agent every operation that does not opt in", async () => {
    const { db, close } = testDb();
    closers.push(close);
    await memberContext(db, { role: "admin", name: "Ada" });
    const agent = await memberContext(db, { kind: "agent", name: "Planner" });
    const asAgent = createRouterClient(router, { context: agent });

    await expect(asAgent.workspace.get({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets an Agent call an operation that opts in", async () => {
    const { db, close } = testDb();
    closers.push(close);
    await memberContext(db, { role: "admin", name: "Ada" });
    const agent = await memberContext(db, { kind: "agent", name: "Planner" });
    const asAgent = createRouterClient(router, { context: agent });

    expect(await asAgent.labels.list({})).toMatchObject({ labels: [] });
  });

  it("opens exactly the operations ADR-0004 allows an Agent", () => {
    const allowed = operations(router)
      .filter((meta) => meta.agents)
      .map((meta) => meta.name)
      .sort();

    expect(allowed).toEqual([
      "comments.create",
      "comments.list",
      "documents.get",
      "documents.list",
      "documents.write",
      "inbox.list",
      "issues.create",
      "issues.get",
      "issues.list",
      "issues.move",
      "issues.setLabels",
      "issues.update",
      "labels.create",
      "labels.list",
      "links.add",
      "links.list",
      "projects.get",
      "projects.list",
    ]);
  });
});

describe("Project grants", () => {
  it("hides an ungranted Project from an Agent", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    const asAdmin = createRouterClient(router, { context: admin });
    const dev = await asAdmin.projects.create({ key: "DEV", name: "deevy" });
    await asAdmin.projects.create({ key: "OPS", name: "operations" });
    await asAdmin.issues.create({ projectKey: "DEV", title: "Granted" });
    await asAdmin.issues.create({ projectKey: "OPS", title: "Hidden" });

    const agent = await agentContext(db, { sponsor: admin.member, grants: [dev.id] });
    const asAgent = createRouterClient(router, { context: agent });

    expect((await asAgent.projects.list({})).projects.map((p) => p.key)).toEqual(["DEV"]);
    expect(await asAgent.issues.get({ key: "DEV-1" })).toMatchObject({ key: "DEV-1" });
    await expect(asAgent.issues.get({ key: "OPS-1" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "No such Project",
    });
  });
});

describe("Gate decisions", () => {
  it("refuses a delegated credential, so approval happens in deevy's UI", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await memberContext(db, { role: "admin", name: "Ada" });
    const asAdmin = createRouterClient(router, { context: admin });
    await asAdmin.projects.create({ key: "DEV", name: "deevy" });
    await asAdmin.issues.create({ projectKey: "DEV", title: "Gated" });

    const viaKey = createRouterClient(router, {
      context: { ...admin, principal: { kind: "api_key", keyId: "k1" } },
    });
    await expect(viaKey.gates.approve({ key: "DEV-1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    expect(await asAdmin.gates.approve({ key: "DEV-1" })).toMatchObject({
      state: { name: "Spec" },
    });
  });
});
