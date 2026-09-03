import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
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
import { orpc } from "@/lib/orpc";

/** A Project's Issues, and the one-line form that adds another. */
export function IssueList({ projectKey }: { projectKey: string }) {
  const queryClient = useQueryClient();
  const issues = useQuery(orpc.issues.list.queryOptions({ input: { projectKey } }));
  const [title, setTitle] = useState("");

  const create = useMutation(
    orpc.issues.create.mutationOptions({
      onSuccess: async () => {
        setTitle("");
        await queryClient.invalidateQueries({ queryKey: orpc.issues.key() });
      },
    }),
  );

  return (
    <section className="flex flex-col gap-4">
      <form
        className="flex items-end gap-3"
        onSubmit={(submitted) => {
          submitted.preventDefault();
          if (title.trim()) create.mutate({ projectKey, title: title.trim() });
        }}
      >
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="new-issue">New Issue</Label>
          <Input
            id="new-issue"
            value={title}
            placeholder="What needs doing?"
            onChange={(changed) => setTitle(changed.target.value)}
          />
        </div>
        <Button type="submit" disabled={create.isPending || !title.trim()}>
          Add Issue
        </Button>
      </form>

      {create.error ? <p className="text-sm text-destructive">{create.error.message}</p> : null}

      {issues.isPending ? <Skeleton className="h-32 w-full" /> : null}
      {issues.isError ? (
        <p className="text-destructive">Could not load Issues: {issues.error.message}</p>
      ) : null}

      {issues.data?.issues.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No Issues yet</EmptyTitle>
            <EmptyDescription>
              Add the first one above. It starts in the Workflow&apos;s first State.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {issues.data && issues.data.issues.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Key</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="w-32">State</TableHead>
              <TableHead className="w-40">Assignee</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {issues.data.issues.map((issue) => (
              <TableRow key={issue.id}>
                <TableCell className="text-muted-foreground">{issue.key}</TableCell>
                <TableCell>
                  <Link
                    to="/issues/$issueKey"
                    params={{ issueKey: issue.key }}
                    className="font-medium hover:underline"
                  >
                    {issue.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={issue.state.isGate ? "outline" : "secondary"}>
                    {issue.state.name}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {issue.assignee ? issue.assignee.user.name : "Unassigned"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </section>
  );
}
