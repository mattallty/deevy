// The stories for Sortable and its parts. Kept under lib/ with a non-component
// file name: a sibling named like an export is shimmed to the package by the
// story-imports plugin, so `export * from "./Sortable"` would re-export all of it.
import {
  Sortable,
  SortableContent,
  SortableItem,
  SortableItemHandle,
  SortableOverlay,
  StateBadge,
} from "@deevy/design-system";
import { GripVertical } from "lucide-react";
import { useState } from "react";
import { states } from "./fixtures";

type Draft = {
  uid: string;
  name: string;
  isGate: boolean;
  category: "backlog" | "active" | "done";
  dirty?: boolean;
};

const workflow: Draft[] = [
  { uid: "st_1", ...states.backlog },
  { uid: "st_2", ...states.todo },
  { uid: "st_3", ...states.inProgress },
  { uid: "st_4", ...states.review, dirty: true },
  { uid: "st_5", ...states.done },
];

function StateList({
  initial,
  currentUid,
  disabledUid,
}: {
  initial: Draft[];
  currentUid?: string;
  disabledUid?: string;
}) {
  const [draft, setDraft] = useState(initial);
  return (
    <Sortable value={draft} onValueChange={setDraft} getItemValue={(state) => state.uid}>
      <SortableContent asChild>
        <ul aria-label="States" className="flex w-64 flex-col gap-1">
          {draft.map((state, index) => (
            <SortableItem
              key={state.uid}
              value={state.uid}
              asChild
              {...(state.uid === disabledUid ? { disabled: true } : {})}
            >
              <li
                className={[
                  "flex items-center gap-1 rounded-md",
                  state.uid === currentUid ? "bg-accent" : "",
                ].join(" ")}
                {...(state.dirty ? { "data-dirty": "true" } : {})}
              >
                <SortableItemHandle
                  aria-label={`Drag ${state.name}`}
                  className="px-1.5 text-muted-foreground hover:text-foreground"
                >
                  <GripVertical className="size-4" />
                </SortableItemHandle>
                <button
                  type="button"
                  aria-label={`Edit ${state.name}`}
                  aria-current={state.uid === currentUid ? "true" : undefined}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm hover:bg-accent"
                >
                  <span className="w-4 font-mono text-xs text-muted-foreground">{index + 1}</span>
                  <StateBadge state={state} />
                  {state.dirty ? (
                    <span
                      aria-label="unsaved"
                      className="ml-auto size-1.5 shrink-0 rounded-full bg-gate"
                    />
                  ) : null}
                </button>
              </li>
            </SortableItem>
          ))}
        </ul>
      </SortableContent>
      <SortableOverlay />
    </Sortable>
  );
}

/** The Workflow editor's States, in order: a grip to drag, the step number in mono, the State, and an amber dot on one not yet saved. The selected one is highlighted. */
export const WorkflowStates = () => <StateList initial={workflow} currentUid="st_4" />;

/** A State that may not move: Done stays last. */
export const WithDisabledItem = () => (
  <StateList initial={workflow} currentUid="st_3" disabledUid="st_5" />
);

/** Horizontal: the Board's column order. */
export const Horizontal = () => {
  const [order, setOrder] = useState([states.todo, states.inProgress, states.review, states.done]);
  return (
    <Sortable
      value={order}
      onValueChange={setOrder}
      getItemValue={(state) => state.name}
      orientation="horizontal"
    >
      <SortableContent asChild>
        <ul aria-label="Columns" className="flex flex-wrap gap-2">
          {order.map((state) => (
            <SortableItem key={state.name} value={state.name} asChild>
              <li
                className={[
                  "flex items-center gap-1 rounded-md border bg-card py-1 pr-3 pl-1",
                  state.isGate ? "border-gate/40 bg-gate/5" : "",
                ].join(" ")}
              >
                <SortableItemHandle
                  aria-label={`Drag ${state.name}`}
                  className="px-1 text-muted-foreground hover:text-foreground"
                >
                  <GripVertical className="size-4" />
                </SortableItemHandle>
                <StateBadge state={state} />
              </li>
            </SortableItem>
          ))}
        </ul>
      </SortableContent>
      <SortableOverlay />
    </Sortable>
  );
};
