import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

const stub = vi.hoisted(() => {
  const states = [
    { id: "s1", name: "Intent", position: 0, isGate: true, category: "backlog" },
    { id: "s2", name: "Spec", position: 1, isGate: true, category: "active" },
    { id: "s4", name: "Build", position: 3, isGate: false, category: "active" },
    { id: "s6", name: "Done", position: 5, isGate: false, category: "done" },
  ];
  const base = {
    id: "i1",
    key: "DEV-1",
    number: 1,
    title: "Ship it",
    description: null,
    assignee: null,
    assigneeMemberId: null,
    parentId: null,
    parent: null,
    children: [],
    closedAt: null,
    project: { id: "p1", key: "DEV", name: "deevy" },
    gateDecisions: [],
    labels: [],
  };
  return {
    states,
    inGate: {
      ...base,
      state: states[0],
      gateDecisions: [
        {
          id: "g1",
          decision: "rejected",
          note: "Needs rethinking",
          stateId: "s1",
          createdAt: new Date(),
        },
      ],
    },
    inBuild: { ...base, key: "DEV-2", id: "i2", state: states[2] },
    approved: [] as unknown[],
    rejected: [] as unknown[],
    moved: [] as unknown[],
  };
});

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const { stubClient } = await import("./stub-client.ts");
  const byKey: Record<string, unknown> = { "DEV-1": stub.inGate, "DEV-2": stub.inBuild };
  const client = stubClient({
    projects: {
      get: async () => ({
        id: "p1",
        key: "DEV",
        name: "deevy",
        description: null,
        team: null,
        archivedAt: null,
        states: stub.states,
      }),
    },
    workflow: { get: async () => ({ states: stub.states }) },
    issues: {
      get: async ({ key }: { key: string }) => byKey[key],
      move: async (input: unknown) => {
        stub.moved.push(input);
        return stub.inBuild;
      },
    },
    gates: {
      approve: async (input: unknown) => {
        stub.approved.push(input);
        return stub.inGate;
      },
      reject: async (input: unknown) => {
        stub.rejected.push(input);
        return stub.inGate;
      },
    },
  });
  return { client, orpc: createTanstackQueryUtils(client) };
});

const { createAppRouter } = await import("../src/router.tsx");

async function mountAt(path: string) {
  const router = createAppRouter(
    { workspaceName: "Acme Team", memberName: "Ada" },
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

describe("an Issue sitting in a Gate", () => {
  it("offers Approve and Reject instead of a State picker", async () => {
    await mountAt("/issues/DEV-1");

    expect(await screen.findByRole("button", { name: "Approve" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reject" })).toBeTruthy();
    expect(screen.queryByLabelText("State")).toBeNull();
  });

  it("sends the note along with the approval", async () => {
    await mountAt("/issues/DEV-1");

    fireEvent.change(await screen.findByLabelText("Note"), {
      target: { value: "Worth doing" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(stub.approved).toContainEqual(
        expect.objectContaining({ key: "DEV-1", note: "Worth doing" }),
      ),
    );
  });

  it("is highlighted and scrolled to when a deevy link names it", async () => {
    // jsdom implements no scrolling, so the call itself is what a link
    // handing a Human straight to a Gate can be checked by.
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;

    await mountAt("/issues/DEV-1?gate=s1");

    const panel = await screen.findByRole("group", { name: /Intent Gate/i });
    expect(panel.dataset.focused).toBe("true");
    await waitFor(() => expect(scrolled).toHaveBeenCalled());
  });

  it("puts the ruling in front of the Human the link was for", async () => {
    await mountAt("/issues/DEV-1?gate=s1");

    const banner = await screen.findByRole("status");
    expect(banner.textContent).toMatch(/Waiting on your ruling/);
    expect(banner.textContent).toMatch(/Intent/);
    expect(within(banner).getByRole("button", { name: "Rule now" })).toBeTruthy();
  });

  it("is left alone when the link names a State the Issue has moved on from", async () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;

    await mountAt("/issues/DEV-1?gate=s2");

    const panel = await screen.findByRole("group", { name: /Intent Gate/i });
    expect(panel.dataset.focused).toBeUndefined();
    expect(scrolled).not.toHaveBeenCalled();
  });

  it("shows the decisions already made on it", async () => {
    await mountAt("/issues/DEV-1");

    const decisions = await screen.findByRole("list", { name: "Gate decisions" });
    expect(within(decisions).getByText(/Needs rethinking/)).toBeTruthy();
  });
});

describe("an Issue in a State that is not a Gate", () => {
  it("offers a State picker rather than Approve and Reject", async () => {
    await mountAt("/issues/DEV-2");

    expect(await screen.findByLabelText("State")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });
});

describe("the Workflow editor", () => {
  it("lists the States in order with their category and Gate flag", async () => {
    await mountAt("/projects/DEV/settings/workflow");

    const list = await screen.findByRole("list", { name: "States" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    // Master–detail: the first State's form sits beside the list, not inside it.
    expect(screen.getAllByDisplayValue("Intent")).toHaveLength(1);
  });
});
