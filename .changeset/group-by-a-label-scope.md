---
"@deevy/web": patch
---

Issues can be grouped by a Label scope — one entry in Group by per scope the Workspace uses, so `epic` and
`priority` are each a way to divide the list or column the board, with a "No epic" bucket for the Issues
carrying none. Never by Labels at large: an Issue carries at most one Label per scope, so a scope divides
the Issues exactly once each and a board column can take a drop, which sets that scope's Label and leaves
every other Label alone.
