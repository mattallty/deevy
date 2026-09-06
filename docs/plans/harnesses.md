# Harness spike: vertical slices

Breakdown of the harness spike, 2026-09-06. Vocabulary is [CONTEXT.md](../../CONTEXT.md); M4's slices, whose
package this spike changes, are in [m4.md](./m4.md), and the survey the spike is built on is
[coding-agent-clis.md](../research/coding-agent-clis.md). The spike is done when the runtime that today runs
Claude through the Agent SDK runs four coding-agent CLIs through one contract — Claude Code, OpenCode, Cursor
CLI and Copilot CLI — with the same supervisor, the same tests, the same acceptance walk, and a written page
that lets somebody add a fifth without touching anything but their own file.

Six slices, in dependency order. Each is one PR on `main` that leaves deevy unchanged and carries its own
tests. Nothing in a slice is needed by an earlier one.

It is a spike, which means two things. Every slice that adds a harness begins with a list of questions the
survey could not answer from the vendor's documentation, and the slice's first commit is the answers; a
harness whose answers fail the bounds is recorded as a tier C row and its slice ends there, with the recipe
left in the tree as a documented non-starter rather than deleted. And the product decisions the spike raises
(the package's name, the image tags, what is promised to whom) are taken once, in slice 6, with the four
recipes in hand.

## Decisions taken for the spike

- **A harness is a CLI in a subprocess, not an SDK.** M4 chose the Agent SDK so the seam would be a function
  rather than "a child process, a PATH, and an argv string nobody can typecheck". That argument was right for
  one harness and is wrong for four: the Agent SDK is itself a wrapper around the `claude` binary (the
  Dockerfile has to install that binary separately for exactly this reason), the Codex SDK wraps `codex exec`,
  and Cursor and Copilot have no SDK at all. One adapter shape — spawn an argv, feed it configuration through
  argv, env and files the supervisor writes, read JSON lines from stdout — fits every row of the survey, and
  the discipline that made the options object safe carries over: the argv is built in one function and
  asserted whole. ADR-0013's "service, not a CI job" stands; its "SDK, not CLI" paragraph is superseded, and
  slice 6 records that.
- **The seam does not move.** `type Session = (input: SessionInput) => AsyncIterable<SessionEvent>` in
  `src/session.ts` is already harness-neutral and every test in the package scripts it. A harness is what
  produces a `Session` from a `Config`, which is what `buildSession` is today. The supervisor keeps not
  knowing which harness it has. One field is added: `done` carries a `usage` the harness fills as best it
  can, because PLAN.md's cost-per-Run item should not land on one harness only.
- **The Agent's key never enters the session's process tree.** Today the key travels to the SDK as an MCP
  header, and the SDK passes it to the CLI, and the CLI spawns the session's shell — same uid, same
  container, so a `cat /proc/<pid>/cmdline` in that shell is the key. ADR-0014 already calls a key the
  session can reach "an allowlist a subprocess can walk around". The spike closes it the only way a
  subprocess model can: the supervisor, which already listens on 8787, serves `/mcp` on loopback and forwards
  to deevy with the header, and every harness is configured with `http://127.0.0.1:<port>/mcp` and no
  credential at all. The proxy is also where the deevy-tool allowlist is enforced — `tools/list` is filtered
  and `tools/call` on anything else is refused — so bound 4 of ADR-0014 stops depending on four CLIs'
  permission syntaxes for the tools that matter most, and a refusal is one `denied` event from one place. A
  shell that curls the proxy gets exactly the allowlisted tools, which is the allowlist and not a hole.
- **The bounds that vary are enforced by the recipe, and the recipe says which it cannot enforce.** Tools by
  name for the repository tools (Read, Write, Bash), refusal instead of a prompt, and isolation from the
  cloned repository's own configuration are expressed differently by every CLI, and the survey found three
  that cannot ignore project configuration at all. So a recipe declares a list of paths the supervisor
  removes from the clone before the session starts, and a paragraph for OPERATIONS.md saying what the
  harness leaves unbounded. ADR-0014's rule for anything added later — what stops it reaching further, what a
  Human sees when it tries — is the template for that paragraph.
- **The environment is still an allowlist, and the recipe extends it by name.** `sessionEnv` stays; a recipe
  adds the variables its CLI needs (`ANTHROPIC_API_KEY`, `CURSOR_API_KEY`, `COPILOT_GITHUB_TOKEN`, a provider
  key for OpenCode) and the supervisor refuses to start without them, the way it refuses without
  `DEEVY_AGENT_KEY`. `HOME` for the session is a directory the supervisor prepared, because three of the four
  CLIs read their own configuration from the home directory and the supervisor has to own that file.
- **stdin is closed, always.** Two CLIs in the survey hang or cancel tool calls on stdin they did not expect.
  The runner spawns with stdin closed and treats that as part of the contract, not as a per-recipe detail.
- **No test spends money, still.** Every recipe is tested three ways for free: its argv and strip list
  asserted whole, its parser run against a recorded JSON-lines fixture, and the supervisor driven by the
  scripted session exactly as today. One live test per harness exists behind `DEEVY_AGENT_LIVE=<harness>`
  and CI never sets it. The acceptance script gains `--harness` and runs the scripted session against every
  recipe, which proves the supervisor is harness-blind and costs nothing.
- **deevy does not change.** No slice touches `packages/core`. If a CLI makes an operation awkward, that is a
  finding for after the spike, written into the slice's "Found by building" section, not a widening done in
  passing (ADR-0011).

## Deferred out of the spike

The other twenty-two rows of the survey, which become community recipes against the page slice 6 writes.
Codex, until openai/codex#24135 is fixed, because deevy is an MCP server and `codex exec` cancels MCP calls.
A second forge beside GitHub, which is the other axis of this package and gets its own spike. Running the
session as a different uid from the supervisor, which would bound the working directory as well as the key;
the container stays the sandbox for now. Any change to what an Agent may call.

## Conventions every slice follows

M4's four conventions for `apps/claude-agent` ([m4.md](./m4.md), 19–22) hold. The spike adds five:

23. A harness is one file in `src/harness/` plus its fixture, and touches nothing outside them. The supervisor
    imports the registry in `src/harness/index.ts` and never a recipe by name.
24. Convention 21 widens: a recipe's argv, its strip list and its required environment are asserted whole,
    as one snapshot per recipe. The Claude Code snapshot is compared against today's `sessionOptions` field
    for field in its first commit, so the move from SDK to CLI is shown to lose nothing.
25. Every recipe has a recorded JSON-lines fixture under `tests/fixtures/<harness>/`, captured once from a
    real run and committed, and the parser test replays it. A recipe with no fixture is not a recipe.
26. Every recipe answers ADR-0014's two questions in a paragraph in OPERATIONS.md — what stops the session
    reaching further than intended, and what a Human sees in the Run's feed when it tries — and says in the
    same paragraph what it cannot bound.
27. The image pins the CLI's version, and `main.ts` runs the CLI's `--version` at startup and refuses to
    start if the binary is missing. A harness the container cannot run is found at boot, not at the first
    Run.

Sizes are t-shirt estimates for one developer plus agents: S under a day, M two to three days, L a week.

## Dependency order

```
M4
└─ 1 The key stays with the supervisor         proxy, allowlist, denied, probe
   └─ 2 The harness contract, and Claude Code on the CLI
      ├─ 3 OpenCode
      ├─ 4 Cursor CLI
      └─ 5 Copilot CLI
         6 Images, docs, the ADR, and the recipe page     needs everything
```

Slices 3, 4 and 5 are independent of one another and can be built in parallel once 2 is in.

---

## Slice 1: The key stays with the supervisor (M)

**Goal.** A session reaches deevy through the supervisor and never holds the Agent's key, and the deevy-tool
allowlist is enforced in one place that does not depend on the harness.

**Depends on.** M4.

**Work.**

- `src/proxy.ts`: a streamable-HTTP MCP endpoint on the receiver's existing listener (`/mcp` beside
  `/healthz`), bound to loopback, forwarding to `${DEEVY_URL}/mcp` with `Authorization: Bearer
${DEEVY_AGENT_KEY}`. It is a byte-level forwarder for everything except two methods it understands:
  `tools/list`, whose result it filters to `deevyTools` (the names without the `mcp__deevy__` prefix), and
  `tools/call`, which it refuses with a JSON-RPC error for a name not on that list. The receiver already
  verifies deevy's signature with code that never saw the signer; this is the same posture in the other
  direction.
