import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
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

/** The Notification kinds a rule can name, in the words the API uses. */
const kinds = [
  { value: "mention", label: "Mention" },
  { value: "assignment", label: "Assignment" },
  { value: "gate_awaiting", label: "Gate awaiting" },
  { value: "run_awaiting_input", label: "Run awaiting input" },
  { value: "run_finished", label: "Run finished" },
] as const;

type Kind = (typeof kinds)[number]["value"];

interface Rule {
  notificationKind: Kind | null;
  projectId: string | null;
  channelId: string;
}

/** The empty option of a select, which is what "any" is on the wire. */
const anyValue = "";

/**
 * Channels and routing: where Notifications leave deevy for. A Channel is a
 * Slack incoming webhook; a rule says which Notifications go to it.
 */
export function ChannelsPage() {
  const queryClient = useQueryClient();
  const channels = useQuery(orpc.channels.list.queryOptions({ input: {} }));
  const rules = useQuery(orpc.routing.list.queryOptions({ input: {} }));
  const projects = useQuery(orpc.projects.list.queryOptions({ input: {} }));

  const [name, setName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [draft, setDraft] = useState<Rule[]>([]);
  const [tested, setTested] = useState<string | null>(null);

  // The rules a Human edits are a working copy: they are saved as a whole,
  // because a rule only means anything next to the others.
  useEffect(() => {
    if (!rules.data) return;
    setDraft(
      rules.data.rules.map((rule) => ({
        notificationKind: rule.notificationKind as Kind | null,
        projectId: rule.projectId,
        channelId: rule.channelId,
      })),
    );
  }, [rules.data]);

  const refreshChannels = () => queryClient.invalidateQueries({ queryKey: orpc.channels.key() });

  const create = useMutation(
    orpc.channels.create.mutationOptions({
      onSuccess: async () => {
        setName("");
        setWebhookUrl("");
        await refreshChannels();
      },
    }),
  );
  const remove = useMutation(orpc.channels.delete.mutationOptions({ onSuccess: refreshChannels }));
  const test = useMutation(
    orpc.channels.test.mutationOptions({
      onSuccess: (result) =>
        setTested(
          result.delivered
            ? "Slack accepted the message."
            : `Slack refused it: ${result.error ?? result.status}`,
        ),
    }),
  );
  const save = useMutation(
    orpc.routing.set.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.routing.key() }),
    }),
  );

  const rows = channels.data?.channels ?? [];
  const failed = create.error ?? remove.error ?? test.error ?? save.error;

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Channels</h1>
        <p className="text-sm text-muted-foreground">
          Where Notifications are delivered. Every Human has an inbox; a Slack Channel is an
          incoming webhook this Workspace posts to.
        </p>
      </header>

      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border p-4"
        onSubmit={(submitted) => {
          submitted.preventDefault();
          if (name.trim() && webhookUrl.trim()) {
            create.mutate({ name: name.trim(), webhookUrl: webhookUrl.trim() });
          }
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="channel-name">Name</Label>
          <Input
            id="channel-name"
            value={name}
            placeholder="#deevy"
            onChange={(changed) => setName(changed.target.value)}
          />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="channel-webhook">Incoming webhook URL</Label>
          <Input
            id="channel-webhook"
            value={webhookUrl}
            placeholder="https://hooks.slack.com/services/…"
            onChange={(changed) => setWebhookUrl(changed.target.value)}
          />
        </div>
        <Button type="submit" disabled={create.isPending || !name.trim() || !webhookUrl.trim()}>
          Add Channel
        </Button>
      </form>

      {failed ? <p className="text-sm text-destructive">{failed.message}</p> : null}
      {tested ? <p className="text-sm text-muted-foreground">{tested}</p> : null}
      {channels.isPending ? <Skeleton className="h-24 w-full" /> : null}

      {rows.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Channel</TableHead>
              <TableHead>Posts to</TableHead>
              <TableHead className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((channel) => (
              <TableRow key={channel.id}>
                <TableCell className="font-medium">{channel.name}</TableCell>
                <TableCell className="text-muted-foreground">{channel.webhookHost}</TableCell>
                <TableCell className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={test.isPending}
                    onClick={() => test.mutate({ channelId: channel.id })}
                  >
                    Test
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ channelId: channel.id })}
                  >
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      {channels.data && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No Channels yet.</p>
      ) : null}

      <section className="flex flex-col gap-3">
        <header>
          <h2 className="text-lg font-semibold">Routing</h2>
          <p className="text-sm text-muted-foreground">
            Which Notifications reach which Channel. A rule left on Any covers every kind or every
            Project. Each Human still chooses what reaches them, under Notifications.
          </p>
        </header>

        {draft.map((rule, at) => (
          <div key={at} className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`rule-kind-${at}`}>Notification</Label>
              <NativeSelect
                id={`rule-kind-${at}`}
                value={rule.notificationKind ?? anyValue}
                onChange={(changed) =>
                  setDraft((current) =>
                    current.map((one, index) =>
                      index === at
                        ? {
                            ...one,
                            notificationKind: (changed.target.value || null) as Kind | null,
                          }
                        : one,
                    ),
                  )
                }
              >
                <option value={anyValue}>Any</option>
                {kinds.map((kind) => (
                  <option key={kind.value} value={kind.value}>
                    {kind.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`rule-project-${at}`}>Project</Label>
              <NativeSelect
                id={`rule-project-${at}`}
                value={rule.projectId ?? anyValue}
                onChange={(changed) =>
                  setDraft((current) =>
                    current.map((one, index) =>
                      index === at ? { ...one, projectId: changed.target.value || null } : one,
                    ),
                  )
                }
              >
                <option value={anyValue}>Any</option>
                {(projects.data?.projects ?? []).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.key}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor={`rule-channel-${at}`}>Channel</Label>
              <NativeSelect
                id={`rule-channel-${at}`}
                value={rule.channelId}
                onChange={(changed) =>
                  setDraft((current) =>
                    current.map((one, index) =>
                      index === at ? { ...one, channelId: changed.target.value } : one,
                    ),
                  )
                }
              >
                {rows.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDraft((current) => current.filter((_, index) => index !== at))}
            >
              Remove rule
            </Button>
          </div>
        ))}

        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={rows.length === 0}
            onClick={() =>
              setDraft((current) => [
                ...current,
                { notificationKind: null, projectId: null, channelId: rows[0]?.id ?? "" },
              ])
            }
          >
            Add rule
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate({ rules: draft })}>
            Save routing
          </Button>
        </div>
      </section>
    </section>
  );
}
