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
        return (async function* () {
          for (const message of stub.messages) yield message;
          // Then stay open, the way the real stream does.
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

  it("resumes from the last seq it saw after the stream drops", async () => {
    stub.subscribed.length = 0;
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
