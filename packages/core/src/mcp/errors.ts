import type { CallToolResult } from "@modelcontextprotocol/server";
import { ORPCError } from "@orpc/server";

/**
 * The oRPC codes whose message is written for whoever called the operation:
 * "No such Project", "An Agent cannot do that". Handing those to an Agent is
 * the point, because they tell it what to do differently. Every other failure
 * is ours, and its detail goes to the log rather than to the caller.
 */
const spoken = new Set(["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "BAD_REQUEST", "CONFLICT"]);

/** What an Agent is told when the failure is not one of its own making. */
export const opaqueToolError = "deevy could not complete that tool call";

/**
 * An operation's failure as MCP sees it: a tool error, never a protocol error,
 * because the model is meant to read it and try something else.
 */
export function toolError(error: unknown, report: (error: unknown) => void): CallToolResult {
  const spokenFor =
    error instanceof ORPCError && spoken.has(error.code) && error.message ? error.message : null;
  if (!spokenFor) report(error);
  return {
    content: [{ type: "text", text: spokenFor ?? opaqueToolError }],
    isError: true,
  };
}