- The proxy is up only while a Run is being worked and answers only one session at a time, because the
  supervisor is sequential and a listener that accepts calls with no Run in flight is a listener nobody is
  watching.
- A refused `tools/call` yields a `denied` `SessionEvent` from the proxy into the same stream the harness
  produces, so `work.ts`'s existing handling — a `denied` Activity in the Run's feed, up to the cap — needs no
  change. Slice 2's contract merges the two sources.
- `deevyIsReachable` stops reading a harness's `ready` event and becomes a probe the supervisor makes itself
  before starting the session: `initialize` against deevy through the proxy. A session that cannot reach
  deevy is still the one condition worth abandoning a Run over; the check just stops being one CLI's
  message.
- `sessionOptions` in `sdk.ts` points the SDK at the proxy with no header. That is the whole change to the
  Claude adapter in this slice, and it is what makes the field-for-field comparison in slice 2 possible.

**Acceptance test.** Against a real deevy in-process: a client on the proxy lists exactly the twelve tools;
`tools/call` on `gates_approve` is refused and the supervisor records a `denied`; `issues_get` through the
proxy returns what the key returns directly; the proxy refuses a connection that is not from loopback; with
the proxy's forwarder given a wrong key, the pre-session probe fails the Run before any session starts.
`tests/boundary.test.ts` still passes: the proxy is `node:http`, and the package still has one dependency.

