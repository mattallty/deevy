import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { pickOption } from "./select.ts";

const stub = vi.hoisted(() => ({
  listed: [] as unknown[],
  ada: {
    id: "m-ada",
    kind: "human",
    role: "admin",
    handle: "ada",
    sponsorId: null,
    suspendedAt: null,
    user: {
      id: "u-ada",
      name: "Ada Lovelace",
      email: "ada@example.com",
      image: null,
      kind: "human",
    },
  },
  events: [
    {
      seq: 12,
      kind: "gate.approved",
      actorMemberId: "m-ada",
      subjectType: "issue",
      subjectId: "i1",
      projectId: "p1",
      payload: { state: "Intent" },
      createdAt: new Date("2026-09-05T10:02:00Z"),
    },
    {
      seq: 11,
      kind: "run.started",
      actorMemberId: null,
      subjectType: "run",
      subjectId: "r1",
      projectId: "p1",
      payload: null,
      createdAt: new Date("2026-09-05T10:01:00Z"),
    },
  ],
}));

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const { stubClient } = await import("./stub-client.ts");
  const client = stubClient({
    members: { list: async () => ({ members: [stub.ada] }) },
    projects: {
      list: async () => ({
        projects: [{ id: "p1", key: "DEV", name: "deevy", states: [], team: null }],
      }),
    },
    events: {
      // Filters by kind the way the server does, so the page need not.
      list: async (input: { kindPrefix?: string }) => {
        stub.listed.push(input);
        const prefix = input.kindPrefix;
        const events = prefix
          ? stub.events.filter((event) => event.kind.startsWith(`${prefix}.`))
          : stub.events;
        return { events, nextCursor: 11 };
      },
      // The base stub's subscribe stays quiet on its own; overriding the namespace drops it.
      subscribe: async () => {
        await new Promise(() => {});
        return (async function* () {
          yield { type: "heartbeat", cursor: null };
        })();
      },
    },
  });
  return { client, orpc: createTanstackQueryUtils(client) };
});

const { createAppRouter } = await import("../src/router.tsx");

async function mountAt(path: string) {
  const router = createAppRouter(
    { workspaceName: "Acme Team", memberName: "Ada Lovelace" },
    { initialEntries: [path] },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await act(async () => {
    await router.load();
  });
}

describe("the Event log", () => {
  it("lists the Workspace's Events newest first, with actor, kind and subject", async () => {
    await mountAt("/settings/events");

    expect(await screen.findByRole("heading", { name: "Event log" })).toBeTruthy();
    const table = await screen.findByRole("table", { name: "Event log" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows[0]?.textContent).toContain("gate.approved");
    expect(rows[0]?.textContent).toContain("Ada Lovelace");
    expect(rows[1]?.textContent).toContain("run.started");
    expect(rows[1]?.textContent).toContain("deevy");
    // Asked newest first.
    expect(stub.listed.at(-1)).toMatchObject({ order: "desc" });
  });

  it("asks the server for one kind and opens a payload", async () => {
    await mountAt("/settings/events");
    await screen.findByRole("table", { name: "Event log" });

    await pickOption(screen.getByLabelText("Kind"), "run.*");
    // The filter is the query's, so a page is a full page of matches. The
    // table is rebuilt after the skeleton, so it is found again.
    await waitFor(() => expect(stub.listed.at(-1)).toMatchObject({ kindPrefix: "run" }));
    await waitFor(() => {
      const filtered = screen.getByRole("table", { name: "Event log" });
      expect(within(filtered).queryByText("gate.approved")).toBeNull();
      expect(within(filtered).getByText("run.started")).toBeTruthy();
    });

    await pickOption(screen.getByLabelText("Kind"), "Every kind");
    await waitFor(() => expect(stub.listed.at(-1)).not.toHaveProperty("kindPrefix"));
    fireEvent.click(await screen.findByText("gate.approved"));
    expect((await screen.findByLabelText("Payload of 12")).textContent).toContain(
      '"state": "Intent"',
    );
  });

  it("is in the Settings navigation", async () => {
    await mountAt("/settings/events");
    const nav = screen.getByRole("navigation", { name: "Settings" });
    expect(within(nav).getByRole("link", { name: "Event log" }).getAttribute("href")).toBe(
      "/settings/events",
    );
  });
});
