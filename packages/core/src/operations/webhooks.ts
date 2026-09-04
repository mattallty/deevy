import {
  delivery as deliveryTable,
  event as eventTable,
  webhookSubscription as webhookSubscriptionTable,
  type Db,
  type WebhookSubscription,
} from "@deevy/db";
import { ORPCError } from "@orpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { appendEvent } from "../events.ts";
import { NoInput, defineOperation, type ContextFor } from "./registry.ts";

/**
 * Webhook subscriptions: the URLs deevy tells when something happens, which is
 * the whole of how an Agent is triggered (ADR-0003). Nothing here runs an
 * Agent; it registers where to knock.
 *
 * None of these operations is open to an Agent. Deciding who is told what is
 * administration, and an Agent never administers (ADR-0004) — an Agent that
 * could point deevy's signed POSTs at a URL of its choosing would also be an
 * Agent that could exfiltrate the log.
 */

/**
 * A subscription as the API hands one back. The `secret` is absent by
 * construction: it is the credential the signature is worth anything because
 * of, so it goes in and never comes out — not here, not in the Event log, not
 * in `openapi.json`. A Human who has lost it sets a new one.
 */
const SubscriptionView = z.object({
  id: z.string(),
  /** The Agent this belongs to, when it is an Agent's. Null is a generic subscriber. */
  memberId: z.string().nullable(),
  url: z.string(),
  /** The Event kinds it asked for, `run.*` included. Null is all of them. */
  kinds: z.array(z.string()).nullable(),
  projectId: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.date(),
  /** Set while it is switched off. Nothing is derived for it, and nothing is sent. */
  disabledAt: z.date().nullable(),
});

function view(row: WebhookSubscription) {
  return {
    id: row.id,
    memberId: row.memberId,
    url: row.url,
    kinds: row.kinds ?? null,
    projectId: row.projectId,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    disabledAt: row.disabledAt,
  };
}

/** The host a subscription points at: enough for the log to be useful, and not a credential. */
function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/** An http URL would put deevy's signed POSTs, and the Workspace's Events, on the wire. */
const SubscriptionUrl = z.url().max(2048).startsWith("https://");

/**
 * Long enough that guessing it is not a way in. It is never read back, so a
 * Human who loses it sets another rather than being shown this one.
 */
const Secret = z.string().min(16).max(200);

/** Exact kinds, or a family: `run.*` is every kind of Event a Run appends (webhooks.ts). */
const Kinds = z
  .array(
    z
      .string()
      .max(60)
      .regex(/^[a-z_]+\.([a-z_]+|\*)$/, "An Event kind looks like `run.started` or `run.*`"),
  )
  .max(50);

/**
 * Who may touch a subscription: an admin, or the Sponsor of the Agent it
 * belongs to. A Sponsor is accountable for what its Agent does (CONTEXT.md),
 * so it owns where that Agent is told things; a subscription belonging to no
 * Agent is the Workspace's, and only an admin has one of those.
 */
async function mayManage(context: ContextFor<"member">, memberId: string | null): Promise<boolean> {
  if (context.member.role === "admin") return true;
  if (!memberId) return false;
  const agent = await context.db.query.member.findFirst({
    where: { id: memberId, workspaceId: context.workspace.id, kind: "agent" },
    columns: { sponsorId: true },
  });
  return agent?.sponsorId === context.member.id;
}

async function requireSubscription(
  context: ContextFor<"member">,
  subscriptionId: string,
): Promise<WebhookSubscription> {
  const found = await context.db.query.webhookSubscription.findFirst({
    where: { id: subscriptionId, workspaceId: context.workspace.id },
  });
  if (!found) throw new ORPCError("NOT_FOUND", { message: "No such webhook subscription" });
  if (!(await mayManage(context, found.memberId))) {
    throw new ORPCError("FORBIDDEN", {
      message: "Only an admin, or the Sponsor of the Agent this belongs to, can do that",
    });
  }
  return found;
}

/** One attempt at one delivery, as the settings page shows it. */
const DeliveryView = z.object({
  id: z.string(),
  subscriptionId: z.string(),
  eventSeq: z.number().int(),
  /** What the Event was, read from the log rather than copied when it was owed. */
  eventKind: z.string().nullable(),
  attempts: z.number().int(),
  nextAttemptAt: z.date(),
  lastStatus: z.number().int().nullable(),
  lastError: z.string().nullable(),
  deliveredAt: z.date().nullable(),
  createdAt: z.date(),
});

