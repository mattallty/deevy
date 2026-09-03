# Research: Anthropic "The AI-native SDLC playbook" (claude.com/blog, Louis Claxton, 2026-08-21)

## Thesis
Code generation is no longer the constraint; plan, review/test, deploy and human-assumed controls are.
SDLC becomes a loop: each stage commits a version-controlled artifact that the next stage reads and
that automatically triggers it. Humans stay accountable at gates. "The chain of commits is the audit trail."

## Artifact chain
intent.md (Problem, Proposed outcome, Affected users/systems, Constraints, Open questions; Author; Status)
 -> spec.md (requirements + design, flagged concerns each owned by a policy owner; provenance: prompt + skill versions)
 -> plan.md (files that change, order of work, tests that prove it; approved before code; updated in same commit as any deviation)
 -> diff + tests + PR (agent review passes: bugs/security/compliance; Important vs Nit; findings never approve/block alone)
 -> release per env (agent prepares, release manager authorizes, hook enforces)
 -> incident / finding record -> new intent.md

## Gates & roles
Originator, Product Owner (accepts intent, signs spec), Policy Owner (resolves flagged concerns),
Engineer (accepts plan), Tech Lead/Architect (higher-risk plans; owns REVIEW.md), Code Owner (approves PR),
Release Manager (prod authorization), Service Owner/On-call (triage queue), Security Lead (scan triage),
Platform Engineer (intent home, hooks, evals). Risk classification decides who approves.
Separation of duties is structural: the proposing agent has no route to approve.
Approval gates belong at artifact boundaries, not mid-build (keeps humans off critical path of parallel sessions).

## Trackers
Legacy trackers persist; "fit around what exists". One source of truth per artifact type. Three configs:
repo as SoT / legacy tracker as SoT (md are working copies; agent reads record at session start, writes back via MCP) /
linkage minimum (artifact carries record ID, record carries commit SHA).
Tickets are triggers (ticket -> intent.md; agent tagged on a ticket over MCP triages it).
Triage queue of agent-generated intents/findings: fix now / schedule / dismiss (reason required; suppress recurrence).
Findings exported to existing tracker for auditors. MCP is the only integration mechanism named.

## Decomposition & sizing
No story points, estimates, refinement. Sizing is binary: one-PR fix -> straight to PR gate; larger -> intent.md.
Tasks split by files touched; file-independent tasks parallelize (one worktree/session each); shared-file tasks serialize.
2-3 parallel sessions; ceiling = human review capacity.

## Identity & audit
Non-interactive runs and Claude Tag act under the agent's own identity; interactive sessions attributed to the engineer.
Every transition timestamped and attributed; metrics derive from transition timestamps, PR metadata, hook/eval logs.

## Verification
Agent self-verifies before a human sees output; verifier subagent in fresh context; evidence attached to PR/check run.
Evals as regression tests for agent config (CLAUDE.md, skills, hooks); every incident becomes an eval.

## Implications for a PM tool
Must hold/link: intent, spec, plan (versioned, with provenance), PR + findings, verification evidence,
incident/finding records with dismissal reasons, agent-config objects, hook decision log.
State transitions must fire triggers. Agents read record at start, write outcome back, act under own identity,
write access via proposal only. Humans need: triage queue, flagged concerns routed to owners, plans for
interrogation, PRs with ranked findings, blocked actions with route to approval, roles as fields,
SoT declaration per artifact, record ID <-> commit SHA links, full audit chain per change.
