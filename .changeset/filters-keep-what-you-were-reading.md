---
"@deevy/web": patch
---

Changing a filter no longer blanks the screen on the way to the answer. The Issue list, the Board and the Event log each asked a new question and showed nothing while it was in flight: the count under the heading disappeared, the rows were replaced by a skeleton, and both came back a moment later — a flicker on every filter, and a page that jumped as the count's line collapsed and reopened. What you were reading now stays where it is until the new answer arrives and replaces it. A skeleton is still what you see the first time a list loads, when there is genuinely nothing to keep.
