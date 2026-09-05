import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

const stub = vi.hoisted(() => {
  const ada = {
    id: "m-ada",
    handle: "ada",
    role: "admin",
    user: { id: "u", name: "Ada Lovelace", email: "a@b.c" },
  };
  const core = { id: "t1", name: "Core", handle: "core", members: [ada] };
  return {
    ada,
    core,
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
    comments: [
      {
        id: "c1",
        body: "First thought",
        author: ada,
        createdAt: new Date(),
        editedAt: null,
        deletedAt: null,
      },
      {
        id: "c2",
        body: "",
        author: ada,
        createdAt: new Date(),
        editedAt: null,
        deletedAt: new Date(),
      },
    ],
    created: [] as unknown[],
  };
});

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const { stubClient } = await import("./stub-client.ts");
  const client = stubClient({
    members: { list: async () => ({ members: [stub.ada] }) },
    teams: { list: async () => ({ teams: [stub.core] }) },
    issues: { get: async () => stub.issue },
    workflow: { get: async () => ({ states: [stub.issue.state] }) },
    comments: {
      list: async () => ({ comments: stub.comments }),
      create: async (input: unknown) => {
        stub.created.push(input);
        return stub.comments[0];
      },
      update: async () => stub.comments[0],
      delete: async () => ({ deleted: true }),
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

describe("the comment thread", () => {
  it("shows each comment with its author, and marks a withdrawn one", async () => {
    await mountAt("/issues/DEV-1");

    const thread = await screen.findByRole("list", { name: "Comments" });
    const entries = within(thread).getAllByRole("listitem");
    expect(entries).toHaveLength(2);
    expect(within(entries[0]!).getByText("First thought")).toBeTruthy();
    expect(within(entries[1]!).getByText(/withdrawn/i)).toBeTruthy();
  });

  it("posts what was typed", async () => {
    await mountAt("/issues/DEV-1");

    fireEvent.change(await screen.findByLabelText("Comment"), {
      target: { value: "ping @ada" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Comment" }));

    await waitFor(() =>
      expect(stub.created).toContainEqual(
        expect.objectContaining({ issueKey: "DEV-1", body: "ping @ada" }),
      ),
    );
  });

  it("suggests Members and Teams after an @", async () => {
    await mountAt("/issues/DEV-1");

    fireEvent.change(await screen.findByLabelText("Comment"), { target: { value: "hi @a" } });

    const suggestions = await screen.findByRole("listbox", { name: "Mentions" });
    expect(within(suggestions).getByText("@ada")).toBeTruthy();
  });
});
