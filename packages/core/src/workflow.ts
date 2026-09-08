import {
  gateApprover as gateApproverTable,
  gateDecision as gateDecisionTable,
  issue as issueTable,
  member as memberTable,
  type Db,
  type Issue,
  type Member,
  type WorkflowState,
} from "@deevy/db";
import { ORPCError } from "@orpc/server";
import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { issueUrl } from "./slack.ts";
import { newId } from "./ids.ts";

/** A State as the default template describes it, before it belongs to a Project. */
export type WorkflowStateTemplate = Pick<
  WorkflowState,
  "name" | "position" | "isGate" | "category" | "documentName" | "documentTemplate"
>;

/**
 * The Document templates the playbook asks each of the first three States for
 * (docs/PLAN.md). They are headings rather than prose, so an Agent and a Human
 * fill in the same shape.
 */
const templates = {
  intent: [
    "## Problem",
    "",
    "## Proposed outcome",
    "",
    "## Affected users and systems",
    "",
    "## Constraints",
    "",
    "## Open questions",
    "",
  ].join("\n"),
  spec: ["## Requirements", "", "## Design", "", "## Flagged concerns", ""].join("\n"),
  plan: ["## Files that change", "", "## Order of work", "", "## Tests that prove it", ""].join(
    "\n",
  ),
};

/**
 * The default Workflow every new Project starts with (docs/PLAN.md): Intent,
 * Spec, Plan, Build, Review, Done, with Gates on leaving Intent, Spec, Plan and
 * Review. A team that wants Todo, Doing, Done deletes the middle.
 *
 * `category` is what tells a board and a list which Issues are open: an Issue
 * is active from the moment someone writes its Spec, since reaching Spec means
 * the Intent Gate accepted the work.
 */
export function defaultWorkflow(): WorkflowStateTemplate[] {
  return [
    {
      name: "Intent",
      position: 0,
      isGate: true,
      category: "backlog",
      documentName: "intent",
      documentTemplate: templates.intent,
    },
    {
      name: "Spec",
      position: 1,
      isGate: true,
      category: "active",
      documentName: "spec",
      documentTemplate: templates.spec,
    },
    {
      name: "Plan",
      position: 2,
      isGate: true,
      category: "active",
      documentName: "plan",
      documentTemplate: templates.plan,
    },
    {
      name: "Build",
      position: 3,
      isGate: false,
      category: "active",
      documentName: null,
      documentTemplate: null,
    },
    {
      name: "Review",
      position: 4,
      isGate: true,
      category: "active",
      documentName: null,
      documentTemplate: null,
    },
    {
      name: "Done",
      position: 5,
      isGate: false,
      category: "done",
      documentName: null,
      documentTemplate: null,
    },
  ];
}

/**
 * Moving an Issue into a State. A `done` State closes the Issue and leaving one
 * reopens it, so `closedAt` and the State's category never disagree
 * (docs/plans/m1.md). Every move stamps `stateEnteredAt`.
 */
export async function enterState(db: Db, issue: Issue, to: WorkflowState): Promise<void> {
  await db
    .update(issueTable)
    .set({
      stateId: to.id,
      stateEnteredAt: new Date(),
      closedAt: to.category === "done" ? (issue.closedAt ?? new Date()) : null,
      updatedAt: new Date(),
    })
    .where(eq(issueTable.id, issue.id));
}

/**
 * A Gate is a State an Issue cannot leave without a Human's approval
 * (CONTEXT.md), so a plain move out of one is refused and `gates.approve` or
 * `gates.reject` is the only way through.
 */
export function assertLeavable(from: WorkflowState, issueKey: string): void {
  if (!from.isGate) return;
  throw new ORPCError("FORBIDDEN", {
    message: `${issueKey} is in the ${from.name} Gate; approve or reject it`,
  });
}

/**
 * Only a Human rules on a Gate (ADR-0004). The check lives here rather than in
 * the registry so M2's Agents meet it without a new rule.
 */
export function assertHuman(member: Pick<Member, "kind">): void {
  if (member.kind === "agent") {
    throw new ORPCError("FORBIDDEN", { message: "Only a Human can decide a Gate" });
  }
}

/**
 * The Humans a Gate names, in no particular order. Empty is M1's behaviour and
 * the default: any Human may decide it (schema/gate.ts). Naming approvers
 * narrows both who is asked and who may answer.
 */
export async function gateApprovers(db: Db, stateId: string): Promise<string[]> {
  const rows = await db
    .select({ memberId: gateApproverTable.memberId })
    .from(gateApproverTable)
    .where(eq(gateApproverTable.stateId, stateId));
  return rows.map((row) => row.memberId);
}

/**
 * A named list narrows who may decide; an empty one narrows nothing. ADR-0004
 * keeps every Agent out either way, which `assertHuman` says first.
 */
