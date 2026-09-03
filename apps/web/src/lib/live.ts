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
        try {
          const stream = await client.events.subscribe(
            { after: cursor.current },
            { signal: controller.signal },
          );
          for await (const message of stream) {
            if (stopped) return;
            if (message.type === "heartbeat") {
              cursor.current = message.cursor ?? cursor.current;
              continue;
            }
            cursor.current = message.event.seq;
            await invalidateFor(message.event);
          }
        } catch {
          if (stopped) return;
        }
        // The stream ended or failed; wait a moment before trying again.
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