**What this slice is not.** Not a second MCP server: it speaks deevy's tools and adds none, so
`mcp-tools.json` is unchanged and ADR-0016's list of which way each tool faces is still deevy's.

---

### Found by building the slice

**The proxy is its own listener, not a route on 8787.** The plan put `/mcp` beside `/healthz` on the
receiver's listener and had it check who connected. Built, it is a second `node:http` server bound to
`127.0.0.1` on port 0, opened by `workRun` for one Run and closed in its `finally`. That is loopback by
address rather than by inspection, one session at a time by construction, and up only while a Run is in
flight without a line of code saying so. The URL is per Run, and reaches the session as `SessionInput.mcpUrl`.

**There is no `initialize` to probe with.** The 2026-07-28 revision has no handshake: every request carries
its envelope in `_meta`, and deevy's edge rejects an `initialize` sent with a modern `MCP-Protocol-Version`
header, then rejects a request whose body names a method the `Mcp-Method` header does not. Both are recorded
in [mcp-spec-2026-07-28.md](../research/mcp-spec-2026-07-28.md) and both were learned again here, which is
the point of a client that never saw the server's code. The probe is a `tools/list` with the envelope and
the header, and it is the better probe: it proves the key is this Agent's and that deevy lists its tools.

**`deevyIsReachable` is gone.** The supervisor no longer reads a harness's `ready` event to decide whether
deevy is there; the probe decides, before a token is spent, in words the Run's feed can carry
("deevy answered 401 to tools/list"). `ready` stays in `SessionEvent` for the log.

**A refusal is recorded before the session is answered.** The first version queued the proxy's refusals and
drained them at the harness's next event. The acceptance walk caught what that costs: the model's refused
call came first, its `runs_request_approval` came last, and the queued refusal was written after the Run
had stopped at the Gate — an Activity on a Run in `awaiting_input` puts it back in `active`, and the
supervisor then failed a Run that had done everything right. So the proxy awaits `onDenied` before it
answers the session, and the error Activity is in the feed before the model has seen the error.

**The acceptance walk now goes through the proxy.** The scripted model calls `input.mcpUrl` with no
credential, and the walk gained a check that `gates_approve` through it is refused with "not available to
this session". The walk on both deployments is what shows the forwarder is transparent to a real socket,
JSON and SSE alike.

---

## Slice 2: The harness contract, and Claude Code on the CLI (L)

**Goal.** The runtime chooses a harness by name, runs it as a subprocess through one runner, and the first
harness is Claude Code through `claude -p`, with the Agent SDK dependency gone and nothing lost.

**Depends on.** Slice 1.

**Questions the survey left open, answered in the first commit.**

- Does `--setting-sources` accept an empty value that loads no settings, or is the least a subprocess can
  load `user` from a `HOME` the supervisor prepared and left empty?
