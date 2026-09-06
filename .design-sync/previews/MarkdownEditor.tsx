import { MarkdownEditor } from "@deevy/design-system";
import { useState } from "react";
import { ada, builder, grace, planner } from "./lib/fixtures";

const mentions = [ada, grace, planner, builder].map((member) => ({
  handle: member.handle,
  name: member.user.name,
  kind: member.kind,
}));

const spec = `## Why

A Gate needs to say who may decide it. Today **any Human** can approve or reject.

## Acceptance

- [x] The Gate carries \`rulingAuthority\`
- [ ] The Board's Decide button is offered only to those Members

> An Agent never decides a Gate.`;

/** A Document being written: the block editor, with its Edit / Source tabs above the text. */
export const Document = () => {
  const [value, setValue] = useState(spec);
  return (
    <div className="w-full max-w-xl">
      <MarkdownEditor id="spec" aria-label="Spec" value={value} onChange={setValue} mode="block" />
    </div>
  );
};

/** A comment being written: inline, three rows, with the placeholder that says how to send and mention. */
export const Comment = () => {
  const [value, setValue] = useState("");
  return (
    <div className="w-full max-w-xl">
      <MarkdownEditor
        id="new-comment"
        aria-label="Comment"
        mode="inline"
        rows={3}
        value={value}
        onChange={setValue}
        mentions={mentions}
        placeholder="Say something. @ mentions a Member or a Team; ⌘Enter sends."
      />
    </div>
  );
};

/** A comment half-written, with a mention in it. */
export const CommentDraft = () => {
  const [value, setValue] = useState(
    "@planner the Spec reads well — can you add the migration note before this leaves Review?",
  );
  return (
    <div className="w-full max-w-xl">
      <MarkdownEditor
        aria-label="Comment"
        mode="inline"
        rows={3}
        value={value}
        onChange={setValue}
        mentions={mentions}
        placeholder="Say something."
      />
    </div>
  );
};
