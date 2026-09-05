import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { orpc } from "@/lib/orpc";

/** The MCP endpoint is this deevy, so it is read off the page rather than configured. */
function mcpEndpoint(): string {
  return `${window.location.origin}/mcp`;
}

/**
 * The MCP clients one Human has let act as themselves. An Agent authenticates
 * with a key its Sponsor issued (/settings/agents); a Human's own client signs
 * in with OAuth and needs no header at all, because deevy is the authorization
 * server (ADR-0007).
 */
export function McpClientsPage() {
  const queryClient = useQueryClient();
  const clients = useQuery(orpc.oauthClients.list.queryOptions({ input: {} }));
  const revoke = useMutation(
    orpc.oauthClients.revoke.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.oauthClients.key() }),
    }),
  );

  const rows = clients.data?.clients ?? [];

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">MCP clients</h1>
        <p className="text-sm text-muted-foreground">
          The clients you have let act as you. Each one reaches deevy as you, with everything you
          can do — except deciding a Gate, which happens here, in deevy, or not at all.
        </p>
      </header>

      <section
        aria-label="Connect your MCP client"
        className="flex flex-col gap-2 rounded-md border p-4"
      >
        <h2 className="text-sm font-medium">Connect your MCP client</h2>
        <p className="text-sm text-muted-foreground">The endpoint is</p>
        <code className="rounded bg-muted px-2 py-1 text-sm">{mcpEndpoint()}</code>
        <p className="text-sm text-muted-foreground">
          and Claude Code adds it with no header at all — it signs you in through a browser and asks
          you to consent:
        </p>
        <code className="overflow-x-auto rounded bg-muted px-2 py-1 text-sm">
          {`claude mcp add --transport http deevy ${mcpEndpoint()}`}
        </code>
      </section>

      {revoke.error ? <p className="text-sm text-destructive">{revoke.error.message}</p> : null}
      {clients.isPending ? <Skeleton className="h-24 w-full" /> : null}
      {clients.isError ? (
        <p className="text-sm text-destructive">
          Could not load your MCP clients: {clients.error.message}
        </p>
      ) : null}

      {rows.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Allowed</TableHead>
              <TableHead>Since</TableHead>
              <TableHead className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((client) => (
              <TableRow key={client.clientId}>
                <TableCell className="font-medium">
                  {client.name ?? client.clientId}
                  <span className="block font-mono text-xs text-muted-foreground">
                    {client.clientId}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {client.scopes.length > 0 ? client.scopes.join(", ") : "Everything you can do"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {client.consentedAt ? client.consentedAt.toLocaleDateString() : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate({ clientId: client.clientId })}
                  >
                    Revoke
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      {clients.data && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No MCP client is connected as you yet. Add one with the command above.
        </p>
      ) : null}

      {rows.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Revoking stops a client asking for anything new. A token deevy already handed it keeps
          working until it expires, within the hour.
        </p>
      ) : null}
    </section>
  );
}
