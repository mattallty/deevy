import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { pickOption, selectedLabel } from "./select.ts";

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
        user: { id: "u-ada", name: "Ada Lovelace", email: "ada@example.com", image: null },
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
  create: vi.fn(async (input: { name: string; handle?: string | null }) => ({
    id: "m-new",
    handle: input.handle ?? "reviewer",
    user: { id: "u-new", name: input.name, email: "reviewer@agents.invalid", image: null },
    key: {
      id: "k-first",
      name: "first key",
      start: "deevy_sk_abcd",
      createdAt: new Date(),
      lastRequestAt: null,
      expiresAt: null,
      enabled: true,
      key: "deevy_sk_THE_ONLY_TIME_YOU_SEE_THIS",
    },
  })),
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

const { mountAt } = await import("./mount.tsx");

/** The page links to an Agent's own page, so it is mounted through the router. */

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

describe("an Agent's schedule", () => {
  it("shows the interval each Agent wakes on, and sets one", async () => {
    await mountAt("/settings/agents");

    const idle = await screen.findByRole("row", { name: /idle/i });
    expect(selectedLabel(within(idle).getByLabelText(/schedule/i))).toBe("Hourly");

    const planner = await screen.findByRole("row", { name: /planner/i });
    const picker = within(planner).getByLabelText(/schedule/i);
    // Never is the default: an Agent that only reacts to what happens.
    expect(selectedLabel(picker)).toBe("Never");

    await pickOption(picker, "Hourly");

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

    // The key it was created with, in the one place it is ever readable.
    const shown = await screen.findByRole("dialog");
    expect(within(shown).getByText("deevy_sk_THE_ONLY_TIME_YOU_SEE_THIS")).toBeTruthy();
    expect(within(shown).getByText(/only time you will see it/i)).toBeTruthy();
    expect(within(shown).getByRole("link", { name: /open reviewer/i })).toBeTruthy();
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
