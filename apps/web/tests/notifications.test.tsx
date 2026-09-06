import { fireEvent, screen, waitFor } from "@testing-library/react";
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

const { mountAt } = await import("./mount.tsx");

describe("the Notifications settings page", () => {
  it("shows every kind of Notification against the inbox and Slack", async () => {
    await mountAt("/settings/notifications", { memberName: "Ada" });

    expect(await screen.findByText("Gate awaiting")).toBeTruthy();
    expect(
      (screen.getByLabelText("Run awaiting input in Slack") as HTMLInputElement).ariaChecked,
    ).toBe("false");
    expect(
      (screen.getByLabelText("Run finished in the inbox") as HTMLInputElement).ariaChecked,
    ).toBe("false");
  });

  it("saves the whole matrix when a Human turns one of them off", async () => {
    await mountAt("/settings/notifications", { memberName: "Ada" });

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
