import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

const stub = vi.hoisted(() => ({
  notifications: [
    {
      id: "n1",
      kind: "assignment",
      readAt: null,
      createdAt: new Date(),
      eventId: 9,
      issue: { id: "i1", key: "DEV-1", title: "Ship it" },
    },
    {
      id: "n2",
      kind: "mention",
      readAt: new Date(),
      createdAt: new Date(),
      eventId: 8,
      issue: { id: "i1", key: "DEV-1", title: "Ship it" },
    },
    {
      id: "n3",
      kind: "gate_awaiting",
      readAt: null,
      createdAt: new Date(),
      eventId: 7,
      issue: { id: "i2", key: "DEV-2", title: "Needs a decision" },
    },
  ],
  read: [] as unknown[],
  allRead: 0,
}));

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const { stubClient } = await import("./stub-client.ts");
  const client = stubClient({
    inbox: {
      list: async () => ({ notifications: stub.notifications, nextCursor: 7 }),
      unreadCount: async () => ({ unread: 2 }),
      markRead: async (input: unknown) => {
        stub.read.push(input);
        return { read: 1 };
      },
      markAllRead: async () => {
        stub.allRead += 1;
        return { read: 2 };
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

describe("the inbox", () => {
  it("groups Notifications by the Issue they are about", async () => {
    await mountAt("/inbox");

    const first = await screen.findByRole("list", { name: "Notifications for DEV-1" });
    expect(within(first).getAllByRole("listitem")).toHaveLength(2);
    const second = screen.getByRole("list", { name: "Notifications for DEV-2" });
    expect(within(second).getAllByRole("listitem")).toHaveLength(1);
    expect(within(second).getByText("a Gate is waiting")).toBeTruthy();
  });

  it("offers Mark read only on the ones still unread", async () => {
    await mountAt("/inbox");

    const first = await screen.findByRole("list", { name: "Notifications for DEV-1" });
    const buttons = within(first).getAllByRole("button", { name: "Mark read" });
    expect(buttons).toHaveLength(1);

    fireEvent.click(buttons[0]!);
    await waitFor(() => expect(stub.read).toContainEqual({ ids: ["n1"] }));
  });

  it("marks everything read at once", async () => {
    await mountAt("/inbox");

    fireEvent.click(await screen.findByRole("button", { name: "Mark all read" }));

    await waitFor(() => expect(stub.allRead).toBeGreaterThan(0));
  });
});

describe("the sidebar", () => {
  it("badges the Inbox with the unread count", async () => {
    await mountAt("/");

    expect(await screen.findByLabelText("2 unread")).toBeTruthy();
  });
});
