---
"@deevy/agent": patch
---

An Agent now runs git itself: its own branches, its own commits and messages, pushed where it likes. The
four harnesses no longer deny `git push`, `git remote`, `git config` or `gh`. The credential stays with the
supervisor, which serves the remote on loopback and adds it on the way out, so a session's `origin` is a
local address and its checkout holds no token. **Where an Agent can push is now the scope of the token you
issue and whatever your forge protects**, so give it a token scoped to one repository and protect the
branches that matter.
