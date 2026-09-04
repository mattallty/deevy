import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
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
}));

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const { stubClient } = await import("./stub-client.ts");
  const client = stubClient({
    agents: { list: async () => ({ agents: stub.agents }) },
  });
  return { client, orpc: createTanstackQueryUtils(client) };
});

const { AgentsPage } = await import("../src/routes/settings/agents.tsx");

function mount(ui: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("the Agents settings page", () => {
  it("lists every Agent with the Human accountable for it", async () => {
    mount(<AgentsPage />);

    const planner = await screen.findByRole("row", { name: /planner/i });
    expect(within(planner).getByText("Ada Lovelace")).toBeTruthy();

    const idle = await screen.findByRole("row", { name: /idle/i });
    expect(within(idle).getByText(/suspended/i)).toBeTruthy();
    expect(within(idle).getByText(/no sponsor/i)).toBeTruthy();
  });

  it("says how many Projects an Agent may see", async () => {
    mount(<AgentsPage />);

    const planner = await screen.findByRole("row", { name: /planner/i });
    expect(within(planner).getByText("1 Project")).toBeTruthy();
    const idle = await screen.findByRole("row", { name: /idle/i });
    await waitFor(() => expect(within(idle).getByText(/no Projects/i)).toBeTruthy());
  });
});
