# Changelog

deevy's user-visible changes, one entry per release. Each entry is folded from the changesets a pull request
declared, so it says what changed for somebody upgrading rather than what was committed.

A release is two Docker images and one `vX.Y.Z` tag — see [docs/OPERATIONS.md](./docs/OPERATIONS.md).

<!-- Entries are inserted below this line by `vp run version`. -->

## 0.5.2

### Patch Changes

- **release** — [#36](https://github.com/mattallty/deevy/pull/36) [`8d9fb55`](https://github.com/mattallty/deevy/commit/8d9fb558fb9bff1f9259b0b9723a51d732159228) Thanks [@mattallty](https://github.com/mattallty)! - Nothing in deevy changed. This release exists to walk the release itself end to end after a fix to it: the
  Version PR behind it is the first whose own checks run, rather than queueing for an approval that could never
  be granted. If you are on 0.5.1 you can skip it.

## 0.5.1

### Patch Changes

- **web** — [#28](https://github.com/mattallty/deevy/pull/28) [`bb21531`](https://github.com/mattallty/deevy/commit/bb215311be6f27c4d749880e25a97222ac10d248) Thanks [@mattallty](https://github.com/mattallty)! - The UI kit can now be synced to Claude Design (claude.ai/design), so a design agent builds screens out of deevy's real components instead of generic ones. `apps/web/design-system` re-exports every standalone component as one importable entry with its own stylesheet, types and per-component docs; `.design-sync/` holds the sync's configuration, its preview cards and the conventions the design agent reads. Nothing the app ships changes.
- **web** — [#32](https://github.com/mattallty/deevy/pull/32) [`5cb0ddd`](https://github.com/mattallty/deevy/commit/5cb0ddde5e85160ecab3651dbbd5f42cda06e52d) Thanks [@mattallty](https://github.com/mattallty)! - Issues can be grouped by a Label scope — one entry in Group by per scope the Workspace uses, so `epic` and
  `priority` are each a way to divide the list or column the board, with a "No epic" bucket for the Issues
  carrying none. Never by Labels at large: an Issue carries at most one Label per scope, so a scope divides
  the Issues exactly once each and a board column can take a drop, which sets that scope's Label and leaves
  every other Label alone.
- **web** — [#32](https://github.com/mattallty/deevy/pull/32) [`5cb0ddd`](https://github.com/mattallty/deevy/commit/5cb0ddde5e85160ecab3651dbbd5f42cda06e52d) Thanks [@mattallty](https://github.com/mattallty)! - Issues can be grouped by Assignee and by Project, in the list and on the board alike. On a board, dragging a
  card between Assignee columns reassigns it — including onto Unassigned, which takes it off whoever held it —
  and every Member has a column even holding nothing, so there is somewhere to drop. Project columns take no
  cards and say why: an Issue belongs to the Project its key names. The table also stops repeating whatever the
  groups already say, so grouping by Assignee brings the State column back and takes the Assignee one away.
- **web** — [#32](https://github.com/mattallty/deevy/pull/32) [`5cb0ddd`](https://github.com/mattallty/deevy/commit/5cb0ddde5e85160ecab3651dbbd5f42cda06e52d) Thanks [@mattallty](https://github.com/mattallty)! - Group by is on the board as well as the list. The columns are what a board groups by, so the board was the
  one screen where the control was hidden and the one where it is most wanted. It offers "No grouping" only
  on a list — a board with no columns is not a board — and `?group=` now carries whatever the screen groups
  by, so a grouped view is still a link.
- **web** — [#32](https://github.com/mattallty/deevy/pull/32) [`5cb0ddd`](https://github.com/mattallty/deevy/commit/5cb0ddde5e85160ecab3651dbbd5f42cda06e52d) Thanks [@mattallty](https://github.com/mattallty)! - A Settings page lays itself out by the room it actually has, not by the size of the window. The Settings
  content column is a container query now, and the nav beside it appears at 1024px rather than 768px — at
  768 it was taking 235px next to a 256px sidebar and leaving the page 161px, which pushed the window
  sideways on seven of the eleven pages. Below that the scrolling strip of tabs is the whole navigation.
  The Labels form's four columns follow the same rule and stack when they do not fit.
- **web** — [#32](https://github.com/mattallty/deevy/pull/32) [`5cb0ddd`](https://github.com/mattallty/deevy/commit/5cb0ddde5e85160ecab3651dbbd5f42cda06e52d) Thanks [@mattallty](https://github.com/mattallty)! - Settings works on a phone. Its eleven pages were a strip of tabs that scrolled sideways — MCP clients was
  four swipes from General, and the page you were on could be scrolled out of its own navigation. They are
  one control now, which names where you are without being opened and opens to the whole list in the same
  four groups the wide nav uses. The page beside it also stops adding a second 24px gutter inside the one
  the app already gives it, which was spending a quarter of a 390px screen on margins.
- **web** — [#27](https://github.com/mattallty/deevy/pull/27) [`65b4e2f`](https://github.com/mattallty/deevy/commit/65b4e2fe50d852761fbf8fd24552f30aff455153) Thanks [@mattallty](https://github.com/mattallty)! - Task-list checkboxes sit beside their text again. In the editor every `- [ ]` item stacked its checkbox above the text, and when a description or comment was read the same items carried a bullet next to the checkbox; both now render each item as one row, the checkbox at the left.
- **web** — [#32](https://github.com/mattallty/deevy/pull/32) [`5cb0ddd`](https://github.com/mattallty/deevy/commit/5cb0ddde5e85160ecab3651dbbd5f42cda06e52d) Thanks [@mattallty](https://github.com/mattallty)! - Settings › Teams is master–detail: the Teams down a rail, one of them open beside it, and the open one
  named in the URL so a Team is a link. It shows what it never used to — which Projects a Team owns, and
  which of its Members are Humans and which are Agents. Naming a Team is behind a button rather than a form
  standing above the page, taking somebody off a Team is behind that row's menu, and the only destructive
  control left is Disband, once. Below a wide column the two panes stack, so it works on a phone.
- **web** — [#32](https://github.com/mattallty/deevy/pull/32) [`5cb0ddd`](https://github.com/mattallty/deevy/commit/5cb0ddde5e85160ecab3651dbbd5f42cda06e52d) Thanks [@mattallty](https://github.com/mattallty)! - The Event log reads as a log. Its rows are 12px throughout rather than 14px, and the Actor is a name
  instead of an avatar and a name — 300 rows of avatars was a column of noise. Who is a Human and who is
  an Agent still shows, in the colour the rest of the app gives each. Its three filters now say what they
  filter on — Kind, Subject, Project — rather than leaving "Every kind" to stand on its own.
- **web** — [#32](https://github.com/mattallty/deevy/pull/32) [`5cb0ddd`](https://github.com/mattallty/deevy/commit/5cb0ddde5e85160ecab3651dbbd5f42cda06e52d) Thanks [@mattallty](https://github.com/mattallty)! - Folded to its icons, the sidebar lines up and every row can be clicked. The Workspace badge sat four
  pixels left of the column every other icon keeps, the Member's avatar had the left of its ring shaved
  off by the button clipping it, and the invisible "Projects" group label lay on top of the Projects row
  and swallowed every click on it. Settings no longer folds the sidebar on the way in and unfolds it on
  the way out either: it leaves it the way you set it. The Settings content column is wider, 1100px, and
  the app no longer scrolls sideways on a narrow window while a Settings page is open.
- **web** — [#32](https://github.com/mattallty/deevy/pull/32) [`5cb0ddd`](https://github.com/mattallty/deevy/commit/5cb0ddde5e85160ecab3651dbbd5f42cda06e52d) Thanks [@mattallty](https://github.com/mattallty)! - Settings › Workspace › General shows you the Workspace instead of only asking about it. It opens with the
  Workspace itself — its mark, its name edited where you read it, its address, when it was made, and how many
  Humans, Agents, Teams and Projects it has — and the name saves itself on blur like every other single field
  in deevy, so the Save button is gone. Who may join is a row of chips rather than a table with a form standing
  open above it. While anything is unset — no rule, no Project, no Agent, no Repository, no Channel — one strip
  at the top names what is missing and links to the page that fixes it, and it disappears once nothing is.
  Renaming the Workspace now changes the name in the sidebar, which it never did.
- **web** — [#32](https://github.com/mattallty/deevy/pull/32) [`5cb0ddd`](https://github.com/mattallty/deevy/commit/5cb0ddde5e85160ecab3651dbbd5f42cda06e52d) Thanks [@mattallty](https://github.com/mattallty)! - The Allowlist is now a section of Settings › Workspace › General, beside the Workspace's name — who may
  join is a fact about the Workspace, not a page of its own. `/settings/allowlist` redirects there, so an
  old link still lands on it. On Notifications, only the table's headings are bold now.
- **server** — [#32](https://github.com/mattallty/deevy/pull/32) [`5cb0ddd`](https://github.com/mattallty/deevy/commit/5cb0ddde5e85160ecab3651dbbd5f42cda06e52d) Thanks [@mattallty](https://github.com/mattallty)! - The seeded Workspace's fabricated people and its Allowlist rule are at `example.com`, whatever
  `DEEVY_ADMIN_EMAIL` is. The seed used to take the domain from the admin's own address, which put a real
  domain on a screen every screenshot and demo shows. The admin still signs in as themselves; only the
  fiction moved. Reseed with `--force` to pick it up, and restart the server afterwards — `--force` unlinks
  the database file, and a running server keeps serving the one it already has open.
- **server** — [#32](https://github.com/mattallty/deevy/pull/32) [`5cb0ddd`](https://github.com/mattallty/deevy/commit/5cb0ddde5e85160ecab3651dbbd5f42cda06e52d) Thanks [@mattallty](https://github.com/mattallty)! - `vp pack` no longer prints twenty lines of `UNRESOLVED_IMPORT` for `@opentelemetry/api` on every build.
  Better Auth reaches its tracer through a dynamic import with a no-op fallback and marks the package an
  optional peer; deevy does not install it, so the bundle names it external on purpose instead. Nothing
  about what the server does changes.
- **agent** — [#29](https://github.com/mattallty/deevy/pull/29) [`c8b6b06`](https://github.com/mattallty/deevy/commit/c8b6b061a522285f01da42712f9ef5cc50645840) Thanks [@mattallty](https://github.com/mattallty)! - The reference runtime is now `apps/agent` and can drive four coding-agent CLIs: Claude Code, OpenCode, Cursor
  CLI and GitHub Copilot CLI, selected with `DEEVY_AGENT_HARNESS`. Each ships as its own image
  (`deevy-agent:claude-code`, `:opencode`, `:cursor`, `:copilot`, plus `<version>-<harness>`); `deevy-agent:latest`
  stays Claude Code. What each harness bounds and does not is in `docs/OPERATIONS.md`, and `docs/harnesses.md`
  says how to add another.
- **agent** — [#31](https://github.com/mattallty/deevy/pull/31) [`f68a624`](https://github.com/mattallty/deevy/commit/f68a624620ae23afa21025df8ad2f50c50dde1de) Thanks [@mattallty](https://github.com/mattallty)! - An Agent now runs git itself: its own branches, its own commits and messages, pushed where it likes. The
  four harnesses no longer deny `git push`, `git remote`, `git config` or `gh`. The credential stays with the
  supervisor, which serves the remote on loopback and adds it on the way out, so a session's `origin` is a
  local address and its checkout holds no token. **Where an Agent can push is now the scope of the token you
  issue and whatever your forge protects**, so give it a token scoped to one repository and protect the
  branches that matter.
- **agent** — [#29](https://github.com/mattallty/deevy/pull/29) [`c8b6b06`](https://github.com/mattallty/deevy/commit/c8b6b061a522285f01da42712f9ef5cc50645840) Thanks [@mattallty](https://github.com/mattallty)! - The reference runtime drives Claude Code as a subprocess (`claude -p`) instead of through the Agent SDK,
  behind a harness contract other coding-agent CLIs can implement; `DEEVY_AGENT_HARNESS` selects the harness
  and defaults to `claude-code`. Each session now runs with a home directory of its own, so the operator's
  dotfiles and credentials are not readable from a session's shell, and the files a repository could ship to
  configure the CLI (`.mcp.json`, `.claude/`) are removed from the clone before the session starts. The
  runtime checks at startup that the harness binary runs, and logs what each Run spent when the harness
  reports it. The image no longer carries the Agent SDK; it installs the Claude Code CLI at a pinned version.
- **agent** — [#29](https://github.com/mattallty/deevy/pull/29) [`c8b6b06`](https://github.com/mattallty/deevy/commit/c8b6b061a522285f01da42712f9ef5cc50645840) Thanks [@mattallty](https://github.com/mattallty)! - The reference runtime no longer hands its session the Agent's API key. The session reaches deevy through a
  loopback proxy the runtime opens for each Run, which adds the key, offers only the twelve tools the runtime
  grants, and refuses any other tool before deevy hears of it; a refusal is written into the Run's feed as an
  error Activity. The runtime also checks that deevy answers the key before a session starts, and fails the Run
  with the reason when it does not.
- **agent** — [#31](https://github.com/mattallty/deevy/pull/31) [`f68a624`](https://github.com/mattallty/deevy/commit/f68a624620ae23afa21025df8ad2f50c50dde1de) Thanks [@mattallty](https://github.com/mattallty)! - A session now runs as its own user, so it can no longer read the supervisor's environment. On one user a
  session with a shell reads the Agent's API key and the git token out of `/proc`, whatever the environment
  allowlist hands it; the image gives the supervisor root and each session uid 10002, and the working directory
  and the session's home are handed over before it starts. Run the container with
  `--cap-drop=ALL --cap-add=SETUID --cap-add=SETGID`. A runtime that is not root keeps its old shape and says
  so in its first lines, which is fine for trying it out and is not a way to run it against a Workspace other
  people write in.
- **agent** — [#31](https://github.com/mattallty/deevy/pull/31) [`f68a624`](https://github.com/mattallty/deevy/commit/f68a624620ae23afa21025df8ad2f50c50dde1de) Thanks [@mattallty](https://github.com/mattallty)! - A pull request now carries what the Agent said. The summary it writes when it finishes its Run becomes the
  title and the body, and the commit message when the supervisor commits on its behalf; a Run that finishes
  without one keeps the runtime's old line. The instructions tell the Agent that git is its own, that the
  default branch is not to be pushed even though it can, and that what it writes when it finishes is what a
  reviewer reads.
- **agent** — [#31](https://github.com/mattallty/deevy/pull/31) [`f68a624`](https://github.com/mattallty/deevy/commit/f68a624620ae23afa21025df8ad2f50c50dde1de) Thanks [@mattallty](https://github.com/mattallty)! - Every ref a Run moves is now in its feed: the branch, the commit it came from and the one it points at, and
  whether history was rewritten. A force-push to the base branch is a sentence a Human reads on the Issue
  rather than something nobody finds. A session that pushed its own branch is attributed rather than pushed
  over: the supervisor opens a pull request for what the agent left and attaches it to the Run, instead of
  making a second branch beside it. And a Run that delivers twice, once before a Gate and once after the
  ruling, now continues its branch instead of failing the second push.
- **agent** — [#31](https://github.com/mattallty/deevy/pull/31) [`f68a624`](https://github.com/mattallty/deevy/commit/f68a624620ae23afa21025df8ad2f50c50dde1de) Thanks [@mattallty](https://github.com/mattallty)! - The runtime image documents the capabilities it actually needs:
  `--cap-drop=ALL --cap-add=SETUID --cap-add=SETGID --cap-add=CHOWN --cap-add=DAC_OVERRIDE`. Two of them are
  what lets a session be another user; the other two are what lets the supervisor hand it a working directory
  and read back what it wrote. Running with only the first two fails at the first Run.

## 0.5.0

### Minor Changes

- **release** — [#19](https://github.com/mattallty/deevy/pull/19) [`d6aa91e`](https://github.com/mattallty/deevy/commit/d6aa91e46e74152b1549aaaafc7d85e941e92ea6) Thanks [@mattallty](https://github.com/mattallty)! - Release candidates. `changeset pre enter rc` puts the release path into pre-release mode: versions become
  `0.5.0-rc.N`, the images publish under their own tags without moving `latest`, and the GitHub Release is
  marked as a prerelease. `changeset pre exit` ends the line, and the final release's notes re-list every
  change in it.

## 0.4.1

### Patch Changes

- **release** — [#14](https://github.com/mattallty/deevy/pull/14) [`d24c71a`](https://github.com/mattallty/deevy/commit/d24c71a62c58ea9c34bac0af2436d912fa575bb7) Thanks [@mattallty](https://github.com/mattallty)! - The changelog fold no longer deletes the per-package changelogs, which failed every release, and it strips a
  third shape of dependency bullet that was reaching the release notes.
- **release** — [#16](https://github.com/mattallty/deevy/pull/16) [`78fc0ad`](https://github.com/mattallty/deevy/commit/78fc0ad1fd751741769b1f52e52ea01de7284c2b) Thanks [@mattallty](https://github.com/mattallty)! - Releasing no longer tags the version pull request's own commit, the version pull request can pass its own
  checks, and a prerelease tag no longer moves the `latest` image tag.
- **release** — [#13](https://github.com/mattallty/deevy/pull/13) [`3c2bd55`](https://github.com/mattallty/deevy/commit/3c2bd5543fd4fdae4c5a7f21c9b955d02a92c142) Thanks [@mattallty](https://github.com/mattallty)! - deevy publishes a changelog. Each release now writes `CHANGELOG.md` and a GitHub Release from what its pull
  requests declared, and the images are published by merging a "Version Packages" pull request rather than by
  pushing a tag by hand.

## 0.4.0

Nothing here is backfilled. deevy reached v1 — milestones M0 through M4 — before it kept a changelog, and the
record of that is [docs/PLAN.md](./docs/PLAN.md), the per-milestone plans in [docs/plans](./docs/plans), the
decisions in [docs/adr](./docs/adr), and the git log. Only `v0.3.0` was ever tagged.
