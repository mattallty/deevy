import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { pickOption } from "./select.ts";

const stub = vi.hoisted(() => ({
  states: [{ id: "s1", name: "Intent", position: 0, isGate: true, category: "backlog" }],
  documents: [
    { id: "d1", name: "intent", currentVersion: 2, issueId: "i1" },
    { id: "d2", name: "spec", currentVersion: 1, issueId: "i1" },
  ],
  bodies: {
    "intent:2": "## Problem\n\nThe Event log has no reader.",
    "intent:1": "## Problem",
    "spec:1": "## Requirements",
  } as Record<string, string>,
  written: [] as unknown[],
}));

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const { stubClient } = await import("./stub-client.ts");
  const issue = {
    id: "i1",
    key: "DEV-1",
    title: "Ship it",
    description: null,
    state: stub.states[0],
    assignee: null,
    parent: null,
    children: [],
    gateDecisions: [],
    labels: [],
    project: { id: "p1", key: "DEV", name: "deevy" },
  };
  const client = stubClient({
    issues: { get: async () => issue },
    workflow: { get: async () => ({ states: stub.states }) },
    documents: {
      list: async () => ({ documents: stub.documents }),
      get: async ({ name, version }: { name: string; version?: number }) => {
        const doc = stub.documents.find((d) => d.name === name)!;
        const at = version ?? doc.currentVersion;
        return {
          ...doc,
          version: at,
          body: stub.bodies[`${name}:${at}`] ?? "",
          authorMemberId: null,
        };
      },
      write: async (input: unknown) => {
        stub.written.push(input);
        return { ...stub.documents[0], version: 3, body: "written", authorMemberId: null };
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

describe("the Documents section on an Issue", () => {
  it("shows one tab per Document and renders the current version as markdown", async () => {
    await mountAt("/issues/DEV-1");

    const tabs = await screen.findByRole("tablist", { name: "Documents" });
    expect(
      within(tabs)
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual(["intent", "spec"]);
    expect(await screen.findByText(/The Event log has no reader/)).toBeTruthy();
  });

  it("writes a new version from the editor", async () => {
    await mountAt("/issues/DEV-1");

    fireEvent.click(await screen.findByRole("button", { name: "Edit intent" }));
    fireEvent.change(screen.getByLabelText("Body"), {
      target: { value: "## Problem\n\nRewritten." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save version" }));

    await waitFor(() =>
      expect(stub.written).toContainEqual(
        expect.objectContaining({ name: "intent", body: "## Problem\n\nRewritten." }),
      ),
    );
  });

  it("lets an older version be read", async () => {
    await mountAt("/issues/DEV-1");

    await pickOption(await screen.findByLabelText("Version"), "1");

    await waitFor(() => expect(screen.queryByText(/The Event log has no reader/)).toBeNull());
  });
});
