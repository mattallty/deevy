/**
 * How something reaches this deevy over MCP. The endpoint is this instance, so
 * it is read off the page rather than configured, and the recipes are the ones
 * the reference runtime itself drives (docs/harnesses.md, ADR-0018) plus the
 * shape everything else takes.
 */

/** The MCP endpoint is this deevy, so it is read off the page. */
export function mcpEndpoint(): string {
  return `${window.location.origin}/mcp`;
}

/**
 * What the snippets put where the key goes. A key is readable once, when it is
 * minted, so no page can fill this in for you.
 */
export const KEY_PLACEHOLDER = "<the key>";

const AUTHORIZATION = { Authorization: `Bearer ${KEY_PLACEHOLDER}` };

export interface McpRecipe {
  /** What the tab says. */
  label: string;
  /** Where this goes: the file to write, or what the command writes for you. */
  where: string;
  /** The command or the configuration, with this deevy's endpoint already in it. */
  snippet: (endpoint: string) => string;
}

/** The JSON every client takes, differing in the key the server sits under. */
function serverJson(
  wrapper: string,
  endpoint: string,
  server: Record<string, unknown> = {},
): string {
  return JSON.stringify(
    { [wrapper]: { deevy: { ...server, url: endpoint, headers: AUTHORIZATION } } },
    null,
    2,
  );
}

/**
 * One entry per coding agent deevy knows it is reached by. The four the
 * runtime ships a recipe for come first, in the order `docs/harnesses.md`
 * lists them; the last is for everything else, because MCP is the contract and
 * a client deevy has never heard of connects the same way.
 */
export const mcpRecipes: McpRecipe[] = [
  {
    label: "Claude Code",
    where: "Run this where the Agent works, and it writes the entry itself.",
    snippet: (endpoint) =>
      `claude mcp add --transport http deevy ${endpoint} \\\n  --header "Authorization: Bearer ${KEY_PLACEHOLDER}"`,
  },
  {
    label: "OpenCode",
    where: "In opencode.json, beside the repository or under ~/.config/opencode.",
    snippet: (endpoint) => serverJson("mcp", endpoint, { type: "remote", enabled: true }),
  },
  {
    label: "Cursor CLI",
    where: "In ~/.cursor/mcp.json, the same file the editor reads.",
    snippet: (endpoint) => serverJson("mcpServers", endpoint),
  },
  {
    label: "Copilot CLI",
    where: "In ~/.copilot/mcp-config.json.",
    snippet: (endpoint) => serverJson("mcpServers", endpoint, { type: "http" }),
  },
  {
    label: "Anything else",
    where: "Any MCP client over streamable HTTP, with the key as a bearer token.",
    snippet: (endpoint) => serverJson("mcpServers", endpoint, { type: "http" }),
  },
];
