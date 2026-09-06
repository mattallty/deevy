import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MemberChip } from "@/components/member-chip";
import { SettingsPage, SettingsSection } from "@/components/settings-page";
import { orpc } from "@/lib/orpc.ts";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** The MCP endpoint is this deevy, so it is read off the page rather than configured. */
function mcpEndpoint(): string {
  return `${window.location.origin}/mcp`;
}

/**
 * The intervals a schedule offers. Anything finer than a quarter of an hour is
 * a poll, not a schedule, and the sweep only runs once a minute anyway.
 */
const NEVER = "never";
const intervals = [
  { minutes: 15, label: "Every 15 minutes" },
  { minutes: 30, label: "Every 30 minutes" },
  { minutes: 60, label: "Hourly" },
  { minutes: 240, label: "Every 4 hours" },
  { minutes: 1440, label: "Daily" },
];

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
  const queryClient = useQueryClient();
  const agents = useQuery(orpc.agents.list.queryOptions({ input: {} }));
  const [creating, setCreating] = useState(false);
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: orpc.agents.key() });
    await queryClient.invalidateQueries({ queryKey: orpc.members.key() });
  };
  const update = useMutation(orpc.agents.update.mutationOptions({ onSuccess: refresh }));
  const suspend = useMutation(orpc.agents.suspend.mutationOptions({ onSuccess: refresh }));
  const reinstate = useMutation(orpc.agents.reinstate.mutationOptions({ onSuccess: refresh }));
  const failed = suspend.error ?? reinstate.error ?? update.error;

  if (agents.isPending) return <p className="text-muted-foreground">Loading Agents…</p>;
  if (agents.isError) {
    return <p className="text-destructive">Could not load Agents: {agents.error.message}</p>;
  }

  return (
    <SettingsPage
      title="Agents"
      description="Every Agent works under its own identity, with exactly one Human accountable for it. A schedule wakes an Agent on the Issues assigned to it, whether or not anything happened."
      actions={<Button onClick={() => setCreating(true)}>New Agent</Button>}
    >
      <NewAgent open={creating} onOpenChange={setCreating} />
      {failed ? <p className="text-sm text-destructive">{failed.message}</p> : null}

      <SettingsSection
        aria-label="Connect an Agent"
        title="Connect an Agent"
        description="An Agent reaches deevy over MCP with the key its Sponsor issued. The endpoint is"
      >
        <code className="rounded bg-muted px-2 py-1 text-sm">{mcpEndpoint()}</code>
        <p className="text-sm text-muted-foreground">and Claude Code adds it with</p>
        <code className="overflow-x-auto rounded bg-muted px-2 py-1 text-sm">
          {`claude mcp add --transport http deevy ${mcpEndpoint()} --header "Authorization: Bearer <the key>"`}
        </code>
      </SettingsSection>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Agent</TableHead>
            <TableHead>Sponsor</TableHead>
            <TableHead>Can see</TableHead>
            <TableHead>Schedule</TableHead>
            <TableHead className="text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {agents.data.agents.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                No Agents yet. Create one to give it an identity and an API key.
              </TableCell>
            </TableRow>
          ) : null}
          {agents.data.agents.map((agent) => (
            <TableRow key={agent.id}>
              <TableCell>
                <Link
                  to="/settings/agents/$memberId"
                  params={{ memberId: agent.id }}
                  className="underline-offset-4 hover:underline"
                >
                  <MemberChip
                    member={{
                      id: agent.id,
                      kind: "agent",
                      handle: agent.handle,
                      suspendedAt: agent.suspendedAt,
                      user: agent.user,
                    }}
                    showHandle
                  />
                </Link>
              </TableCell>
              <TableCell>
                {agent.sponsor ? (
                  <MemberChip
                    member={{ id: agent.sponsor.id, kind: "human", user: agent.sponsor.user }}
                    size="xs"
                  />
                ) : (
                  <span className="text-destructive">No Sponsor</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {grantSummary(agent.grantedProjectIds.length)}
              </TableCell>
              <TableCell>
                <Select
                  value={agent.scheduleMinutes === null ? NEVER : String(agent.scheduleMinutes)}
                  disabled={update.isPending}
                  onValueChange={(next) => {
                    if (next === null) return;
                    update.mutate({
                      memberId: agent.id,
                      scheduleMinutes: next === NEVER ? null : Number(next),
                    });
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    aria-label={`Schedule for ${agent.user.name}`}
                    className="w-44"
                  >
                    <SelectValue>
                      {(selected: string) =>
                        selected === NEVER
                          ? "Never"
                          : (intervals.find((interval) => String(interval.minutes) === selected)
                              ?.label ?? selected)
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={NEVER}>Never</SelectItem>
                    </SelectGroup>
                    <SelectSeparator />
                    <SelectGroup>
                      {intervals.map((interval) => (
                        <SelectItem key={interval.minutes} value={String(interval.minutes)}>
                          {interval.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="flex items-center justify-end gap-2 text-right">
                {agent.suspendedAt ? (
                  <>
                    <Badge variant="outline">Suspended</Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={reinstate.isPending}
                      onClick={() => reinstate.mutate({ memberId: agent.id })}
                    >
                      Reinstate
                    </Button>
                  </>
                ) : (
                  <>
                    <Badge variant="secondary">Active</Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={suspend.isPending}
                      onClick={() => suspend.mutate({ memberId: agent.id })}
                    >
                      Suspend
                    </Button>
                  </>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SettingsPage>
  );
}

/**
 * Creating an Agent makes the Human who did it accountable for it (ADR-0001),
 * so there is no Sponsor to choose here. The handle is slugged from the name
 * when it is left out.
 */
function NewAgent({ open, onOpenChange }: { open: boolean; onOpenChange: (to: boolean) => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");

  const create = useMutation(
    orpc.agents.create.mutationOptions({
      onSuccess: async () => {
        setName("");
        setHandle("");
        onOpenChange(false);
        await queryClient.invalidateQueries({ queryKey: orpc.agents.key() });
      },
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Agent</DialogTitle>
          <DialogDescription>
            You will be its Sponsor. It can see nothing until you grant it a Project, and it cannot
            reach deevy until you issue it a key.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(submitted) => {
            submitted.preventDefault();
            create.mutate({ name: name.trim(), handle: handle.trim() || null });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="agent-name">Name</Label>
            <Input
              id="agent-name"
              value={name}
              onChange={(changed) => setName(changed.target.value)}
              placeholder="Planner"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="agent-handle">Handle</Label>
            <Input
              id="agent-handle"
              value={handle}
              onChange={(changed) => setHandle(changed.target.value)}
              placeholder="Left out, it is made from the name"
            />
          </div>
          {create.error ? <p className="text-sm text-destructive">{create.error.message}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={create.isPending || !name.trim()}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
