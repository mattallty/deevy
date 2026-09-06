import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

const stub = vi.hoisted(() => ({
  subscriptions: [
    {
      id: "s1",
      memberId: "m-planner",
      url: "https://runtime.example/deevy",
      kinds: ["run.*"],
      projectId: null,
      createdBy: "m1",
      createdAt: new Date(),
      disabledAt: null,
    },
  ],
  deliveries: [
    {
      id: "d1",
      subscriptionId: "s1",
      eventSeq: 42,
      eventKind: "run.started",
      attempts: 3,
      nextAttemptAt: new Date(),
      lastStatus: 500,
      lastError: "upstream is down",
      deliveredAt: null,
      createdAt: new Date(),
    },
  ],
  created: [] as unknown[],
  redelivered: [] as unknown[],
}));

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const { stubClient } = await import("./stub-client.ts");
  const client = stubClient({
    webhooks: {
      list: async () => ({ subscriptions: stub.subscriptions }),
      create: async (input: unknown) => {
        stub.created.push(input);
        return stub.subscriptions[0];
      },
      deliveries: async () => ({ deliveries: stub.deliveries }),
      redeliver: async (input: unknown) => {
        stub.redelivered.push(input);
        return { queued: true };
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

describe("the Webhooks settings page", () => {
  it("lists the subscriptions and what each one asked for", async () => {
    await mountAt("/settings/webhooks");

    expect(await screen.findByText("https://runtime.example/deevy")).toBeTruthy();
    expect(screen.getByText("run.*")).toBeTruthy();
  });

  it("subscribes a URL, with a secret the browser makes and the server never returns", async () => {
    await mountAt("/settings/webhooks");

    fireEvent.change(await screen.findByLabelText("URL"), {
      target: { value: "https://runtime.example/other" },
    });
    fireEvent.change(screen.getByLabelText("Event kinds"), { target: { value: "issue.*, run.*" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    fireEvent.click(screen.getByRole("button", { name: "Subscribe" }));

    await waitFor(() => expect(stub.created).toHaveLength(1));
    const [sent] = stub.created as [{ url: string; secret: string; kinds: string[] }];
    expect(sent.url).toBe("https://runtime.example/other");
    expect(sent.kinds).toEqual(["issue.*", "run.*"]);
    expect(sent.secret.length).toBeGreaterThanOrEqual(16);
    // Shown once, here, because nothing will ever hand it back.
    expect(screen.getByText(sent.secret)).toBeTruthy();
  });

  it("shows how the last attempts went, and asks for one again", async () => {
    await mountAt("/settings/webhooks");

    fireEvent.click(await screen.findByRole("button", { name: "Deliveries" }));

    expect(await screen.findByText("run.started")).toBeTruthy();
    expect(screen.getByText(/500/)).toBeTruthy();
    expect(screen.getByText(/upstream is down/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Redeliver" }));

    await waitFor(() =>
      expect(stub.redelivered).toContainEqual({ subscriptionId: "s1", deliveryId: "d1" }),
    );
  });
});
