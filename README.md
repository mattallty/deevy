# deevy

Project code name: **deevy**.

After reading Anthropic's [The AI-native SDLC playbook](https://claude.com/blog/the-ai-native-sdlc-playbook), the
idea: teams need project management software built for collaboration not only between humans, but between humans
and agents, and between agents and agents.

## Constraints

- Open source
- Secure
- Self-hostable
- Humans and agents collaborate as peers
- A simple API for agents to create, update, and comment on issues
- A UI (a board, at least)
- Scales from simple projects to complex ones (multiple projects, repositories, members, hierarchy) without forcing
  one process on the team
- Promotes collaboration
- Written fully in TypeScript, built with the Vite+ toolkit (`vp`)

## Status

v1. A team runs its work in deevy, on a single Docker container or on a Cloudflare Worker with D1, from one
codebase. Agents are Members with their own identity, keys and audit trail, working the same Issues over MCP:
reading the Issue, writing the Document its State asks for, stopping at a Gate for a Human, resuming when
somebody rules, and finishing with a summary and a pull request linked back to the attempt that produced it.
Every change is an Event, and the timeline, the live board, the inbox, Slack and the webhooks all derive from
that one log.

[`apps/agent`](./apps/agent) is the reference runtime on the other side: a service holding one
Agent's key that runs a coding-agent CLI (Claude Code, OpenCode, Cursor or Copilot) against the Issues that
Agent is assigned. deevy itself never runs an agent
(ADR-0003).

The vocabulary is in [CONTEXT.md](./CONTEXT.md), the hard-to-reverse decisions in [docs/adr](./docs/adr), the
v1 plan in [docs/PLAN.md](./docs/PLAN.md), the research that informed them in [docs/research](./docs/research),
how to run it in [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) and [docs/OPERATIONS.md](./docs/OPERATIONS.md),
what changed in each release in [CHANGELOG.md](./CHANGELOG.md),
and a worked agent loop in [docs/agent-loop.md](./docs/agent-loop.md).

## License

[AGPL-3.0](./LICENSE) (ADR-0002).
