import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarkdownEditor } from "@/components/markdown-editor";
import { useMentionables } from "@/lib/mentions";
import { orpc } from "@/lib/orpc";
import { PAGE_SCOPE, useShortcut } from "@/lib/shortcuts";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * The Documents on an Issue: intent, spec, plan, whichever the Workflow asked
 * for. Writes are versions, so an older one stays readable (CONTEXT.md).
 */
export function IssueDocuments({
  issueKey,
  shortcutScope = PAGE_SCOPE,
}: {
  issueKey: string;
  /** The shortcut scope the Issue is shown in, so `[` and `]` turn these tabs. */
  shortcutScope?: string;
}) {
  const documents = useQuery(orpc.documents.list.queryOptions({ input: { issueKey } }));
  const [active, setActive] = useState<string | null>(null);
  const names = (documents.data?.documents ?? []).map((doc) => doc.name);
  const current = active && names.includes(active) ? active : names[0];
  const turn = (by: -1 | 1) => {
    if (!current || names.length < 2) return;
    const at = names.indexOf(current);
    setActive(names[(at + by + names.length) % names.length] ?? null);
  };
  useShortcut("[", () => turn(-1), { scope: shortcutScope });
  useShortcut("]", () => turn(1), { scope: shortcutScope });

  if (documents.isPending) return <Skeleton className="h-40 w-full" />;
  if (documents.isError) {
    return <p className="text-destructive">Could not load Documents: {documents.error.message}</p>;
  }
  if (documents.data.documents.length === 0) return null;

  const document = documents.data.documents.find((doc) => doc.name === current);
  if (!current || !document) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">Documents</h2>
      <Tabs value={current} onValueChange={(next) => setActive(next)}>
        <TabsList aria-label="Documents">
          {names.map((name) => (
            <TabsTrigger key={name} value={name}>
              {name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <DocumentPane issueKey={issueKey} name={current} currentVersion={document.currentVersion} />
    </section>
  );
}

interface PaneProps {
  issueKey: string;
  name: string;
  currentVersion: number;
}

function DocumentPane({ issueKey, name, currentVersion }: PaneProps) {
  const queryClient = useQueryClient();
  const [version, setVersion] = useState<number | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const reading = version ?? currentVersion;

  const document = useQuery(
    orpc.documents.get.queryOptions({ input: { issueKey, name, version: reading } }),
  );
  const mentionables = useMentionables();
  const write = useMutation(
    orpc.documents.write.mutationOptions({
      onSuccess: async () => {
        setDraft(null);
        setVersion(null);
        await queryClient.invalidateQueries({ queryKey: orpc.documents.key() });
      },
    }),
  );

  if (document.isPending) return <Skeleton className="h-40 w-full" />;
  if (document.isError) {
    return (
      <p className="text-destructive">
        Could not load {name}: {document.error.message}
      </p>
    );
  }

  const readingOlder = reading !== currentVersion;

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`version-${name}`}>Version</Label>
          <Select
            value={String(reading)}
            onValueChange={(next) => {
              if (next === null) return;
              setDraft(null);
              setVersion(Number(next));
            }}
          >
            <SelectTrigger id={`version-${name}`} className="w-36">
              <SelectValue>
                {(selected: string) =>
                  Number(selected) === currentVersion ? `${selected} (current)` : selected
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Array.from({ length: currentVersion }, (_, index) => currentVersion - index).map(
                  (candidate) => (
                    <SelectItem key={candidate} value={String(candidate)}>
                      {candidate === currentVersion ? `${String(candidate)} (current)` : candidate}
                    </SelectItem>
                  ),
                )}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <span className="flex-1" />
        {draft === null && !readingOlder ? (
          <Button
            variant="outline"
            size="sm"
            aria-label={`Edit ${name}`}
            onClick={() => setDraft(document.data.body)}
          >
            Edit {name}
          </Button>
        ) : null}
      </div>

      {readingOlder ? (
        <p className="text-xs text-muted-foreground">
          Reading version {reading}. Switch to the current version to edit.
        </p>
      ) : null}

      {draft === null ? (
        <Markdown>{document.data.body}</Markdown>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(submitted) => {
            submitted.preventDefault();
            write.mutate({ issueKey, name, body: draft });
          }}
        >
          <MarkdownEditor
            id={`body-${name}`}
            value={draft}
            onChange={setDraft}
            mentions={mentionables}
            rows={16}
            placeholder={`Write the ${name}…`}
            onSubmit={() => write.mutate({ issueKey, name, body: draft })}
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={write.isPending}>
              Save version
            </Button>
            <Button type="button" variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
          {write.error ? <p className="text-sm text-destructive">{write.error.message}</p> : null}
        </form>
      )}
    </div>
  );
}
