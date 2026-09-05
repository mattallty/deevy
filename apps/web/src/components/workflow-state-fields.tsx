import type { ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OptionsSelect } from "@/components/options-select";

export const stateCategories = ["backlog", "active", "done"] as const;
export type StateCategory = (typeof stateCategories)[number];

/** A State as the Workflow editor holds it while it is being edited. */
export interface DraftState {
  /** Stable for the life of the draft: a new State has no id yet, and the sortable needs one. */
  uid: string;
  id?: string;
  name: string;
  isGate: boolean;
  category: StateCategory;
  documentName: string | null;
  documentTemplate: string | null;
  /** The Agent entering this State assigns the Issue to, and starts a Run for. */
  triggerAgentMemberId: string | null;
  /** The Humans this Gate names. Empty means any Human may decide it. */
  approverMemberIds: string[];
}

export function newDraftState(): DraftState {
  return {
    uid: crypto.randomUUID(),
    name: "New State",
    isGate: false,
    category: "active",
    documentName: null,
    documentTemplate: null,
    triggerAgentMemberId: null,
    approverMemberIds: [],
  };
}

export interface NamedMember {
  id: string;
  user: { name: string };
}

export interface StateFieldsProps {
  state: DraftState;
  /** Makes the ids unique when several States are on one page. */
  index: number;
  agents: NamedMember[];
  onEdit: (change: Partial<DraftState>) => void;
  /** The Document template control; the default is a plain Textarea. */
  renderTemplate?: (state: DraftState, onEdit: (change: Partial<DraftState>) => void) => ReactNode;
  /** The approvers control for a Gate (components/approvers-picker.tsx on the page). */
  renderApprovers: (state: DraftState, onEdit: (change: Partial<DraftState>) => void) => ReactNode;
  /** Lay the fields out in one column (a narrow card) rather than a wrapping row. */
  stacked?: boolean;
}

/**
 * The fields of one State, shared by the Workflow editor and the round-2 mockups
 * of it (docs/plans/ui-redesign-2.md slice H), so a layout can change without
 * the form changing under it. The accessible names are the test contract:
 * Name, Counts as, Gate, Document it asks for, Template for <State>, Assign an
 * Agent on entering, Approvers for <State> (the label; the picker is the caller's).
 */
export function StateFields({
  state,
  index,
  agents,
  onEdit,
  renderTemplate,
  renderApprovers,
  stacked = false,
}: StateFieldsProps) {
  const row = stacked ? "flex flex-col gap-3" : "flex flex-wrap items-end gap-3";
  return (
    <div className={row}>
      <div className="flex flex-1 flex-col gap-2">
        <Label htmlFor={`state-name-${index}`}>Name</Label>
        <Input
          id={`state-name-${index}`}
          value={state.name}
          onChange={(changed) => onEdit({ name: changed.target.value })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`state-category-${index}`}>Counts as</Label>
        <OptionsSelect
          id={`state-category-${index}`}
          className="w-32"
          value={state.category}
          onChange={(next) => onEdit({ category: next as StateCategory })}
          options={stateCategories.map((category) => ({ value: category, label: category }))}
        />
      </div>
      <div className="flex items-center gap-2 pb-2">
        <Checkbox
          id={`state-gate-${index}`}
          checked={state.isGate}
          onCheckedChange={(checked) => onEdit({ isGate: checked === true })}
        />
        <Label htmlFor={`state-gate-${index}`}>Gate</Label>
      </div>
      <div className="flex w-full flex-col gap-2">
        <Label htmlFor={`state-document-${index}`}>Document it asks for</Label>
        <Input
          id={`state-document-${index}`}
          value={state.documentName ?? ""}
          placeholder="intent, spec, plan… or nothing"
          onChange={(changed) => onEdit({ documentName: changed.target.value.trim() || null })}
        />
        {state.documentName ? (
          renderTemplate ? (
            renderTemplate(state, onEdit)
          ) : (
            <Textarea
              aria-label={`Template for ${state.name}`}
              rows={4}
              value={state.documentTemplate ?? ""}
              placeholder="## Problem"
              onChange={(changed) => onEdit({ documentTemplate: changed.target.value })}
            />
          )
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`state-agent-${index}`}>Assign an Agent on entering</Label>
        <OptionsSelect
          id={`state-agent-${index}`}
          className="w-48"
          value={state.triggerAgentMemberId ?? ""}
          onChange={(next) => onEdit({ triggerAgentMemberId: next || null })}
          options={[
            { value: "", label: "Nobody" },
            ...agents.map((agent) => ({ value: agent.id, label: agent.user.name })),
          ]}
        />
      </div>
      {state.isGate ? (
        <div className="flex w-full flex-col gap-2">
          <Label htmlFor={`state-approvers-${index}`}>Approvers for {state.name}</Label>
          <p className="text-xs text-muted-foreground">
            Naming nobody leaves it to any Human, which is the default.
          </p>
          {renderApprovers(state, onEdit)}
        </div>
      ) : null}
    </div>
  );
}
