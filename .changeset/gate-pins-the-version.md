---
"@deevy/web": minor
"@deevy/core": minor
"@deevy/db": minor
---

A Gate ruling now records what it ruled on. Every approval and rejection pins the version each of the
Issue's Documents stood at, so "approved" is a statement about words that cannot change afterwards: the
ruling reads "on spec v2", it says so when the text has been written since, and the Document's history marks
the version a Gate approved or rejected. `documents.versions` reports those rulings per version, for Agents
as well as Humans.
