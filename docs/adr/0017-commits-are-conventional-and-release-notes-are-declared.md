# Commits are conventional, and release notes are declared rather than derived

deevy kept no changelog through M0 to M4, and its log was written as prose: `A Gate says who may rule on it,
instead of implying it`. That reads well and it is not machine-readable, so the only way to learn what a
release contained was to read thirty commits and decide. Two changes fix that, and they are separate
decisions that are easy to mistake for one.

**Commits are conventional commits**, in the standard imperative: `feat(gates): add ruling authority to
Gate`. Not a house dialect with the prose subject kept — every tool that reads this format expects lowercase
imperative, and a dialect would have to be taught to each of them for no reader's gain. The voice moves to
the body, which stays prose and stays unwrapped, and to the changeset summaries.

**Release notes come from changesets**, which a pull request writes by hand, and not from the commit types.
This is the part that looks redundant and is not: a conventional commit classifies a _commit_, and a
changeset declares a _user-visible change and how big it is_. Deriving the changelog from commit types —
which is the usual reason to adopt conventional commits at all — would make the release notes a function of
how somebody chose to split their work into commits. A `feat:` nobody outside this repository can observe
gets an empty changeset; a one-line `fix:` can be the minor bump.

Decided 2026-09-06, the first after-v1 change that is tooling rather than product;
[docs/plans/commits-and-changelogs.md](../plans/commits-and-changelogs.md) is the implementation.

## What that costs, and where it is paid

- **Two ledgers per pull request**, one of which is easy to forget. The forgetting is caught by
  `changeset status --since=origin/main` in `pull-request.yml`, which fails the pull request. Most of the
  friction lands on Agents, who write most of the commits here — so both rules are in CLAUDE.md, not only in
  the developer docs.
- **`config-conventional` rejects this repository's own history** in two rules, and they are switched off in
  `commitlint.config.js` rather than worked around: `body-max-line-length` and `footer-max-line-length` both
  default to 100, and the bodies here are unwrapped paragraphs — one in recent history is a single
  700-character line. `subject-case` needed no change, which is worth recording because it is the rule
  everybody expects to be the problem: it judges the casing of the whole subject, so `add ruling authority to
Gate` passes and the CONTEXT.md vocabulary keeps its capitals mid-sentence.
- **No `scope-enum`.** A scope is optional and free-form. The changelog is grouped by the packages a
  changeset names, so a scope list would be a second vocabulary to keep in step with the workspace for
  nothing a reader sees.
- **Nothing before this is rewritten.** Every commit up to here keeps its prose subject and its missing type,
  and the changelog starts at 0.4.0 with a pointer to PLAN.md rather than a backfill that invents dates for
  releases that were never tagged.

## One version, because there is one product

Nothing here is published to npm; a release is two Docker images and a `vX.Y.Z` tag. So all seven workspace
packages sit in a changesets `fixed` group with `privatePackages: { version: true, tag: false }`, and the one
number they share is the image tag. Changesets writes a `CHANGELOG.md` per package and offers no way to stop
it, so those are gitignored and folded into the root one by `tools/release/scripts/fold-changelog.ts`. They are
left on disk deliberately: `changesets/action` reads them back after the version command to compose the
Version PR, and deleting them fails the release, which is how the first run of this ended. Being gitignored is
what keeps them out of the commit, and only the newest section is ever read. If `@deevy/core` is ever published, splitting it out of the `fixed` group is one line.

## Release candidates, and not snapshots

Changesets' pre-release mode is supported, because an rc is a thing deevy will want and the cost was small:
an rc publishes images under its own tags, is a prerelease on GitHub, and does not move `latest` — the same
`-` in the version decides all three. Leaving pre mode re-lists every change in the final version's notes, so
the fold drops the `X.Y.Z-*` sections that release supersedes.

`changesets/action` is pinned exactly, and its major must match the changesets CLI's: v1 bundles changesets 2,
v2 bundles 3. Running the CLI at 3 under the action at v1 works for every ordinary release and fails only in
pre-release mode, where the two disagree about the shape of `.changeset/pre.json` — the older code looks for a
file the newer CLI never wrote. Move the pin and the catalog entry together, the way the other pre-release
lines in this repository are moved.

The one caveat is structural and worth writing down rather than discovering: `changesets.yml` runs on `main`,
so while pre mode is on every merge to `main` joins the rc line and no stable patch can ship without exiting
first. The changesets documentation recommends a dedicated branch for exactly this. deevy does not have one,
because it has no maintained stable line to patch — an rc here is a stabilising period, not a parallel
release train — and if that ever stops being true, the branch is the answer rather than more workflow.

**Snapshot releases are deliberately absent.** They exist so somebody can `npm install` a branch, and the
changesets documentation is explicit that a snapshot version commit must never be merged — which is the
opposite of a flow whose whole mechanism is merging a Version PR. The equivalent here is an image tagged by
commit, which needs nothing from changesets.

## The release fires by call, not by tag

`changesets.yml` calls `release.yml` through `workflow_call` when a Version PR merges. This is a constraint
and not a preference: **a tag pushed with `GITHUB_TOKEN` does not trigger a workflow**, so wiring the merge
to push `vX.Y.Z` and leaving `release.yml` on its tag trigger produces a release that silently never happens.
The tag is still created, because OPERATIONS.md and the image tags refer to it, and a hand-pushed `v*` tag
still publishes — that route stays as the escape hatch for a release made outside this flow.

Releasing takes **two** conditions, and getting this wrong cost three attempts. "No changesets waiting"
cannot be the signal on its own, because it is also true of every ordinary push to main — the tag is the rest
of it, and a version whose tag does not exist yet is one the Version PR just brought in. But the changesets
check is not redundant either: `changesets/action` runs the version command **in place**, so when changesets
were waiting the working tree and HEAD are already bumped by the time anything downstream looks at them. A tag
step that reads the version without that gate tags the Version PR's own commit — which is not on `main` — and
publishes it while its pull request is still open.

Both facts are read from the commit, before the action runs, and neither from the action's outputs. It is not
a usable source for the first one: in the branch it takes when there are no changesets **and no publish
script** — deevy's case, since nothing goes to npm — it returns without setting any output, so
`hasChangesets` is the empty string rather than `false`, and a guard comparing it against `"false"` never
fires and skips the release with a green tick. Counting `.changeset/*.md` on the commit answers the question
the workflow is actually asking, from a source the action cannot invalidate.

The Version PR is also the one pull request that consumes changesets instead of adding one, so the gate that
requires a changeset has to exempt it by branch name or it can never merge.
