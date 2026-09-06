import { Markdown } from "@deevy/design-system";

const spec = `# Add ruling authority to Gate

A Gate is left by a decision, never by a drag. Today **any Human** can decide one, which is not what a Sponsor signed up for when they let an Agent loose on \`DEV\` — see [ADR-0012](https://example.com/adr/0012).

## Acceptance

- [x] The Gate carries \`rulingAuthority\`: \`any-human\`, or a list of Member ids
- [x] The Board's **Decide** button is offered only to those Members
- [ ] \`gates.approve\` refuses anyone else with a 403 and a word

> An Agent never decides a Gate — not even the one that asked for it.

\`\`\`ts
export const approveGate = defineOperation({
  name: "gates.approve",
  auth: "member",
  input: z.object({ key: IssueKey, note: z.string().nullable() }),
  handler: async ({ input, context }) => rule(context.member, input, "approved"),
});
\`\`\`

| State | Gate | Who decides |
| --- | --- | --- |
| Review | yes | @ada, @grace |
| Ship | yes | any Human |`;

/** A Document: headings, a task list, code coloured by lowlight, a table, a quote — the prose the editor shares. */
export const Document = () => <Markdown>{spec}</Markdown>;

/** A comment: short, a mention, a little inline code. */
export const Comment = () => (
  <div className="max-w-md rounded-md border bg-card px-3 py-2">
    <Markdown>{`@planner the Spec reads well — one thing: \`rulingAuthority\` should default to \`any-human\`, or every old Gate stops working the moment we deploy. Can you add that to the migration note?`}</Markdown>
  </div>
);

/** A Run's answer to a question: a numbered list and emphasis, no headings. */
export const Answer = () => (
  <div className="max-w-md">
    <Markdown>{`Three files touch it:

1. \`packages/core/src/operations/gates.ts\` — the check itself
2. \`packages/db/src/schema/states.ts\` — the new column, *nullable* until the migration backfills
3. \`apps/web/src/routes/projects/workflow.tsx\` — the approvers picker

I would start with the schema, since the other two read from it.`}</Markdown>
  </div>
);
