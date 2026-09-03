import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { GateControls } from "@/components/gate-controls";
import { IssueDocuments } from "@/components/issue-documents";
import { IssueTimeline } from "@/components/issue-timeline.tsx";
import { Markdown } from "@/components/markdown.tsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { orpc } from "@/lib/orpc.ts";

const UNASSIGNED = "unassigned";

/** One Issue: its title and description, its State, its family, and its timeline. */
export function IssuePage({ issueKey }: { issueKey: string }) {
  const queryClient = useQueryClient();
  const issue = useQuery(orpc.issues.get.queryOptions({ input: { key: issueKey } }));
  const members = useQuery(orpc.members.list.queryOptions({ input: {} }));
  const [editing, setEditing] = useState(false);

  const update = useMutation(
    orpc.issues.update.mutationOptions({
      onSuccess: async () => {
        setEditing(false);
        await queryClient.invalidateQueries();
      },
    }),
  );

  if (issue.isPending) return <p className="text-muted-foreground">Loading {issueKey}…</p>;
  if (issue.isError) {
    return (
      <p className="text-destructive">
        Could not load {issueKey}: {issue.error.message}
      </p>
    );
  }

  const { id, key, title, description, state, assignee, parent, children, gateDecisions } =
    issue.data;

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{key}</Badge>
          <Badge variant={state.isGate ? "outline" : "default"}>{state.name}</Badge>
          {parent ? (
            <Link
              to="/issues/$issueKey"
              params={{ issueKey: parent.key }}
              className="text-sm text-muted-foreground hover:underline"
            >
              parent {parent.key}
            </Link>
          ) : null}
        </div>

        {editing ? (
          <EditIssue
            title={title}
            description={description}
            pending={update.isPending}
            onCancel={() => setEditing(false)}
            onSave={(next) => update.mutate({ key, ...next })}
          />
        ) : (
          <div className="flex items-start gap-3">
            <h1 className="flex-1 text-2xl font-semibold">{title}</h1>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
          </div>
        )}
        {update.error ? <p className="text-sm text-destructive">{update.error.message}</p> : null}
      </header>

      {!editing && description ? <Markdown>{description}</Markdown> : null}
      {!editing && !description ? (
        <p className="text-sm text-muted-foreground">No description yet.</p>
      ) : null}

      <IssueDocuments issueKey={key} />

      <GateControls
        issueKey={key}
        projectKey={issue.data.project.key}
        state={state}
        decisions={gateDecisions}
      />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Assignee</h2>
        <Select
          value={assignee?.id ?? UNASSIGNED}
          disabled={update.isPending}
          onValueChange={(next) =>
            update.mutate({ key, assigneeMemberId: next === UNASSIGNED ? null : next })
          }
        >
          <SelectTrigger aria-label="Assignee" className="w-64">
            <SelectValue>
              {(selected: string) =>
                selected === UNASSIGNED
                  ? "Unassigned"
                  : (members.data?.members.find((member) => member.id === selected)?.user.name ??
                    "Unassigned")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
            {members.data?.members.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.user.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      {children.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Children</h2>
          <ul className="flex flex-col gap-1">
            {children.map((child) => (
              <li key={child.id} className="text-sm">
                <Link
                  to="/issues/$issueKey"
                  params={{ issueKey: child.key }}
                  className="hover:underline"
                >
                  <span className="text-muted-foreground">{child.key}</span> {child.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Timeline</h2>
        <IssueTimeline issueId={id} />
      </section>
    </article>
  );
}

interface EditIssueProps {
  title: string;
  description: string | null;
  pending: boolean;
  onCancel: () => void;
  onSave: (next: { title: string; description: string | null }) => void;
}

function EditIssue({ title, description, pending, onCancel, onSave }: EditIssueProps) {
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftDescription, setDraftDescription] = useState(description ?? "");

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(submitted) => {
        submitted.preventDefault();
        onSave({
          title: draftTitle.trim(),
          description: draftDescription.trim() === "" ? null : draftDescription,
        });
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="issue-title">Title</Label>
        <Input
          id="issue-title"
          value={draftTitle}
          onChange={(changed) => setDraftTitle(changed.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="issue-description">Description</Label>
        <Textarea
          id="issue-description"
          rows={10}
          value={draftDescription}
          placeholder="Markdown."
          onChange={(changed) => setDraftDescription(changed.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || !draftTitle.trim()}>
          Save
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