- Does `--output-format stream-json` carry the `system`/`permission_denied` message the SDK exposes, so the
  runtime's `denied` for repository tools keeps its source?
- Does the `result` message carry `usage` and `total_cost_usd` in print mode?

**Work.**

- `src/harness/contract.ts`:

  ```ts
  interface Harness {
    name: string;
    binary: string;
    /** Variables the session needs on top of `sessionEnvAllowed`; the supervisor refuses to start without them. */
    requires: ReadonlyArray<string>;
    /** Paths removed from the clone before the session starts, relative to its root. */
    strip: ReadonlyArray<string>;
    /** Files the supervisor writes before the session starts, under the session's HOME or a private directory. */
    prepare(ctx: HarnessContext): Promise<void>;
    /** The whole command line, asserted whole by a test. */
    argv(ctx: HarnessContext): string[];
    /** One stdout line to zero or more events. */
    parse(line: string): SessionEvent[];
    /** What OPERATIONS.md says about this harness. */
    bounds: string;
  }
  ```

  `HarnessContext` is the `Config`, the `SessionInput`, the proxy's URL, the instructions text, and the
  session's `HOME`.

- `src/harness/run.ts`: the runner. `spawn(binary, argv, { cwd, env: sessionEnv(...), stdio: ["ignore",
"pipe", "pipe"] })`, a line reader on stdout into `parse`, stderr kept for the `done` detail when the exit
  code is not zero, `SIGTERM` then `SIGKILL` on the Run's `AbortSignal`, and the `done` event synthesised from
  the exit code when the stream did not produce one. It merges the proxy's `denied` events from slice 1
  into the same iterable.
- `src/harness/claude-code.ts`: the recipe. `argv` is `-p --output-format stream-json --verbose --mcp-config
'<inline json pointing at the proxy>' --strict-mcp-config --allowedTools … --disallowedTools …
--permission-mode default --permission-prompts none --setting-sources '' --append-system-prompt-file
<instructions> --max-turns N --model M --effort E`, from the same `deevyTools`, `repositoryTools` and
  `deniedTools` lists as today. `strip` is `.mcp.json`, `.claude/`, `CLAUDE.md` is **not** stripped: it is
  input, and ADR-0014 says input is untrusted and is not what the bounds are for. `parse` is
  `toSessionEvents` moved, since the CLI's stream is the SDK's message stream.
- `src/harness/index.ts`: the registry, `{ "claude-code": claudeCode }`, and `harnessFor(config)`.
  `DEEVY_AGENT_HARNESS` selects, default `claude-code`, an unknown name refuses to start.
- `main.ts` runs `<binary> --version` at startup (convention 27) and logs it.
- `sdk.ts` and `@anthropic-ai/claude-agent-sdk` are removed. The Dockerfile installs `@anthropic-ai/claude-code`
  at a pinned version instead. `tests/boundary.test.ts` asserts the dependency list is now empty.
- `SessionEvent`'s `done` gains `usage?: { inputTokens; outputTokens; costUsd? }`, and `work.ts` puts it in
  the `runs_finish` summary's last line when present. Nothing in deevy is asked to store it.

**Acceptance test.** The argv snapshot, compared in the test against the previous `sessionOptions` shape so
each SDK field has a flag; the strip list snapshot; the parser replayed over `tests/fixtures/claude-code/`;
a hostile clone fixture (`.mcp.json` adding a server, `.claude/settings.json` granting everything) is
stripped and, in the live test, the session's `ready` lists one server; the runner's timeout kills a `sleep`
and the Run fails with the timeout reason; every existing test in the package passes unchanged with the
scripted session, which is the proof the supervisor did not notice.

---

## Slice 3: OpenCode (M)

**Goal.** The same Run, worked by OpenCode against whichever provider the operator gives it a key for.

**Depends on.** Slice 2.

**Questions answered first.**

- What does `opencode run` do with a permission rule of `ask` when there is no TTY: block, reject, or exit?
  The documentation says the prompt "still activates". If it blocks, every rule in the recipe is `allow` or
  `deny` and `ask` is a bug the test catches.
- Does `OPENCODE_CONFIG_CONTENT` fully own `mcp` and `permission` when the clone's `opencode.json` is
  stripped, given that configuration is merged rather than replaced?
