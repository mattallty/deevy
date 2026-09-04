import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { client, orpc } from "@/lib/orpc";

/**
 * Keeps this browser in step with the Workspace by reading the Event log as it
 * happens (docs/plans/m1.md slice 7). Every Event invalidates the queries that
 * could show it, so nothing here decides what changed: the Event log does.
 */
export function useLiveEvents(enabled: boolean) {
  const queryClient = useQueryClient();
  const cursor = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let stopped = false;

    async function run() {
      // Reconnect from the last seq seen, so a drop costs nothing.
      while (!stopped) {
        // A stream that ends of its own accord is not a failure. On Workers
        // every stream does: it spends its query budget and signs off with a
        // heartbeat carrying the cursor it reached, so the next one resumes
        // exactly and the board is one poll behind rather than two seconds
        // behind (docs/plans/m3.md slice 7). A stream that ends having said
        // nothing at all is a different thing — nothing to resume from, and
        // reconnecting at once would be a hot loop — so it waits like a
        // failure does.
        let delivered = 0;
        try {
          const stream = await client.events.subscribe(
            { after: cursor.current },
            { signal: controller.signal },
          );
          for await (const message of stream) {
            if (stopped) return;
            delivered += 1;
            if (message.type === "heartbeat") {
              cursor.current = message.cursor ?? cursor.current;
              continue;
            }
            cursor.current = message.event.seq;
            await invalidateFor(message.event);
          }
          if (delivered > 0) continue;
        } catch {
          if (stopped) return;
        }
        // The stream failed, or ended before it said anything; wait a moment.
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    async function invalidateFor(event: { subjectType: string; projectId: string | null }) {
      const invalidations = [queryClient.invalidateQueries({ queryKey: orpc.events.key() })];
      if (event.subjectType === "issue" || event.projectId) {
        invalidations.push(queryClient.invalidateQueries({ queryKey: orpc.issues.key() }));
      }
      if (event.subjectType === "project") {
        invalidations.push(
          queryClient.invalidateQueries({ queryKey: orpc.projects.key() }),
          queryClient.invalidateQueries({ queryKey: orpc.workflow.key() }),
        );
      }
      if (event.subjectType === "member") {
        invalidations.push(queryClient.invalidateQueries({ queryKey: orpc.members.key() }));
      }
      if (event.subjectType === "team") {
        invalidations.push(queryClient.invalidateQueries({ queryKey: orpc.teams.key() }));
      }
      if (event.subjectType === "allowlist_rule") {
        invalidations.push(queryClient.invalidateQueries({ queryKey: orpc.allowlist.key() }));
      }
      await Promise.all(invalidations);
    }

    void run();
    return () => {
      stopped = true;
      controller.abort();
    };
  }, [enabled, queryClient]);
}
