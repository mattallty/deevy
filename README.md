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

M0 scaffold: a Human can sign in with GitHub and see an empty Workspace. The vocabulary is in
[CONTEXT.md](./CONTEXT.md), the hard-to-reverse decisions in [docs/adr](./docs/adr), the v1 plan in
[docs/PLAN.md](./docs/PLAN.md), the research that informed them in [docs/research](./docs/research), and how to
run it in [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md).

## License

[AGPL-3.0](./LICENSE) (ADR-0002).
