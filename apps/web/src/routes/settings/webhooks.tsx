import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Webhook } from "lucide-react";
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
import { SettingsPage, SettingsSection } from "@/components/settings-page";
import { orpc } from "@/lib/orpc";

/**
 * Webhooks: the URLs deevy tells when something happens, which is how an Agent
 * outside deevy is triggered (ADR-0003).
 *
 * The secret is made here, in the browser, and shown once. Nothing ever hands
 * it back — it is the credential a receiver checks deevy's signature with — so
 * this page is the only moment it exists anywhere a Human can read it.
 */
function newSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `whsec_${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** `issue.*, run.started` as a Human types it, and as the API wants it. */
function parseKinds(typed: string): string[] | null {
  const kinds = typed
    .split(",")
    .map((kind) => kind.trim())
    .filter((kind) => kind.length > 0);
  return kinds.length > 0 ? kinds : null;
}

/** What one attempt came back with, in a few words. */
function outcome(delivery: {
  deliveredAt: Date | null;
  attempts: number;
  lastStatus: number | null;
  lastError: string | null;
}): string {
  if (delivery.deliveredAt) return `Delivered (${delivery.lastStatus ?? 200})`;
  if (delivery.attempts === 0) return "Waiting to be sent";
  const status = delivery.lastStatus === 0 ? "no answer" : delivery.lastStatus;
  return `Failed (${status}): ${delivery.lastError ?? "no reason given"}`;
}

export function WebhooksPage() {
  const queryClient = useQueryClient();
  const subscriptions = useQuery(orpc.webhooks.list.queryOptions({ input: {} }));

  const [url, setUrl] = useState("");
  const [kinds, setKinds] = useState("");
  const [secret, setSecret] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const deliveries = useQuery({
    ...orpc.webhooks.deliveries.queryOptions({ input: { subscriptionId: open ?? "" } }),
    enabled: open !== null,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.webhooks.key() });

  const create = useMutation(
    orpc.webhooks.create.mutationOptions({
      onSuccess: async () => {
        setShown(secret);
        setUrl("");
        setKinds("");
        setSecret("");
        await refresh();
      },
    }),
  );
  const remove = useMutation(orpc.webhooks.delete.mutationOptions({ onSuccess: refresh }));
  const update = useMutation(orpc.webhooks.update.mutationOptions({ onSuccess: refresh }));
  const redeliver = useMutation(orpc.webhooks.redeliver.mutationOptions({ onSuccess: refresh }));

  const rows = subscriptions.data?.subscriptions ?? [];
  const failed = create.error ?? remove.error ?? update.error ?? redeliver.error;

  return (
    <SettingsPage
      title="Webhooks"
      description={
        <>
          Where deevy delivers its Events. Every POST is signed with the subscription&apos;s secret
          in a <code>deevy-signature</code> header, and retried until it lands or is given up on.
        </>
      }
    >
      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4"
        onSubmit={(submitted) => {
          submitted.preventDefault();
          if (!url.trim() || !secret) return;
          create.mutate({ url: url.trim(), secret, kinds: parseKinds(kinds) });
        }}
      >
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="webhook-url">URL</Label>
          <Input
            id="webhook-url"
            value={url}
            placeholder="https://runtime.example/deevy"
            onChange={(changed) => setUrl(changed.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="webhook-kinds">Event kinds</Label>
          <Input
            id="webhook-kinds"
            value={kinds}
            placeholder="run.*, issue.assigned"
            onChange={(changed) => setKinds(changed.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="webhook-secret">Secret</Label>
          <div className="flex gap-2">
            <Input
              id="webhook-secret"
              value={secret}
              placeholder="whsec_…"
              onChange={(changed) => setSecret(changed.target.value)}
            />
            <Button type="button" variant="outline" onClick={() => setSecret(newSecret())}>
              Generate
            </Button>
          </div>
        </div>
        <Button type="submit" disabled={create.isPending || !url.trim() || !secret}>
          Subscribe
        </Button>
      </form>

      {shown ? (
        <p className="rounded-lg border p-3 text-sm">
          Copy this secret now — deevy never shows it again:{" "}
          <code className="font-mono">{shown}</code>
        </p>
      ) : null}
      {failed ? <p className="text-sm text-destructive">{failed.message}</p> : null}
      {subscriptions.isPending ? <Skeleton className="h-24 w-full" /> : null}

      {rows.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>URL</TableHead>
              <TableHead>Events</TableHead>
              <TableHead>State</TableHead>
              <TableHead className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((subscription) => (
              <TableRow key={subscription.id}>
                <TableCell className="font-medium">{subscription.url}</TableCell>
                <TableCell className="text-muted-foreground">
                  {(subscription.kinds ?? ["Everything"]).join(", ")}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {subscription.disabledAt ? "Off" : "On"}
                </TableCell>
                <TableCell className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setOpen((current) => (current === subscription.id ? null : subscription.id))
                    }
                  >
                    Deliveries
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={update.isPending}
                    onClick={() =>
                      update.mutate({
                        subscriptionId: subscription.id,
                        disabled: subscription.disabledAt === null,
                      })
                    }
                  >
                    {subscription.disabledAt ? "Switch on" : "Switch off"}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ subscriptionId: subscription.id })}
                  >
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      {subscriptions.data && rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Webhook aria-hidden />
            </EmptyMedia>
            <EmptyTitle>No Webhooks yet</EmptyTitle>
            <EmptyDescription>
              Subscribe a URL above; every Event it names is delivered there.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {open ? (
        <SettingsSection
          title="Recent deliveries"
          description="What this subscription was owed lately. A failed one is tried again on its own; Redeliver owes it from the beginning."
        >
          {deliveries.isPending ? <Skeleton className="h-20 w-full" /> : null}
          {(deliveries.data?.deliveries ?? []).length === 0 && !deliveries.isPending ? (
            <p className="text-sm text-muted-foreground">Nothing has been owed to it yet.</p>
          ) : null}
          {(deliveries.data?.deliveries ?? []).map((delivery) => (
            <div
              key={delivery.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"
            >
              <span className="font-medium">{delivery.eventKind ?? "an Event that is gone"}</span>
              <span className="text-muted-foreground">{outcome(delivery)}</span>
              <span className="text-muted-foreground">
                {delivery.attempts} attempt{delivery.attempts === 1 ? "" : "s"}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={redeliver.isPending}
                onClick={() => redeliver.mutate({ subscriptionId: open, deliveryId: delivery.id })}
              >
                Redeliver
              </Button>
            </div>
          ))}
        </SettingsSection>
      ) : null}
    </SettingsPage>
  );
}
