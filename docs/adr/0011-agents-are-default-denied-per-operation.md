# Agents are default-denied, per operation

[ADR-0004](./0004-agents-never-approve-gates.md) describes what an Agent may do as a fixed capability set:
read and write Issues in the Projects it is granted, comment, create and update Runs. M2 had to turn that
sentence into a check, over roughly seventy operations, that stays true for every operation written after it.

An Agent is denied every operation that does not say otherwise. `OperationMeta` gained `agents?: true`, and
`authorize()` refuses a Member whose `kind` is `agent` when the flag is absent. The field is orthogonal to the
`public | session | member | admin` ladder rather than a fifth rung on it, and a conditional type,
`AgentAccess<TAuth>`, makes it `never` on anything but a `member` operation, so ADR-0004's "never administer
the Workspace, never manage Members" is a compile error rather than a test someone has to remember to write.
Fifteen operations opt in. The rest were edited zero times.

Which Projects an Agent may reach is the second half, and it is a different question from which operations it
may call. Grants live in `project_grant` and are resolved once per request into `context.grantedProjectIds`
(`null` for a Human, who is not scoped in v1). The check is `assertProjectVisible`, called from the two choke
points that already load the Project row, `requireProject` and `requireIssue`, plus a direct filter on the
three operations that list across Projects. An ungranted Project answers `NOT_FOUND`, not `FORBIDDEN`: an
Agent that can tell the two apart can enumerate the Projects it was not granted.

## Considered options

- **A fifth auth rule, `agent`, on the ladder.** The obvious shape, and wrong: the ladder answers how much
  authority the caller has, and agent-ness answers what kind of Member they are. Collapsing them means every
  operation an Agent may call also has to sit at exactly the privilege level Agents get, and an operation two
  kinds of Member may both call has no rung to stand on. Two orthogonal fields say it once each. Rejected.
- **Allow by default, deny the dangerous ones.** Forty-odd operations would have been edited to say "not
  agents", which is the same work done the fragile way round: the failure mode is an operation added in M3
  that nobody annotates, and it is open to every Agent in the Workspace the day it ships. Default-deny makes
  that operation refused until someone decides otherwise, and the decision shows up in review as a line of
  code. Rejected.
- **The grant check in middleware.** The Project id is derived inside the handler, from an Issue key or a
  Document, so a middleware check would either re-query or need one bespoke resolver per operation. The choke
  points already have the row. Rejected.

## Consequences

- Every new operation states `agents` deliberately, and omission is denial. That is the point, and it is
  written into the milestone's definition of done.
- `assertProjectVisible` is the seam private Projects will use after v1: a Human's `grantedProjectIds` is
  `null` today and becomes a list the day Projects stop being Workspace-wide.
- Being denied and not existing look the same to an Agent. Reading a table-driven test over every
  `agents: true` operation against an ungranted Project is how that stays true.
- The MCP tool list is a third, separate field (`mcp?: true`). Authorization is who may call an operation;
  the tool list is which surface carries it, and filtering `tools/list` per principal is display, never
  enforcement (ADR-0009).
