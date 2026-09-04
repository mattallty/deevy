import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { orpc } from "@/lib/orpc.ts";

/**
 * One Agent: who answers for it, the Projects it may see, and the keys it
 * reaches deevy with. An Agent starts able to see nothing and reach nothing,
 * so this page is where it is given both (ADR-0004).
 */
export function AgentPage({ memberId }: { memberId: string }) {
  const queryClient = useQueryClient();
  const agents = useQuery(orpc.agents.list.queryOptions({ input: {} }));
  const refresh = async () => {
    await queryClient.invalidateQueries();
  };

  if (agents.isPending) return <Skeleton className="h-40 w-full" />;
  if (agents.isError) {
    return <p className="text-destructive">Could not load the Agent: {agents.error.message}</p>;
  }
  const agent = agents.data.agents.find((row) => row.id === memberId);
  if (!agent) return <p className="text-muted-foreground">No such Agent.</p>;

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{agent.user.name}</h1>
        <p className="text-sm text-muted-foreground">
          {agent.handle ? `@${agent.handle} · ` : ""}
          Sponsored by{" "}
          <span className="text-foreground">{agent.sponsor?.user.name ?? "nobody"}</span>
          {agent.suspendedAt ? " · " : ""}
          {agent.suspendedAt ? <Badge variant="outline">Suspended</Badge> : null}
        </p>
      </header>

      <Grants memberId={memberId} onChanged={refresh} />
      <Keys memberId={memberId} onChanged={refresh} />
    </section>
  );
}

/** An ungranted Project does not exist to an Agent, so this is its whole world. */
function Grants({ memberId, onChanged }: { memberId: string; onChanged: () => Promise<void> }) {
  const granted = useQuery(orpc.agents.grants.list.queryOptions({ input: { memberId } }));
  const projects = useQuery(orpc.projects.list.queryOptions({ input: {} }));
  const add = useMutation(orpc.agents.grants.add.mutationOptions({ onSuccess: onChanged }));
  const remove = useMutation(orpc.agents.grants.remove.mutationOptions({ onSuccess: onChanged }));

  const mine = granted.data?.projects ?? [];
  const ungranted = (projects.data?.projects ?? []).filter(
    (project) => !mine.some((row) => row.id === project.id),
  );

  return (
    <section aria-label="Projects" className="flex flex-col gap-3 rounded-md border p-4">
      <div>
        <h2 className="text-sm font-medium">Projects</h2>
        <p className="text-sm text-muted-foreground">
          It can read and write Issues in these and nowhere else. A Project it was not granted does
          not exist to it.
        </p>
      </div>

      {mine.length === 0 ? (
        <p className="text-sm text-muted-foreground">None yet, so it can see nothing.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {mine.map((project) => (
            <li key={project.id} className="flex items-center gap-1 rounded border px-2 py-1">
              <span className="text-sm font-medium">{project.key}</span>
              <span className="text-sm text-muted-foreground">{project.name}</span>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Revoke ${project.key}`}
                disabled={remove.isPending}
                onClick={() => remove.mutate({ memberId, projectId: project.id })}
              >
                ×
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="grant-project">Grant a Project</Label>
        <NativeSelect
          id="grant-project"
          value=""
          disabled={add.isPending || ungranted.length === 0}
          onChange={(changed) => {
            const projectId = changed.target.value;
            if (projectId) add.mutate({ memberId, projectId });
          }}
        >
          <option value="">Choose a Project…</option>
          {ungranted.map((project) => (
            <option key={project.id} value={project.id}>
              {project.key} — {project.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      {(add.error ?? remove.error) ? (
        <p className="text-sm text-destructive">{(add.error ?? remove.error)?.message}</p>
      ) : null}
    </section>
  );
}

/**
 * Keys are shown once, at the moment they are minted, because deevy stores a
 * hash and cannot show one again. Everything else here is a stub of one.
 */
function Keys({ memberId, onChanged }: { memberId: string; onChanged: () => Promise<void> }) {
  const keys = useQuery(orpc.agents.keys.list.queryOptions({ input: { memberId } }));
  const [name, setName] = useState("");
  const [minted, setMinted] = useState<string | null>(null);

  const issue = useMutation(
    orpc.agents.keys.issue.mutationOptions({
      onSuccess: async (issued: { key: string }) => {
        setMinted(issued.key);
        setName("");
        await onChanged();
      },
    }),
  );
  const revoke = useMutation(orpc.agents.keys.revoke.mutationOptions({ onSuccess: onChanged }));

  return (
    <section aria-label="API keys" className="flex flex-col gap-3 rounded-md border p-4">
      <div>
        <h2 className="text-sm font-medium">API keys</h2>
        <p className="text-sm text-muted-foreground">
          The Agent sends one as a bearer token. deevy keeps only a hash, so a key it has issued
          cannot be shown again.
        </p>
      </div>

      {minted ? (
        <div className="flex flex-col gap-1 rounded border border-dashed p-3">
          <p className="text-sm font-medium">Copy this now: it is the only time you will see it.</p>
          <code className="overflow-x-auto rounded bg-muted px-2 py-1 text-sm">{minted}</code>
        </div>
      ) : null}

      {(keys.data?.keys ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No keys, so it cannot reach deevy yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {(keys.data?.keys ?? []).map((key) => (
            <li key={key.id} className="flex items-center justify-between gap-2 text-sm">
              <span>
                <span className="font-medium">{key.name ?? "unnamed"}</span>{" "}
                <code className="text-muted-foreground">{key.start}…</code>
                {key.enabled ? null : <Badge variant="outline">Disabled</Badge>}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate({ memberId, keyId: key.id })}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex items-end gap-2"
        onSubmit={(submitted) => {
          submitted.preventDefault();
          issue.mutate({ memberId, name: name.trim() });
        }}
      >
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="key-name">Key name</Label>
          <Input
            id="key-name"
            value={name}
            onChange={(changed) => setName(changed.target.value)}
            placeholder="ci, laptop, the machine it runs on"
          />
        </div>
        <Button type="submit" disabled={issue.isPending || !name.trim()}>
          Issue
        </Button>
      </form>
      {(issue.error ?? revoke.error) ? (
        <p className="text-sm text-destructive">{(issue.error ?? revoke.error)?.message}</p>
      ) : null}
    </section>
  );
}
