import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { orpc } from "@/lib/orpc.ts";

/** The MCP endpoint is this deevy, so it is read off the page rather than configured. */
function mcpEndpoint(): string {
  return `${window.location.origin}/mcp`;
}

/** "1 Project", "3 Projects", or the fact that it can see nothing yet. */
function grantSummary(count: number): string {
  if (count === 0) return "No Projects";
  return count === 1 ? "1 Project" : `${count} Projects`;
}

/**
 * The Agents in this Workspace and the Human accountable for each (ADR-0001).
 * An Agent sees only the Projects it was granted, so the count is the first
 * thing worth showing next to its Sponsor.
 */
export function AgentsPage() {
  const agents = useQuery(orpc.agents.list.queryOptions({ input: {} }));

  if (agents.isPending) return <p className="text-muted-foreground">Loading Agents…</p>;
  if (agents.isError) {
    return <p className="text-destructive">Could not load Agents: {agents.error.message}</p>;
  }

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Agents</h1>
        <p className="text-sm text-muted-foreground">
          Every Agent works under its own identity, with exactly one Human accountable for it.
        </p>
      </header>

      <section aria-label="Connect an Agent" className="flex flex-col gap-2 rounded-md border p-4">
        <h2 className="text-sm font-medium">Connect an Agent</h2>
        <p className="text-sm text-muted-foreground">
          An Agent reaches deevy over MCP with the key its Sponsor issued. The endpoint is
        </p>
        <code className="rounded bg-muted px-2 py-1 text-sm">{mcpEndpoint()}</code>
        <p className="text-sm text-muted-foreground">and Claude Code adds it with</p>
        <code className="overflow-x-auto rounded bg-muted px-2 py-1 text-sm">
          {`claude mcp add --transport http deevy ${mcpEndpoint()} --header "Authorization: Bearer <the key>"`}
        </code>
      </section>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Agent</TableHead>
            <TableHead>Sponsor</TableHead>
            <TableHead>Can see</TableHead>
            <TableHead className="text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {agents.data.agents.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground">
                No Agents yet. Create one to give it an identity and an API key.
              </TableCell>
            </TableRow>
          ) : null}
          {agents.data.agents.map((agent) => (
            <TableRow key={agent.id}>
              <TableCell>
                <span className="font-medium">{agent.user.name}</span>
                {agent.handle ? (
                  <span className="text-muted-foreground"> @{agent.handle}</span>
                ) : null}
              </TableCell>
              <TableCell>
                {agent.sponsor ? (
                  agent.sponsor.user.name
                ) : (
                  <span className="text-destructive">No Sponsor</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {grantSummary(agent.grantedProjectIds.length)}
              </TableCell>
              <TableCell className="text-right">
                {agent.suspendedAt ? (
                  <Badge variant="outline">Suspended</Badge>
                ) : (
                  <Badge variant="secondary">Working</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
