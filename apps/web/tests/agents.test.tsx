import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

const stub = vi.hoisted(() => ({
  agents: [
    {
      id: "m-planner",
      role: "member",
      kind: "agent",
      handle: "planner",
      suspendedAt: null,
      user: {
        id: "u-planner",
        name: "Planner",
        email: "planner@agents.deevy.invalid",
        image: null,
      },
      sponsor: {
        id: "m-ada",
        role: "admin",
        kind: "human",
        handle: "ada",
        suspendedAt: null,
        user: { id: "u-ada", name: "Ada Lovelace", email: "ada@flippable.net", image: null },
      },
      webhookUrl: null,
      scheduleMinutes: null,
      grantedProjectIds: ["p-dev"],
    },
    {
      id: "m-idle",
      role: "member",
      kind: "agent",
      handle: "idle",
      suspendedAt: new Date(),
      user: { id: "u-idle", name: "Idle", email: "idle@agents.deevy.invalid", image: null },
      sponsor: null,
      webhookUrl: "https://example.invalid/hook",
      scheduleMinutes: 60,
      grantedProjectIds: [],
    },
  ],
  scheduled: [] as Array<Record<string, unknown>>,
}));

const calls = vi.hoisted(() => ({
  create: vi.fn(async (_input: { name: string; handle?: string | null }) => ({ id: "m-new" })),
  suspend: vi.fn(async (_input: { memberId: string }) => ({})),
  reinstate: vi.fn(async (_input: { memberId: string }) => ({})),
}));

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const { stubClient } = await import("./stub-client.ts");
  const client = stubClient({
    agents: {
      list: async () => ({ agents: stub.agents }),
      update: async (input: Record<string, unknown>) => {
        stub.scheduled.push(input);
        return stub.agents[0];
      },
      create: calls.create,
      suspend: calls.suspend,
      reinstate: calls.reinstate,
    },
  });
  return { client, orpc: createTanstackQueryUtils(client) };
});

const { createAppRouter } = await import("../src/router.tsx");

/** The page links to an Agent's own page, so it is mounted through the router. */
async function mountAt(path: string) {
  const router = createAppRouter(
    { workspaceName: "Flippable Team", memberName: "Ada Lovelace" },
    { initialEntries: [path] },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await router.load();
}

describe("the Agents settings page", () => {
  it("lists every Agent with the Human accountable for it", async () => {
    await mountAt("/settings/agents");

    const planner = await screen.findByRole("row", { name: /planner/i });
    expect(within(planner).getByText("Ada Lovelace")).toBeTruthy();

    const idle = await screen.findByRole("row", { name: /idle/i });
    expect(within(idle).getByText(/suspended/i)).toBeTruthy();
    expect(within(idle).getByText(/no sponsor/i)).toBeTruthy();
  });

  it("says how many Projects an Agent may see", async () => {
    await mountAt("/settings/agents");

    const planner = await screen.findByRole("row", { name: /planner/i });
    expect(within(planner).getByText("1 Project")).toBeTruthy();
    const idle = await screen.findByRole("row", { name: /idle/i });
    await waitFor(() => expect(within(idle).getByText(/no Projects/i)).toBeTruthy());
  });
});

describe("connecting an Agent over MCP", () => {
  it("gives the endpoint and a command to paste, so a Sponsor need not guess", async () => {
    await mountAt("/settings/agents");

    const panel = await screen.findByRole("region", { name: /connect an agent/i });
    expect(within(panel).getByText(`${window.location.origin}/mcp`)).toBeTruthy();
    expect(within(panel).getByText(/claude mcp add/i).textContent).toContain("--transport http");
  });
});

describe("an Agent's schedule", () => {
  it("shows the interval each Agent wakes on, and sets one", async () => {
    await mountAt("/settings/agents");

    const idle = await screen.findByRole("row", { name: /idle/i });
    expect((within(idle).getByLabelText(/schedule/i) as HTMLSelectElement).value).toBe("60");

    const planner = await screen.findByRole("row", { name: /planner/i });
    const picker = within(planner).getByLabelText(/schedule/i) as HTMLSelectElement;
    // Never is the default: an Agent that only reacts to what happens.
    expect(picker.value).toBe("");

    fireEvent.change(picker, { target: { value: "60" } });

    await waitFor(() => expect(stub.scheduled).toHaveLength(1));
    expect(stub.scheduled[0]).toEqual({ memberId: "m-planner", scheduleMinutes: 60 });
  });
});

describe("sponsoring an Agent", () => {
  it("creates one from the page, because the operator guide says this is where", async () => {
    await mountAt("/settings/agents");

    fireEvent.click(await screen.findByRole("button", { name: "New Agent" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Reviewer" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

    await waitFor(() => expect(calls.create).toHaveBeenCalledTimes(1));
    expect(calls.create.mock.calls[0]?.[0]).toMatchObject({ name: "Reviewer" });
  });

  it("stops one that is working, and brings back one that is not", async () => {
    await mountAt("/settings/agents");

    const planner = await screen.findByRole("row", { name: /planner/i });
    fireEvent.click(within(planner).getByRole("button", { name: "Suspend" }));
    await waitFor(() => expect(calls.suspend).toHaveBeenCalledTimes(1));
    expect(calls.suspend.mock.calls[0]?.[0]).toMatchObject({ memberId: "m-planner" });

    const idle = await screen.findByRole("row", { name: /idle/i });
    fireEvent.click(within(idle).getByRole("button", { name: "Reinstate" }));
    await waitFor(() => expect(calls.reinstate).toHaveBeenCalledTimes(1));
  });
});
