import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

const created = vi.fn(async () => ({
  id: "new-issue",
  key: "DEV-7",
  number: 7,
  title: "Ship the launch page",
  description: null,
  state: { id: "s1", name: "Intent", position: 0, isGate: false, category: "active" },
  assignee: null,
  assigneeMemberId: null,
  parent: null,
  parentId: null,
  children: [],
  gateDecisions: [],
  labels: [],
  closedAt: null,
  updatedAt: new Date(),
  project: { id: "p1", key: "DEV", name: "deevy" },
}));

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const { stubClient } = await import("./stub-client.ts");
  const client = stubClient({
    projects: {
      list: async () => ({
        projects: [
          { id: "p1", key: "DEV", name: "deevy", description: null, team: null, archivedAt: null },
          { id: "p2", key: "OPS", name: "ops", description: null, team: null, archivedAt: null },
        ],
      }),
    },
    issues: { create: created },
  });
  return { client, orpc: createTanstackQueryUtils(client) };
});

const { createAppRouter } = await import("../src/router.tsx");

/** The shell, on a route that has nothing to do with Issues. */
async function mountAt(path: string) {
  const router = createAppRouter(
    { workspaceName: "Flippable Team", memberName: "Ada Lovelace" },
    { memory: true, initialEntries: [path] },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await router.load();
  return router;
}

/**
 * Creating an Issue used to mean navigating to a Project and finding a form at
 * the top of its Issue list — the first thing a Human walking
 * docs/m3-acceptance.md could not find at all. The action belongs where every
 * route can reach it.
 */
describe("creating an Issue from anywhere", () => {
  it("is offered by the shell on a route that is not a Project", async () => {
    await mountAt("/inbox");

    expect(screen.getByRole("button", { name: /new issue/i })).toBeTruthy();
  });

  it("asks which Project, and creates the Issue there", async () => {
    created.mockClear();
    const router = await mountAt("/inbox");

    fireEvent.click(screen.getByRole("button", { name: /new issue/i }));
    // The Projects are fetched only once the dialog is open, so the option has
    // to exist before the select can be set to it.
    await screen.findByRole("option", { name: /ops/i });
    fireEvent.change(screen.getByLabelText(/project/i), { target: { value: "OPS" } });
    fireEvent.change(screen.getByLabelText(/title/i), {
      target: { value: "Ship the launch page" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create issue$/i }));

    await waitFor(() =>
      expect(created).toHaveBeenCalledWith(
        expect.objectContaining({ projectKey: "OPS", title: "Ship the launch page" }),
        expect.anything(),
      ),
    );
    // And it lands on what it just made, rather than leaving the Human to find it.
    await waitFor(() => expect(router.state.location.pathname).toBe("/issues/DEV-7"));
  });

  it("opens on `c`, the key every tool of this kind uses", async () => {
    await mountAt("/inbox");

    fireEvent.keyDown(document.body, { key: "c" });

    expect(await screen.findByLabelText(/title/i)).toBeTruthy();
  });

  it("leaves `c` alone while the Human is typing into something else", async () => {
    await mountAt("/projects/DEV");

    const field = await screen.findByLabelText(/new issue/i);
    field.focus();
    fireEvent.keyDown(field, { key: "c" });

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
