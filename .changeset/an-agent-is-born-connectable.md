---
"@deevy/core": patch
"@deevy/web": patch
---

An Agent is now created with its first API key, and the dialog that created it is where you read that key — the only time it is readable, since deevy keeps a hash. An Agent with no key can reach nothing at all, so making one was an errand every Sponsor had to remember; `agents.create` returns it (and null where an instance has no way to mint keys at all), so an Agent created over the API arrives connectable too. The key is called "first key" in the list, `agent.key_issued` is in the Event log for it exactly as for one you issue yourself, and every later key is still issued from the Agent's own page.

Connecting is now explained where the key is, rather than once above the list of every Agent. The dialog that creates an Agent — and the banner beside any key you issue afterwards — carries the command to connect with **that key already written into it**, because that is the one moment deevy can fill it in. The Agent's own page carries the same block standing, and there it names the key rather than containing it: `DEEVY_AGENT_KEY` for the clients that read a variable, and a placeholder for the two that do not.

Every one of them offers a tab per coding agent — Claude Code, OpenCode, Cursor CLI, Copilot CLI, and the shape anything else speaking MCP over streamable HTTP takes — with the file to write or the command that writes it. The four named are the ones the reference runtime drives itself. Which clients get the variable form is not a guess: Claude Code expands `${VAR}` in the entry it writes and OpenCode reads `{env:VAR}`, while Cursor documents `${env:VAR}` but does not resolve it for a remote server and the Copilot CLI documents nothing, so those two are told the key itself rather than a reference deevy would receive verbatim.
