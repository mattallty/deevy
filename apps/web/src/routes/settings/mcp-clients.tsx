import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SettingsPage, SettingsSection } from "@/components/settings-page";
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
    <SettingsPage
      title="MCP clients"
      description={
        <>
          The clients you have let act as you. Each one reaches deevy as you, with everything you
          can do — except deciding a Gate, which happens here, in deevy, or not at all.
        </>
      }
    >
      <SettingsSection
        aria-label="Connect your MCP client"
        title="Connect your MCP client"
        description="The endpoint is"
      >
        <code className="rounded bg-muted px-2 py-1 text-sm">{mcpEndpoint()}</code>
        <p className="text-sm text-muted-foreground">
          and Claude Code adds it with no header at all — it signs you in through a browser and asks
          you to consent:
        </p>
        <code className="overflow-x-auto rounded bg-muted px-2 py-1 text-sm">
          {`claude mcp add --transport http deevy ${mcpEndpoint()}`}
        </code>
      </SettingsSection>

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
                    variant="destructive"
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
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Plug aria-hidden />
            </EmptyMedia>
            <EmptyTitle>No MCP clients yet</EmptyTitle>
            <EmptyDescription>
              Nothing is connected as you. Add one with the command above.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {rows.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Revoking stops a client asking for anything new. A token deevy already handed it keeps
          working until it expires, within the hour.
        </p>
      ) : null}
    </SettingsPage>
  );
}
