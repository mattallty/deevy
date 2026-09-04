// Writes packages/core/mcp-tools.json. CI regenerates it and fails on a diff,
// so the tool set an agent sees cannot change without review, and an oRPC beta
// bump that quietly reshapes a schema shows up as a diff (ADR-0009).
import { writeFile } from "node:fs/promises";
import { toolManifest } from "../src/mcp/manifest.ts";

const manifest = await toolManifest();
const target = new URL("../mcp-tools.json", import.meta.url);
await writeFile(target, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${target.pathname} (${manifest.length} tools)`);
