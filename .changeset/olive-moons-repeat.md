---
"@deevy/release": minor
---

Release candidates. `changeset pre enter rc` puts the release path into pre-release mode: versions become
`0.5.0-rc.N`, the images publish under their own tags without moving `latest`, and the GitHub Release is
marked as a prerelease. `changeset pre exit` ends the line, and the final release's notes re-list every
change in it.
