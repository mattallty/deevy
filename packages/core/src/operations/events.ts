import { and, asc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { event as eventTable } from "@deevy/db";
import { EventSchema } from "../schemas.ts";
import { eventIterator } from "@orpc/server";
import { subscribeToEvents } from "../live.ts";
import { defineOperation, defineStreamOperation } from "./registry.ts";

export const events = {
  list: defineOperation({
    name: "events.list",
    summary: "Events in this Workspace, oldest first, from a cursor",
    method: "GET",
    path: "/events",
    auth: "member",
    input: z.object({
      /** Return Events after this seq. Pass back the previous page's nextCursor. */
      after: z.coerce.number().int().nonnegative().optional(),
      subjectType: z.string().optional(),
      subjectId: z.string().optional(),
      projectId: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100),
    }),
    output: z.object({
      events: z.array(EventSchema),
      /** The seq of the last Event returned, or null when the page is empty. */
      nextCursor: z.number().int().nullable(),
    }),
    handler: async ({ input, context }) => {
      const rows = await context.db
        .select()
        .from(eventTable)
        .where(
          and(
            eq(eventTable.workspaceId, context.workspace.id),
            input.after === undefined ? undefined : gt(eventTable.seq, input.after),
            input.subjectType === undefined
              ? undefined
              : eq(eventTable.subjectType, input.subjectType),
            input.subjectId === undefined ? undefined : eq(eventTable.subjectId, input.subjectId),
            input.projectId === undefined ? undefined : eq(eventTable.projectId, input.projectId),
          ),
        )
        .orderBy(asc(eventTable.seq))
        .limit(input.limit);
      return { events: rows, nextCursor: rows.at(-1)?.seq ?? null };
    },
  }),

  subscribe: defineStreamOperation({
    name: "events.subscribe",
    summary: "The Event log as it happens, from a cursor, with heartbeats",
    method: "GET",
    path: "/events/subscribe",
    auth: "member",
    input: z.object({
      /** Resume from here. Omitted, the stream starts with what happens next. */
      after: z.coerce.number().int().nonnegative().optional(),
      projectId: z.string().optional(),
    }),
    output: eventIterator(
      z.union([
        z.object({ type: z.literal("event"), event: EventSchema }),
        z.object({ type: z.literal("heartbeat"), cursor: z.number().int().nullable() }),
      ]),
    ),
    handler: ({ input, context, signal }) =>
      subscribeToEvents({
        db: context.db,
        workspaceId: context.workspace.id,
        projectId: input.projectId,
        after: input.after,
        signal,
      }),
  }),
};
