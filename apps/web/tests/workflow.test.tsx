import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { pickOption, selectedLabel } from "./select.ts";

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
  /** How long `workflow.get` takes to answer, so a refetch can land after a save. */
  getDelayMs: 0,
  /** When set, a save is what `workflow.get` serves from then on, as the server would. */
  remembers: false,
}));

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const { stubClient } = await import("./stub-client.ts");
  const client = stubClient({
    agents: { list: async () => ({ agents: stub.agents }) },
    members: { list: async () => ({ members: stub.members }) },
    workflow: {
      get: async () => {
        if (stub.getDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, stub.getDelayMs));
        }
        return { states: stub.states };
      },
      // The server answers with the Workflow as saved.
      update: async (input: { states: Array<Record<string, unknown>> }) => {
        stub.saved.push(input);
        const states = input.states.map((state, index) => ({
          ...stub.states.find((known) => known.id === state.id),
          ...state,
          id: (state.id as string | undefined) ?? `new-${String(index)}`,
          position: index,
        })) as typeof stub.states;
        if (stub.remembers) stub.states = states;
        return { states };
      },
    },
  });
  return { client, orpc: createTanstackQueryUtils(client) };
});

const { WorkflowPage } = await import("../src/routes/projects/workflow.tsx");
const { mount } = await import("./mount.tsx");

async function states() {
  const list = await screen.findByRole("list", { name: "States" });
  return within(list).getAllByRole("listitem");
}

/** Master–detail: pick a State on the left, then read its form on the right. */
async function open(name: string) {
  const list = await screen.findByRole("list", { name: "States" });
  fireEvent.click(within(list).getByRole("button", { name: `Edit ${name}` }));
  return screen.getByRole("form", { name });
}

