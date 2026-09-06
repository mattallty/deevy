import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { GitBranch } from "lucide-react";
import { DataTable, type DataColumn } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  type RepositoryRow = NonNullable<typeof repositories.data>["repositories"][number];
  const columns: DataColumn<RepositoryRow>[] = [
    {
      id: "name",
      header: "Repository",
      cell: (repository) => <span className="font-medium">{repository.name}</span>,
      sortValue: (repository) => repository.name,
    },
    {
      id: "url",
      header: "URL",
      cell: (repository) => <span className="text-muted-foreground">{repository.url}</span>,
      sortValue: (repository) => repository.url,
      className: "w-full",
    },
    {
      id: "actions",
      header: "",
      cell: (repository) => (
        <Button
          variant="ghost"
          size="sm"
          disabled={remove.isPending}
          onClick={() => remove.mutate({ repositoryId: repository.id })}
        >
          Forget
        </Button>
      ),
      className: "text-right",
    },
  ];

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

      <DataTable
        aria-label="Repositories"
        columns={columns}
        rows={repositories.data?.repositories ?? []}
        getRowId={(repository) => repository.id}
        loading={repositories.isPending}
        empty={{
          icon: GitBranch,
          title: "No Repositories yet",
          description: "Register one above, so a pull request can link to its Issue.",
        }}
      />
    </SettingsPage>
  );
}
