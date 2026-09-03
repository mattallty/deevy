import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { orpc } from "@/lib/orpc";

/** Discussion on an Issue, with `@handle` mentions of Members and Teams. */
export function IssueComments({ issueKey }: { issueKey: string }) {
  const queryClient = useQueryClient();
  const comments = useQuery(orpc.comments.list.queryOptions({ input: { issueKey } }));
  const [body, setBody] = useState("");

  const create = useMutation(
    orpc.comments.create.mutationOptions({
      onSuccess: async () => {
        setBody("");
        await queryClient.invalidateQueries({ queryKey: orpc.comments.key() });
      },
    }),
  );
  const remove = useMutation(
    orpc.comments.delete.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.comments.key() }),
    }),
  );

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">Comments</h2>

      {comments.isPending ? <Skeleton className="h-24 w-full" /> : null}
      {comments.isError ? (
        <p className="text-destructive">Could not load comments: {comments.error.message}</p>
      ) : null}

      {comments.data ? (
        <ul aria-label="Comments" className="flex flex-col gap-3">
          {comments.data.comments.map((comment) => (
            <li key={comment.id} className="flex flex-col gap-1 rounded-lg border p-3">
              <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {comment.author?.user.name ?? "Someone"}
                </span>
                <span>{new Date(comment.createdAt).toLocaleString()}</span>
                {comment.editedAt ? <span>edited</span> : null}
                <span className="flex-1" />
                {comment.deletedAt ? null : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ commentId: comment.id })}
                  >
                    Delete
                  </Button>
                )}
              </div>
              {comment.deletedAt ? (
                <p className="text-sm italic text-muted-foreground">This comment was withdrawn.</p>
              ) : (
                <Markdown>{comment.body}</Markdown>
              )}
            </li>
          ))}
          {comments.data.comments.length === 0 ? (
            <li className="text-sm text-muted-foreground">Nothing said yet.</li>
          ) : null}
        </ul>
      ) : null}

      <form
        className="flex flex-col gap-2"
        onSubmit={(submitted) => {
          submitted.preventDefault();
          if (body.trim()) create.mutate({ issueKey, body: body.trim() });
        }}
      >
        <Label htmlFor="new-comment">Comment</Label>
        <MentionBox value={body} onChange={setBody} />
        <div>
          <Button type="submit" disabled={create.isPending || !body.trim()}>
            Comment
          </Button>
        </div>
        {create.error ? <p className="text-sm text-destructive">{create.error.message}</p> : null}
      </form>
    </section>
  );
}

/**
 * A markdown box that offers handles after an `@`. Mentioning a Team reaches
 * everyone on it, so Teams are suggested alongside Members (CONTEXT.md).
 */
function MentionBox({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const members = useQuery(orpc.members.list.queryOptions({ input: {} }));
  const teams = useQuery(orpc.teams.list.queryOptions({ input: {} }));

  // The handle being typed: an @ run at the very end of the text.
  const typing = /(?:^|[^\w@/])@([a-z0-9-]*)$/i.exec(value)?.[1];
  const handles = [
    ...(members.data?.members ?? [])
      .filter((member) => member.handle)
      .map((member) => ({ handle: member.handle!, name: member.user.name })),
    ...(teams.data?.teams ?? []).map((team) => ({ handle: team.handle, name: team.name })),
  ];
  const suggestions =
    typing === undefined
      ? []
      : handles.filter((entry) => entry.handle.startsWith(typing.toLowerCase())).slice(0, 8);

  function choose(handle: string) {
    onChange(value.replace(/@([a-z0-9-]*)$/i, `@${handle} `));
  }

  return (
    <div className="relative flex flex-col gap-1">
      <Textarea
        id="new-comment"
        aria-label="Comment"
        rows={4}
        value={value}
        placeholder="Markdown. Mention someone with @handle."
        onChange={(changed) => onChange(changed.target.value)}
      />
      {suggestions.length > 0 ? (
        <ul
          role="listbox"
          aria-label="Mentions"
          className="flex flex-col rounded-md border bg-popover p-1 text-sm shadow-md"
        >
          {suggestions.map((entry) => (
            <li key={entry.handle}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => choose(entry.handle)}
              >
                <span className="font-medium">@{entry.handle}</span>
                <span className="text-muted-foreground">{entry.name}</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
