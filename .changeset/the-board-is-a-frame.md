---
"@deevy/web": patch
---

A Board is now a frame rather than a page that grows. On anything wider than a phone it is exactly as tall as the room below the filters, and each column scrolls its own cards: the Workflow stays on screen while you read down a State, the column headers and their counts stay put, and a wheel over a column does what a wheel does everywhere else. It also stopped spending height on saying what it is: the page's bottom gutter goes to the cards, and the "Board" heading is gone — the Project's name is the page's heading and the tab above already says which one you are on. On a 1440x900 screen that is a column 100px taller than before. A Board on a phone still grows and scrolls with the page, because the chrome above it leaves about 300px there and a frame that size would show two cards.

The frame around every screen changed with it: the window itself no longer scrolls, the page area does. The sidebar and the top bar therefore stay where they are on a long page instead of sliding away, and a screen that asks for the viewport's height now gets the room that is actually there.
