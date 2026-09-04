import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

const stub = vi.hoisted(() => ({
  subscribed: [] as unknown[],
  messages: [
    { type: "heartbeat", cursor: 7 },
    {
      type: "event",
      event: { seq: 8, kind: "issue.created", subjectType: "issue", projectId: "p1" },
    },
  ],
  /**
   * How many streams end of their own accord before the rest stay open. A
   * Worker's stream ends when its budget is spent, and what the hook does next
   * is the difference between a board that is a poll behind and one that is two
   * seconds behind (docs/plans/m3.md slice 7).
   */
  endsCleanly: 0,
}));

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const client = {
    issues: { list: async () => ({ issues: [], nextCursor: null }) },
    projects: { list: async () => ({ projects: [] }) },
    members: { list: async () => ({ members: [] }) },
    teams: { list: async () => ({ teams: [] }) },
    allowlist: { list: async () => ({ rules: [] }) },
    workflow: { get: async () => ({ states: [] }) },
    events: {
      list: async () => ({ events: [], nextCursor: null }),
      subscribe: async (input: unknown) => {
        stub.subscribed.push(input);
        const ends = stub.endsCleanly > 0;
        if (ends) stub.endsCleanly -= 1;
        return (async function* () {
          for (const message of stub.messages) yield message;
          // A stream that has spent its budget returns; otherwise it stays
          // open, the way a Node one does.
          if (ends) return;
          await new Promise(() => {});
        })();
      },
    },
  };
  return { client, orpc: createTanstackQueryUtils(client) };
});

const { useLiveEvents } = await import("../src/lib/live.ts");

function Probe() {
  useLiveEvents(true);
  return null;
}

describe("useLiveEvents", () => {
  it("subscribes and re-reads the queries an Event could have changed", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidated: unknown[] = [];
    const original = queryClient.invalidateQueries.bind(queryClient);
    queryClient.invalidateQueries = (filters?: Parameters<typeof original>[0]) => {
      invalidated.push(filters?.queryKey);
      return original(filters);
    };

    render(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(stub.subscribed.length).toBeGreaterThan(0));
    await waitFor(() => expect(invalidated.length).toBeGreaterThan(1));
    // An Event about an Issue re-reads the Issue queries, not the Member ones.
    const keys = JSON.stringify(invalidated);
    expect(keys).toContain("issues");
    expect(keys).not.toContain("members");
  });

  it("resubscribes from the cursor at once when the stream ends on purpose", async () => {
    stub.subscribed.length = 0;
    stub.endsCleanly = 1;
    stub.messages = [
      { type: "heartbeat", cursor: 7 },
      {
        type: "event",
        event: { seq: 8, kind: "issue.created", subjectType: "issue", projectId: "p1" },
      },
      // The sign-off a Worker's stream ends with: where it got to.
      { type: "heartbeat", cursor: 8 },
    ];
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );

    // Well inside the two seconds a failed stream costs: an end on purpose is
    // not a failure and must not be paid for like one.
    await waitFor(() => expect(stub.subscribed.length).toBe(2), { timeout: 500 });
    expect(stub.subscribed[1]).toEqual({ after: 8 });
  });

  it("resumes from the last seq it saw after the stream drops", async () => {
    stub.subscribed.length = 0;
    stub.endsCleanly = 0;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(stub.subscribed.length).toBeGreaterThan(0));
    // The first subscription starts with no cursor; the hook adopts the seq it
    // is told and would reconnect from there.
    expect(stub.subscribed[0]).toEqual({ after: undefined });
  });
});
