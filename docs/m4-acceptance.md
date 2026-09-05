# M4 acceptance: the reference runtime working an Issue end to end

M4 is done when [PLAN.md](./PLAN.md)'s M2 scenario runs with `apps/claude-agent` driving it rather than a
person driving Claude Code by hand — on the Node deployment, and then on a Cloudflare Worker built from the
same commit, with nothing changing but `DEEVY_URL`. That last part is the strongest evidence for
[ADR-0006](./adr/0006-runtime-agnostic-core-node-first.md) anyone has produced: a client that cannot tell the
two deployments apart.

**Status: executed, and executed on every commit.** It is a script rather than a runbook, and it needs no
Cloudflare account, no GitHub OAuth App and no repository on the internet:

```bash
vp run claude-agent#acceptance
```

Twenty-nine checks, fourteen against each deployment plus one comparing them. CI runs it after the Workers
smoke.

## Why it needs nothing outside this machine

| What the walk needs                        | What it uses instead                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| A deployed Worker                          | `wrangler dev --local` — miniflare with a real local D1, no account                                                 |
| The Docker image                           | The packed Node bundle, on a port it picks                                                                          |
| A GitHub OAuth App, so a Human can sign in | `apps/web/scripts/stub-github.js`, prepended to whichever bundle is under test: the OAuth code is the email address |
| A repository the Agent may push to         | A bare git repository in a temporary directory, and real `git`                                                      |
| GitHub's pull-request API                  | A stub HTTP server, reached through `DEEVY_AGENT_GITHUB_API`                                                        |
| An Anthropic key                           | A scripted session — see below                                                                                      |

Nothing is mocked on deevy's side. The Worker is the built Worker with its own bindings and asset routing;
the Node server is the bundle the Docker image runs; sign-in is Better Auth's real OAuth dance with only the
far end replaced; and everything the runtime does goes over HTTP and `/mcp` on a socket.

## What is real, and what is scripted

**The supervisor is real.** Discovery, the claim, the envelope, the Gate round trip, the working directory,
the branch, the push, the pull request, the Link and the comment are `apps/claude-agent/src` doing its own
job.

**The model's judgement is scripted**, and the scripted session writes over `/mcp` with the Agent's key
exactly as Claude would — `runs_list`, `runs_post_activity`, `documents_get`, `documents_write`,
`runs_request_approval`, `runs_finish`. So the surface is the real one even though the reasoning is not.

**What this cannot stand in for is Claude.** A scripted session always calls the right tool in the right
order; a model may not. That is `apps/claude-agent/tests/live.test.ts`, skipped unless you ask:

```bash
DEEVY_AGENT_LIVE=1 vp run claude-agent#test tests/live.test.ts
```

It needs an Anthropic key and spends money, so CI never runs it. **It has not been run.** Pointing it at
either deployment this script starts is the remaining manual step, and the only one.

## What it walks

1. **A Human sets the work up**, over the surface the SPA calls, after signing in with GitHub: a Project, an
   Agent, the grant that makes the Project exist to it, and a key shown once. Then an Issue with an intent
   Document, the Intent and Spec Gates approved, and the Issue assigned to the Agent — which is the trigger,
   and opens a Run in `pending` before anything wakes up.
2. **The runtime says which Member it is**, which is the first thing it does on startup and the thing a wrong
   key fails at.
3. **The first pass.** The Run is taken up, the session reads the intent and writes the plan, and the Run
   stops at the Plan Gate with an elicitation carrying a deevy URL. Nothing is delivered by a Run that only
   asked.
4. **A pass over a Run nobody has ruled on** reports it and does not work it. A Run waiting on a Human is not
   the runtime's, however long it waits.
5. **The Human rules**, with a note. The next pass resumes the Run — because deevy moved it back to `active`
   and told the Agent so — and the resumed session's prompt carries the decision and the note.
6. **The evidence.** A branch named after the attempt is on the remote and `main` is untouched; a pull
   request was opened against the base branch; the pull request is a Link on the Issue attributed to the Run
   that produced it; and a comment names both.
7. **The record.** The Event log reads
   `run.started run.activity document.updated run.activity run.awaiting_input gate.approved run.answered
run.activity run.activity run.completed issue.link_added comment.created`, with the Agent as actor
   throughout and the Human exactly one hop away at the three Events that are theirs — the assignment that
   triggered the Run, the ruling, and that ruling reaching the Run.
8. **The same walk on the other deployment**, and the two Event logs are compared to each other.

## Running it against something else

```bash
vp run claude-agent#acceptance -- --url https://deevy.example.com
```

It walks whatever is there, including a real deployment. It creates a Project `PLN` and an Agent `Planner`,
so point it at an instance you do not mind it writing to. Signing in still goes through the GitHub stub, so
against an instance that was not started by this script the sign-in step is the one that will fail.

## What the walk found

Three assertions written from memory were wrong about deevy, and each was worth knowing:

- **`run.started` is attributed to the Human whose assignment triggered it**, not to the Agent. That is
  PLAN.md's accountability rule visible in the log — the Run records the Member that triggered it.
- **`run.answered` is the Human's too**, because it records their ruling reaching the Run rather than the
  Agent doing anything.
- **The story is richer than the one the plan sketched.** `document.updated`, `issue.link_added` and
  `comment.created` sit in the same log, so the Event log alone says what was written, what was attached and
  what was said — without anyone having to know what the runtime did internally.

One thing had to change to make the walk runnable rather than merely written: `DeevyError` used TypeScript
parameter properties, which Node's type stripping refuses rather than erases, so the source could not be run
directly by a script. The fields are assigned in the constructor now.

## Recording the result

The script is the record: a failing check names itself and what it saw. When something is added to the
milestone, add its check here rather than to a document nobody executes — a walk that runs on every commit is
the only kind that stays true.
