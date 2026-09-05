# The reference agent runtime

deevy never runs an agent ([ADR-0003](../../docs/adr/0003-deevy-triggers-agents-but-never-runs-them.md)). It
gives an Agent an identity, tells it there is work, and takes a Run back; the running happens outside. This is
the outside part: a service that holds one Agent's API key, asks deevy what that Agent has been assigned, and
runs Claude against it through the [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk).

**It is not part of deevy, and deevy does not need it.** An instance with no runtime is a Workspace where the
Humans do the work. It lives in this repository so CI can drive it against a real deevy on every commit, and
because a reference implementation is worth more than a description of one.

It reaches deevy over HTTP and MCP like any third party, so it does not care which deployment it is talking
to. Point it at a Docker instance or at a `workers.dev` origin and the only thing that changes is `DEEVY_URL`.

## Running it

[`docs/OPERATIONS.md`](../../docs/OPERATIONS.md#the-reference-agent-runtime) is the operator's guide: creating
the Agent, granting it Projects, issuing its key, the repository and git credential, the webhook, the full
configuration table, and — read this one — what is bounded and what is not.

The short version, against a deevy on localhost. From the repository root:

```bash
vp run claude-agent#build
```

Then from this directory:

```bash
DEEVY_URL=http://localhost:3000 DEEVY_AGENT_KEY=<the key> node dist/main.mjs --once
```

`--once` makes one pass and exits. Without it the loop stays up, polling every `DEEVY_AGENT_POLL_SECONDS` and
backing off while there is nothing to do. It listens on 8787: `/healthz` always, and deevy's signed webhook
deliveries when `DEEVY_AGENT_WEBHOOK_SECRET` is set — a delivery cuts the wait short so a Run starts when it
is assigned rather than at the next poll.

## What it does with a Run

`runs.list` with no arguments is the queue: for an Agent that means its own Runs, and `pending` is work to do.
Nothing is remembered between passes, so a restarted container and a second host behave like the pass before.

It takes up one Run at a time, gives the session a working directory — a fresh clone of the configured
repository, or an empty directory when there is none — and lets the model read the Issue, write the Document
its State asks for, narrate through `runs_post_activity`, and stop at a Gate.

A Run stopped at a Gate is not the runtime's any more. deevy moves it back to `active` the moment a Human
rules and tells the Agent so, and that Notification is what hands it back — so the runtime never polls a Gate
and never asks the same question twice.

A Run that changed files gets a branch named after the attempt, a commit, a push and a pull request, and the
pull request's URL becomes a Link on the Issue carrying the Run's id. Nothing is ever pushed to the base
branch.

Whatever the session does, the Run does not rot. One that crashes, hangs or simply stops gets an error
Activity and a failed Run, because a Run left `active` and silent tells a Human nothing until deevy's sweep
calls it `stale` half an hour later.

## The rule that shapes this package

**No `packages/core` import, and no `workspace:*` runtime dependency.** It has exactly one dependency, the
Agent SDK. `tests/boundary.test.ts` reads the manifest and the sources and says so.

That is not tidiness. It is what makes this package a test of the surfaces
([ADR-0005](../../docs/adr/0005-one-core-three-surfaces.md)) rather than a second view of the same objects: if
an operation is awkward from here, that is a finding about deevy's HTTP or MCP surface, not something to work
around with an import. The clearest return so far is `src/receiver.ts`, which verifies deevy's
`deevy-signature` with code that has never seen the signer — a check a shared function could never make.

devDependencies are the exception and may reach into the workspace, because standing a real deevy up is what
they are for.

## The seam, and why no test needs an API key

```ts
type Session = (input: SessionInput) => AsyncIterable<SessionEvent>;
```

Everything else hangs off that. The real one is `buildSession`, which is `query()` from the Agent SDK with
options that are the whole security boundary. A test's is four lines that yield scripted events and call back
into a real deevy exactly as the model would.

So the loop, the envelope, the Gate round trip, the working directory and the delivery are all testable for
free — 84 tests, every one against a real deevy, none of them costing anything. One test calls the model and
is skipped unless you ask:

```bash
DEEVY_AGENT_LIVE=1 vp run claude-agent#test tests/live.test.ts
```

CI never sets it. A milestone whose suite needs a paid key is a milestone nobody runs twice.

## The files

| File                             | What it is                                                                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `src/config.ts`                  | Everything it reads from the environment, once, never at module scope.                                                            |
| `src/deevy.ts`                   | deevy over HTTP, hand-written, narrow: the operations the supervisor itself calls.                                                |
| `src/session.ts`                 | The seam, and the four events the supervisor has an opinion about.                                                                |
| `src/sdk.ts`                     | The real session, and the options object a test asserts whole.                                                                    |
| `src/instructions.md`            | What the session is told about working an Issue. The original of the snippet in [`docs/agent-loop.md`](../../docs/agent-loop.md). |
| `src/work.ts`                    | One pass and one Run: discovery, the claim, the envelope, the resume.                                                             |
| `src/workspace.ts`               | A clone per Run, and the credential the session never sees.                                                                       |
| `src/deliver.ts`, `src/forge.ts` | The branch, the push, and the pull request.                                                                                       |
| `src/loop.ts`                    | Staying up: a sequential loop, backoff, and a stop that finishes the sentence.                                                    |
| `src/receiver.ts`                | `/healthz`, and deevy's signed deliveries.                                                                                        |
| `src/main.ts`                    | The process.                                                                                                                      |
| `src/index.ts`                   | What the package exports, for the acceptance script and for anyone embedding it.                                                  |
| `scripts/acceptance.ts`          | The milestone's own walk, on both deployments, with nothing outside this machine.                                                 |
| `scripts/boot.ts`                | Starting deevy on either deployment locally, with the outside world stubbed.                                                      |

## Copying it into your own repository

It is meant to be copied. Two things need doing when you do:

- **Resolve the `catalog:` version.** `pnpm-workspace.yaml` pins the Agent SDK exactly, and `catalog:` only
  means something inside this workspace. Pin the same version yourself, on purpose — it is a 0.x, and what
  moves in it is the options object that decides what an agent with a shell may do.
- **Take the tests.** `tests/helpers.ts` stands a real deevy up in-process; that is the part worth keeping,
  and it is the part that will tell you when you have broken something.

## Where the decisions are

- [ADR-0013](../../docs/adr/0013-the-reference-runtime-is-a-service-not-a-ci-job.md) — why this is a service
  and not a GitHub Action, and what that costs.
- [ADR-0014](../../docs/adr/0014-an-agents-input-is-untrusted-and-its-tools-are-not.md) — Issue text is
  written by anyone with Project access and reaches a session holding a shell. What bounds that, and what does
  not.
- [`docs/plans/m4.md`](../../docs/plans/m4.md) — the ten slices this was built in, each with what building it
  found.
- [`docs/m4-acceptance.md`](../../docs/m4-acceptance.md) — the acceptance walk, which is a script:
  `vp run claude-agent#acceptance`.
