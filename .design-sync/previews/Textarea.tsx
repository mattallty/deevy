import { Label, Textarea } from "@deevy/design-system";

/** Three rows, resize off; the description of a Project, in markdown. */
export const Default = () => (
  <div className="flex w-full max-w-sm flex-col gap-2">
    <Label htmlFor="textarea-description">Description</Label>
    <Textarea id="textarea-description" rows={3} placeholder="What this Project is for." />
  </div>
);

export const WithValue = () => (
  <div className="flex w-full max-w-sm flex-col gap-2">
    <Label htmlFor="textarea-body">Description</Label>
    <Textarea
      id="textarea-body"
      rows={4}
      defaultValue={
        "A Gate needs to know who may rule on it. Add a `rulingAuthority` to the State and show it on the Gate card.\n\nApprovers stay the Humans the Workflow names."
      }
    />
  </div>
);

/** `field-sizing: content`: the box is 64px empty and grows with the text; `rows` is only a fallback. */
export const GrowsWithContent = () => (
  <div className="flex w-full max-w-sm flex-col gap-3">
    <Textarea rows={2} defaultValue="Approved. Merge it." aria-label="Short ruling" />
    <Textarea
      rows={2}
      aria-label="Long ruling"
      defaultValue={
        "Rejected. The spec names three approvers but the Workflow only lets one Human rule; either the Gate takes a quorum, or the spec drops to one.\n\nAlso: the acceptance walk still says `ticket` in two places. CONTEXT.md says Issue.\n\nSend it back through Review once both are fixed."
      }
    />
  </div>
);

export const Disabled = () => (
  <div className="flex w-full max-w-sm flex-col gap-2">
    <Label htmlFor="textarea-template">Document template</Label>
    <Textarea
      id="textarea-template"
      rows={3}
      disabled
      defaultValue={"## Intent\n\nWhat this Issue changes, and for whom."}
    />
  </div>
);

export const Invalid = () => (
  <div className="flex w-full max-w-sm flex-col gap-2">
    <Label htmlFor="textarea-ruling">Ruling</Label>
    <Textarea id="textarea-ruling" rows={3} aria-invalid placeholder="Why the Gate is rejected." />
    <p className="text-xs text-destructive">A rejection needs a reason the Agent can act on.</p>
  </div>
);