- What are the `--format json` event shapes for a tool call, a refusal, and the end of a run, and is there
  usage in the last one?
- Is the deevy MCP server's tool set reachable by name in `permission` (the survey says MCP tools are
  included) so the repository tools and the deevy tools can both be listed?

**Work.**

- `src/harness/opencode.ts`. `prepare` writes nothing to the clone; configuration goes in
  `OPENCODE_CONFIG_CONTENT`, which is an env var the session's shell can read and which therefore contains
  **no secret**: the MCP entry is the proxy's loopback URL. `permission` is `{"*": "deny"}` followed by an
  allow per repository tool and per deevy tool, with the same `git push`, `git remote`, `git config` and `gh`
  denials as Claude Code's, expressed as bash patterns. `argv` is `run --format json --model <provider/model>
--dir <cwd> <prompt>`. `strip` is `opencode.json`, `opencode.jsonc`, `.opencode/`.
- `requires` is the provider key the model needs, and `DEEVY_AGENT_MODEL` for this harness is
  `provider/model`; the recipe validates the shape.
- Instructions: OpenCode reads `AGENTS.md` from the clone as input. The runtime's `instructions.md` is
  delivered as a custom agent in the inline config whose prompt is the instructions, selected with
  `--agent`, so the system prompt is the supervisor's and the repository's `AGENTS.md` is one more thing the
  model reads.
- `opencode serve` plus `--attach` is noted and not used: a per-Run process is what keeps a restarted
  supervisor and a second host behaving like the pass before.

**Acceptance test.** The three snapshots (convention 24); the fixture replay; the hostile clone stripped; the
`ask` finding pinned by a test whichever way it went; the acceptance script's `--harness opencode` run with
the scripted session.

---

## Slice 4: Cursor CLI (M)

**Goal.** The same Run, worked by Cursor's `agent`.

**Depends on.** Slice 2.

**Questions answered first.**

- In print mode without `--force`, a write is "proposed, not applied". With `--force`, is the refusal of a
  tool that a `deny` rule names a hang, an error in the stream, or a silent skip?
- Where is the CLI's MCP configuration, what is the HTTP entry's shape, and does `--approve-mcps` cover a
  server that needs no login?
- Is the project's `.cursor/cli.json` merged with `~/.cursor/cli-config.json`, and does a project `allow`
  widen a global `deny`? The documentation says deny wins; the test says whether that holds across scopes.
- Does `stream-json` carry tool names, refusals and usage?

**Work.**

- `src/harness/cursor.ts`. `prepare` writes `~/.cursor/cli-config.json` in the session's `HOME` with
  `permissions.allow` of `Mcp(deevy:*)`, `Read(**)`, `Write(**)`, `Shell(*)` when there is a repository, and
  `permissions.deny` of `Shell(git push)`, `Shell(git remote)`, `Shell(git config)`, `Shell(gh)`; and the
  MCP configuration with the proxy's URL. `argv` is `-p --output-format stream-json --force --approve-mcps
