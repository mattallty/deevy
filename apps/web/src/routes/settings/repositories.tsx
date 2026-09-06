import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SettingsPage } from "@/components/settings-page";
import { orpc } from "@/lib/orpc";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const providers = ["github", "gitlab", "other"] as const;

/** Registering a Repository is what lets a pasted Link be matched to it. */
export function RepositoriesPage() {
  const queryClient = useQueryClient();
  const repositories = useQuery(orpc.repositories.list.queryOptions({ input: {} }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.repositories.key() });

  const [provider, setProvider] = useState<(typeof providers)[number]>("github");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const create = useMutation(
    orpc.repositories.create.mutationOptions({
      onSuccess: async () => {
        setName("");
        setUrl("");
        await refresh();
      },
    }),
  );
  const remove = useMutation(orpc.repositories.delete.mutationOptions({ onSuccess: refresh }));
  const failed = create.error ?? remove.error;

  return (
    <SettingsPage
      title="Repositories"
      description={
        <>Where the code lives. A Link pasted on an Issue is matched to one of these by its URL.</>
      }
    >
      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4"
        onSubmit={(submitted) => {
          submitted.preventDefault();
          if (name.trim() && url.trim()) {
            create.mutate({ provider, name: name.trim(), url: url.trim() });
          }
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="repo-provider">Provider</Label>
          <Select
            value={provider}
            onValueChange={(next) => {
              if (next) setProvider(next as (typeof providers)[number]);
            }}
          >
            <SelectTrigger id="repo-provider" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {providers.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="repo-name">Name</Label>
          <Input
            id="repo-name"
            value={name}
            placeholder="owner/repo"
            onChange={(changed) => setName(changed.target.value)}
          />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="repo-url">URL</Label>
          <Input
            id="repo-url"
            value={url}
            placeholder="https://github.com/owner/repo"
            onChange={(changed) => setUrl(changed.target.value)}
          />
        </div>
        <Button type="submit" disabled={create.isPending || !name.trim() || !url.trim()}>
          Add Repository
        </Button>
      </form>

      {failed ? <p className="text-sm text-destructive">{failed.message}</p> : null}
      {repositories.isPending ? <Skeleton className="h-32 w-full" /> : null}

      {repositories.data && repositories.data.repositories.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Repository</TableHead>
              <TableHead>URL</TableHead>
              <TableHead className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {repositories.data.repositories.map((repository) => (
              <TableRow key={repository.id}>
                <TableCell className="font-medium">{repository.name}</TableCell>
                <TableCell className="text-muted-foreground">{repository.url}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ repositoryId: repository.id })}
                  >
                    Forget
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      {repositories.data?.repositories.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GitBranch aria-hidden />
            </EmptyMedia>
            <EmptyTitle>No Repositories yet</EmptyTitle>
            <EmptyDescription>
              Register one above, so a pull request can link to its Issue.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
    </SettingsPage>
  );
}
