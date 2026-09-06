---
"@deevy/web": patch
---

The UI kit can now be synced to Claude Design (claude.ai/design), so a design agent builds screens out of deevy's real components instead of generic ones. `apps/web/design-system` re-exports every standalone component as one importable entry with its own stylesheet, types and per-component docs; `.design-sync/` holds the sync's configuration, its preview cards and the conventions the design agent reads. Nothing the app ships changes.
