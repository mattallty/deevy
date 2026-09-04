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

M2 done: a team runs its work in deevy on the Docker image, and an agent loop outside it works an Issue over
MCP as a Member of its own — reading the Issue, writing the plan Document, stopping at a Gate for a Human, and
finishing with a Run summary. M3 puts the same thing on Cloudflare Workers.

The vocabulary is in [CONTEXT.md](./CONTEXT.md), the hard-to-reverse decisions in [docs/adr](./docs/adr), the
v1 plan in [docs/PLAN.md](./docs/PLAN.md), the research that informed them in [docs/research](./docs/research),
how to run it in [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) and [docs/OPERATIONS.md](./docs/OPERATIONS.md),
and a worked agent loop in [docs/agent-loop.md](./docs/agent-loop.md).

## License

[AGPL-3.0](./LICENSE) (ADR-0002).
