import {
  gateApprover as gateApproverTable,
  gateDecision as gateDecisionTable,
  issue as issueTable,
  type Db,
  type Issue,
  type Member,
  type WorkflowState,
} from "@deevy/db";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { issueUrl } from "./slack.ts";

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
    id: crypto.randomUUID(),
    issueId: input.issueId,
    stateId: input.stateId,
    decision: input.decision,
    note: input.note ?? null,
    memberId: input.memberId,
  });
}
