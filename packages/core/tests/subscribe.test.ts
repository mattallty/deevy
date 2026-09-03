import { createRouterClient } from "@orpc/server";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { appendEvent } from "../src/events.ts";
import { router } from "../src/operations/index.ts";
import { memberContext, testDb } from "./helpers.ts";

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

describe("events.subscribe", () => {
  it(
    "opens with a heartbeat carrying the cursor it will read from",
    { timeout: 15000 },
    async () => {
      const { db, close } = testDb();
      closers.push(close);
      const context = await memberContext(db);
      const existing = await appendEvent(context, {
        kind: "workspace.created",
        subjectType: "workspace",
        subjectId: context.workspace.id,
      });
      const client = createRouterClient(router, { context });
      const controller = new AbortController();

      const stream = await client.events.subscribe({}, { signal: controller.signal });
      let opening: { type: string; cursor?: number | null } | undefined;
      for await (const message of stream) {
        opening = message;
        break;
      }
      controller.abort();

      // Without `after`, the stream starts from what happens next, and says so.
      expect(opening).toMatchObject({ type: "heartbeat", cursor: existing.seq });
    },
  );

  it("yields Events appended once it is reading", { timeout: 15000 }, async () => {
    const { db, close } = testDb();
    closers.push(close);
    const context = await memberContext(db);
    const client = createRouterClient(router, { context });
    const controller = new AbortController();

    const stream = await client.events.subscribe({}, { signal: controller.signal });
    const seen: string[] = [];
    const opened = Promise.withResolvers<void>();
    const reading = (async () => {
      for await (const message of stream) {
        if (message.type === "heartbeat") opened.resolve();
        if (message.type === "event") seen.push(message.event.kind);
        if (seen.length === 1) break;
      }
    })();

    // The opening heartbeat is the signal that the cursor is fixed; appending
    // before it would land in the gap the cursor is chosen from.
    await opened.promise;
    await appendEvent(context, {
      kind: "issue.created",
      subjectType: "issue",
      subjectId: crypto.randomUUID(),
    });
    await reading;
    controller.abort();

    expect(seen).toEqual(["issue.created"]);
  });

  it(
    "starts from the cursor it is given, skipping what came before",
    { timeout: 15000 },
    async () => {
      const { db, close } = testDb();
      closers.push(close);
      const context = await memberContext(db);
      const before = await appendEvent(context, {
        kind: "workspace.created",
        subjectType: "workspace",
        subjectId: context.workspace.id,
      });
      const client = createRouterClient(router, { context });
      const controller = new AbortController();

      const stream = await client.events.subscribe(
        { after: before.seq },
        { signal: controller.signal },
      );
      const seen: string[] = [];
      const reading = (async () => {
        for await (const message of stream) {
          if (message.type === "event") seen.push(message.event.kind);
          if (seen.length === 1) break;
        }
      })();

      await appendEvent(context, {
        kind: "member.joined",
        subjectType: "member",
        subjectId: context.member.id,
      });
      await reading;
      controller.abort();

      expect(seen).toEqual(["member.joined"]);
    },
  );

  it("ends when the request is aborted", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const context = await memberContext(db);
    const client = createRouterClient(router, { context });
    const controller = new AbortController();

    const stream = await client.events.subscribe({}, { signal: controller.signal });
    const drained = (async () => {
      for await (const _ of stream) {
        // Nothing is appended, so this only ends when the signal fires.
      }
      return "ended";
    })();
    controller.abort();

    expect(await Promise.race([drained, timeout(3000)])).toBe("ended");
  });

  it("refuses an anonymous caller", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const client = createRouterClient(router, {
      context: { db, session: null, member: null, workspace: null },
    });
    await expect(client.events.subscribe({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

function timeout(ms: number) {
  return new Promise((resolve) => setTimeout(() => resolve("timed out"), ms));
}
