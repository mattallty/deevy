import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { orpc } from "@/lib/orpc";

/**
 * The Documents on an Issue: intent, spec, plan, whichever the Workflow asked
 * for. Writes are versions, so an older one stays readable (CONTEXT.md).
 */
export function IssueDocuments({ issueKey }: { issueKey: string }) {
  const documents = useQuery(orpc.documents.list.queryOptions({ input: { issueKey } }));
  const [active, setActive] = useState<string | null>(null);

  if (documents.isPending) return <Skeleton className="h-40 w-full" />;
  if (documents.isError) {
    return <p className="text-destructive">Could not load Documents: {documents.error.message}</p>;
  }
  if (documents.data.documents.length === 0) return null;

  const names = documents.data.documents.map((doc) => doc.name);
  const current = active && names.includes(active) ? active : names[0]!;
  const document = documents.data.documents.find((doc) => doc.name === current)!;

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
          <NativeSelect
            id={`version-${name}`}
            value={String(reading)}
            onChange={(changed) => {
              setDraft(null);
              setVersion(Number(changed.target.value));
            }}
          >
            {Array.from({ length: currentVersion }, (_, index) => currentVersion - index).map(
              (candidate) => (
                <option key={candidate} value={candidate}>
                  {candidate === currentVersion ? `${candidate} (current)` : candidate}
                </option>
              ),
            )}
          </NativeSelect>
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
          <div className="flex flex-col gap-2">
            <Label htmlFor={`body-${name}`}>Body</Label>
            <Textarea
              id={`body-${name}`}
              aria-label="Body"
              rows={16}
              value={draft}
              onChange={(changed) => setDraft(changed.target.value)}
            />
          </div>
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
