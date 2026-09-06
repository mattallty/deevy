import { Checkbox, Input, Label } from "@deevy/design-system";

/** 14px medium, tight leading; `htmlFor` ties it to the control below. */
export const Default = () => (
  <div className="flex w-full max-w-sm flex-col gap-2">
    <Label htmlFor="label-name">Name</Label>
    <Input id="label-name" defaultValue="Agent loop" />
  </div>
);

/** A required mark, and a hint in the same row pushed to the end. */
export const WithHint = () => (
  <div className="flex w-full max-w-sm flex-col gap-2">
    <Label htmlFor="label-key">
      Project key
      <span className="text-destructive" aria-hidden>
        *
      </span>
      <span className="ml-auto text-xs font-normal text-muted-foreground">2–5 letters</span>
    </Label>
    <Input id="label-key" placeholder="DEV" className="font-mono uppercase" />
  </div>
);

/** Beside a Checkbox the Label is the click target for the box. */
export const Inline = () => (
  <div className="flex items-center gap-2">
    <Checkbox id="label-gate" defaultChecked />
    <Label htmlFor="label-gate">Gate</Label>
  </div>
);

/** Inside a `group` marked `data-disabled`, the Label dims to half and stops taking clicks. */
export const Disabled = () => (
  <div className="group flex items-center gap-2" data-disabled="true">
    <Checkbox id="label-disabled" disabled />
    <Label htmlFor="label-disabled">Allow Agents to close Issues</Label>
  </div>
);
