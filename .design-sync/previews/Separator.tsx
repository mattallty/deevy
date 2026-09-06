import { Separator } from "@deevy/design-system";

/** A line between two blocks of text. */
export const Horizontal = () => (
  <div className="flex max-w-md flex-col gap-3">
    <div className="flex flex-col gap-1">
      <span className="font-medium">Add ruling authority to Gate</span>
      <span className="text-muted-foreground">DEV-42 · Review · assigned to Ada Lovelace</span>
    </div>
    <Separator />
    <div className="flex flex-col gap-1">
      <span className="font-medium">Stream Events to the inbox without polling</span>
      <span className="text-muted-foreground">DEV-41 · In progress · assigned to Builder</span>
    </div>
  </div>
);

/** Between facts in one row; the separator stretches to the row's height. */
export const Vertical = () => (
  <div className="flex h-5 items-center gap-3 text-muted-foreground">
    <span className="font-mono text-xs">DEV-42</span>
    <Separator orientation="vertical" />
    <span>Review</span>
    <Separator orientation="vertical" />
    <span>Ada Lovelace</span>
    <Separator orientation="vertical" />
    <span className="font-mono text-xs">2h</span>
  </div>
);

/** Both inside a Run's header: the title above, the facts under it. */
export const InAHeader = () => (
  <div className="flex max-w-md flex-col gap-2">
    <span className="font-medium">Run on DEV-41</span>
    <Separator />
    <div className="flex h-5 items-center gap-3 text-muted-foreground">
      <span>Builder</span>
      <Separator orientation="vertical" />
      <span>Completed</span>
      <Separator orientation="vertical" />
      <span className="font-mono text-xs">14 min</span>
    </div>
  </div>
);
