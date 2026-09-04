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
    {
      id: "s3",
      name: "Build",
      position: 2,
      isGate: false,
      category: "active",
      documentName: null,
      documentTemplate: null,
      triggerAgentMemberId: null,
    },
  ],
  members: [
    { id: "m-ada", kind: "human", user: { id: "u-ada", name: "Ada" }, suspendedAt: null },
    { id: "m-bob", kind: "human", user: { id: "u-bob", name: "Bob" }, suspendedAt: null },
    {
      id: "m-planner",
      kind: "agent",
      user: { id: "u-planner", name: "Planner" },
      suspendedAt: null,
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
    members: { list: async () => ({ members: stub.members }) },
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
      { name: "Build", triggerAgentMemberId: null },
    ]);
  });
});

describe("the approvers a Gate names", () => {
  it("offers the Workspace's Humans on a Gate, and nothing on a State that is not one", async () => {
    mount();
    const [intent, , build] = await states();

    const picker = (await within(intent!).findByLabelText(
      "Approvers for Intent",
    )) as HTMLSelectElement;
    await waitFor(() => expect(within(picker).getByRole("option", { name: "Ada" })).toBeTruthy());
    expect(within(picker).getByRole("option", { name: "Bob" })).toBeTruthy();
    // An Agent never decides a Gate (ADR-0004), so it is not on offer.
    expect(within(picker).queryByRole("option", { name: "Planner" })).toBeNull();
    expect(within(build!).queryByLabelText("Approvers for Build")).toBeNull();
  });

  it("saves the Humans it names with the rest of the Workflow", async () => {
    stub.saved.length = 0;
    mount();
    const [intent] = await states();
    const picker = (await within(intent!).findByLabelText(
      "Approvers for Intent",
    )) as HTMLSelectElement;
    await waitFor(() => expect(within(picker).getByRole("option", { name: "Bob" })).toBeTruthy());

    for (const option of picker.options) option.selected = option.value === "m-bob";
    fireEvent.change(picker);
    fireEvent.click(screen.getByRole("button", { name: "Save Workflow" }));

    await waitFor(() => expect(stub.saved).toHaveLength(1));
    expect(stub.saved[0]?.states).toMatchObject([
      { name: "Intent", approverMemberIds: ["m-bob"] },
      { name: "Plan", approverMemberIds: [] },
      { name: "Build", approverMemberIds: [] },
    ]);
  });
});
