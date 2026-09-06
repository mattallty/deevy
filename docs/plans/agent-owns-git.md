# The agent owns git: vertical slices

Breakdown of the work that follows the harness spike, 2026-09-06. Vocabulary is
[CONTEXT.md](../../CONTEXT.md); the spike this continues is [harnesses.md](./harnesses.md), and the runtime
it changes is `apps/agent`. It is done when a session runs git as freely as a contractor would — its own
branches, its own commits, its own messages, pushed where it likes — while the credential that makes the
push possible stays with the supervisor and every ref the session moved is a fact a Human reads in the Run.

Five slices, in dependency order. Each is one PR on `main` that leaves deevy unchanged and carries its own
tests. Nothing in a slice is needed by an earlier one.

Two findings started this. A same-uid session reads the supervisor's environment through `/proc`, so the
Agent's key and the git token are reachable today by any harness with a shell, whatever the environment
allowlist says — proved in the shipped image, `grep -c DEEVY_AGENT_KEY /proc/1/environ` answering 1. And an
Agent that writes code cannot say anything about it: one commit per Run, one generic message, a pull request
whose title and body are a template, while the reasoning it wrote sits in deevy where no reviewer looks.

## Decisions taken

- **The session is a different user from the supervisor.** That is the bound the container was assumed to
  provide and does not. With two uids, the supervisor's `/proc` entry is unreadable to the session, the
  working directory is the session's alone, and the supervisor's own files — the harness configuration it
  wrote, the git credential, its memory — are outside what the session can reach. Everything else in this
  plan depends on it: a credential a session can steal is not held by anybody.
- **The session runs git, and git reaches the world through the supervisor.** The same shape as the MCP
  proxy ([ADR-0018](../adr/0018-a-harness-is-a-cli-behind-the-session-seam.md)): `origin` is a loopback URL,
  the supervisor forwards to the real remote and adds the credential, and the session holds nothing. This is
  not a credential helper. A helper hands git the token, and anything that can run git can run the helper and
  print it; a proxy never has one to hand over.
- **The agent pushes what it wants, where it wants.** No denied refs, no denied commands, no force-push
  guard. `git push`, `git remote`, `git config` and `gh` leave the harnesses' denylists. The runtime's job
  becomes making the push attributable, not making it small. **The cost is stated rather than mitigated:** an
  Agent can move the base branch, and a Gate does not stand in the way, because a Gate governs what deevy
  tracks and not what git holds ([ADR-0004](../adr/0004-agents-never-approve-gates.md) is about Issues). The
  control that does stand in the way is the forge's own branch protection and the scope of the token the
  operator issues, both of which are enforced by somebody other than us — which is the argument for
  preferring them to a denylist we wrote. OPERATIONS.md says this in those words, next to the token.
- **Every ref the session moved is an Activity.** The supervisor records the remote's refs when it clones and
  again when the session ends, and writes what changed into the Run's feed: the ref, the old and new commit,
  and whether the new commit has the old one as an ancestor. A force-push to the base branch is then a
  sentence a Human reads on the Issue rather than something nobody finds. This is what replaces the
  prohibition, and it is the answer to ADR-0014's second question — what a Human sees when an agent reaches
  further than intended.
- **Delivery becomes attribution.** When the session pushed, the supervisor stops pushing: it attaches what
  the session left, opens a pull request for a branch that has none, and uses the agent's own words for the
  title and body. When the session pushed nothing but changed files, the supervisor commits and pushes as it
  does today, because losing an Agent's work to a shell it never ran is the worse failure.
- **A laptop is not a container, and says so.** Two uids need a container: a process cannot become another
  user without the capability to do it. Run directly on a laptop, the runtime keeps its current shape, logs
  one line saying the session shares its user, and OPERATIONS.md is explicit that this is for trying it out
  rather than for a Workspace other people write in — which is what
  [ADR-0014](../adr/0014-an-agents-input-is-untrusted-and-its-tools-are-not.md) already says about the
  container being the sandbox.
- **deevy does not change.** No slice touches `packages/core`. The forge stays GitHub-only; a second forge is
  its own spike, and this one deliberately does not start it.

## Deferred

Restricting where a session may push, which is the point of the plan rather than an omission. A second forge.
Letting the agent open its own pull request through its own tooling, since the supervisor opening one with
the agent's words costs a slice and inventing a second API costs more. Per-Run network policy. Running each
session in a container of its own, which is the next boundary after the uid and wants a different deployment
shape.

## Conventions every slice follows

M1's eight, M2's five, M3's four and M4's four hold. The harness spike's five (23–27) hold for anything under
`src/harness/`. This adds three:

28. **What the session can reach is asserted by a session, not by reading the code.** Every claim about the
    uid boundary is a test in which a fake harness tries the thing and fails: reading the supervisor's
    environment, writing outside the working directory, finding the token in `.git/config`.
29. **A credential appears in exactly one process.** A test greps the session's environment, its argv, its
    home directory and the working directory for the git token and the Agent's key, and finds neither. The
    same test exists for the MCP key today; this widens it to git.
