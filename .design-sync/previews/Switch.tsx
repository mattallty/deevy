import { Label, Switch } from "@deevy/design-system";

/** On: the track fills in the action colour and the thumb slides right. */
export const On = () => (
  <div className="flex items-center gap-2">
    <Switch id="switch-slack" defaultChecked />
    <Label htmlFor="switch-slack">Post Notifications to Slack</Label>
  </div>
);

export const Off = () => (
  <div className="flex items-center gap-2">
    <Switch id="switch-autorun" />
    <Label htmlFor="switch-autorun">Start a Run when the Issue enters this State</Label>
  </div>
);

export const Disabled = () => (
  <div className="flex flex-col gap-3">
    <div className="flex items-center gap-2">
      <Switch id="switch-off-disabled" disabled />
      <Label htmlFor="switch-off-disabled">Allow Agents to close Issues</Label>
    </div>
    <div className="flex items-center gap-2">
      <Switch id="switch-on-disabled" disabled defaultChecked />
      <Label htmlFor="switch-on-disabled">Require a Sponsor for every Agent</Label>
    </div>
  </div>
);

/** `sm` for dense rows; `default` is 28×17. */
export const Sizes = () => (
  <div className="flex flex-col gap-3">
    <div className="flex items-center gap-2">
      <Switch id="switch-default" size="default" defaultChecked />
      <Label htmlFor="switch-default">Default</Label>
    </div>
    <div className="flex items-center gap-2">
      <Switch id="switch-sm" size="sm" defaultChecked />
      <Label htmlFor="switch-sm" className="text-xs">
        Small
      </Label>
    </div>
  </div>
);

/** A settings row: the Label and its explanation on the left, the Switch on the right. */
export const SettingsRow = () => (
  <div className="flex w-full max-w-sm items-start justify-between gap-4 rounded-md border bg-card p-3">
    <div className="flex flex-col gap-0.5">
      <Label htmlFor="switch-suspend">Suspended</Label>
      <p className="text-xs text-muted-foreground">
        A suspended Agent keeps its Issues but cannot start a Run.
      </p>
    </div>
    <Switch id="switch-suspend" aria-invalid={undefined} />
  </div>
);
