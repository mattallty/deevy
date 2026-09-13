---
"@deevy/web": patch
---

An Issue opened beside a list now looks like the Issue page, because it is wide enough to be it. The panel was narrower than the width at which an Issue lays itself out in two columns, so it stacked the rail — the Gate ruling, the Assignee, the Labels, the Links — on top of the description and showed the Issue in an order nothing else in deevy uses. It is wider now, and reads top to bottom exactly as the full page does.

It also stopped behaving like a dialog. There is no dimmed backdrop and nothing behind it is disabled: the list, the Board or the Inbox it was opened from stays lit and usable, which is how a panel beside your work should feel. On a phone it is still the full width of the screen, with the rail first.
