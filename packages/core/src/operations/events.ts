import { and, asc, desc, eq, gt, lt } from "drizzle-orm";
import { z } from "zod";
import { event as eventTable } from "@deevy/db";
import { EventSchema } from "../schemas.ts";
import { eventIterator } from "@orpc/server";
import { subscribeToEvents } from "../live.ts";
import { defineOperation, defineStreamOperation } from "./registry.ts";

export const events = {
  list: defineOperation({
    name: "events.list",
    summary: "Events in this Workspace from a cursor, oldest first unless asked otherwise",
    method: "GET",
    path: "/events",
    auth: "member",
    input: z.object({
      /** Return Events after this seq. Pass back the previous page's nextCursor. */
      after: z.coerce.number().int().nonnegative().optional(),
      /**
       * Return Events before this seq: the page an Event log read newest-first
       * turns to next (docs/plans/ui-redesign.md slice 10).
       */
      before: z.coerce.number().int().positive().optional(),
      /** Oldest first is the stream's order; newest first is a log's. */
      order: z.enum(["asc", "desc"]).default("asc"),
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
            input.before === undefined ? undefined : lt(eventTable.seq, input.before),
            input.subjectType === undefined
              ? undefined
              : eq(eventTable.subjectType, input.subjectType),
            input.subjectId === undefined ? undefined : eq(eventTable.subjectId, input.subjectId),
            input.projectId === undefined ? undefined : eq(eventTable.projectId, input.projectId),
          ),
        )
        .orderBy(input.order === "desc" ? desc(eventTable.seq) : asc(eventTable.seq))
        .limit(input.limit);
      // The cursor is the last row's seq either way: `after` it going forward,
      // `before` it going back.
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
        // Whatever this runtime allows a stream. Absent on Node, where the
        // stream lives as long as the request does (docs/plans/m3.md).
        ...context.live,
      }),
  }),
};
