import { run as runTable, type Db } from "@deevy/db";
import { createRouterClient } from "@orpc/server";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { router } from "../src/operations/index.ts";
import { isOpen } from "../src/runs.ts";
import { discardingJobQueue } from "../src/jobs.ts";
import { dueRunsQuery, sweepStaleRuns } from "../src/work.ts";
import { agentContext, memberContext, testDb } from "./helpers.ts";

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

const MINUTE = 60_000;

/** An admin, a Project with one Issue, and an Agent granted that Project. */
async function workspaceWithAgent() {
  const { db, close } = testDb();
  closers.push(close);
  const admin = await memberContext(db, { role: "admin", name: "Ada" });
  const asAdmin = createRouterClient(router, { context: admin });
  const project = await asAdmin.projects.create({ key: "DEV", name: "deevy" });
  await asAdmin.issues.create({ projectKey: "DEV", title: "Ship the thing" });
  const issue = await db.query.issue.findFirst({ where: { projectId: project.id } });
  if (!issue) throw new Error("the Issue was not created");
  const agent = await agentContext(db, { sponsor: admin.member, grants: [project.id] });
  return { db, workspaceId: admin.workspace.id, project, issue, agent };
}

type RunStatus = "pending" | "active" | "awaiting_input" | "completed";
interface Where {
  issueId: string;
  agentMemberId: string;
}

/** Runs whose last Activity was `silentMinutes` ago, straight into the table. */
async function seedRuns(
  db: Db,
  where: Where,
  count: number,
  silentMinutes: number,
  status: RunStatus = "active",
) {
  const ids = Array.from({ length: count }, () => crypto.randomUUID());
  await db.insert(runTable).values(
    ids.map((id) => ({
      id,
      ...where,
      trigger: "manual" as const,
      status,
      lastActivityAt: new Date(Date.now() - silentMinutes * MINUTE),
    })),
  );
  return ids;
}

async function seedRun(db: Db, where: Where, silentMinutes: number, status: RunStatus = "active") {
  const [id] = await seedRuns(db, where, 1, silentMinutes, status);
  return id as string;
}

/**
 * Counts the statements a sweep issues. Every Drizzle statement starts with
 * one of these calls, so the names recorded are the statements, in order.
 */
