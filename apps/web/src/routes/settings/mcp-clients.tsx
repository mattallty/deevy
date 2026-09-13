import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plug } from "lucide-react";
import { DataTable, type DataColumn } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { SettingsPage, SettingsSection } from "@/components/settings-page";
import { mcpEndpoint } from "@/lib/mcp";
import { orpc } from "@/lib/orpc";

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
  type ClientRow = (typeof rows)[number];
  const columns: DataColumn<ClientRow>[] = [
    {
      id: "client",
      header: "Client",
      cell: (client) => (
        <span className="font-medium">
          {client.name ?? client.clientId}
          <span className="block font-mono text-xs text-muted-foreground">{client.clientId}</span>
        </span>
      ),
      sortValue: (client) => client.name ?? client.clientId,
      className: "w-full",
    },
    {
      id: "scopes",
      header: "Allowed",
      cell: (client) => (
        <span className="text-muted-foreground">
          {client.scopes.length > 0 ? client.scopes.join(", ") : "Everything you can do"}
        </span>
      ),
    },
    {
      id: "since",
      header: "Since",
      cell: (client) => (
        <span className="text-muted-foreground">
          {client.consentedAt ? client.consentedAt.toLocaleDateString() : "—"}
        </span>
      ),
      sortValue: (client) => client.consentedAt?.getTime() ?? null,
    },
    {
      id: "actions",
      header: "",
      cell: (client) => (
        <Button
          variant="destructive"
          size="sm"
          disabled={revoke.isPending}
          onClick={() => revoke.mutate({ clientId: client.clientId })}
        >
          Revoke
        </Button>
      ),
      className: "text-right",
    },
  ];

  return (
    <SettingsPage title="MCP clients">
      <SettingsSection aria-label="Connect your MCP client" title="Connect your MCP client">
        <code className="rounded bg-muted px-2 py-1 text-sm">{mcpEndpoint()}</code>
        <p className="text-sm text-muted-foreground">
          Or add it to Claude Code — no key needed. The second command signs you in through your
          browser and asks you to approve the connection:
        </p>
        <code className="overflow-x-auto rounded bg-muted px-2 py-1 text-sm">
          {`claude mcp add --transport http deevy ${mcpEndpoint()}`}
        </code>
        <code className="overflow-x-auto rounded bg-muted px-2 py-1 text-sm">
          claude mcp login deevy
        </code>
      </SettingsSection>

      {revoke.error ? <p className="text-sm text-destructive">{revoke.error.message}</p> : null}
      {clients.isError ? (
        <p className="text-sm text-destructive">
          Could not load your MCP clients: {clients.error.message}
        </p>
      ) : (
        <DataTable
          aria-label="MCP clients"
          columns={columns}
          rows={rows}
          getRowId={(client) => client.clientId}
          loading={clients.isPending}
          empty={{
            icon: Plug,
            title: "No MCP clients yet",
            description: "Connect your first client with the command above.",
          }}
        />
      )}

      {rows.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Revoking stops a client from asking for anything new. Any access it already has keeps
          working until it expires, usually within the hour.
        </p>
      ) : null}
    </SettingsPage>
  );
}
