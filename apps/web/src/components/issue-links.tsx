import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { orpc } from "@/lib/orpc";

const kindLabels = {
  pull_request: "Pull requests",
  commit: "Commits",
  branch: "Branches",
  url: "Links",
} as const;

type Kind = keyof typeof kindLabels;
const order: Kind[] = ["pull_request", "commit", "branch", "url"];

/** What an Issue points at, grouped by kind. The kind is derived from the URL. */
export function IssueLinks({ issueKey }: { issueKey: string }) {
  const queryClient = useQueryClient();
  const links = useQuery(orpc.links.list.queryOptions({ input: { issueKey } }));
  const [url, setUrl] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.links.key() });

  const add = useMutation(
    orpc.links.add.mutationOptions({
      onSuccess: async () => {
        setUrl("");
        await refresh();
      },
    }),
  );
  const remove = useMutation(orpc.links.remove.mutationOptions({ onSuccess: refresh }));
  const failed = add.error ?? remove.error;

  const grouped = order
    .map((kind) => ({
      kind,
      links: (links.data?.links ?? []).filter((link) => link.kind === kind),
    }))
    .filter((group) => group.links.length > 0);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">Links</h2>

      <form
        className="flex items-end gap-3"
        onSubmit={(submitted) => {
          submitted.preventDefault();
          if (url.trim()) add.mutate({ issueKey, url: url.trim() });
        }}
      >
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="new-link">Add a link</Label>
          <Input
            id="new-link"
            value={url}
            placeholder="Paste a pull request, commit, branch, or any URL"
            onChange={(changed) => setUrl(changed.target.value)}
          />
        </div>
        <Button type="submit" disabled={add.isPending || !url.trim()}>
          Add link
        </Button>
      </form>

      {failed ? <p className="text-sm text-destructive">{failed.message}</p> : null}
      {links.isPending ? <Skeleton className="h-16 w-full" /> : null}

      {grouped.map((group) => (
        <div key={group.kind} className="flex flex-col gap-1">
          <h3 className="text-xs font-medium text-muted-foreground">{kindLabels[group.kind]}</h3>
          <ul aria-label={kindLabels[group.kind]} className="flex flex-col gap-1">
            {group.links.map((link) => (
              <li key={link.id} className="flex items-center gap-2 text-sm">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="truncate hover:underline"
                >
                  {link.title ?? link.ref ?? link.url}
                </a>
                {link.repository ? <Badge variant="outline">{link.repository.name}</Badge> : null}
                <span className="flex-1" />
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-6 px-2"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ linkId: link.id })}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