/** The subscriptions a caller may see, which for anyone but an admin is their Agents'. */
async function visibleSubscriptions(context: ContextFor<"member">): Promise<WebhookSubscription[]> {
  const rows = await context.db.query.webhookSubscription.findMany({
    where: { workspaceId: context.workspace.id },
    orderBy: { createdAt: "asc" },
  });
  if (context.member.role === "admin") return rows;
  const sponsored = await context.db.query.member.findMany({
    where: { workspaceId: context.workspace.id, kind: "agent", sponsorId: context.member.id },
    columns: { id: true },
  });
  const mine = new Set(sponsored.map((row) => row.id));
  return rows.filter((row) => row.memberId !== null && mine.has(row.memberId));
}

/** The Agent a subscription is being made for, checked before anything is written. */
async function assertMayCreate(context: ContextFor<"member">, memberId: string | null) {
  if (memberId) {
    const agent = await context.db.query.member.findFirst({
      where: { id: memberId, workspaceId: context.workspace.id, kind: "agent" },
      columns: { id: true },
    });
    if (!agent) throw new ORPCError("NOT_FOUND", { message: "No such Agent in this Workspace" });
  }
  if (!(await mayManage(context, memberId))) {
    throw new ORPCError("FORBIDDEN", {
      message: "Only an admin, or the Sponsor of the Agent this belongs to, can do that",
    });
  }
}

