/**
 * Prints one version's section of the root CHANGELOG.md, for the body of a
 * GitHub Release. Separate from the fold so the release workflow reads back
 * exactly what was committed rather than regenerating it from changesets that
 * have already been consumed.
 *
 *   node tools/release/scripts/release-notes.ts 0.5.0
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const version = process.argv[2];
if (version === undefined) throw new Error("Usage: release-notes.ts <version>");

const root = path.resolve(import.meta.dirname, "../../..");
const changelog = await readFile(path.join(root, "CHANGELOG.md"), "utf8");

// Split on headings but keep them, then take the one that opens with this version.
const section = changelog
  .split(/(?=^## )/m)
  .find((part) => part.startsWith(`## ${version}\n`) || part.trimEnd() === `## ${version}`);

if (section === undefined) throw new Error(`CHANGELOG.md has no section for ${version}.`);

process.stdout.write(`${section.replace(/^## .*\n/, "").trim()}\n`);