describe("the Agent a State triggers", () => {
  it("offers every Agent per State and shows the rule the State already carries", async () => {
    mount(<WorkflowPage projectKey="DEV" />);
    expect(await states()).toHaveLength(3);

    const intent = await open("Intent");
    const onIntent = within(intent).getByLabelText("Assign an Agent on entering");
    expect(selectedLabel(onIntent)).toBe("Nobody");
    fireEvent.keyDown(onIntent, { key: "ArrowDown" });
    expect(await screen.findByRole("option", { name: "Builder" })).toBeTruthy();
    fireEvent.keyDown(onIntent, { key: "Escape" });

    const plan = await open("Plan");
    const onPlan = within(plan).getByLabelText("Assign an Agent on entering");
    await waitFor(() => expect(selectedLabel(onPlan)).toBe("Planner"));
  });

  it("saves the rule with the rest of the Workflow", async () => {
    mount(<WorkflowPage projectKey="DEV" />);
    const intent = await open("Intent");
    const picker = within(intent).getByLabelText("Assign an Agent on entering");
    await pickOption(picker, "Builder");
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
    mount(<WorkflowPage projectKey="DEV" />);
    const intent = await open("Intent");

    // A combobox: typing filters, ArrowDown opens, the options are portalled.
    const picker = await within(intent).findByLabelText("Approvers for Intent");
    fireEvent.keyDown(picker, { key: "ArrowDown" });
    expect(await screen.findByRole("option", { name: "Ada" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Bob" })).toBeTruthy();
    // An Agent never decides a Gate (ADR-0004), so it is not on offer.
    expect(screen.queryByRole("option", { name: "Planner" })).toBeNull();
    // The open popup holds the page; close it before moving on.
    fireEvent.keyDown(picker, { key: "Escape" });

    const build = await open("Build");
    expect(within(build).queryByLabelText("Approvers for Build")).toBeNull();
  });

  it("saves the Humans it names with the rest of the Workflow", async () => {
    stub.saved.length = 0;
    mount(<WorkflowPage projectKey="DEV" />);
    const intent = await open("Intent");
    const picker = await within(intent).findByLabelText("Approvers for Intent");
    fireEvent.keyDown(picker, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Bob" }));
    expect(await within(intent).findByRole("button", { name: "Remove Bob" })).toBeTruthy();
    fireEvent.keyDown(picker, { key: "Escape" });
    fireEvent.click(await screen.findByRole("button", { name: "Save Workflow" }));

    await waitFor(() => expect(stub.saved).toHaveLength(1));
    expect(stub.saved[0]?.states).toMatchObject([
      { name: "Intent", approverMemberIds: ["m-bob"] },
      { name: "Plan", approverMemberIds: [] },
      { name: "Build", approverMemberIds: [] },
    ]);
  });
});

describe("a Gate that wants more than one Human", () => {
  it("saves the count and the exclusion, and offers neither on a State that is not a Gate", async () => {
    stub.saved.length = 0;
    mount(<WorkflowPage projectKey="DEV" />);
    const build = await open("Build");
    expect(within(build).queryByLabelText("Humans who must agree")).toBeNull();

    const intent = await open("Intent");
    fireEvent.change(within(intent).getByLabelText("Humans who must agree"), {
      target: { value: "2" },
    });
    fireEvent.click(
      within(intent).getByRole("checkbox", {
        name: "Whoever brings an Issue here cannot approve it",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save Workflow" }));

    await waitFor(() => expect(stub.saved).toHaveLength(1));
    expect(stub.saved[0]?.states).toMatchObject([
      { name: "Intent", approvalsRequired: 2, excludeRequester: true },
      { name: "Plan", approvalsRequired: 1, excludeRequester: false },
      { name: "Build", approvalsRequired: 1, excludeRequester: false },
    ]);
  });
});

describe("the order and the template", () => {
  it("moves a State with the arrows and counts the change", async () => {
    stub.saved.length = 0;
    mount(<WorkflowPage projectKey="DEV" />);
    const plan = await open("Plan");
    expect(screen.getByText("No changes")).toBeTruthy();
    fireEvent.click(within(plan).getByRole("button", { name: "Move Plan up" }));
    const rows = await states();
    expect(rows[0]?.textContent).toContain("Plan");
    expect(screen.getByText(/1 unsaved change/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save Workflow" }));
    await waitFor(() => expect(stub.saved).toHaveLength(1));
    const saved = stub.saved[0]?.states as Array<{ name: string }> | undefined;
    expect(saved?.map((state) => state.name)).toEqual(["Plan", "Intent", "Build"]);
  });

  it("edits a Document template in the editor's Source tab", async () => {
    stub.saved.length = 0;
    mount(<WorkflowPage projectKey="DEV" />);
    const build = await open("Build");
    fireEvent.change(within(build).getByLabelText("Document it asks for"), {
      target: { value: "plan" },
    });
    fireEvent.click(await within(build).findByRole("tab", { name: "Source" }));
    fireEvent.change(await within(build).findByLabelText("Template for Build"), {
      target: { value: "## Steps" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Workflow" }));
    await waitFor(() => expect(stub.saved).toHaveLength(1));
    expect(stub.saved[0]?.states).toMatchObject([
      { name: "Intent" },
      { name: "Plan" },
      { name: "Build", documentName: "plan", documentTemplate: "## Steps" },
    ]);
  });
});

describe("saving", () => {
  it("keeps a renamed State after Save while the refetch is still on its way", async () => {
    stub.saved.length = 0;
    const before = stub.states;
    stub.getDelayMs = 30;
    stub.remembers = true;
    try {
      mount(<WorkflowPage projectKey="DEV" />);
      const intent = await open("Intent");
      fireEvent.change(within(intent).getByLabelText("Name"), { target: { value: "Backlog" } });
      expect(screen.getByText(/1 unsaved change/)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Save Workflow" }));
      await waitFor(() => expect(stub.saved).toHaveLength(1));

      // The draft is what was saved, not what the stale query still holds.
      await waitFor(() => expect(screen.getByText("No changes")).toBeTruthy());
      const rows = await states();
      expect(rows[0]?.textContent).toContain("Backlog");
      expect(screen.queryByLabelText("unsaved")).toBeNull();
      // And still so once the refetch has landed.
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(screen.getByText("No changes")).toBeTruthy();
      expect((await states())[0]?.textContent).toContain("Backlog");
    } finally {
      stub.states = before;
      stub.getDelayMs = 0;
      stub.remembers = false;
    }
  });
});
