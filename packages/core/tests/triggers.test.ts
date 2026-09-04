import { createRouterClient } from "@orpc/server";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { router } from "../src/operations/index.ts";
import { agentContext, memberContext, testDb } from "./helpers.ts";

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

/** An admin, a Project, DEV-1, and an Agent `@planner` granted that Project. */
async function workspaceWithAgent() {
  const { db, close } = testDb();
  closers.push(close);
  const admin = await memberContext(db, { role: "admin", name: "Ada" });
  const asAdmin = createRouterClient(router, { context: admin });
  const project = await asAdmin.projects.create({ key: "DEV", name: "deevy" });
  await asAdmin.issues.create({ projectKey: "DEV", title: "Ship the thing" });
  const agent = await agentContext(db, { sponsor: admin.member, grants: [project.id] });
  return { db, admin, asAdmin, project, agent };
}

describe("the assignment trigger", () => {
  it("creates one pending Run when an Issue is assigned to an Agent", async () => {
    const { db, asAdmin, agent } = await workspaceWithAgent();

    await asAdmin.issues.update({ key: "DEV-1", assigneeMemberId: agent.member.id });

    const runs = await db.query.run.findMany();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      agentMemberId: agent.member.id,
      trigger: "assignment",
      status: "pending",
    });
  });
});
