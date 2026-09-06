---
"@deevy/agent": patch
---

The reference runtime is now `apps/agent` and can drive four coding-agent CLIs: Claude Code, OpenCode, Cursor
CLI and GitHub Copilot CLI, selected with `DEEVY_AGENT_HARNESS`. Each ships as its own image
(`deevy-agent:claude-code`, `:opencode`, `:cursor`, `:copilot`, plus `<version>-<harness>`); `deevy-agent:latest`
stays Claude Code. What each harness bounds and does not is in `docs/OPERATIONS.md`, and `docs/harnesses.md`
says how to add another.
