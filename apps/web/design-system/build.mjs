#!/usr/bin/env node
// Builds deevy's design system for the Claude Design sync (.design-sync/):
//   dist/index.js       the kit as one ES module, every dependency external
//   dist/index.css      the compiled stylesheet, fonts beside it in dist/fonts
//   dist/types/**       declarations, with `@/` rewritten to relative paths
// Run from anywhere: `node apps/web/design-system/build.mjs`.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { build } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..");
const dist = join(here, "dist");
rmSync(dist, { recursive: true, force: true });

const shared = {
  root: web,
  configFile: false,
  publicDir: false,
  logLevel: "warn",
  resolve: { alias: { "@": join(web, "src") } },
};

// 1. The kit as one ES module. Library mode would inline every font into the
//    CSS as base64, so the stylesheet is a second, ordinary build below.
await build({
  ...shared,
  plugins: [react()],
  build: {
    outDir: dist,
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    lib: { entry: join(here, "index.ts"), formats: ["es"], fileName: () => "index.js" },
    rollupOptions: {
      // Every bare import stays external; the sync bundles them from node_modules.
      external: (id) =>
        !id.startsWith(".") && !id.startsWith("/") && !id.startsWith("@/") && !id.startsWith("\0"),
      output: { codeSplitting: false },
    },
  },
});

// 2. The stylesheet, with the fonts as files beside it and relative urls.
await build({
  ...shared,
  base: "./",
  plugins: [tailwindcss()],
  build: {
    outDir: dist,
    emptyOutDir: false,
    minify: false,
    sourcemap: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: join(here, "styles.css"),
      output: {
        assetFileNames: (info) =>
          (info.names ?? []).some((n) => n.endsWith(".css"))
            ? "index.css"
            : "fonts/[name][extname]",
      },
    },
  },
});

execFileSync(join(web, "node_modules", ".bin", "tsc"), ["-p", join(here, "tsconfig.json")], {
  stdio: "inherit",
});

// tsc keeps `@/x` in the emitted declarations; the sync's type reader has no
// alias map, so point each one at the emitted file instead.
const typesSrc = join(dist, "types", "src");
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".d.ts")) {
      const text = readFileSync(p, "utf8");
      const next = text.replace(/(["'])@\/([^"']+)\1/g, (_, q, rest) => {
        let rel = relative(dirname(p), join(typesSrc, rest)).split("\\").join("/");
        if (!rel.startsWith(".")) rel = `./${rel}`;
        return `${q}${rel}${q}`;
      });
      if (next !== text) writeFileSync(p, next);
    }
  }
}
walk(join(dist, "types"));

// One doc per export for the sync's per-component docs (dist/docs): the family
// map in families.json puts each export in its group, a family's own page in
// docs/<Root>.md is its root's doc, and every part points back at its root.
const families = JSON.parse(readFileSync(join(here, "families.json"), "utf8"));
const docsOut = join(dist, "docs");
mkdirSync(docsOut, { recursive: true });
let docs = 0;
for (const [group, roots] of Object.entries(families)) {
  for (const [root, parts] of Object.entries(roots)) {
    const own = join(here, "docs", `${root}.md`);
    const body = existsSync(own)
      ? readFileSync(own, "utf8")
      : parts.length
        ? `\`${root}\` is the root of a family; compose its parts inside it: ${parts.map((n) => `\`${n}\``).join(", ")}.\n`
        : "";
    writeFileSync(join(docsOut, `${root}.md`), `---\ncategory: ${group}\n---\n\n${body}`);
    docs++;
    for (const part of parts) {
      writeFileSync(
        join(docsOut, `${part}.md`),
        `---\ncategory: ${group}\n---\n\nPart of the \`${root}\` family: render it inside \`${root}\` and read ${root}.prompt.md for the composition${existsSync(own) ? " and its rules" : ""}.\n`,
      );
      docs++;
    }
  }
}
console.error(`design-system: ${docs} component docs`);
console.error(`design-system: built ${relative(process.cwd(), dist)}`);