function countingDb(db: Db) {
  const statements: string[] = [];
  const starters = new Set([
    "select",
    "insert",
    "update",
    "delete",
    "run",
    "all",
    "get",
    "batch",
    "execute",
    "transaction",
  ]);
  const counted = new Proxy(db, {
    get(target, property) {
      const value = Reflect.get(target, property) as unknown;
      // `query` is the relational API: a sweep reaching for it is reading per
      // row, which is the one thing this design forbids.
      if (property === "query") statements.push("query");
      if (typeof property !== "string" || !starters.has(property)) return value;
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        statements.push(property);
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  }) as Db;
  return { counted, statements };
}

describe("the stale sweep", () => {
  it("moves a Run silent for longer than the window to stale, and says so in an Event", async () => {
    const { db, workspaceId, project, issue, agent } = await workspaceWithAgent();
    const runId = await seedRun(db, { issueId: issue.id, agentMemberId: agent.member.id }, 31);

    const result = await sweepStaleRuns({ db, workspaceId });
    expect(result).toEqual({ scanned: 1, changed: 1, more: false });
    const row = await db.query.run.findFirst({ where: { id: runId } });
    expect(row?.status).toBe("stale");
    // Stale is silence, not an ending: nothing is finished.
    expect(row?.finishedAt).toBeNull();
    const events = await db.query.event.findMany({ where: { kind: "run.went_stale" } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      workspaceId,
      subjectType: "run",
      subjectId: runId,
      projectId: project.id,
      // Nobody did this: silence is not the act of a Member.
      actorMemberId: null,
    });
  });

  it("is answered by the index the sweep was given, and sorts nothing", async () => {
    const { db, workspaceId } = await workspaceWithAgent();
    const query = dueRunsQuery(db, { workspaceId, cutoff: new Date(), limit: 50 });

    const plan = await db.all<{ detail: string }>(sql`EXPLAIN QUERY PLAN ${query.getSQL()}`);
    const detail = plan.map((step) => step.detail).join("\n");

    expect(detail).toContain("run USING INDEX run_status_lastActivityAt_idx");
    // A sort would visit every due Run before the LIMIT applied, so one pass
    // would cost the backlog instead of the limit.
    expect(detail).not.toContain("TEMP B-TREE");
    // The joins only follow primary keys; neither is a table scan.
    expect(detail).not.toContain("SCAN");
  });

  it("leaves alone what is still talking, what is finished, and what waits on a Human", async () => {
    const { db, workspaceId, issue, agent } = await workspaceWithAgent();
    const where = { issueId: issue.id, agentMemberId: agent.member.id };
    const fresh = await seedRun(db, where, 29);
    const done = await seedRun(db, where, 90, "completed");
    // A Run waiting on a Human is not a silent Agent, and only an
    // `awaiting_input` Run can be answered: sweeping it strands the answer.
    const waiting = await seedRun(db, where, 90, "awaiting_input");

    const result = await sweepStaleRuns({ db, workspaceId });

    expect(result).toEqual({ scanned: 0, changed: 0, more: false });
    const rows = await db.query.run.findMany();
    const status = new Map(rows.map((row) => [row.id, row.status]));
    expect(status.get(fresh)).toBe("active");
    expect(status.get(done)).toBe("completed");
    expect(status.get(waiting)).toBe("awaiting_input");
    expect(await db.query.event.findMany({ where: { kind: "run.went_stale" } })).toHaveLength(0);
  });

  it("leaves a swept Run open, because stale is recoverable and never terminal", async () => {
    const { db, workspaceId, issue, agent } = await workspaceWithAgent();
    const runId = await seedRun(db, { issueId: issue.id, agentMemberId: agent.member.id }, 31);

    await sweepStaleRuns({ db, workspaceId });

    const row = await db.query.run.findFirst({ where: { id: runId } });
    expect(isOpen(row?.status ?? "completed")).toBe(true);
    // The silence itself survives: the sweep is not the Agent speaking.
    expect(row?.lastActivityAt.getTime()).toBeLessThan(Date.now() - 30 * MINUTE);
  });

  it("costs the same handful of statements whatever the Workspace holds", async () => {
    const { db, workspaceId, issue, agent } = await workspaceWithAgent();
    await seedRuns(db, { issueId: issue.id, agentMemberId: agent.member.id }, 50, 31);
    const { counted, statements } = countingDb(db);

    const result = await sweepStaleRuns({ db: counted, workspaceId });

    expect(result).toEqual({ scanned: 50, changed: 50, more: true });
    // One indexed SELECT, one batched UPDATE, and the Events in chunks that
    // stay inside D1's hundred bound parameters per statement.
    expect(statements).toEqual(["select", "update", "insert", "insert", "insert"]);
  });

  it("costs what the limit says, not what the table holds", async () => {
    const { db, workspaceId, issue, agent } = await workspaceWithAgent();
    await seedRuns(db, { issueId: issue.id, agentMemberId: agent.member.id }, 50, 31);
    const { counted, statements } = countingDb(db);

    const first = await sweepStaleRuns({ db: counted, workspaceId, limit: 10 });

    expect(first).toEqual({ scanned: 10, changed: 10, more: true });
    expect(statements).toEqual(["select", "update", "insert"]);
    // `more` means run it again, never raise the limit: one pass has to fit
    // inside a Cloudflare Cron Trigger's CPU budget.
    let passes = 1;
    let result = first;
    while (result.more && passes < 10) {
      result = await sweepStaleRuns({ db, workspaceId, limit: 10 });
      passes += 1;
    }
    // Five passes move ten Runs each and a sixth finds nothing: a full pass
    // cannot know it was the last one without looking again.
    expect(passes).toBe(6);
    expect(result.more).toBe(false);
    expect(await db.query.event.findMany({ where: { kind: "run.went_stale" } })).toHaveLength(50);
  });
});

describe("the job queue port", () => {
  it("swallows the enqueue, because the durable row is the record and the queue is a hint", async () => {
    // A deployment with no queue still works: every sweep finds the same rows,
    // only later. What must never happen is a queue turning a successful write
    // into a failed request.
    await expect(
      discardingJobQueue().enqueue({ kind: "webhook.delivery", id: "d1" }),
    ).resolves.toBeUndefined();
  });
});
