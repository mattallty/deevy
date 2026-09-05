import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

const stub = vi.hoisted(() => ({
  preferences: [
    { kind: "mention", inbox: true, slack: true },
    { kind: "assignment", inbox: true, slack: true },
    { kind: "gate_awaiting", inbox: true, slack: true },
    { kind: "run_awaiting_input", inbox: true, slack: false },
    { kind: "run_finished", inbox: false, slack: true },
  ],
  saved: [] as unknown[],
}));

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const { stubClient } = await import("./stub-client.ts");
  const client = stubClient({
    preferences: {
      get: async () => ({ preferences: stub.preferences }),
      set: async (input: unknown) => {
        stub.saved.push(input);
        return { preferences: stub.preferences };
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

describe("the Notifications settings page", () => {
  it("shows every kind of Notification against the inbox and Slack", async () => {
    await mountAt("/settings/notifications");

    expect(await screen.findByText("Gate awaiting")).toBeTruthy();
    expect(
      (screen.getByLabelText("Run awaiting input in Slack") as HTMLInputElement).ariaChecked,
    ).toBe("false");
    expect(
      (screen.getByLabelText("Run finished in the inbox") as HTMLInputElement).ariaChecked,
    ).toBe("false");
  });

  it("saves the whole matrix when a Human turns one of them off", async () => {
    await mountAt("/settings/notifications");

    fireEvent.click(await screen.findByLabelText("Gate awaiting in Slack"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(stub.saved).toHaveLength(1));
    const [saved] = stub.saved as [{ preferences: Array<Record<string, unknown>> }];
    expect(saved.preferences).toHaveLength(5);
    expect(saved.preferences).toContainEqual({
      kind: "gate_awaiting",
      inbox: true,
      slack: false,
    });
  });
});
