import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

const stub = vi.hoisted(() => {
  const labels = [
    { id: "l1", scope: null, name: "backend", color: "#3b82f6" },
    { id: "l2", scope: "epic", name: "Checkout", color: "#a855f7" },
  ];
  const issue = {
    id: "i1",
    key: "DEV-1",
    title: "Ship it",
    description: null,
    state: { id: "s4", name: "Build", position: 3, isGate: false, category: "active" },
    assignee: null,
    parent: null,
    children: [],
    gateDecisions: [],
    labels: [labels[0]],
    project: { id: "p1", key: "DEV", name: "deevy" },
  };
  return { labels, issue, created: [] as unknown[], set: [] as unknown[] };
});

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const { stubClient } = await import("./stub-client.ts");
  const client = stubClient({
    issues: {
      get: async () => stub.issue,
      list: async () => ({ issues: [stub.issue], nextCursor: 1 }),
      setLabels: async (input: unknown) => {
        stub.set.push(input);
        return stub.issue;
      },
    },
    workflow: { get: async () => ({ states: [stub.issue.state] }) },
    labels: {
      list: async () => ({ labels: stub.labels }),
      create: async (input: unknown) => {
        stub.created.push(input);
        return stub.labels[0];
      },
    },
  });
  return { client, orpc: createTanstackQueryUtils(client) };
});

const { createAppRouter } = await import("../src/router.tsx");

async function mountAt(path: string) {
  const router = createAppRouter(
    { workspaceName: "Flippable Team", memberName: "Ada" },
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

describe("the Labels settings page", () => {
  it("lists Labels, showing a scoped one as scope: name", async () => {
    await mountAt("/settings/labels");

    expect(await screen.findByText("backend")).toBeTruthy();
    expect(screen.getByText("epic: Checkout")).toBeTruthy();
  });

  it("creates a Label from the form, splitting scope from name", async () => {
    await mountAt("/settings/labels");

    fireEvent.change(await screen.findByLabelText("Scope"), { target: { value: "epic" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Billing" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Label" }));

    await waitFor(() =>
      expect(stub.created).toContainEqual(
        expect.objectContaining({ scope: "epic", name: "Billing" }),
      ),
    );
  });
});

describe("the Label picker on an Issue", () => {
  it("shows which Labels are on it and sets the whole selection", async () => {
    await mountAt("/issues/DEV-1");

    await screen.findByRole("group", { name: "Labels" });
    fireEvent.click(await screen.findByRole("button", { name: "epic: Checkout" }));

    await waitFor(() =>
      expect(stub.set).toContainEqual(
        expect.objectContaining({ key: "DEV-1", labelIds: ["l1", "l2"] }),
      ),
    );
  });
});
