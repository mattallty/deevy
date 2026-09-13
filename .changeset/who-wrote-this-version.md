---
"@deevy/core": patch
"@deevy/web": patch
---

A Document now says who wrote the version you are reading, and when they wrote it. Half the words on a deevy Issue are an Agent's and the page never said which half; the version row has carried its author since Documents were versioned, and `documents.get` returns it along with the time that version was written — the version's own time, so reading version 1 of a Document edited yesterday no longer claims it was written yesterday.

A Gate ruling says which Gate it was at and who made it. An Issue that came through Intent, Spec and Plan showed three lines that each read "approved" over a note, with nothing to tell them apart; each one now names its Gate and the Human who ruled, with the note quoted under it.

The dot beside a line in an Issue's Activity sits on the line it belongs to, rather than a hair above it.
