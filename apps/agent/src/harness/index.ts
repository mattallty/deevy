import type { Config } from "../config.ts";
import { claudeCode } from "./claude-code.ts";
import type { Harness } from "./contract.ts";
import { copilot } from "./copilot.ts";
import { cursor } from "./cursor.ts";
import { opencode } from "./opencode.ts";

/**
 * Every harness this runtime can drive, by the name `DEEVY_AGENT_HARNESS`
 * selects it with. The supervisor imports this and never a recipe by name
 * (docs/plans/harnesses.md, convention 23).
 */
export const harnesses: ReadonlyArray<Harness> = [claudeCode, opencode, cursor, copilot];

/** The harness the configuration names, or a refusal that names the choices. */
export function harnessFor(config: Config): Harness {
  const found = harnesses.find((harness) => harness.name === config.harness);
  if (found) return found;
  const known = harnesses.map((harness) => harness.name).join(", ");
  throw new Error(`DEEVY_AGENT_HARNESS is "${config.harness}"; the runtime knows ${known}`);
}

/**
 * What the harness needs from the environment and does not have. The runtime
 * refuses to start rather than fail every session at once.
 */
export function missingFor(
  harness: Harness,
  env: Record<string, string | undefined> = process.env,
): string[] {
  return harness.env.requires.filter((name) => !env[name]);
}
