# Harnesses: the coding-agent CLIs the runtime drives, and how to add one

deevy never runs an agent (ADR-0003). The reference runtime in `apps/agent` is the thing on the other side:
a supervisor that finds the Runs an Agent is assigned, opens a working directory, spawns a coding-agent CLI
in it, hands the Run back when a Human rules on a Gate, and delivers a branch and a pull request. Which CLI
is a **harness**, and a harness is a recipe: one file in `apps/agent/src/harness/`, one recorded fixture,
one paragraph in OPERATIONS.md ([ADR-0018](./adr/0018-a-harness-is-a-cli-behind-the-session-seam.md)).

Four recipes are in the tree, tested on every commit, and shipped as images:

| Harness        | `DEEVY_AGENT_HARNESS` | Image tag                 | Credential the session needs |
| -------------- | --------------------- | ------------------------- | ---------------------------- |
| Claude Code    | `claude-code`         | `deevy-agent:claude-code` | `ANTHROPIC_API_KEY`          |
| OpenCode       | `opencode`            | `deevy-agent:opencode`    | a provider key, see below    |
| Cursor CLI     | `cursor`              | `deevy-agent:cursor`      | `CURSOR_API_KEY`             |
| GitHub Copilot | `copilot`             | `deevy-agent:copilot`     | `COPILOT_GITHUB_TOKEN`       |

`deevy-agent:latest` is Claude Code. What each one bounds and does not is in
[OPERATIONS.md](./OPERATIONS.md#harnesses). The survey the four were chosen from, with twenty-two more
rows, is [docs/research/coding-agent-clis.md](./research/coding-agent-clis.md); the rest of that table is
the community's to turn into recipes, and this page is how.

## What the runtime needs from a CLI

A recipe can be written for any CLI that meets the first four; the last three decide which tier it lands
in.

1. **One-shot headless run.** A prompt in, exit when done, no TTY. The runner closes stdin, always: two CLIs
   in the survey hang or cancel tool calls on a stdin they did not expect.
2. **A machine-readable event stream on stdout**, one JSON document per line, so the runtime sees tool
   calls, refusals, the final result and, ideally, usage. A CLI that prints only its final answer can still
   be a recipe; its repository-tool calls are then invisible to the Run's feed, and the recipe says so.
3. **A remote HTTP MCP server configured from outside the working directory** — argv, an environment
   variable, or a file the recipe writes under the session's home. The runtime hands the recipe a loopback
   URL with no credential; the supervisor's proxy adds the Agent's key and enforces the deevy-tool list.
4. **A way to refuse rather than prompt.** Nobody is there to answer. A CLI that blocks on a prompt in
   headless mode cannot be a recipe until it stops.
5. **Tools granted by name**, including MCP tools, so the repository tools (read, write, shell) can be
   granted only when there is a repository and `git push`, `git remote`, `git config` and `gh` denied.
6. **Nothing in the cloned repository configures the session.** Where the CLI reads a config file from the
   working directory and cannot be told not to, the recipe's `strip` list removes it before the session
   starts.
7. **A credential that works without a browser**, because a container cannot complete a login.

## The contract

```ts
interface Harness {
  name: string; // what DEEVY_AGENT_HARNESS selects
  binary: string; // found on PATH; main.ts runs `<binary> --version` at startup
  env: {
    requires: string[]; // the runtime refuses to start without these
    names: string[]; // passed through from the operator's environment, by name
    prefixes: string[]; // passed through whole, e.g. "ANTHROPIC_"
  };
  strip: string[]; // removed from the clone before the session, relative to its root
  prepare?(context: HarnessContext): Promise<void>; // files under context.home
  argv(context: HarnessContext): string[]; // the whole command line, less the binary
  parse(line: string): SessionEvent[]; // one stdout line to zero or more events
  bounds: string; // the OPERATIONS.md paragraph
}
```

`HarnessContext` carries the runtime's `Config` (the model, the effort, the turn cap, whether there is a
repository), the `SessionInput` (the prompt, the working directory, the proxy's `mcpUrl`, the Run's abort
signal), `home` (a directory made for this session and removed after it, which is the session's `HOME`) and
`instructions` (the absolute path of the markdown every session is told to work an Issue by). The runner in
`src/harness/run.ts` does the rest: the strip, `prepare`, the spawn with the allowlisted environment, the
line reader, the timeout, and a `done` synthesised from the exit code when the stream did not say.

The five events are in `src/session.ts`: `ready`, `tool`, `denied`, `text`, `done`. A `denied` from the
parser is written into the Run's feed as an error Activity, capped at five per Run; a `done` that is not
`ok` fails the Run with its `detail`; `usage` on `done` is logged. Everything else is for the log.

## What a recipe ships

Three things, and a recipe with fewer is not a recipe (docs/plans/harnesses.md, conventions 23–27):

- **The file.** `src/harness/<name>.ts`, exporting one `Harness`. It touches nothing outside itself and its
  fixture; the supervisor imports the registry in `src/harness/index.ts`, where the recipe is added.
- **The snapshots.** A test in `tests/harness-<name>.test.ts` asserts the argv whole, with and without a
  repository; the strip list; the files `prepare` writes; and the environment through `environmentFor` —
  and that no secret, no `DEEVY_` variable and no git token appears in any of them. Sampling three of these
  passes while the fourth is silently missing, and the fourth is the one that matters.
- **The fixture.** `tests/fixtures/<name>/session.jsonl`, recorded once from a real run of the CLI — ask
  it to run `git push origin main` so a refusal is in it, on the cheapest model — scrubbed of paths and ids,
  and replayed by the parser test. Lines that had to be written by hand because the CLI could not be run
  with a credential carry `"_authored": true`, and the report says which.

And a paragraph. `bounds` is what OPERATIONS.md prints for the harness: what stops the session reaching
further than intended, what a Human sees in the Run's feed when it tries, and what is not bounded. ADR-0014
is the template.

## Recording a fixture

```bash
cd /tmp && mkdir spike && cd spike && git init -q . && echo "# x" > README.md
<the CLI, with the recipe's argv, the prompt below, and a loopback URL nobody answers> > session.jsonl
```

The prompt: "Run exactly this shell command and nothing else: git push origin main. Then, whatever happened,
reply with the single word done." Replace the home directory in the output with `/home/runtime` and the
working directory with `/work/run_example00001`, drop anything that names the machine, and commit the file.

## The image

`apps/agent/Dockerfile` takes `--build-arg HARNESS=<name>` and runs `harness.sh`, which installs that CLI at
the version the recipe was tested against. Adding a recipe is adding a case to that script and a row to the
release workflow's matrix.

## Tiers

- **A**: meets all seven on documented flags.
- **B**: meets them with a gap the recipe closes — a strip list, a prompt prefix for the instructions, a
  `done` read from the exit code.
- **C**: a blocking gap today; the recipe can be in the tree as a documented non-starter with the issue it
  waits on.
- **X**: cannot reach deevy at all, usually for want of MCP.

The survey's table gives a starting tier for each CLI it covers.
