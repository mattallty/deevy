# Agents are first-class Members, not bots acting under a human's token

deevy exists so humans and agents can collaborate on the same Issues. Assignment, accountability, audit, and
agent-to-agent handoff all need the agent to have an identity of its own, so an Agent is a Member with its own
identity, credentials, permissions, and audit trail. Every Agent is accountable to a Sponsor, a Human.

## Considered options

- **Agents act as bots under a human's token.** Simplest to build, but every agent action is attributed to a person,
  two agents cannot be told apart, and nothing can be assigned to an agent.
- **Hybrid: identity, permissions inherited from the sponsor.** Rejected for v1; permission scoping per Agent is
  decided separately.
