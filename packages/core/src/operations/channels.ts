import { channel as channelTable, type Channel, type Db } from "@deevy/db";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { appendEvent } from "../events.ts";
import { postSlackMessage } from "../slack.ts";
import { NoInput, defineOperation } from "./registry.ts";

/**
 * Channels: where Notifications are delivered (CONTEXT.md). Only Slack is
 * configured here. The inbox is every Human's and needs no row, so a Channel in
 * this namespace is always a Slack incoming webhook.
 *
 * None of these operations is open to an Agent (ADR-0004). Where Humans are
 * told things is administration, and an Agent never administers.
 */

/**
 * A Channel as the API hands it back. The incoming-webhook URL is a
 * credential — anyone holding it can post into the room — so it goes in and
 * never comes out, and the host stands in for it wherever a Human has to
 * recognise which Channel is which.
 */
const ChannelView = z.object({
  id: z.string(),
  kind: z.enum(["inbox", "slack"]),
  name: z.string(),
  webhookHost: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.date(),
});

/** Slack's webhook host, or null when the URL is unset or unparseable. */
function hostOf(config: Channel["config"]): string | null {
  const url = config?.webhookUrl;
  if (typeof url !== "string") return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function view(row: Channel) {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    webhookHost: hostOf(row.config),
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

/** Slack refuses anything else, and an http URL would put the credential on the wire. */
const WebhookUrl = z.url().max(500).startsWith("https://");

async function requireChannel(db: Db, workspaceId: string, channelId: string): Promise<Channel> {
  const found = await db.query.channel.findFirst({ where: { id: channelId, workspaceId } });
  if (!found) throw new ORPCError("NOT_FOUND", { message: "No such Channel" });
  return found;
}

export const channels = {
  list: defineOperation({
    name: "channels.list",
    summary: "The Channels this Workspace delivers Notifications to",
    method: "GET",
    path: "/channels",
    auth: "admin",
    input: NoInput,
    output: z.object({ channels: z.array(ChannelView) }),
    handler: async ({ context }) => {
      const rows = await context.db.query.channel.findMany({
        where: { workspaceId: context.workspace.id },
        orderBy: { createdAt: "asc" },
      });
      return { channels: rows.map(view) };
    },
  }),

  create: defineOperation({
    name: "channels.create",
    summary: "Add a Slack incoming webhook as a Channel",
    method: "POST",
    path: "/channels",
    auth: "admin",
    input: z.object({
      /** What a Human calls it, usually the Slack channel: `#deevy`. */
      name: z.string().trim().min(1).max(120),
      webhookUrl: WebhookUrl,
    }),
    output: ChannelView,
    handler: async ({ input, context }) => {
      const id = crypto.randomUUID();
      const [row] = await context.db
        .insert(channelTable)
        .values({
          id,
          workspaceId: context.workspace.id,
          kind: "slack",
          name: input.name,
          config: { webhookUrl: input.webhookUrl },
          createdBy: context.member.id,
        })
        .returning();
      if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
      // The Event carries the host, never the URL: the log is readable by
      // every Member, and the credential is not.
      await appendEvent(context, {
        kind: "channel.created",
        subjectType: "channel",
        subjectId: id,
        payload: { name: input.name, channelKind: "slack", webhookHost: hostOf(row.config) },
      });
      return view(row);
    },
  }),

  update: defineOperation({
    name: "channels.update",
    summary: "Rename a Channel, or point it at a new webhook",
    method: "PATCH",
    path: "/channels/{channelId}",
    auth: "admin",
    input: z.object({
      channelId: z.string(),
      name: z.string().trim().min(1).max(120).optional(),
      webhookUrl: WebhookUrl.optional(),
    }),
    output: ChannelView,
    handler: async ({ input, context }) => {
      const found = await requireChannel(context.db, context.workspace.id, input.channelId);
      const [row] = await context.db
        .update(channelTable)
        .set({
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.webhookUrl === undefined
            ? {}
            : { config: { ...found.config, webhookUrl: input.webhookUrl } }),
        })
        .where(eq(channelTable.id, found.id))
        .returning();
      if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
      await appendEvent(context, {
        kind: "channel.updated",
        subjectType: "channel",
        subjectId: row.id,
        payload: {
          name: row.name,
          // Whether the credential changed is worth recording; what it changed
          // to is not.
          webhookChanged: input.webhookUrl !== undefined,
        },
      });
      return view(row);
    },
  }),

  delete: defineOperation({
    name: "channels.delete",
    summary: "Remove a Channel; the routing rules aimed at it go with it",
    method: "DELETE",
    path: "/channels/{channelId}",
    auth: "admin",
    input: z.object({ channelId: z.string() }),
    output: z.object({ deleted: z.literal(true) }),
    handler: async ({ input, context }) => {
      const found = await requireChannel(context.db, context.workspace.id, input.channelId);
      // The rules referencing it cascade (schema/channel.ts). Deliveries owed to
      // it do not: they carry no foreign key, and the sweep retires one whose
      // Channel is gone rather than sending it somewhere else.
      await context.db.delete(channelTable).where(eq(channelTable.id, found.id));
      await appendEvent(context, {
        kind: "channel.deleted",
        subjectType: "channel",
        subjectId: found.id,
        payload: { name: found.name },
      });
      return { deleted: true as const };
    },
  }),

  test: defineOperation({
    name: "channels.test",
    summary: "Post a message to this Channel now, to prove it works",
    method: "POST",
    path: "/channels/{channelId}/test",
    auth: "admin",
    input: z.object({ channelId: z.string() }),
    output: z.object({
      delivered: z.boolean(),
      status: z.number().int(),
      error: z.string().nullable(),
    }),
    handler: async ({ input, context }) => {
      const found = await requireChannel(context.db, context.workspace.id, input.channelId);
      const webhookUrl = found.config?.webhookUrl;
      if (typeof webhookUrl !== "string" || webhookUrl.length === 0) {
        throw new ORPCError("BAD_REQUEST", { message: "This Channel has no webhook URL" });
      }
      // Sent here and now rather than through a delivery row: the Human is
      // waiting for the answer, and a test message is owed to nobody if it
      // fails. It appends no Event either, because nothing changed.
      const posted = await postSlackMessage(webhookUrl, {
        text: `${context.workspace.name} is connected to this Channel.`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*${context.workspace.name}* is connected to this Channel. Notifications routed here will arrive like this.`,
            },
          },
        ],
      });
      return { delivered: posted.delivered, status: posted.status, error: posted.error ?? null };
    },
  }),
};
