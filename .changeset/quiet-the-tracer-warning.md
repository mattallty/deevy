---
"@deevy/server": patch
---

`vp pack` no longer prints twenty lines of `UNRESOLVED_IMPORT` for `@opentelemetry/api` on every build.
Better Auth reaches its tracer through a dynamic import with a no-op fallback and marks the package an
optional peer; deevy does not install it, so the bundle names it external on purpose instead. Nothing
about what the server does changes.
