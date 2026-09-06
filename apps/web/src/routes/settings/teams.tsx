import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsPage } from "@/components/settings-page";
import { orpc } from "@/lib/orpc.ts";

/** Teams and who is on them. A Team owns Projects and can be mentioned; it is not a permission wall. */
export function TeamsPage() {
  const queryClient = useQueryClient();
  const teams = useQuery(orpc.teams.list.queryOptions({ input: {} }));
  const members = useQuery(orpc.members.list.queryOptions({ input: {} }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.teams.key() });

  const [name, setName] = useState("");
  const create = useMutation(
    orpc.teams.create.mutationOptions({
      onSuccess: async () => {
        setName("");
        await refresh();
      },
    }),
  );
  const remove = useMutation(orpc.teams.delete.mutationOptions({ onSuccess: refresh }));
  const addMember = useMutation(orpc.teams.addMember.mutationOptions({ onSuccess: refresh }));
  const removeMember = useMutation(orpc.teams.removeMember.mutationOptions({ onSuccess: refresh }));
  const failed = create.error ?? remove.error ?? addMember.error ?? removeMember.error;

  return (
    <SettingsPage
      title="Teams"
      description={
        <>A Team owns Projects and can be mentioned. Every Human still sees every Project.</>
      }
    >
      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4"
        onSubmit={(submitted) => {
          submitted.preventDefault();
          if (name.trim()) create.mutate({ name: name.trim() });
        }}
      >
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="team-name">Name</Label>
          <Input
            id="team-name"
            value={name}
            placeholder="Platform"
            onChange={(changed) => setName(changed.target.value)}
          />
        </div>
        <Button type="submit" disabled={create.isPending || !name.trim()}>
          Add Team
        </Button>
      </form>

      {failed ? <p className="text-sm text-destructive">{failed.message}</p> : null}

      {teams.isPending ? <p className="text-muted-foreground">Loading Teams…</p> : null}
      {teams.data?.teams.length === 0 ? (
        <p className="text-sm text-muted-foreground">No Teams yet.</p>
      ) : null}

      <div className="flex flex-col gap-4">
        {teams.data?.teams.map((team) => (
          <article key={team.id} className="flex flex-col gap-3 rounded-lg border p-4">
            <header className="flex items-center gap-2">
              <h2 className="font-medium">{team.name}</h2>
              <span className="text-sm text-muted-foreground">@{team.handle}</span>
              <span className="flex-1" />
              <Button
                variant="ghost"
                size="sm"
                disabled={remove.isPending}
                onClick={() => remove.mutate({ teamId: team.id })}
              >
                Disband
              </Button>
            </header>

            <ul className="flex flex-col gap-1">
              {team.members.map((member) => (
                <li key={member.id} className="flex items-center gap-2 text-sm">
                  <span>{member.user.name}</span>
                  {member.handle ? (
                    <span className="text-xs text-muted-foreground">@{member.handle}</span>
                  ) : null}
                  {member.role === "admin" ? <Badge variant="outline">admin</Badge> : null}
                  <span className="flex-1" />
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={removeMember.isPending}
                    onClick={() => removeMember.mutate({ teamId: team.id, memberId: member.id })}
                  >
                    Remove
                  </Button>
                </li>
              ))}
              {team.members.length === 0 ? (
                <li className="text-sm text-muted-foreground">Nobody on this Team yet.</li>
              ) : null}
            </ul>

            <AddToTeam
              teamId={team.id}
              taken={new Set(team.members.map((member) => member.id))}
              members={members.data?.members ?? []}
              onAdd={(memberId) => addMember.mutate({ teamId: team.id, memberId })}
            />
          </article>
        ))}
      </div>
    </SettingsPage>
  );
}

interface AddToTeamProps {
  teamId: string;
  taken: Set<string>;
  members: Array<{ id: string; user: { name: string } }>;
  onAdd: (memberId: string) => void;
}

function AddToTeam({ teamId, taken, members, onAdd }: AddToTeamProps) {
  const [chosen, setChosen] = useState<string | null>(null);
  const available = members.filter((member) => !taken.has(member.id));
  if (available.length === 0) return null;

  return (
    <div className="flex items-end gap-2">
      <Select value={chosen} onValueChange={setChosen}>
        <SelectTrigger aria-label={`Add a Member to this Team`} className="w-56">
          <SelectValue placeholder="Add a Member">
            {(selected: string | null) =>
              available.find((member) => member.id === selected)?.user.name ?? "Add a Member"
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {available.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.user.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        disabled={!chosen}
        onClick={() => {
          if (chosen) onAdd(chosen);
          setChosen(null);
        }}
        data-team={teamId}
      >
        Add
      </Button>
    </div>
  );
}
