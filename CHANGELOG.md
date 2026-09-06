# Changelog

deevy's user-visible changes, one entry per release. Each entry is folded from the changesets a pull request
declared, so it says what changed for somebody upgrading rather than what was committed.

A release is two Docker images and one `vX.Y.Z` tag — see [docs/OPERATIONS.md](./docs/OPERATIONS.md).

<!-- Entries are inserted below this line by `vp run version`. -->

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
