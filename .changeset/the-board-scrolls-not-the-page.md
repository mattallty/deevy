---
"@deevy/web": patch
---

A Board with more columns than fit no longer drags the whole page sideways with it. The board has always had its own horizontal scroll, but the words only a screen reader hears — the "Gate" on a State, the letter behind an avatar — are positioned text, and positioned text is clipped by whatever it is positioned against rather than by whatever scrolls. Against the page, they landed wherever their off-screen column was, and the page grew a scrollbar of its own: the sidebar and the header slid away as you moved through the Workflow. The board is now what they are positioned against, so it is the only thing that scrolls.
