import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

const stub = vi.hoisted(() => ({
  agent: {
    id: "m-planner",
    role: "member",
    kind: "agent",
    handle: "planner",
    suspendedAt: null,
    user: { id: "u-planner", name: "Planner", email: "planner@agents.invalid", image: null },
    sponsor: {
      id: "m-ada",
      role: "admin",
      kind: "human",
      handle: "ada",
      suspendedAt: null,
      user: { id: "u-ada", name: "Ada Lovelace", email: "ada@example.com", image: null },
    },
    webhookUrl: null,
    scheduleMinutes: null,
    grantedProjectIds: ["p-dev"],
  },
  projects: [
    { id: "p-dev", key: "DEV", name: "deevy", description: null, teamId: null, archivedAt: null },
    { id: "p-ops", key: "OPS", name: "ops", description: null, teamId: null, archivedAt: null },
  ],
  keys: [
    {
      id: "k-1",
      name: "ci",
      start: "deevy_sk_abcd",
      createdAt: new Date("2026-09-01T10:00:00Z"),
      lastRequestAt: null,
      expiresAt: null,
      enabled: true,
    },
  ],
}));

const calls = vi.hoisted(() => ({
  issue: vi.fn(async (_input: { memberId: string; name: string }) => ({
    id: "k-2",
    name: "laptop",
    start: "deevy_sk_wxyz",
    createdAt: new Date(),
    lastRequestAt: null,
    expiresAt: null,
    enabled: true,
    key: "deevy_sk_THE_ONLY_TIME_YOU_SEE_THIS",
  })),
  revoke: vi.fn(async (_input: { memberId: string; keyId: string }) => ({ revoked: true })),
  grantAdd: vi.fn(async (_input: { memberId: string; projectId: string }) => ({
    projects: [],
  })),
  grantRemove: vi.fn(async (_input: { memberId: string; projectId: string }) => ({
    projects: [],
  })),
}));

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const { stubClient } = await import("./stub-client.ts");
  const client = stubClient({
    agents: {
      list: async () => ({ agents: [stub.agent] }),
      keys: { list: async () => ({ keys: stub.keys }), issue: calls.issue, revoke: calls.revoke },
      grants: {
        list: async () => ({ projects: [stub.projects[0]] }),
        add: calls.grantAdd,
        remove: calls.grantRemove,
      },
    },
    projects: { list: async () => ({ projects: stub.projects }) },
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
  // The router settles its matches in React state, so the load belongs
  // inside act: `render` wraps its own work and cannot wrap this.
  await act(async () => {
    await router.load();
  });
}

describe("an Agent's own page", () => {
  it("shows who answers for it and what it can see", async () => {
    await mountAt("/settings/agents/m-planner");

    expect(await screen.findByRole("heading", { name: /planner/i })).toBeTruthy();
    // The shell shows the signed-in Human's name too, so this asks the line
    // that says who answers for the Agent rather than the page as a whole.
    expect(screen.getByText(/Sponsored by/).textContent).toContain("Ada Lovelace");
    const grants = await screen.findByRole("region", { name: /projects/i });
    expect(within(grants).getByText(/DEV/)).toBeTruthy();
  });

  it("shows an issued key exactly once, and says so", async () => {
    await mountAt("/settings/agents/m-planner");

    const keys = await screen.findByRole("region", { name: /api keys/i });
    // What is already there is a stub, never the key itself.
    expect(await within(keys).findByText(/deevy_sk_abcd/)).toBeTruthy();

    fireEvent.change(within(keys).getByLabelText(/key name/i), { target: { value: "laptop" } });
    fireEvent.click(within(keys).getByRole("button", { name: /issue/i }));

    await waitFor(() => expect(calls.issue).toHaveBeenCalledTimes(1));
    const shown = await screen.findByText("deevy_sk_THE_ONLY_TIME_YOU_SEE_THIS");
    expect(shown).toBeTruthy();
    expect(screen.getByText(/only time/i)).toBeTruthy();
  });

  it("grants a Project and takes one back", async () => {
    await mountAt("/settings/agents/m-planner");

    const grants = await screen.findByRole("region", { name: /projects/i });
    // A combobox over the Projects not yet granted: ArrowDown opens it under
    // jsdom, the options are portalled, choosing one grants it.
    const picker = within(grants).getByLabelText(/grant a project/i);
    fireEvent.keyDown(picker, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: /OPS/ }));
    fireEvent.keyDown(picker, { key: "Escape" });
    await waitFor(() => expect(calls.grantAdd).toHaveBeenCalledTimes(1));
    expect(calls.grantAdd.mock.calls[0]?.[0]).toMatchObject({
      memberId: "m-planner",
      projectId: "p-ops",
    });

    fireEvent.click(within(grants).getByRole("button", { name: /revoke DEV/i }));
    await waitFor(() => expect(calls.grantRemove).toHaveBeenCalledTimes(1));
  });
});

describe("the Agent's own settings", () => {
  it("offers the schedule, the Sponsor, its recent Runs, and the way to suspend it", async () => {
    await mountAt("/settings/agents/m-planner");

    expect(await screen.findByLabelText("Wake")).toBeTruthy();
    expect(screen.getByLabelText("Change Sponsor")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Recent Runs" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Suspend" })).toBeTruthy();
  });
});
