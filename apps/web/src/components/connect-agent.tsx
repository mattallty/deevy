import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KEY_ENV, mcpEndpoint, mcpRecipes, secretFor } from "@/lib/mcp";

/**
 * How to point a coding agent at this deevy: the endpoint, then one tab per
 * client with the file to write or the command that writes it.
 *
 * `issuedKey` is the whole design. A key is readable once, at the moment it is
 * minted, so this block is shown there — in the dialog that created the Agent
 * and beside a key just issued — with the key already in the command, ready to
 * run. Everywhere else there is nothing to fill in, and each client is told
 * instead to read `DEEVY_AGENT_KEY` from its environment, or shown a
 * placeholder where that client has no way to (`lib/mcp.ts`).
 */
export function ConnectAgent({ issuedKey = null }: { issuedKey?: string | null }) {
  const endpoint = mcpEndpoint();
  const [client, setClient] = useState(mcpRecipes[0]?.label ?? "");
  const chosen = mcpRecipes.find((recipe) => recipe.label === client) ?? mcpRecipes[0];
  if (!chosen) return null;
  const secret = secretFor(chosen, issuedKey);
  const wantsEnv = !issuedKey && chosen.variable !== undefined;

  return (
    <div className="flex flex-col gap-3">
      <code className="w-fit rounded bg-muted px-2 py-1 text-sm">{endpoint}</code>
      <Tabs value={client} onValueChange={(next) => setClient(String(next))}>
        {/* Five names are wider than a phone: the strip scrolls, the page does not. */}
        <TabsList aria-label="Coding agent" className="scrollbar-thin max-w-full overflow-x-auto">
          {mcpRecipes.map((recipe) => (
            <TabsTrigger key={recipe.label} value={recipe.label}>
              {recipe.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <p className="text-sm text-muted-foreground">{chosen.where}</p>
      {wantsEnv ? (
        <pre className="overflow-x-auto rounded bg-muted px-3 py-2 font-mono text-xs">
          {`export ${KEY_ENV}=…   # the key, from when it was issued`}
        </pre>
      ) : null}
      <pre className="overflow-x-auto rounded bg-muted px-3 py-2 font-mono text-xs">
        {chosen.snippet(endpoint, secret)}
      </pre>
      <p className="text-sm text-muted-foreground">
        {issuedKey
          ? "The key is in the command above; this is the only place it can be put there for you."
          : wantsEnv
            ? "The key is never readable twice, so this one reads it from your environment. Issue another if you no longer have it."
            : "This client cannot read the key from your environment, so paste the key itself. Issue another if you no longer have it."}
      </p>
    </div>
  );
}