--workspace <cwd> --model <model> <prompt>`. `strip` is `.cursor/`. `requires` is `CURSOR_API_KEY`.
- Cursor has no effort flag; `DEEVY_AGENT_EFFORT` is documented as read by Claude Code only, and the config
  table gains a column saying which harness reads each variable.
- `--sandbox` exists and is left at its default in the spike, with a note: it may be a bound the container
  is currently providing, and turning it on is a follow-up with its own test.

**Acceptance test.** As slice 3, with `--harness cursor`.

---

## Slice 5: Copilot CLI (M)

**Goal.** The same Run, worked by GitHub Copilot's CLI.

**Depends on.** Slice 2.

**Questions answered first.**

- Is there a machine-readable output mode for `-p`? The programmatic reference documents none. If there is
  not, the recipe's `parse` sees only the final text, tool calls and refusals of repository tools are
  invisible to the Run's feed, and the deevy-tool trace comes from the proxy alone. That is a documented
  weaker tier, not a reason to stop.
- Where is the MCP configuration file under `COPILOT_HOME`, and what is an HTTP server's shape?
- Does headless mode require the working directory to be a trusted directory in `config.json`, and does the
  supervisor therefore write that file too?
- Which token scopes does `COPILOT_GITHUB_TOKEN` need? The session's shell will see this token. It must be a
  fine-grained token with Copilot access and **no repository permission**, distinct from
  `DEEVY_AGENT_GIT_TOKEN`, which the supervisor holds and the session never sees. A token that can push is a
  push the denylist cannot stop.

**Work.**

- `src/harness/copilot.ts`. `prepare` writes the MCP configuration and the trusted-directory entry under a
  `COPILOT_HOME` the supervisor owns. `argv` is `-p <prompt> --no-ask-user --allow-tool 'deevy(<tool>)'` per
  deevy tool, `--allow-tool read,write,shell` when there is a repository, `--deny-tool 'shell(git push:*)'`,
  `'shell(git remote:*)'`, `'shell(git config:*)'`, `'shell(gh:*)'`, `--model <model>`. `strip` is nothing the
  survey found: Copilot reads `.github/copilot-instructions.md` and `AGENTS.md` as input, which is allowed.
  `requires` is `COPILOT_GITHUB_TOKEN`.
- Instructions travel as a custom agent file under `COPILOT_HOME` selected with `--agent`, or as a prefix of
  the prompt if the agent mechanism cannot carry a system prompt; the first commit says which.

**Acceptance test.** As slice 3, with `--harness copilot`, plus a test that the token named in `requires` is
not the git token: the recipe refuses to start if the two variables hold the same value.

---

## Slice 6: Images, docs, the ADR, and the recipe page (M)

**Goal.** An operator can pull one image per harness, the documentation says what each harness bounds and
does not, the decision is recorded, and somebody outside this repository can add a recipe.

**Depends on.** Slices 1 through 5.

**Work.**

- **Images.** One Dockerfile with `ARG HARNESS`; the runtime stage installs that CLI at a pinned version and
  sets `DEEVY_AGENT_HARNESS`. The release workflow builds `deevy-agent:<version>-<harness>` and
  `deevy-agent:<harness>` for the four, and `deevy-agent:latest` stays Claude Code so the compose profile in
  OPERATIONS.md keeps working. A fat image with all four is not built: a session uses one harness and one
  credential.
- **Name.** The package is renamed from `claude-agent` to `agent` (`apps/agent`, `vp run agent#…`), because
  the name was the most Claude-specific thing left. The image name `deevy-agent` already fits. CLAUDE.md,
  PLAN.md, OPERATIONS.md, the README and the acceptance doc follow.
- **OPERATIONS.md.** The configuration table gains a "read by" column. A "Harnesses" section carries each
  recipe's `bounds` paragraph verbatim (convention 26), the credential each needs, and for Copilot the
  two-token rule from slice 5 in bold.
- **ADR-0018, "A harness is a CLI behind the session seam".** The decision, the reversal of ADR-0013's SDK
  paragraph with the reason it was right then, the proxy from slice 1 as the bound that replaced the header,
  the strip list as the bound for CLIs that cannot ignore project configuration, and the rule that a recipe
  declares what it cannot bound. ADR-0013 gets a one-line note pointing here.
- **`docs/harnesses.md`, the recipe page.** The seven requirements from the survey as a checklist, the
  `Harness` interface, the three free tests a recipe must ship, how to record a fixture, the tier a recipe
  lands in when a requirement is unmet, and the survey's table as the starting list, with a sentence that
  the four in-tree recipes are the ones this repository runs on every commit and the rest are the
  community's. `agent-loop.md` keeps its `claude` example and gains one sentence saying the runtime now
  drives that CLI, and any of three others, from a program.
- **Release.** Changeset, version, the four images pushed and pulled anonymously, `m4-acceptance.md` amended
  to say the walk now runs once per harness.

**Acceptance test.** `vp run agent#acceptance` walks both deployments times four harnesses with the scripted
session; CI green; each image starts with `--once` against a local deevy and exits zero with no key for the
harness present, refusing at the `requires` check with a message that names the variable.

### What the spike is expected to find

Written before building, to be corrected after. Copilot will be the weakest tier, for output rather than
permissions. OpenCode's `ask` will block, and the recipe will have no `ask`. Cursor's project-scope
permissions will be the one place a repository can widen something, and the strip list will be doing real
work there. And the proxy will turn out to be the change that mattered most, because it is the one that
made the four recipes smaller rather than larger.
