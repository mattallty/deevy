---
"@deevy/core": patch
"@deevy/web": patch
---

An Issue sitting in a Gate now says where that Gate has got to. The panel on the Issue reads how many Humans must agree and how many have, names the ones who did with whatever note they left, and — when you are not one of the Humans it is waiting for — disables Approve and says why instead of refusing you after the click: you are not one of the approvers it names, you brought the Issue here and it asks somebody else, or you have already approved and it wants one more.

A Gate can also become unopenable after it was configured, because suspending a Member takes a Human out of the count. The Issue says so where the buttons are — how many approvals it wants, how many Humans could give one — and says an admin can lower the number or reinstate whoever is suspended. Rejecting stays available throughout: one rejection ends the matter whatever the threshold, including from the Human who asked.

The Workflow editor now carries both settings on every Gate, so neither needs the API any more: how many Humans must agree, and whether whoever brings an Issue there may be one of them.

The Issue detail carries this as a `gate` object over the API and the RPC surface, alongside the Gate rulings it already returned, and it is null for an Issue that is not in a Gate — which is also when deevy spends nothing working it out.
