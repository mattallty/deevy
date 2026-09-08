---
"@deevy/core": patch
"@deevy/web": patch
"@deevy/server": patch
---

Which providers an instance offers a Human to sign in with is now configuration rather than a constant.
`createAuth` registers the entries whose client id and secret are both set, `health.ping` reports that
list publicly, and the sign-in page draws one button per entry in the order the server sent. Setting only
half a pair — a `GITHUB_CLIENT_ID` with no secret — no longer registers a provider whose sign-in ends on
GitHub's own error page: the entry is absent, and an instance with no provider configured says so on the
page instead of offering a button that goes nowhere. GitHub stays the one entry, on the same
`GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`, so an instance whose environment is unchanged sees only
the heading's wording change.
