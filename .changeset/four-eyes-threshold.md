---
"@deevy/core": patch
"@deevy/db": patch
"@deevy/web": patch
---

A Gate can now ask for more than one Human. Each Gate carries the number of distinct Humans who must approve before an Issue leaves it, and that number defaults to one, so every Workflow you already have behaves exactly as it did. Set it on a Gate and the Issue stays put until the last of them approves: each approval before that is its own `gate.approval` Event carrying how many are still wanted, the Issue enters no State, no Document is opened, and an Agent waiting at the Gate is still told `awaiting`. `gate.approved` continues to mean what it always meant — the Issue left the Gate — so webhooks, timelines and Run resumption need no change to stay correct. Approving twice is refused, because a Gate wants distinct Humans and not one Human's opinion twice.

Approvals count for one visit to the Gate. Entering the State begins a visit, and so does every rejection — including a rejection in the first State of a Workflow, which has nowhere to send the Issue and so leaves it where it is. One rejection ends the matter however many approvals were wanted.

A threshold no one could ever meet is refused when you save the Workflow, naming both numbers: a Gate asking for three approvals in a Workspace where only two Humans could give one is a Gate nobody can open, and the Humans who count are the ones the Gate names, or everybody, less anyone suspended. Saving a Workflow without mentioning the number leaves each Gate's threshold as it was, so an older API client cannot widen a Gate by accident, and a State that stops being a Gate loses its threshold rather than keeping one in reserve.
