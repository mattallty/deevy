/**
 * The deevy tools a session may call, by the names deevy gives them.
 *
 * Listed rather than wildcarded on purpose: deevy gaining a twenty-first tool
 * must not silently widen what this program may do, and the list is short
 * enough to read as a description of the job (docs/agent-loop.md). Every name
 * is in `packages/core/mcp-tools.json`.
 *
 * The proxy enforces this list (src/proxy.ts): `tools/list` is filtered to it
 * and `tools/call` on anything else is refused before it reaches deevy. So the
 * harness's own permission syntax is a second fence around the deevy tools,
 * never the only one (docs/plans/harnesses.md).
 */
export const deevyToolNames: ReadonlyArray<string> = [
  "inbox_list",
  "runs_list",
  "runs_get",
  "runs_start",
  "issues_get",
  "documents_get",
  "documents_write",
  "runs_post_activity",
  "runs_request_approval",
  "links_add",
  "comments_create",
  "runs_finish",
];
