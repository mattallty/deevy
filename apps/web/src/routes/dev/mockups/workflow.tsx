import { ArrowDown, ArrowRight, ArrowUp, GripVertical, Trash2, X } from "lucide-react";
import { useState } from "react";
import {
  Sortable,
  SortableContent,
  SortableItem,
  SortableItemHandle,
  SortableOverlay,
} from "@/components/diceui/sortable";
import { MarkdownEditor } from "@/components/markdown-editor";
import { MemberChip } from "@/components/member-chip";
import { StateBadge } from "@/components/state-badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { StateFields, type DraftState } from "@/components/workflow-state-fields";
import { ada, builder, grace, planner } from "@/dev/fixtures";
import { cn } from "@/lib/utils";
import { Variant } from "../mockups";

const humans = [ada, grace];
const agents = [planner, builder];
const template = `## Problem\n\nWhat is wrong for whom, in one paragraph.\n\n## Proposed outcome\n\n- The observable change\n- What stays as it is\n\n## Constraints\n\n| Constraint | Why |\n| --- | --- |\n| No schema change | D1 has no transactions |\n\n## Open questions\n\n1. …`;
const initial: DraftState[] = [
  {
    uid: "1",
    id: "1",
    name: "Intent",
    isGate: true,
    category: "backlog",
    documentName: "intent",
    documentTemplate: template,
    triggerAgentMemberId: null,
    approverMemberIds: [ada.id],
  },
  {
    uid: "2",
    id: "2",
    name: "Spec",
    isGate: true,
    category: "active",
    documentName: "spec",
    documentTemplate: "## Scope\n\n## Out of scope\n",
    triggerAgentMemberId: planner.id,
    approverMemberIds: [],
  },
  {
    uid: "3",
    id: "3",
    name: "Plan",
    isGate: false,
    category: "active",
    documentName: "plan",
    documentTemplate: "## Steps\n\n1. ",
    triggerAgentMemberId: planner.id,
    approverMemberIds: [],
  },
  {
    uid: "4",
    id: "4",
    name: "Build",
    isGate: false,
    category: "active",
    documentName: null,
    documentTemplate: null,
    triggerAgentMemberId: builder.id,
    approverMemberIds: [],
  },
  {
    uid: "5",
    id: "5",
    name: "Review",
    isGate: true,
    category: "active",
    documentName: null,
    documentTemplate: null,
    triggerAgentMemberId: null,
    approverMemberIds: [ada.id, grace.id],
  },
  {
    uid: "6",
    id: "6",
    name: "Done",
    isGate: false,
    category: "done",
    documentName: null,
    documentTemplate: null,
    triggerAgentMemberId: null,
    approverMemberIds: [],
  },
];

function useDraft() {
  const [draft, setDraft] = useState(initial);
  const edit = (uid: string, change: Partial<DraftState>) =>
    setDraft(draft.map((state) => (state.uid === uid ? { ...state, ...change } : state)));
  const swap = (at: number, to: number) => {
    if (to < 0 || to >= draft.length) return;
    const next = [...draft];
    [next[at], next[to]] = [next[to]!, next[at]!];
    setDraft(next);
  };
  const changes = draft.filter((state, index) => state !== initial[index]).length;
  return { draft, setDraft, edit, swap, changes };
}

/** A preview of the approvers combobox slice H builds: chips and a typing box, labelled as today. */
function ApproverChips({
  state,
  onEdit,
}: {
  state: DraftState;
  onEdit: (change: Partial<DraftState>) => void;
}) {
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-2 py-1">
      {state.approverMemberIds.map((id) => {
        const human = humans.find((candidate) => candidate.id === id);
        return human ? (
          <span
            key={id}
            className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-xs"
          >
            <MemberChip member={human} size="xs" />
            <button
              type="button"
              aria-label={`Remove ${human.user.name}`}
              className="text-muted-foreground hover:text-foreground"
              onClick={() =>
                onEdit({
                  approverMemberIds: state.approverMemberIds.filter(
                    (candidate) => candidate !== id,
                  ),
                })
              }
            >
              <X className="size-3" />
            </button>
          </span>
        ) : null;
      })}
      <input
        aria-label={`Approvers for ${state.name}`}
        placeholder={state.approverMemberIds.length ? "Add…" : "Any Human may decide; name some…"}
        className="min-w-32 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        readOnly
      />
    </div>
  );
}

function Template({
  state,
  onEdit,
}: {
  state: DraftState;
  onEdit: (change: Partial<DraftState>) => void;
}) {
  return (
    <div className="max-h-80 overflow-y-auto rounded-md border">
      <MarkdownEditor
        mode="block"
        aria-label={`Template for ${state.name}`}
        value={state.documentTemplate ?? ""}
        onChange={(next) => onEdit({ documentTemplate: next })}
        rows={6}
        placeholder="## Problem"
      />
    </div>
  );
}

