# Changesets

A changeset is one file describing one user-visible change and how big it is. `changeset add` writes one;
`vp run version` consumes every file here into the root [CHANGELOG.md](../CHANGELOG.md) and moves the single
version every package shares.

deevy publishes nothing to npm, so these do not decide what is released — two Docker images are, from the
`vX.Y.Z` tag. They decide what the release _says_, which is why the summary is written for somebody upgrading
deevy rather than for somebody reviewing the diff.

A change no user can observe still needs a file, and `changeset add --empty` is that file. See
[docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md) and [docs/plans/commits-and-changelogs.md](../docs/plans/commits-and-changelogs.md).
