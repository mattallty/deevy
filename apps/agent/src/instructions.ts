import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * Where the instructions every session carries live: `instructions.md` beside
 * this module in `src/`, and beside `main.mjs` in `dist/`, where the build
 * copies it (vite.config.ts). A harness that takes a file gets this path; one
 * that takes text gets `readInstructions`.
 */
export function instructionsPath(): string {
  return fileURLToPath(new URL("./instructions.md", import.meta.url));
}

let instructions: string | null = null;

/** The instructions every session carries, read once per process. */
export async function readInstructions(): Promise<string> {
  instructions ??= await readFile(instructionsPath(), "utf8");
  return instructions;
}
