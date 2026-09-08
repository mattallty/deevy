# A Gate may want more than one Human, and may exclude the one who asked

[ADR-0004](./0004-agents-never-approve-gates.md) says an Agent never approves a Gate, and
[ADR-0010](./0010-a-delegated-credential-cannot-decide-a-gate.md) says a delegated credential cannot either.
Both answer _which kind of caller_ may rule. Neither says how many rulings a Gate takes, or whether the
Human who asked for one may give it — and until now the answer to both was the same: one, from anybody,
including the person who put the Issue there. This records the two rules that changed and the three that
did not.

## Why now

The last two spikes leaned on the Gate harder. An Agent drives four different CLIs
([ADR-0018](./0018-a-harness-is-a-cli-behind-the-session-seam.md)) and pushes where it likes
([ADR-0019](./0019-the-session-is-its-own-user-and-git-goes-through-the-supervisor.md)), so the Gate is the
only place a Human still stands between a proposal and a decision. A single approval from anybody is a thin
place to put that much weight.

## The decision

**A Gate carries a threshold, and it defaults to one.** `workflow_state.approvals_required`. Every Workflow
that existed before the column keeps behaving exactly as it did, which is what makes the change safe to ship
to instances nobody asked.

**A Gate may carry an exclusion, and it defaults to off.** `workflow_state.exclude_requester`. Two flags
rather than one, because they answer different questions and a Workspace may want either alone: two
approvals from anyone, or one approval from anyone but the author.

**Approvals count for one visit, and only a rejection begins a new one.** Distinct Humans who approved since
the later of `stateEnteredAt` and the last rejection of that Gate. Counting from `stateEnteredAt` alone was
the first draft and it is wrong where it matters most: a rejection in the first State of a Workflow has
nowhere to send the Issue, so it stamps nothing, and approvals given before it would have survived it — a
Gate a Human had just rejected would open on the next click. The default template Gates on leaving Intent,
and Intent is the first State, so this is the common case rather than a corner.

Only a rejection begins a visit. An approval is a ruling too, and a rule that restarted on every ruling
would restart on every approval, so no Gate could count past one.

**One rejection ends it, however many approvals were wanted.** Deliberately asymmetric. Consensus is for
letting something through; anyone who sees a reason to stop has seen enough. A Gate that needed two
rejections would let one reviewer's objection be outvoted, which is not what a Gate is for. The requester,
excluded from approving, may still reject: they are not being silenced, they are being told they cannot
also be the agreement.

**A partial approval is its own Event.** `gate.approval` per Human, carrying how many are still wanted.
`gate.approved` continues to mean the Issue left the Gate, so the Run resume, the timeline, the webhooks and
every other consumer of the log keep meaning what they meant. A subscriber receives a kind it did not ask
for, which is what an append-only log does; one that switches on kinds ignores it and one that displays them
gains a true line.

**The requester is one hop, through the Sponsor.** The actor on the move that brought the Issue to this
Gate, and when that actor is an Agent, its Sponsor. That is PLAN.md's own rule for accountability — the
accountable Human is the triggering Human, or the Sponsor when an Agent triggered it — asked about who
should not be the one to wave the work through. Two things make it abstain rather than guess: only Events at
or after `stateEnteredAt` are read, so an Issue carried into a State by an edit to the Workflow (which
appends no Event of its own) excludes nobody; and a rejection that could not move the Issue is not the move
that put it there.

**A Gate nobody could open is refused where it is written.** `workflow.update` counts the Humans who could
actually approve and refuses a threshold above it, naming both numbers. The exclusion reserves one Human
from every count — which Human is not known until there is an Issue, but that one of them will be is — so a
Workspace of one cannot exclude anybody at all. deevy's stated zero-config case is a solo developer, and the
failure of getting this wrong is an Issue nobody can move with no error that says why.

**A pool that shrinks afterwards is said out loud, not guessed around.** Suspending a Member can make a Gate
unsatisfiable after it was configured, and no amount of checking at configuration time prevents that. The
Issue page states the arithmetic where the button would be — how many approvals it wants, how many Humans
could give one — and names an admin's job. Saying it is the whole fix; lowering the threshold on somebody's
behalf would be deevy deciding what the Workspace meant.

**One function answers who could approve.** Four callers need the same answer — the inbox asks who to tell,
`workflow.update` asks whether a threshold can ever be met, `gates.approve` asks whether this Human counts,
and the Issue page asks what to say — and four inputs feed it: the named approvers, the active Humans, the
requester, and who has already approved. Every one of them can change between configuring a Gate and opening
it. Disagreeing about that arithmetic is how a Gate becomes unopenable, so there is exactly one of it.

## What it does not change

**Who may rule.** Still a Human, still in a browser. An Agent cannot approve a Gate (ADR-0004) and a
delegated credential cannot (ADR-0010); neither is weakened, and ruling on a Gate still does not join the
MCP tool set ([ADR-0016](./0016-a-run-is-an-agents-and-the-registry-says-which-way-an-operation-faces.md)).
What changes on that surface is only that `runs_request_approval` answers `awaiting` for longer — though not
for free: it decided from the most recent ruling since the Run asked, so the first of two approvals would
have told a waiting Agent the Gate was approved while the Issue was still in it. An approval answers only
when the Issue actually left.

**What a Gate is.** A State an Issue cannot leave without a Human's approval. It may now want more than one,
which is a number on the same idea rather than a new one.

## What this deliberately does not become

Approval by role or by Team rather than by named Member, which wants a permission model deevy does not have.
A Gate that needs one approval from each of two named groups. Time-boxed approvals that expire. Delegating
your approval while away. And a refusal of the approval itself when a Gate cannot currently be satisfied:
the operation still records it, because an admin lowering the threshold is the fix and a recorded approval
is still true — the Issue page is where that is said, not the API.

## What it costs

Two statements on deevy's busiest write. An Issue in a Gate carries its standing, and the two are the
eligibility questions: the approvers the Gate names, and the Humans of the Workspace who are not suspended.
The rulings themselves are free, because the Issue page already loads them for its history. An Issue in a
State that is not a Gate asks neither question. `packages/core/tests/budget.test.ts` holds the number and
the reason, against D1's cap of 50 per invocation.
