---
"@deevy/web": minor
"@deevy/core": minor
---

Edit a Document where you read it. The intent, spec and plan panes have no Edit button and no read mode any
more: the text on screen is the editor, and leaving it — or ⌘Enter — writes a version, with a line that says
whether the save landed. The byline names every Member who has written a version, Humans and Agents alike
("written by Ada and Planner"), and the older versions moved behind a ⋯ menu that opens the full history,
reads any version and can restore one. A save that would land on top of somebody else's is now refused
rather than quietly winning: `documents.write` takes the version the text was read from, and a new
`documents.versions` operation lists who wrote what and when.
