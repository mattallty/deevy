import { createRouterClient } from "@orpc/server";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { router } from "../src/operations/index.ts";
import { agentContext, memberContext, testDb } from "./helpers.ts";

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

/** An admin, a Project, one Issue in it, and an Agent granted that Project. */
async function workspaceWithAgent() {
  const { db, close } = testDb();
  closers.push(close);
  const admin = await memberContext(db, { role: "admin", name: "Ada" });
  const asAdmin = createRouterClient(router, { context: admin });
  const project = await asAdmin.projects.create({ key: "DEV", name: "deevy" });
  await asAdmin.issues.create({ projectKey: "DEV", title: "Ship the thing" });
  const agent = await agentContext(db, { sponsor: admin.member, grants: [project.id] });
  return { db, admin, asAdmin, agent, asAgent: createRouterClient(router, { context: agent }) };
}

describe("the Run lifecycle", () => {
  it("starts pending, so a triggered Run exists before the Agent says anything", async () => {
    const { asAgent } = await workspaceWithAgent();

    const run = await asAgent.runs.start({ issueKey: "DEV-1" });

    expect(run).toMatchObject({ issueKey: "DEV-1", status: "pending", trigger: "manual" });
    expect(run.startedAt).toBeNull();
  });
});
