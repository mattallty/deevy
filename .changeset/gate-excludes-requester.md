---
"@deevy/core": patch
"@deevy/db": patch
---

A Gate can now refuse the approval of the Human who put the Issue in front of it. Turn the exclusion on for a Gate and whoever brought the Issue there is asked for nothing and refused if they try, with a message that says why rather than a bare refusal; anybody else may still approve. It is a separate choice from how many approvals a Gate wants, so a Workspace can have two approvals from anyone, or one approval from anyone but the author, or both at once.

The requester is the Human who made the move that brought the Issue to the Gate — and when an Agent made that move, its Sponsor, which is deevy's rule for accountability everywhere else. When the Event log does not say who brought it, because an Issue was carried into a State by an edit to the Workflow rather than by anyone, the Gate excludes nobody: a rule that guessed would be worse than one that abstains.

Saving a Workflow refuses an exclusion nobody could work around: turning it on reserves one Human from every count, so a Workspace of one cannot exclude anybody at all, and a Gate asking two approvals with the requester excluded needs three Humans. As with the approval threshold, saving a Workflow without mentioning the exclusion leaves each Gate's answer as it was, and a State that stops being a Gate loses it.
