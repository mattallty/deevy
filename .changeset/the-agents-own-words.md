---
"@deevy/agent": patch
---

A pull request now carries what the Agent said. The summary it writes when it finishes its Run becomes the
title and the body, and the commit message when the supervisor commits on its behalf; a Run that finishes
without one keeps the runtime's old line. The instructions tell the Agent that git is its own, that the
default branch is not to be pushed even though it can, and that what it writes when it finishes is what a
reviewer reads.
