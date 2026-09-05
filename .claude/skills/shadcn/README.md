# shadcn skill (vendored)

The official shadcn/ui agent skill, copied on 2026-09-05 from the install at `~/.claude/skills/shadcn`
(source: https://ui.shadcn.com — the skill the `shadcn` CLI publishes). Only `SKILL.md`, `rules/`,
`cli.md`, `customization.md`, `registry.md` and `mcp.md` are kept; the upstream evals and assets are not.

It is vendored so every session working on `apps/web` — a person's, CI's, an Agent's — designs against the
same rules. Its `SKILL.md` runs `shadcn info --json` for project context, which finds `components.json`
only when the working directory is `apps/web`, so do UI work from there. deevy is a **Base UI** project
(`"style": "base-mira"`): follow `rules/base-vs-radix.md` and never add an item that imports `@radix-ui/*`
(see `../deevy-ui/SKILL.md` for the registry rules).

To refresh: copy the upstream skill over this directory and re-apply this README.
