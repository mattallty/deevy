---
"@deevy/agent": patch
---

The reference runtime drives Claude Code as a subprocess (`claude -p`) instead of through the Agent SDK,
behind a harness contract other coding-agent CLIs can implement; `DEEVY_AGENT_HARNESS` selects the harness
and defaults to `claude-code`. Each session now runs with a home directory of its own, so the operator's
dotfiles and credentials are not readable from a session's shell, and the files a repository could ship to
configure the CLI (`.mcp.json`, `.claude/`) are removed from the clone before the session starts. The
runtime checks at startup that the harness binary runs, and logs what each Run spent when the harness
reports it. The image no longer carries the Agent SDK; it installs the Claude Code CLI at a pinned version.