export function assertNamedApprover(approvers: string[], memberId: string): void {
  if (approvers.length === 0 || approvers.includes(memberId)) return;
  throw new ORPCError("FORBIDDEN", {
    message: "This Gate names its approvers, and you are not one of them",
  });
}

/**
 * The Humans who could rule on this Gate: the ones it names, or every Human of
 * the Workspace when it names none, less the suspended and less whoever is
 * being left out. It is one function because four callers need the same answer
 * and disagreeing about it is how a Gate becomes unopenable — the inbox asks
 * who to tell, `workflow.update` asks whether a threshold can ever be met,
 * `gates.approve` asks whether this Human counts, and the Issue page asks what
 * to say (docs/plans/four-eyes-gates.md).
 *
 * `named` is passed in rather than read here because `workflow.update` asks
 * about a list it has not written yet.
 */
export async function eligibleApprovers(
  db: Db,
  input: { workspaceId: string; named: string[]; exclude?: string | null },
): Promise<string[]> {
  const rows = await db
    .select({ id: memberTable.id })
    .from(memberTable)
    .where(
      and(
        eq(memberTable.workspaceId, input.workspaceId),
        eq(memberTable.kind, "human"),
        isNull(memberTable.suspendedAt),
        input.exclude ? ne(memberTable.id, input.exclude) : undefined,
        input.named.length > 0 ? inArray(memberTable.id, input.named) : undefined,
      ),
    );
  return rows.map((row) => row.id);
}

/**
 * The distinct Humans who have approved this Gate during the Issue's current
 * visit to it, oldest first.
 *
 * A visit begins when the Issue enters the State, and begins again at every
 * rejection: a rejection is the answer, so approvals given before it are spent
 * whether or not the Issue moved. That second half matters because a rejection
 * in the first State has nowhere to send the Issue and so does not stamp
 * `stateEnteredAt` — without it, a Gate a Human had just rejected would open on
 * the next approval. Approvals do not begin a visit; they accumulate within one.
 *
 * A decision whose Member has been deleted counts for nobody: `memberId` is
 * `set null` on delete (schema/gate.ts), and a Gate must not be held open on
 * behalf of a Member who is gone.
 */
export async function approvalsThisVisit(
  db: Db,
  issue: Pick<Issue, "id" | "stateEnteredAt">,
  stateId: string,
): Promise<string[]> {
  const rows = await db
    .select({
      memberId: gateDecisionTable.memberId,
      decision: gateDecisionTable.decision,
      createdAt: gateDecisionTable.createdAt,
    })
    .from(gateDecisionTable)
    .where(and(eq(gateDecisionTable.issueId, issue.id), eq(gateDecisionTable.stateId, stateId)))
    .orderBy(asc(gateDecisionTable.createdAt));

  const approvals: string[] = [];
  for (const row of rows) {
    if (row.createdAt < issue.stateEnteredAt) continue;
    if (row.decision === "rejected") {
      approvals.length = 0;
      continue;
    }
    if (row.memberId && !approvals.includes(row.memberId)) approvals.push(row.memberId);
  }
  return approvals;
}

/**
 * The Issue's page with this Gate in focus: the link an Agent hands a Human
 * when it reaches a Gate mid-Run (docs/plans/m2.md). The SPA reads `?gate=`
 * and scrolls to it.
 */
export function gateUrl(baseUrl: string, key: string, stateId: string): string {
  return `${issueUrl(baseUrl, key)}?gate=${encodeURIComponent(stateId)}`;
}

/** The State an approval moves to: the next by position, or none when the Gate is last. */
export function nextState(states: WorkflowState[], from: WorkflowState): WorkflowState | null {
  const ordered = [...states].sort((a, b) => a.position - b.position);
  const at = ordered.findIndex((state) => state.id === from.id);
  return ordered[at + 1] ?? null;
}

/** The State a rejection returns to: the previous by position, or the Gate itself when it is first. */
export function previousState(states: WorkflowState[], from: WorkflowState): WorkflowState {
  const ordered = [...states].sort((a, b) => a.position - b.position);
  const at = ordered.findIndex((state) => state.id === from.id);
  return ordered[at - 1] ?? from;
}

export interface RecordDecisionInput {
  issueId: string;
  stateId: string;
  decision: (typeof import("@deevy/db").gateDecisions)[number];
  note?: string | null;
  memberId: string;
}

export async function recordGateDecision(db: Db, input: RecordDecisionInput): Promise<void> {
  await db.insert(gateDecisionTable).values({
    id: newId("decision"),
    issueId: input.issueId,
    stateId: input.stateId,
    decision: input.decision,
    note: input.note ?? null,
    memberId: input.memberId,
  });
}
