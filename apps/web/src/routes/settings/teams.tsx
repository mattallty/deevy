import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MemberChip, type ChipMember } from "@/components/member-chip";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsPage } from "@/components/settings-page";
import { orpc } from "@/lib/orpc.ts";
import { cn } from "@/lib/utils";

export interface TeamsPageProps {
  /** The Team the URL names, so a Team is a link and Back undoes a selection. */
  selected: string | null;
  onSelect: (teamId: string | null) => void;
}

/**
 * Teams and who is on them, as master–detail: the Teams down a rail, one of them
 * open beside it — the shape the Workflow editor already taught (docs/plans/
 * ui-redesign.md, slice 8). A Team owns Projects and can be mentioned; it is not
 * a permission wall.
 *
 * Chosen over a card grid, a grouped table and a membership matrix (Matt,
 * 2026-09-07). What the four had in common is what this one keeps: naming a Team
 * is the rarest thing done here, so its form is behind a button rather than
 * sitting above the page; taking somebody off a Team is behind their row's menu;
 * and the only red left is Disband, once.
 */
export function TeamsPage({ selected, onSelect }: TeamsPageProps) {
  const queryClient = useQueryClient();
  const teams = useQuery(orpc.teams.list.queryOptions({ input: {} }));
  const members = useQuery(orpc.members.list.queryOptions({ input: {} }));
  const projects = useQuery(orpc.projects.list.queryOptions({ input: {} }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.teams.key() });

  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [filter, setFilter] = useState("");

  const create = useMutation(
    orpc.teams.create.mutationOptions({
      onSuccess: async (team) => {
        setName("");
        setNaming(false);
        await refresh();
        // Open what you just named: the rail moved, and nobody wants to find it.
        onSelect(team.id);
      },
    }),
  );
  const remove = useMutation(
    orpc.teams.delete.mutationOptions({
      onSuccess: async () => {
        await refresh();
        onSelect(null);
      },
    }),
  );
  const addMember = useMutation(orpc.teams.addMember.mutationOptions({ onSuccess: refresh }));
  const removeMember = useMutation(orpc.teams.removeMember.mutationOptions({ onSuccess: refresh }));
  const failed = create.error ?? remove.error ?? addMember.error ?? removeMember.error;

  const all = teams.data?.teams ?? [];
  // A Team the URL names but no longer exists (disbanded in another tab) falls
  // back to the first, so the detail pane is never empty while the rail is not.
  const current = all.find((team) => team.id === selected) ?? all[0] ?? null;

  const shown = filter.trim()
    ? all.filter((team) =>
        `${team.name} ${team.handle}`.toLowerCase().includes(filter.trim().toLowerCase()),
      )
    : all;

  // `projects.list` already carries each Project's Team, so which Projects a Team
  // owns is a join here rather than a second thing for the server to return.
  const ownedBy = (teamId: string) =>
    (projects.data?.projects ?? []).filter((project) => project.team?.id === teamId);

  const nameField = (
    <form
      className="flex flex-col gap-2"
      onSubmit={(submitted) => {
        submitted.preventDefault();
        if (name.trim()) create.mutate({ name: name.trim() });
      }}
    >
      <Label htmlFor="team-name">Name</Label>
      <Input
        id="team-name"
        value={name}
        autoFocus
        placeholder="Platform"
        onChange={(changed) => setName(changed.target.value)}
      />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={create.isPending || !name.trim()}>
          Add Team
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setNaming(false);
            setName("");
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );

  return (
    <SettingsPage title="Teams">
      {failed ? <p className="text-sm text-destructive">{failed.message}</p> : null}

      {teams.isPending ? <p className="text-muted-foreground">Loading Teams…</p> : null}

      {!teams.isPending && all.length === 0 ? (
        <div className="flex flex-1 flex-col gap-4">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Users aria-hidden />
              </EmptyMedia>
              <EmptyTitle>No Teams yet</EmptyTitle>
              <EmptyDescription>
                Teams own Projects and can be mentioned as a group. Create your first one to get
                started.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
          <div className="mx-auto w-full max-w-xs rounded-lg border bg-card p-4">
            {naming ? (
              nameField
            ) : (
              <Button className="w-full" onClick={() => setNaming(true)}>
                <Plus aria-hidden />
                Name a Team
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {current ? (
        // Stacked until the column is wide enough for two panes: a 15rem rail
        // beside a page that has 350px left is not a rail, it is a squeeze.
        <div className="grid gap-5 @2xl:grid-cols-[15rem_minmax(0,1fr)]">
          <nav aria-label="Teams" className="flex flex-col gap-2 @2xl:border-r @2xl:pr-4 @2xl:pb-2">
            {/* A filter is furniture until there are enough Teams to lose one in. */}
            {all.length > 5 ? (
              <Input
                aria-label="Filter Teams"
                value={filter}
                placeholder="Filter Teams…"
                onChange={(changed) => setFilter(changed.target.value)}
              />
            ) : null}

            <ul className="flex flex-col gap-0.5">
              {shown.map((team) => {
                const active = team.id === current.id;
                return (
                  <li key={team.id}>
                    <button
                      type="button"
                      aria-current={active ? "true" : undefined}
                      onClick={() => onSelect(team.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent",
                        active && "bg-accent",
                      )}
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className={cn("truncate text-sm", active && "font-medium")}>
                          {team.name}
                        </span>
                        <span className="truncate font-mono text-xs text-muted-foreground">
                          @{team.handle}
                        </span>
                      </span>
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">
                        {team.members.length}
                      </span>
                    </button>
                  </li>
                );
              })}
              {shown.length === 0 ? (
                <li className="px-2.5 py-1.5 text-sm text-muted-foreground">
                  No Team matches “{filter.trim()}”.
                </li>
              ) : null}
            </ul>

            <div className="border-t pt-2">
              {naming ? (
                nameField
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setNaming(true)}>
                  <Plus aria-hidden />
                  New Team
                </Button>
              )}
            </div>
          </nav>

          <TeamDetail
            key={current.id}
            team={current}
            owns={ownedBy(current.id)}
            members={members.data?.members ?? []}
            busy={addMember.isPending || removeMember.isPending || remove.isPending}
            onAdd={(memberId) => addMember.mutate({ teamId: current.id, memberId })}
            onRemove={(memberId) => removeMember.mutate({ teamId: current.id, memberId })}
            onDisband={() => remove.mutate({ teamId: current.id })}
          />
        </div>
      ) : null}
    </SettingsPage>
  );
}

interface TeamMember extends ChipMember {
  role: "admin" | "member";
}

interface TeamDetailProps {
  team: { id: string; name: string; handle: string; members: TeamMember[] };
  owns: Array<{ id: string; key: string; name: string }>;
  members: ChipMember[];
  busy: boolean;
  onAdd: (memberId: string) => void;
  onRemove: (memberId: string) => void;
  onDisband: () => void;
}

function TeamDetail({ team, owns, members, busy, onAdd, onRemove, onDisband }: TeamDetailProps) {
  const [chosen, setChosen] = useState<string | null>(null);
  const taken = new Set(team.members.map((member) => member.id));
  const available = members.filter((member) => !taken.has(member.id));
  const humans = available.filter((member) => member.kind !== "agent");
  const agents = available.filter((member) => member.kind === "agent");

  return (
    <article aria-label={team.name} className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">{team.name}</h2>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono">@{team.handle}</span>
            <span aria-hidden>·</span>
            {owns.length > 0 ? (
              <>
                <span>owns</span>
                {owns.map((project) => (
                  <Badge key={project.id} variant="outline" className="font-mono">
                    {project.key}
                  </Badge>
                ))}
              </>
            ) : (
              <span>owns no Project yet</span>
            )}
          </p>
        </div>
      </header>

      <ul aria-label={`Members of ${team.name}`} className="flex flex-col">
        {team.members.map((member) => (
          <li key={member.id} className="flex items-center gap-3 border-t py-2 last:border-b">
            <MemberChip member={member} size="sm" className="min-w-0 flex-1" />
            {member.role === "admin" ? <Badge variant="outline">admin</Badge> : null}
            <DropdownMenu>
              {/* The menu, not a red button per row: taking somebody off a Team is
                  rare, and eight of them turn a roster into a wall of Remove. */}
              <DropdownMenuTrigger
                aria-label={`Actions for ${member.user.name}`}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                disabled={busy}
              >
                <MoreHorizontal className="size-4" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => onRemove(member.id)}>
                    Remove from {team.name}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ))}
        {team.members.length === 0 ? (
          <li className="border-t border-b py-2 text-sm text-muted-foreground">
            Nobody on this Team yet.
          </li>
        ) : null}
      </ul>

      {available.length > 0 ? (
        <div className="flex flex-wrap items-end gap-2">
          <Select value={chosen} onValueChange={setChosen}>
            <SelectTrigger aria-label="Add a Member to this Team" className="w-56">
              <SelectValue placeholder="Add a Member">
                {(picked: string | null) =>
                  available.find((member) => member.id === picked)?.user.name ?? "Add a Member"
                }
              </SelectValue>
            </SelectTrigger>
            {/* Humans apart from Agents, named by the group they sit in: a Member
                in a Select is a name, never a chip (.claude/skills/deevy-ui). */}
            <SelectContent>
              {humans.length > 0 ? (
                <SelectGroup>
                  <SelectLabel>Humans</SelectLabel>
                  {humans.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.user.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ) : null}
              {agents.length > 0 ? (
                <SelectGroup>
                  <SelectLabel>Agents</SelectLabel>
                  {agents.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.user.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ) : null}
            </SelectContent>
          </Select>
          {/* Default size, like the Select beside it: both are h-8. A `sm` Button
              is h-7 and sits a pixel-and-a-half short of a default trigger. */}
          <Button
            variant="outline"
            disabled={!chosen || busy}
            onClick={() => {
              if (chosen) onAdd(chosen);
              setChosen(null);
            }}
          >
            Add
          </Button>
        </div>
      ) : null}

      <div className="mt-1 flex flex-wrap items-center gap-3 border-t border-destructive/30 pt-4">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          {owns.length > 0
            ? `Disbanding releases ${owns.map((project) => project.key).join(", ")}. Nobody loses access to a Project.`
            : "Nobody loses access to a Project."}
        </p>
        <Button variant="destructive" size="sm" disabled={busy} onClick={onDisband}>
          Disband {team.name}
        </Button>
      </div>
    </article>
  );
}
