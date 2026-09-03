// Writes packages/core/openapi.json. CI regenerates it and fails on a diff so
// every change to the HTTP surface is reviewed (ADR-0009).
import { writeFile } from "node:fs/promises";
import { generateSpec } from "../src/openapi.ts";

const spec = await generateSpec();
const target = new URL("../openapi.json", import.meta.url);
await writeFile(target, `${JSON.stringify(spec, null, 2)}\n`);
console.log(`wrote ${target.pathname}`);
