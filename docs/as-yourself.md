# Working an Issue as yourself

[agent-loop.md](./agent-loop.md) is the worked example of an Agent: a Claude Code holding an Agent's key,
finding the Run a trigger opened, narrating, stopping at a Gate. This is the other one. The same Claude Code,
on your laptop, pointed at the same endpoint with no header, signs **you** in over OAuth and is you
(docs/OPERATIONS.md, "A Human's own MCP client"). What it writes is yours, in the Event log and everywhere
else, and it has no Run, because a Run is an Agent's attempt and you are present for your own work
(ADR-0016).

## Connecting

From the repository you work in, or any directory that is not deevy's own:

```bash
claude mcp add --transport http deevy https://deevy.example.com/mcp
claude mcp login deevy
```

`login` opens a browser on deevy's consent page; allow it, and Settings, MCP clients lists the client. Tools
arrive namespaced, `issues_get` as `mcp__deevy__issues_get`. You are offered what you may call and nothing
else: the nineteen tools below, which is the Agent's set less the four that write a Run, plus `runs_answer`.

## The `CLAUDE.md` snippet

Put this in the repository you work in, beside whatever else tells Claude Code about the code.

```markdown
## Working an Issue in deevy, as the person running you

deevy is where this work is tracked. You are connected to it as the person running you: everything you do
there is theirs, in their name, and it stays in the Event log. Use the `deevy` MCP tools; do not call the
HTTP API by hand.

- **Find the Issue.** `issues_get` with its key, such as `DEV-42`, then `documents_get` for `intent`,
  `spec` and `plan` as far as they exist. The Documents are the brief; the description is a title with more
  words. `issues_list` with a `q` finds a key or a word of a title.
- **Write outcomes, not steps.** There is no Run for you, and no Activity feed: a Run is an Agent's attempt,
  and the person is right here reading you. Put results in deevy: `documents_write` for the Document the
  current State asks for, `comments_create` when another Human needs to be told something in prose,
  mentioning them by handle. Writing a Document again makes a new version; older ones stay readable.
- **Attach what you produced.** `links_add` with the pull request URL and the Issue key. There is no
  `runId` to give.
- **Move the Issue when the work moves.** `projects_get` with the Project key gives its States, their ids,
  and which are Gates. `issues_move` puts the Issue in the next State. A Gate is not left by a move and you
  cannot approve one: say that the Issue is waiting on a ruling, and the person approves it in deevy.
- **Their Agents are visible to you.** `runs_list` with an Issue key shows what Agents have done on it,
  `runs_get` reads one Run's feed, and `runs_answer` answers a question an Agent left it waiting on, in the
  person's name. Answer only what the person told you to answer.
- **Their inbox is `inbox_list`.** Read it when asked. It is theirs, and so is what you do about it.

What you cannot do: open, narrate or finish a Run; approve or reject a Gate; touch Members, Agents, keys or
the Workspace. None of that is missing. It is either an Agent's or the person's own, in deevy's UI.
```

## What it leaves behind

The Event log shows you as the actor, exactly as if you had clicked. A comment posted from that session is
your comment; a Document version is yours; an Issue you moved was moved by you. Nothing says a model was
involved, because nothing needs to: the person accountable is the person whose credential it was. If that
distinction ever matters, it is a column on Events, not a Run.
