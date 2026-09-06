import { ApproversPicker, StateFields } from "@deevy/design-system";
import { useState } from "react";
import { ada, builder, grace, planner } from "./lib/fixtures";

type DraftState = Parameters<typeof StateFields>[0]["state"];

const agents = [planner, builder];
const humans = [ada, grace];

const inProgress: DraftState = {
  uid: "draft-1",
  id: "st_inprogress01",
  name: "In progress",
  isGate: false,
  category: "active",
  documentName: null,
  documentTemplate: null,
  triggerAgentMemberId: builder.id,
  approverMemberIds: [],
};

const review: DraftState = {
  uid: "draft-2",
  id: "st_review00001",
  name: "Review",
  isGate: true,
  category: "active",
  documentName: "spec",
  documentTemplate: "## Problem\n\n## Proposal\n",
  triggerAgentMemberId: null,
  approverMemberIds: [ada.id],
};

const useDraft = (initial: DraftState) => {
  const [state, setState] = useState(initial);
  const onEdit = (change: Partial<DraftState>) => setState((prev) => ({ ...prev, ...change }));
  return { state, onEdit };
};

const approvers = (index: number) => (state: DraftState, onEdit: (change: object) => void) => (
  <ApproversPicker
    id={`state-approvers-${index}`}
    humans={humans}
    value={state.approverMemberIds}
    onChange={(approverMemberIds) => onEdit({ approverMemberIds })}
  />
);

/** A plain State: name, what it counts as, and the Agent that takes the Issue on entering. */
export const PlainState = () => {
  const { state, onEdit } = useDraft(inProgress);
  return (
    <div className="w-[36rem]">
      <StateFields
        state={state}
        index={1}
        agents={agents}
        onEdit={onEdit}
        renderApprovers={approvers(1)}
      />
    </div>
  );
};

/** A Gate: it asks for a Document with a template, and names the Humans who may decide it. */
export const Gate = () => {
  const { state, onEdit } = useDraft(review);
  return (
    <div className="w-[36rem]">
      <StateFields
        state={state}
        index={2}
        agents={agents}
        onEdit={onEdit}
        renderApprovers={approvers(2)}
      />
    </div>
  );
};

/** The same Gate in one column, for a narrow card. */
export const Stacked = () => {
  const { state, onEdit } = useDraft(review);
  return (
    <div className="w-72">
      <StateFields
        state={state}
        index={3}
        agents={agents}
        onEdit={onEdit}
        renderApprovers={approvers(3)}
        stacked
      />
    </div>
  );
};
