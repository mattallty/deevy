import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

const stub = vi.hoisted(() => ({
  issue: {
    id: "i1",
    key: "DEV-1",
    title: "Ship it",
    description: null,
    state: { id: "s4", name: "Build", position: 3, isGate: false, category: "active" },
    assignee: null,
    parent: null,
    children: [],
    gateDecisions: [],
    labels: [],
    project: { id: "p1", key: "DEV", name: "deevy" },
  },
  links: [
    {
      id: "k1",
      kind: "pull_request",
      url: "https://github.com/mattallty/deevy/pull/12",
      title: null,
      ref: "12",
      repository: { id: "r1", name: "mattallty/deevy" },
    },
    {
      id: "k2",
      kind: "url",
      url: "https://example.com/design",
      title: "The design",
      ref: null,
      repository: null,
    },
  ],
  added: [] as unknown[],
}));

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const { stubClient } = await import("./stub-client.ts");
  const client = stubClient({
    issues: { get: async () => stub.issue },
    workflow: { get: async () => ({ states: [stub.issue.state] }) },
    links: {
      list: async () => ({ links: stub.links }),
      add: async (input: unknown) => {
        stub.added.push(input);
        return stub.links[0];
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
  // The router settles its matches in React state, so the load belongs
  // inside act: `render` wraps its own work and cannot wrap this.
  await act(async () => {
    await router.load();
  });
}

describe("the Links section", () => {
  it("groups Links by kind and names the Repository when one matched", async () => {
    await mountAt("/issues/DEV-1");

    const pulls = await screen.findByRole("list", { name: "Pull requests" });
    expect(within(pulls).getByRole("link", { name: "12" })).toBeTruthy();
    expect(within(pulls).getByText("mattallty/deevy")).toBeTruthy();

    const other = screen.getByRole("list", { name: "Links" });
    expect(within(other).getByRole("link", { name: "The design" })).toBeTruthy();
  });

  it("adds a pasted URL without asking for its kind", async () => {
    await mountAt("/issues/DEV-1");

    fireEvent.change(await screen.findByLabelText("Add a link"), {
      target: { value: "https://github.com/mattallty/deevy/pull/13" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add link" }));

    await waitFor(() =>
      expect(stub.added).toContainEqual(
        expect.objectContaining({
          issueKey: "DEV-1",
          url: "https://github.com/mattallty/deevy/pull/13",
        }),
      ),
    );
  });
});
