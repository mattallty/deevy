---
"@deevy/web": patch
---

Nothing a deployment can see: the dev server picks a free port when 5173 is taken, and the SPA's own tests
wait as long for a query as the machine actually needs.