export const webhooks = {
  list: defineOperation({
    name: "webhooks.list",
    summary: "The URLs this Workspace tells when something happens",
    method: "GET",
    path: "/webhooks",
    auth: "member",
    input: NoInput,
    output: z.object({ subscriptions: z.array(SubscriptionView) }),
    handler: async ({ context }) => ({
      subscriptions: (await visibleSubscriptions(context)).map(view),
    }),
  }),

  create: defineOperation({
    name: "webhooks.create",
    summary: "Subscribe a URL to this Workspace's Events",
    method: "POST",
    path: "/webhooks",
    auth: "member",
    input: z.object({
      /** The Agent this is for. Left out, it is the Workspace's own, which is admin work. */
      memberId: z.string().nullish(),
      url: SubscriptionUrl,
      /** Signs every POST. Chosen by whoever will verify it, and never read back. */
      secret: Secret,
      /** The kinds it wants. Null, or left out, is all of them. */
      kinds: Kinds.nullish(),
      /** The Project it wants. Null, or left out, is all of them. */
      projectId: z.string().nullish(),
    }),
    output: SubscriptionView,
    handler: async ({ input, context }) => {
      const memberId = input.memberId ?? null;
      await assertMayCreate(context, memberId);

      const id = crypto.randomUUID();
      const [row] = await context.db
        .insert(webhookSubscriptionTable)
        .values({
          id,
          workspaceId: context.workspace.id,
          memberId,
          url: input.url,
          secret: input.secret,
          kinds: input.kinds ?? null,
          projectId: input.projectId ?? null,
          createdBy: context.member.id,
        })
        .returning();
      if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
      // The Event carries the host and the filter, never the URL and never the
      // secret: the log is readable by every Member.
      await appendEvent(context, {
        kind: "webhook.subscribed",
        subjectType: "webhook",
        subjectId: id,
        projectId: row.projectId,
        payload: {
          memberId,
          host: hostOf(row.url),
          kinds: row.kinds ?? null,
        },
      });
      return view(row);
    },
  }),

  update: defineOperation({
    name: "webhooks.update",
    summary: "Repoint a subscription, narrow it, rotate its secret, or switch it off",
    method: "PATCH",
    path: "/webhooks/{subscriptionId}",
    auth: "member",
    input: z.object({
      subscriptionId: z.string(),
      url: SubscriptionUrl.optional(),
      /** A new secret. The old one is overwritten and neither is ever read back. */
      secret: Secret.optional(),
      kinds: Kinds.nullish(),
      projectId: z.string().nullish(),
      /** Switched off keeps the row and its history; nothing is derived or sent. */
      disabled: z.boolean().optional(),
    }),
    output: SubscriptionView,
    handler: async ({ input, context }) => {
      const found = await requireSubscription(context, input.subscriptionId);
      const [row] = await context.db
        .update(webhookSubscriptionTable)
        .set({
          ...(input.url === undefined ? {} : { url: input.url }),
          ...(input.secret === undefined ? {} : { secret: input.secret }),
          ...(input.kinds === undefined ? {} : { kinds: input.kinds ?? null }),
          ...(input.projectId === undefined ? {} : { projectId: input.projectId ?? null }),
          ...(input.disabled === undefined
            ? {}
            : { disabledAt: input.disabled ? new Date() : null }),
        })
        .where(eq(webhookSubscriptionTable.id, found.id))
        .returning();
      if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
      // Switching one off is what it sounds like to everyone downstream, so it
      // is recorded as the removal it amounts to; anything else restates the
      // subscription. What changed is in the payload, what it changed to is
      // not, because two of the three fields are credentials.
      await appendEvent(context, {
        kind: row.disabledAt ? "webhook.removed" : "webhook.subscribed",
        subjectType: "webhook",
        subjectId: row.id,
        projectId: row.projectId,
        payload: {
          memberId: row.memberId,
          host: hostOf(row.url),
          kinds: row.kinds ?? null,
          secretChanged: input.secret !== undefined,
        },
      });
      return view(row);
    },
  }),

  delete: defineOperation({
    name: "webhooks.delete",
    summary: "Stop telling this URL anything, and forget it",
    method: "DELETE",
    path: "/webhooks/{subscriptionId}",
    auth: "member",
    input: z.object({ subscriptionId: z.string() }),
    output: z.object({ deleted: z.literal(true) }),
    handler: async ({ input, context }) => {
      const found = await requireSubscription(context, input.subscriptionId);
      // The deliveries owed to it carry no foreign key (schema/delivery.ts), so
      // they stay as the record of what was attempted; the sweep retires one
      // whose subscription is gone rather than sending it somewhere else.
      await context.db
        .delete(webhookSubscriptionTable)
        .where(eq(webhookSubscriptionTable.id, found.id));
      await appendEvent(context, {
        kind: "webhook.removed",
        subjectType: "webhook",
        subjectId: found.id,
        projectId: found.projectId,
        payload: { memberId: found.memberId, host: hostOf(found.url) },
      });
      return { deleted: true as const };
    },
  }),

  deliveries: defineOperation({
    name: "webhooks.deliveries",
    summary: "What this subscription was owed lately, and how each attempt went",
    method: "GET",
    path: "/webhooks/{subscriptionId}/deliveries",
    auth: "member",
    input: z.object({
      subscriptionId: z.string(),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    }),
    output: z.object({ deliveries: z.array(DeliveryView) }),
    handler: async ({ input, context }) => {
      const found = await requireSubscription(context, input.subscriptionId);
      const rows = await recentDeliveries(context.db, found.id, input.limit);
      return { deliveries: rows };
    },
  }),

  redeliver: defineOperation({
    name: "webhooks.redeliver",
    summary: "Owe this delivery again, from the beginning",
    method: "POST",
    path: "/webhooks/{subscriptionId}/deliveries/{deliveryId}/redeliver",
    auth: "member",
    input: z.object({ subscriptionId: z.string(), deliveryId: z.string() }),
    output: z.object({ queued: z.literal(true) }),
    handler: async ({ input, context }) => {
      const found = await requireSubscription(context, input.subscriptionId);
      const [row] = await context.db
        .update(deliveryTable)
        .set({
          attempts: 0,
          nextAttemptAt: new Date(),
          deliveredAt: null,
          lockedUntil: null,
          lastError: null,
        })
        .where(
          and(
            eq(deliveryTable.id, input.deliveryId),
            eq(deliveryTable.target, "webhook"),
            eq(deliveryTable.targetId, found.id),
          ),
        )
        .returning({ id: deliveryTable.id });
      if (!row) throw new ORPCError("NOT_FOUND", { message: "No such delivery" });
      // Nothing is sent here: the row is the record and the sweep is what sends
      // it (ADR-0003), so a Redeliver that raced a tick still happens once.
      return { queued: true as const };
    },
  }),
};

/**
 * The last few attempts for one subscription, newest first.
 * `delivery_target_idx` is `(targetId, eventSeq)`, so this walks that index
 * backwards from the newest Event rather than sorting anything.
 */
async function recentDeliveries(db: Db, subscriptionId: string, limit: number) {
  return db
    .select({
      id: deliveryTable.id,
      subscriptionId: deliveryTable.targetId,
      eventSeq: deliveryTable.eventSeq,
      eventKind: eventTable.kind,
      attempts: deliveryTable.attempts,
      nextAttemptAt: deliveryTable.nextAttemptAt,
      lastStatus: deliveryTable.lastStatus,
      lastError: deliveryTable.lastError,
      deliveredAt: deliveryTable.deliveredAt,
      createdAt: deliveryTable.createdAt,
    })
    .from(deliveryTable)
    .leftJoin(eventTable, eq(eventTable.seq, deliveryTable.eventSeq))
    .where(and(eq(deliveryTable.target, "webhook"), eq(deliveryTable.targetId, subscriptionId)))
    .orderBy(desc(deliveryTable.eventSeq))
    .limit(limit);
}