function Footer({ changes }: { changes: number }) {
  return (
    <div className="sticky bottom-0 mt-3 flex items-center gap-3 border-t bg-background/95 py-3 text-sm backdrop-blur">
      <span className="text-muted-foreground">
        {changes === 0
          ? "No changes"
          : `${changes} unsaved ${changes === 1 ? "change" : "changes"}`}
      </span>
      <span className="flex-1" />
      <Button variant="ghost" size="sm" disabled={changes === 0}>
        Reset
      </Button>
      <Button size="sm" disabled={changes === 0}>
        Save Workflow
      </Button>
    </div>
  );
}

function OrderStrip({ draft }: { draft: DraftState[] }) {
  return (
    <ol aria-label="Order" className="flex flex-wrap items-center gap-1.5 text-sm">
      {draft.map((state, index) => (
        <li key={state.uid} className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-muted-foreground">{index + 1}</span>
          <StateBadge state={state} />
          {index < draft.length - 1 ? (
            <ArrowRight className="size-3.5 text-muted-foreground/60" aria-hidden />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function Stepper() {
  const { draft, setDraft, edit, swap, changes } = useDraft();
  return (
    <div className="flex flex-col gap-4">
      <OrderStrip draft={draft} />
      <Sortable value={draft} onValueChange={setDraft} getItemValue={(state) => state.uid}>
        <SortableContent asChild>
          <ul aria-label="States" className="flex flex-col">
            {draft.map((state, index) => (
              <SortableItem key={state.uid} value={state.uid} asChild>
                <li className="grid grid-cols-[2.5rem_1fr] gap-3 pb-4">
                  <div className="flex flex-col items-center gap-1">
                    <span
                      className={cn(
                        "grid size-6 place-items-center rounded-full border font-mono text-xs",
                        state.isGate
                          ? "border-gate bg-gate/15 text-gate-foreground dark:text-gate"
                          : "bg-muted",
                      )}
                    >
                      {index + 1}
                    </span>
                    <SortableItemHandle
                      aria-label={`Drag ${state.name}`}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <GripVertical className="size-4" />
                    </SortableItemHandle>
                    {index < draft.length - 1 ? (
                      <span aria-hidden className="w-px flex-1 bg-border" />
                    ) : null}
                  </div>
                  <div
                    className={cn(
                      "flex flex-col gap-3 rounded-lg border bg-card p-3",
                      state.isGate && "border-gate/40 bg-gate/5",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <StateBadge state={state} />
                      <span className="font-mono text-xs text-muted-foreground">
                        Step {index + 1}
                      </span>
                      <span className="flex-1" />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Move ${state.name} up`}
                        onClick={() => swap(index, index - 1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Move ${state.name} down`}
                        onClick={() => swap(index, index + 1)}
                      >
                        <ArrowDown />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Delete ${state.name}`}>
                        <Trash2 />
                      </Button>
                    </div>
                    <StateFields
                      state={state}
                      index={index}
                      humans={humans}
                      agents={agents}
                      onEdit={(change) => edit(state.uid, change)}
                      renderTemplate={(s, onEdit) => <Template state={s} onEdit={onEdit} />}
                      renderApprovers={(s, onEdit) => <ApproverChips state={s} onEdit={onEdit} />}
                    />
                  </div>
                </li>
              </SortableItem>
            ))}
          </ul>
        </SortableContent>
        <SortableOverlay />
      </Sortable>
      <Footer changes={changes} />
    </div>
  );
}

function Pipeline() {
  const { draft, setDraft, edit, changes } = useDraft();
  return (
    <div className="flex flex-col gap-4">
      <Sortable
        value={draft}
        onValueChange={setDraft}
        getItemValue={(state) => state.uid}
        orientation="horizontal"
      >
        <SortableContent asChild>
          <ul aria-label="States" className="flex gap-3 overflow-x-auto pb-2">
            {draft.map((state, index) => (
              <SortableItem key={state.uid} value={state.uid} asChild>
                <li
                  className={cn(
                    "relative flex w-72 shrink-0 flex-col gap-3 rounded-lg border bg-card p-3",
                    state.isGate && "border-gate/40 bg-gate/5",
                  )}
                >
                  {index < draft.length - 1 ? (
                    <ArrowRight
                      aria-hidden
                      className="absolute top-4 -right-3 z-10 size-4 text-muted-foreground/60"
                    />
                  ) : null}
                  <div className="flex items-center gap-2">
                    <SortableItemHandle
                      aria-label={`Drag ${state.name}`}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <GripVertical className="size-4" />
                    </SortableItemHandle>
                    <span className="font-mono text-xs text-muted-foreground">{index + 1}</span>
                    <StateBadge state={state} />
                  </div>
                  <StateFields
                    stacked
                    state={state}
                    index={index + 100}
                    humans={humans}
                    agents={agents}
                    onEdit={(change) => edit(state.uid, change)}
                    renderTemplate={() => (
                      <Button variant="outline" size="sm" className="self-start">
                        Edit template…
                      </Button>
                    )}
                    renderApprovers={(s, onEdit) => <ApproverChips state={s} onEdit={onEdit} />}
                  />
                </li>
              </SortableItem>
            ))}
          </ul>
        </SortableContent>
        <SortableOverlay />
      </Sortable>
      <Footer changes={changes} />
    </div>
  );
}

function MasterDetail() {
  const { draft, edit, swap, changes } = useDraft();
  const [selected, setSelected] = useState(draft[0]!.uid);
  const current = draft.find((state) => state.uid === selected) ?? draft[0]!;
  const at = draft.indexOf(current);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <ul aria-label="States" className="flex flex-col gap-1">
          {draft.map((state, index) => (
            <li key={state.uid}>
              <button
                type="button"
                aria-current={state.uid === selected ? "true" : undefined}
                onClick={() => setSelected(state.uid)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                  state.uid === selected && "bg-accent",
                )}
              >
                <GripVertical className="size-4 text-muted-foreground" />
                <span className="w-4 font-mono text-xs text-muted-foreground">{index + 1}</span>
                <StateBadge state={state} />
              </button>
            </li>
          ))}
        </ul>
        <form
          aria-label={current.name}
          className={cn(
            "flex flex-col gap-3 rounded-lg border bg-card p-4",
            current.isGate && "border-gate/40 bg-gate/5",
          )}
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="flex items-center gap-3">
            <StateBadge state={current} size="md" />
            <span className="font-mono text-xs text-muted-foreground">Step {at + 1}</span>
            <span className="flex-1" />
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Move ${current.name} up`}
              onClick={() => swap(at, at - 1)}
            >
              <ArrowUp />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Move ${current.name} down`}
              onClick={() => swap(at, at + 1)}
            >
              <ArrowDown />
            </Button>
            <Button variant="ghost" size="icon" aria-label={`Delete ${current.name}`}>
              <Trash2 />
            </Button>
          </div>
          <StateFields
            state={current}
            index={200}
            humans={humans}
            agents={agents}
            onEdit={(change) => edit(current.uid, change)}
            renderTemplate={(s, onEdit) => <Template state={s} onEdit={onEdit} />}
            renderApprovers={(s, onEdit) => <ApproverChips state={s} onEdit={onEdit} />}
          />
        </form>
      </div>
      <Footer changes={changes} />
    </div>
  );
}

const variants = [
  {
    id: "stepper",
    n: 1,
    title: "Vertical stepper",
    note: "A live Order strip on top, then one card per State on a numbered rail: drag the handle, or the arrows. Every State's rules stay visible; the template gets the editor at full width; Gate cards are amber. Recommended.",
    View: Stepper,
  },
  {
    id: "pipeline",
    n: 2,
    title: "Horizontal pipeline",
    note: "Board-like columns with arrows between them, dragged sideways. Reads as a pipeline, but eight columns never fit at 1280 and the template has to open elsewhere.",
    View: Pipeline,
  },
  {
    id: "master",
    n: 3,
    title: "Master–detail",
    note: "A compact reorderable list on the left; the chosen State's whole form on the right. Densest, best for long templates, and shows one State's rules at a time.",
    View: MasterDetail,
  },
] as const;

export function WorkflowMockups() {
  const [shown, setShown] = useState<(typeof variants)[number]["id"]>("stepper");
  const variant = variants.find((candidate) => candidate.id === shown) ?? variants[0];
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup
          value={[shown]}
          onValueChange={(next: string[]) => next[0] && setShown(next[0] as typeof shown)}
          variant="outline"
          spacing={0}
          aria-label="Layout"
        >
          {variants.map((candidate) => (
            <ToggleGroupItem key={candidate.id} value={candidate.id}>
              {candidate.title}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <span className="text-sm text-muted-foreground">
          One at a time: each holds a live editor. The approvers box is a preview of the combobox;
          the template is the real editor.
        </span>
      </div>
      <Variant n={variant.n} title={variant.title} note={variant.note}>
        <variant.View key={variant.id} />
      </Variant>
    </>
  );
}
