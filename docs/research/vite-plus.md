# Research: Vite+ (vp) as of 2026-09-03
Sources: https://viteplus.dev (llms-full.txt saved alongside), github.com/voidzero-dev/vite-plus, npm.

- vite-plus@0.3.0 (2026-08-24), Beta, MIT, fully open source (paid plan reversed; commercial product is separate "Void").
- Global Rust `vp` binary + local `vite-plus` devDependency. Bundles Vite 8/Rolldown, Vitest 4.1, Oxlint/Oxfmt, tsgolint
  (type check, not tsc), tsdown (`vp pack`), Vite Task (`vp run`, cached), Node runtime mgr (`vp env`), PM wrapper.
- Runtime: Node only (engines ^20.19 || ^22.18 || >=24.11; template pins >=22.18). Bun only as package manager. No Deno.
- One vite.config.ts per package with lint/fmt/check/test/pack/run blocks; do not use vitest.config/oxlintrc/tsdown.config.
  lint/fmt/staged only apply from ROOT config (use overrides for apps/api/**).
- Commands: vp dev/build/preview (browser Vite app), vp test (not watch by default), vp check (fmt+lint+typecheck),
  vp pack (tsdown, platform node), vp run [-r] [--parallel] task, vpr picker, vp staged.
- Scaffold: vp create vite:monorepo (pnpm-workspace apps/*, packages/*, tools/*), vite:application (= create-vite:
  react-ts etc.), vite:library (tsdown template), or meta-frameworks (@tanstack/start, svelte, nuxt, next...).
  NO backend/server template.
- Backend: no first-class dev/watch for Node servers (issue #1117 open). Workarounds: `vp pack --watch` + tsdown
  `--on-success "node dist/index.mjs"` (pass-through undocumented) or a custom vp run task using Vite build API watch.
  `vp pack --exe` builds Node SEA (Node 25.7+). Docker guide ends in `node dist/server.js`.
- Full-stack only via meta-frameworks; TanStack Start has an open dual-module bug under npm/Bun (#1391).
- Monorepo: workspace declared by the package manager; `vp run build` is single-package unless -r; long-running dev
  tasks need --parallel; tasks run with scrubbed env (list env vars in `env`/`untrackedEnv`); no remote cache.
- Gotchas: vp dev/build/test ignore package.json scripts; direct `vp build` never cached; tsgolint ignores baseUrl;
  v0.3.0 renamed VITE_* env to VP_*; Windows installer unsigned.
- Suggested layout: root vite.config.ts (run.cache, lint overrides), pnpm-workspace.yaml, apps/web (Vite React SPA),
  apps/server (vp pack, esm), packages/* shared (pack dts+exports).
