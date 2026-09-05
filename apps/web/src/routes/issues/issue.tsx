import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ActivityStream } from "@/components/activity-stream";
import { GateControls } from "@/components/gate-controls";
import { MemberChip } from "@/components/member-chip";
import { StateBadge } from "@/components/state-badge";
import { IssueDocuments } from "@/components/issue-documents";
import { IssueLinks } from "@/components/issue-links";
import { IssueRuns } from "@/components/run-card";
import { LabelPicker } from "@/components/label-picker";
import { Markdown } from "@/components/markdown.tsx";
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
import { MarkdownEditor } from "@/components/markdown-editor";
import { useMentionables } from "@/lib/mentions";
import { cn } from "@/lib/utils";
import { orpc } from "@/lib/orpc.ts";

const UNASSIGNED = "unassigned";

/** One Issue: its title and description, its State, its family, and its timeline. */
export function IssuePage({
  issueKey,
  focusGate = false,
}: {
  issueKey: string;
  /** Put the ruling in front of the reader, as `?gate=` does: the Inbox opens a Gate Notification this way. */
  focusGate?: boolean;
}) {
  const queryClient = useQueryClient();
  const issue = useQuery(orpc.issues.get.queryOptions({ input: { key: issueKey } }));
  const members = useQuery(orpc.members.list.queryOptions({ input: {} }));
  const [editing, setEditing] = useState(false);

  // `?gate=<stateId>` is what an Agent's URL elicitation hands a Human
  // (docs/plans/m2.md): the Issue opens with the Gate it is waiting on in
  // front of them rather than somewhere down the page. A link to a Gate the
  // Issue has since left highlights nothing, which is the honest answer.
  const search = useRouterState({ select: (state) => state.location.search }) as Record<
    string,
    unknown
  >;
  const askedGate = typeof search.gate === "string" ? search.gate : null;
  const gateFocused =
    (askedGate !== null && askedGate === issue.data?.state.id) ||
    (focusGate && issue.data?.state.isGate === true);
  const gatePanel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (gateFocused) gatePanel.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [gateFocused]);

  const update = useMutation(
    orpc.issues.update.mutationOptions({
      onSuccess: async () => {
        setEditing(false);
        await queryClient.invalidateQueries({ queryKey: orpc.issues.key() });
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

  const { id, key, title, description, state, assignee, parent, children, gateDecisions, labels } =
    issue.data;
  const badgeState = {
    name: state.name,
    isGate: state.isGate,
    category: state.category as "backlog" | "active" | "done",
  };

  return (
    <article className="@container flex flex-col gap-6">
      {gateFocused ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-md border border-gate/50 bg-gate/10 px-4 py-2 text-sm"
        >
          <span>
            Waiting on your ruling at the <strong>{state.name}</strong> Gate.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => {
              gatePanel.current?.scrollIntoView({ behavior: "smooth", block: "center" });
              document.getElementById("gate-note")?.focus();
            }}
          >
            Rule now
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-8 @3xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          <header className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-mono text-muted-foreground">{key}</span>
              <StateBadge state={badgeState} />
              {parent ? (
                <Link
                  to="/issues/$issueKey"
                  params={{ issueKey: parent.key }}
                  className="text-muted-foreground hover:underline"
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
                <h1 className="flex-1 text-xl font-semibold tracking-tight">{title}</h1>
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              </div>
            )}
            {update.error ? (
              <p className="text-sm text-destructive">{update.error.message}</p>
            ) : null}
          </header>

          {!editing && description ? <Markdown>{description}</Markdown> : null}
          {!editing && !description ? (
            <p className="text-sm text-muted-foreground">No description yet.</p>
          ) : null}

          <IssueDocuments issueKey={key} />

          <IssueRuns issueKey={key} decisions={gateDecisions} />

          <ActivityStream issueId={id} issueKey={key} />
        </div>

        <aside className="flex flex-col gap-5 @3xl:order-none -order-1">
          <div
            ref={gatePanel}
            role="group"
            aria-label={state.isGate ? `${state.name} Gate` : `${state.name} State`}
            {...(gateFocused ? { "data-focused": "true" } : {})}
            className={cn(
              "rounded-lg",
              state.isGate && "border border-gate/40 bg-gate/5 p-3",
              gateFocused && "ring-2 ring-gate ring-offset-2 ring-offset-background",
            )}
          >
            <GateControls
              issueKey={key}
              projectKey={issue.data.project.key}
              state={state}
              decisions={gateDecisions}
            />
          </div>

          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-medium text-muted-foreground">Assignee</h2>
            <Select
              value={assignee?.id ?? UNASSIGNED}
              disabled={update.isPending}
              onValueChange={(next) =>
                update.mutate({ key, assigneeMemberId: next === UNASSIGNED ? null : next })
              }
            >
              <SelectTrigger aria-label="Assignee" className="w-full">
                <SelectValue>
                  {(selected: string) => {
                    const member = members.data?.members.find((m) => m.id === selected);
                    return selected === UNASSIGNED || !member ? (
                      "Unassigned"
                    ) : (
                      <MemberChip member={member} size="xs" />
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {members.data?.members.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    <MemberChip member={member} size="xs" />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          <LabelPicker issueKey={key} labels={labels} />

          {children.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-xs font-medium text-muted-foreground">Children</h2>
              <ul className="flex flex-col gap-1">
                {children.map((child) => (
                  <li key={child.id} className="text-sm">
                    <Link
                      to="/issues/$issueKey"
                      params={{ issueKey: child.key }}
                      className="hover:underline"
                    >
                      <span className="font-mono text-xs text-muted-foreground">{child.key}</span>{" "}
                      {child.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <IssueLinks issueKey={key} />

          <p className="font-mono text-xs text-muted-foreground">
            updated {new Date(issue.data.updatedAt).toLocaleString()}
          </p>
        </aside>
      </div>
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
  const mentionables = useMentionables();

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
        <MarkdownEditor
          id="issue-description"
          aria-label="Description"
          value={draftDescription}
          onChange={setDraftDescription}
          mentions={mentionables}
          rows={10}
          placeholder="What this Issue is, and why."
          onSubmit={() =>
            onSave({
              title: draftTitle.trim(),
              description: draftDescription.trim() === "" ? null : draftDescription,
            })
          }
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