30. **Every ref that moves is in the Run's feed.** A delivery test asserts the Activities, not just the
    branch: what moved, from what to what, and whether it was a fast-forward.

## Dependency order

```
harness spike
└─ 1 The session is its own user
   └─ 2 git reaches the world through the supervisor
      ├─ 3 What the session pushed is the record
      │  └─ 4 The pull request in the agent's own words
      └─ 5 Docs, the ADR, and the release        needs 1 through 4
```

Sizes are t-shirt estimates for one developer plus agents: S under a day, M two to three days, L a week.

---

## Slice 1: The session is its own user (L)

**Goal.** A session cannot read the supervisor's environment, its files, or anything outside the working
directory it was given.

**Depends on.** The harness spike.

**Questions the first commit answers.**

- Which shape does the container take: the supervisor as root dropping to a session user per spawn, or a
  supervisor that stays unprivileged beside a small setuid helper? The first is one `spawn` option and a
  capability; the second is more machinery and a smaller blast radius if the supervisor has a bug.
- Which capabilities does the image actually need? `--cap-drop=ALL --cap-add=SETUID --cap-add=SETGID` is the
  guess; the answer is what the smoke proves.
- Does anything the supervisor does after the session need to read files the session wrote as another user,
  and does it still work? `git status`, `git add -A` and the diff all run as the supervisor.

**Work.**

- The image gains a second user, `session`, uid 10002, with no home of its own and no shell in `/etc/passwd`
  beyond what the harness needs. The supervisor keeps 10001, or becomes root for the spawn, per the answer
  above.
- `runHarness` spawns with `uid` and `gid` when the runtime is configured for it, and the working directory
  and the session's `HOME` are created and then handed to that user before `prepare` writes into them.
- `openWorkspace` chowns the clone. The credential is used before the chown and is never in the tree, which
  is already true and now testable from the other side.
- `readConfig` gains nothing an operator must set. The runtime uses the session user when it can and logs one
  line when it cannot, naming what is not bounded.

**Acceptance test.** A fake harness that tries, and fails: reading `/proc/<supervisor>/environ`; reading the
supervisor's home; writing outside the working directory; reading `DEEVY_AGENT_GIT_TOKEN` from anywhere. The
same suite passes unchanged with one uid, because a laptop still has to work. The container smoke in CI runs
the same fake harness inside the image, which is the only place the claim is real.

---

## Slice 2: git reaches the world through the supervisor (L)

**Goal.** The session runs any git command it likes, pushes anywhere the token allows, and never holds the
token.

**Depends on.** Slice 1.

**Questions the first commit answers.**

- Smart HTTP is a small protocol to forward — `GET /info/refs`, `POST /git-upload-pack`,
  `POST /git-receive-pack` — but the acceptance walk's remote is a bare repository on disk with no server in
  front of it. Does the proxy spawn `git http-backend` for a path remote, so one code path serves both? That
  is the shape to try first.
- Does anything need the packfile parsed? The record in slice 3 comes from comparing refs, so probably not,
  and not parsing is the difference between a week and a month.
- What does the session see when the remote refuses — a protected branch, a bad token? The proxy must pass
  the forge's own words through, because "the remote refused" with no reason is the worst thing a session can
  be told.

**Work.**

- `src/git-proxy.ts`, beside `src/proxy.ts` and in the same style: a loopback listener, bytes forwarded, the
  `Authorization` header added on the way out, and the upstream's answer returned as it came.
- `openWorkspace` clones as it does today and then rewrites `origin` to the proxy's URL, so the session's
  first `git remote -v` shows a loopback address and nothing else.
- The harnesses' `deniedTools` lose `git push`, `git remote`, `git config` and `gh`. Each recipe's argv
  snapshot moves in the same commit, which is convention 24 doing its job: the change is visible in a
  diff of four asserted lists.
- `gh` is left alone rather than enabled: it needs a token of its own, and the proxy does not give it one.
  The recipes say so.

**Acceptance test.** A session that runs `git checkout -b whatever`, commits twice with its own messages,
and pushes; the bare remote has both commits on that branch. A session that pushes to the base branch
succeeds, and the test says so, because that is the decision. A session that greps its own environment, argv,
`.git/config` and home for the token finds nothing (convention 29). The proxy refuses a connection that is
not from loopback. The acceptance walk gains a Run whose session does its own git.

---

## Slice 3: What the session pushed is the record (M)

**Goal.** A Human reading the Issue can see every ref the Run moved, and whether it rewrote anything.

**Depends on.** Slice 2.

**Work.**

- The supervisor records `git ls-remote` at clone time and again when the session ends, and diffs the two.
- For each ref that moved: an Activity naming it, the old and the new commit, and whether the old is an
  ancestor of the new (`git merge-base --is-ancestor`). A ref that is not a fast-forward is said plainly, and
  the base branch moving is said first, because that is the one worth reading.
- `deliver` becomes conditional. The session pushed: attach every branch it created as a Link on the Issue
  carrying the Run's id, and open a pull request for one that has none. The session pushed nothing and
  changed files: today's behaviour, unchanged. The session did neither: nothing, as today.
