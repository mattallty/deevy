import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeevyError, type Deevy, type Run } from "./deevy.ts";
import { deevyIsReachable, type Session } from "./session.ts";

export interface WorkResult {
  runId: string;
  issueKey: string;
  /** The Run's status when the runtime let go of it, read back from deevy. */
  status: Run["status"];
  /** Set when the supervisor finished the Run itself, and why. */
  failedBy?: string;
}

export interface Pass {
  /** Runs this pass drove to a conclusion, in the order it took them. */
  worked: WorkResult[];
  /** Runs waiting on a Human. Slice 7 acts on these; this pass only counts them. */
  waiting: Run[];
  /** Issues taken up from the inbox this pass. */
  takenUp: string[];
}

export interface WorkOptions {
  deevy: Deevy;
  session: Session;
  /** Aborted when the process is stopping, on top of each Run's own timeout. */
  signal?: AbortSignal;
  runTimeoutMs: number;
}

/**
 * One prompt for one Run.
 *
 * Deliberately thin. How to work an Issue is the instructions the session
 * carries (docs/agent-loop.md), which are the same on every Run; what changes
 * is which Run this is, and the model reads the rest for itself over MCP.
 */
export function promptFor(run: Run): string {
  return [
    `Work Run ${run.id} on Issue ${run.issueKey}.`,
    `It was opened by a ${run.trigger} trigger.`,
    "Read the Issue and the Document its State asks for before you write anything.",
  ].join(" ");
}

/**
 * One pass: take up what the inbox is holding, work every Run that is ours to
 * drive, and report what is waiting on a Human.
 *
 * Nothing is remembered between passes. The queue is `runs.list`, the claim is
 * deevy's one-open-Run-per-Issue rule, and the inbox is cleared server-side —
 * so a fresh process, a restarted container and a second host all behave the
 * same as the pass before (docs/plans/m4.md).
 */
export async function runOnce(options: WorkOptions): Promise<Pass> {
  const { deevy } = options;
  const takenUp = await takeUpAssignments(deevy);

  const worked: WorkResult[] = [];
  for (const run of await deevy.runs("pending")) {
    if (options.signal?.aborted) break;
    worked.push(await workRun(options, run));
  }

  return { worked, waiting: await deevy.runs("awaiting_input"), takenUp };
}

/**
 * The inbox half of ADR-0003's polling fallback: an `assignment` Notification
 * names an Issue this Agent is expected to work.
 *
 * A Run is opened before the Notification is cleared, so a crash in between
 * leaves the work findable rather than read and forgotten. `CONFLICT` is not a
 * failure — it is deevy saying the Issue already has an open Run, which is the
 * answer that makes two hosts sharing one key safe.
 */
async function takeUpAssignments(deevy: Deevy): Promise<string[]> {
  const taken: string[] = [];
  const clear: string[] = [];
  for (const notification of await deevy.unread()) {
    if (notification.kind !== "assignment" || !notification.issue) continue;
    const issueKey = notification.issue.key;
    try {
      await deevy.startRun(issueKey);
      taken.push(issueKey);
    } catch (error) {
      if (!(error instanceof DeevyError) || error.code !== "CONFLICT") throw error;
    }
    clear.push(notification.id);
  }
  await deevy.markRead(clear);
  return taken;
}

/**
 * Drive one Run, and leave it in a state that says what happened.
 *
 * The supervisor narrates nothing the model could narrate: the instructions
 * tell it to post its own Activities, and two accounts of one Run is worse than
 * one. What the supervisor writes is the envelope — the Activity and the
 * ending a session that crashed, hung or simply stopped could not write for
 * itself, because a Run left `active` and silent tells a Human nothing until
 * the sweep calls it `stale` half an hour later.
 */
export async function workRun(options: WorkOptions, run: Run): Promise<WorkResult> {
  const { deevy, session, runTimeoutMs } = options;

  // Only a `pending` Run is taken up. deevy moves a Run to `active` on its first
  // Activity, so an `active` one is being driven by whoever posted it. The
  // window between listing and posting is not closed by this, and one service
  // per key is the supported shape; what this does close is the common case.
  if (run.status !== "pending") {
    return { runId: run.id, issueKey: run.issueKey, status: run.status };
  }

  const cwd = await mkdtemp(join(tmpdir(), "deevy-run-"));
  const timeout = AbortSignal.timeout(runTimeoutMs);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  let failure: string | null = null;

  try {
    for await (const event of session({ prompt: promptFor(run), cwd, signal })) {
      if (event.type === "ready" && !deevyIsReachable(event)) {
        // A session that cannot reach deevy has no way to read the Issue or
        // record what it did, and will fill the gap by guessing. Stop here,
        // before a token is spent on it.
        failure = "The session could not reach deevy, so it was stopped before it started";
        break;
      }
      if (event.type === "done" && !event.ok) failure = event.detail;
    }
  } catch (error) {
    failure = describe(error, timeout.aborted ? "The session ran past its timeout" : null);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }

  // deevy writes before it answers, so what the session managed to do counts
  // whatever it reported (docs/agent-loop.md). Ask deevy rather than believe
  // the session: a Run it finished is finished, and one it left open is the
  // supervisor's to close.
  const settled = await deevy.run(run.id);
  if (settled.status === "completed" || settled.status === "failed") {
    return { runId: run.id, issueKey: run.issueKey, status: settled.status };
  }
  if (settled.status === "awaiting_input") {
    return { runId: run.id, issueKey: run.issueKey, status: settled.status };
  }

  const detail = failure ?? "The session ended without finishing this Run";
  await close(deevy, run.id, detail);
  return {
    runId: run.id,
    issueKey: run.issueKey,
    status: (await deevy.run(run.id)).status,
    failedBy: detail,
  };
}

/**
 * The envelope's two writes, each attempted whatever the other did. Failing to
 * say why is not a reason to leave the Run open, and failing to close it is not
 * a reason to lose the explanation.
 */
async function close(deevy: Deevy, runId: string, detail: string): Promise<void> {
  await deevy.postActivity(runId, "error", detail).catch(() => undefined);
  await deevy.finishRun(runId, "failed", detail).catch(() => undefined);
}

function describe(error: unknown, instead: string | null): string {
  if (instead) return instead;
  if (error instanceof Error) return `The session stopped: ${error.message}`;
  return "The session stopped for a reason it did not give";
}
