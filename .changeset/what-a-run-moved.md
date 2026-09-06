---
"@deevy/agent": patch
---

Every ref a Run moves is now in its feed: the branch, the commit it came from and the one it points at, and
whether history was rewritten. A force-push to the base branch is a sentence a Human reads on the Issue
rather than something nobody finds. A session that pushed its own branch is attributed rather than pushed
over: the supervisor opens a pull request for what the agent left and attaches it to the Run, instead of
making a second branch beside it. And a Run that delivers twice, once before a Gate and once after the
ruling, now continues its branch instead of failing the second push.
