---
"@deevy/web": patch
---

What a command palette row says on its right — the State an Issue is in — lines up at the row's edge instead of stopping somewhere in the middle. It was sharing the row's free space with a tick the list keeps for items that can be checked, so it landed at a different place on every line depending on how long the title beside it was. Nothing in deevy checks a palette row, so the tick stays out of the way until something does.
