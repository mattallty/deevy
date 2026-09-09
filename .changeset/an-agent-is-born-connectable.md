---
"@deevy/core": patch
"@deevy/web": patch
---

An Agent is now created with its first API key, and the dialog that created it is where you read that key — the only time it is readable, since deevy keeps a hash. An Agent with no key can reach nothing at all, so making one was an errand every Sponsor had to remember; `agents.create` returns it (and null where an instance has no way to mint keys at all), so an Agent created over the API arrives connectable too. The key is called "first key" in the list, `agent.key_issued` is in the Event log for it exactly as for one you issue yourself, and every later key is still issued from the Agent's own page.

Connecting is now explained on the Agent that needs connecting, rather than once above the list of all of them. Its page carries this deevy's MCP endpoint and a tab per coding agent — Claude Code, OpenCode, Cursor CLI, Copilot CLI, and the shape anything else speaking MCP over streamable HTTP takes — each with the file to write or the command that writes it. The four named are the ones the reference runtime drives itself.
