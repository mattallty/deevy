---
"@deevy/core": patch
"@deevy/server": patch
"@deevy/web": patch
---

Every link deevy hands a Human — the Gate link an Agent surfaces mid-Run, an invitation, a Slack message —
is now built on the origin a browser finds deevy at, rather than on the origin the API answers on. They are
the same in the Docker image and on the Worker, which serve the SPA themselves; in the `dev` loop and on a
split-origin deployment the API is a second port that serves no page, and a Gate link built on it 404s.

Where the SPA has an origin of its own, `DEEVY_WEB_ORIGIN` is what deevy builds those links on. It was
already the CORS allowance for exactly that deployment, so an operator who has set it needs to change
nothing; one that has not is a deployment where the two origins are the same.
