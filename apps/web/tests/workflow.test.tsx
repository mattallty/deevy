import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

const stub = vi.hoisted(() => ({
  states: [
    {
      id: "s1",
      name: "Intent",
      position: 0,
      isGate: true,
      category: "backlog",
      documentName: null,
      documentTemplate: null,
      triggerAgentMemberId: null,
    },
    {
      id: "s2",
      name: "Plan",
      position: 1,
      isGate: true,
      category: "active",
      documentName: null,
      documentTemplate: null,
      triggerAgentMemberId: "m-planner",
    },
  ],
  agents: [
    {
      id: "m-planner",
      role: "member",
      kind: "agent",
      handle: "planner",
      suspendedAt: null,
      user: { id: "u-planner", name: "Planner", email: "planner@invalid", image: null },
      sponsor: null,
      webhookUrl: null,
      scheduleMinutes: null,
      grantedProjectIds: [],
    },
    {
      id: "m-builder",
      role: "member",
      kind: "agent",
      handle: "builder",
      suspendedAt: null,
      user: { id: "u-builder", name: "Builder", email: "builder@invalid", image: null },
      sponsor: null,
      webhookUrl: null,
      scheduleMinutes: null,
      grantedProjectIds: [],
    },
  ],
  saved: [] as Array<Record<string, unknown>>,
}));

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const { stubClient } = await import("./stub-client.ts");
  const client = stubClient({
    agents: { list: async () => ({ agents: stub.agents }) },
    workflow: {
      get: async () => ({ states: stub.states }),
      update: async (input: Record<string, unknown>) => {
        stub.saved.push(input);
        return { states: stub.states };
      },
    },
  });
  return { client, orpc: createTanstackQueryUtils(client) };
});

const { WorkflowPage } = await import("../src/routes/projects/workflow.tsx");

function mount() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkflowPage projectKey="DEV" />
    </QueryClientProvider>,
  );
}

async function states() {
  const list = await screen.findByRole("list", { name: "States" });
  return within(list).getAllByRole("listitem");
}

describe("the Agent a State triggers", () => {
  it("offers every Agent per State and shows the rule the State already carries", async () => {
    mount();
    const [intent, plan] = await states();

    const onIntent = within(intent!).getByLabelText("Assign an Agent on entering");
    const onPlan = within(plan!).getByLabelText("Assign an Agent on entering");

    await waitFor(() => expect(within(onPlan as HTMLElement).getByText("Planner")).toBeTruthy());
    expect((onIntent as HTMLSelectElement).value).toBe("");
    expect((onPlan as HTMLSelectElement).value).toBe("m-planner");
    expect(within(onPlan as HTMLElement).getByText("Builder")).toBeTruthy();
  });

  it("saves the rule with the rest of the Workflow", async () => {
    mount();
    const [intent] = await states();
    const picker = within(intent!).getByLabelText("Assign an Agent on entering");
    await waitFor(() => expect(within(picker as HTMLElement).getByText("Builder")).toBeTruthy());

    fireEvent.change(picker, { target: { value: "m-builder" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Workflow" }));

    await waitFor(() => expect(stub.saved).toHaveLength(1));
    expect(stub.saved[0]?.states).toMatchObject([
      { name: "Intent", triggerAgentMemberId: "m-builder" },
      { name: "Plan", triggerAgentMemberId: "m-planner" },
    ]);
  });
});
