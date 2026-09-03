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

Discovery complete, nothing built yet. The vocabulary is in [CONTEXT.md](./CONTEXT.md), the hard-to-reverse
decisions in [docs/adr](./docs/adr), the v1 plan in [docs/PLAN.md](./docs/PLAN.md), and the research that
informed them in [docs/research](./docs/research).
