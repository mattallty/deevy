import { Checkbox, Label } from "@deevy/design-system";

/** 16px box beside a Label; the Workflow editor's "Gate" toggle. */
export const WithLabel = () => (
  <div className="flex items-center gap-2">
    <Checkbox id="checkbox-gate" />
    <Label htmlFor="checkbox-gate">Gate</Label>
  </div>
);

/** Checked fills in the action colour with a white check. */
export const Checked = () => (
  <div className="flex items-center gap-2">
    <Checkbox id="checkbox-inbox" defaultChecked />
    <Label htmlFor="checkbox-inbox">Deliver to the inbox</Label>
  </div>
);

export const Disabled = () => (
  <div className="flex flex-col gap-3">
    <div className="flex items-center gap-2">
      <Checkbox id="checkbox-off" disabled />
      <Label htmlFor="checkbox-off">Post to Slack</Label>
    </div>
    <div className="flex items-center gap-2">
      <Checkbox id="checkbox-on" disabled defaultChecked />
      <Label htmlFor="checkbox-on">Deliver to the inbox</Label>
    </div>
  </div>
);

/** A column of choices, as the notification settings lay them out. */
export const Group = () => (
  <div className="flex flex-col gap-3">
    <div className="flex items-center gap-2">
      <Checkbox id="checkbox-assigned" defaultChecked />
      <Label htmlFor="checkbox-assigned">An Issue is assigned to me</Label>
    </div>
    <div className="flex items-center gap-2">
      <Checkbox id="checkbox-gate-open" defaultChecked />
      <Label htmlFor="checkbox-gate-open">A Gate waits for my ruling</Label>
    </div>
    <div className="flex items-center gap-2">
      <Checkbox id="checkbox-run-failed" />
      <Label htmlFor="checkbox-run-failed">A Run of my Agent fails</Label>
    </div>
    <div className="flex items-center gap-2">
      <Checkbox id="checkbox-mention" aria-invalid />
      <Label htmlFor="checkbox-mention">A Member mentions me</Label>
    </div>
  </div>
);