- The double-delivery gap the harness spike found is closed by the same change. A Run that delivers twice —
  once before a Gate and once after the ruling — currently pushes a second time from a fresh clone with no
  knowledge of the first push, which is a non-fast-forward rejection reported as a comment. With the session
  pushing, the second pass pushes on top of what the first left; with the supervisor pushing, it fetches the
  branch it made before rather than branching from base. A test covers both, and there is no test today.

**Acceptance test.** A session that force-pushes the base branch: the Run's feed says so, naming the ref and
both commits, and the Issue carries it. A session that pushes two branches: two Links, one pull request for
whichever has none. A Run that delivers on both passes: one branch, both commits, no rejection.

---

## Slice 4: The pull request in the agent's own words (S)

**Goal.** A reviewer opening the pull request reads what the Agent decided, not a template.

**Depends on.** Slice 3.

**Work.**

- When the supervisor opens a pull request, the title and body come from the Run's own summary — the text
  `runs_finish` already carries — with the Run's id, the Issue key and the deevy URL appended as provenance.
  A Run with no summary keeps today's line, so nothing regresses.
- `src/instructions.md` gains a sentence: what you write when you finish is what a reviewer reads.
- A commit the supervisor makes on the session's behalf takes its message from the same place.

**Acceptance test.** A scripted session finishes with a summary; the stub forge receives a pull request whose
body contains it. One that finishes with nothing gets the old line. The instructions test asserts the new
sentence is shipped.

---

## Slice 5: Docs, the ADR, and the release (M)

**Goal.** An operator knows what the two uids buy, what the token can now do, and what nobody is stopping.

**Depends on.** Slices 1 through 4.

**Work.**

- **ADR-0019, "The session is its own user and git goes through the supervisor."** The `/proc` finding as the
  reason. The proxy as the shape, and why a credential helper is not one. The decision to let an agent push
  anywhere, the argument for the forge's protections over our denylist, and the cost said plainly. What
  ADR-0014's bounds now say, and which of its sentences this rewrites.
- **OPERATIONS.md.** "What is bounded, and what is not" gains the uid and loses the git denylist. The token
  row says, in bold, that its scope is now the whole of what limits where an Agent can push, and that a
  protected base branch is the operator's to configure. Each harness's `bounds` paragraph drops the git
  denials, which is four one-line edits in four recipes.
- **docs/harnesses.md.** A recipe no longer denies git, and the checklist says why.
- **agent-loop.md and as-yourself.md.** The worked example's loop can now commit and push; the snippet says
  so.
- Changeset, version, images, and the acceptance walk re-run on both deployments.

**Acceptance test.** `vp run agent#acceptance` passes; CI green; the container smoke proves the uid boundary
inside the image rather than on a developer's machine.

### What this is expected to find

Written before building, to be corrected after. The supervisor will end up root in the container and that
will feel worse than it is. `git http-backend` will make the acceptance walk work and will be the reason the
proxy is one code path rather than two. Some harness will turn out to set `credential.helper` or
`safe.directory` on its own and fight the prepared git configuration. And the ref record will be the part
operators actually ask for, because "what did it push" is the question a Human has when they open the Issue.

---

## Found by building the plan

**The capabilities were guessed wrong, and a probe in the image said so.** Slice 1 shipped
`--cap-drop=ALL --cap-add=SETUID --cap-add=SETGID`, which is enough to _become_ the session and not enough to
_hand it_ anything: `chown` needs `CHOWN`, and reading back and removing what the session wrote needs
`DAC_OVERRIDE`. With the first two, every Run would have failed at its first working directory. The
container smoke now does the whole round trip rather than only the `/proc` half, and it runs with exactly
the command OPERATIONS.md gives an operator, so the documentation cannot drift from what works.

**`git http-backend` was the right guess.** One code path serves a remote on the internet and a bare
repository on disk, which is what keeps the acceptance walk offline. It needed `http.receivepack` turned on:
git's CGI refuses an anonymous push by default, which is the correct default for a git server and the wrong
one for a listener whose only client is the session.

**The proxy has to outlive the session.** The first version closed it beside the MCP proxy, before the
delivery step — and the supervisor's own push goes through it too, so the branch never reached the remote.
The acceptance walk caught it, which is the second time it has caught an ordering mistake that every unit
test was happy with.

**The double-delivery gap was real.** A Run that delivers before a Gate and again after the ruling pushed a
history the remote's own branch was not part of, which git rejects; the second pass's work was reported as
"could not be delivered" and lost. It now continues the branch. There was no test; there is one.

**`safe.directory` is the price of two users.** git refuses a repository owned by somebody else, and the
supervisor is now somebody else as far as the clone is concerned.

**What was expected and what was found.** The supervisor being root does feel worse than it is, as predicted.
`http-backend` was predicted and was right. No harness fought the prepared git configuration, which was
predicted and did not happen. And the ref record is the part that reads best in the feed: "Rewrote
refs/heads/main from 1a2b3c4 to 5d6e7f8, which is not a fast-forward" is a sentence a Human acts on.
