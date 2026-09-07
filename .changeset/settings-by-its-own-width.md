---
"@deevy/web": patch
---

A Settings page lays itself out by the room it actually has, not by the size of the window. The Settings
content column is a container query now, and the nav beside it appears at 1024px rather than 768px — at
768 it was taking 235px next to a 256px sidebar and leaving the page 161px, which pushed the window
sideways on seven of the eleven pages. Below that the scrolling strip of tabs is the whole navigation.
The Labels form's four columns follow the same rule and stack when they do not fit.
