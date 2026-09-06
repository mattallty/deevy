import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { pickOption } from "./select.ts";

const stub = vi.hoisted(() => {
  const states = [
    { id: "s1", name: "Intent", position: 0, isGate: true, category: "backlog" },
    { id: "s2", name: "Spec", position: 1, isGate: true, category: "active" },
    { id: "s3", name: "Plan", position: 2, isGate: true, category: "active" },
    { id: "s4", name: "Build", position: 3, isGate: false, category: "active" },
    { id: "s5", name: "Review", position: 4, isGate: true, category: "active" },
    { id: "s6", name: "Done", position: 5, isGate: false, category: "done" },
  ];
  const ada = {
    id: "m-ada",
    kind: "human",
    role: "admin",
    handle: "ada",
    user: { id: "u-ada", name: "Ada Lovelace", email: "ada@example.com" },
  };
  return {
    states,
    ada,
    issues: [
      {
        id: "i1",
        key: "DEV-1",
        number: 1,
        title: "In Intent",
        state: states[0],
        assignee: ada,
        assigneeMemberId: ada.id,
        labels: [],
        closedAt: null,
        updatedAt: new Date(),
      },
      {
        id: "i2",
        key: "DEV-2",
        number: 2,
        title: "In Build",
        state: states[3],
        assignee: null,
        assigneeMemberId: null,
        labels: [],
        closedAt: null,
        updatedAt: new Date(),
      },
    ],
    moved: [] as unknown[],
    approved: [] as unknown[],
  };
});

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const { stubClient } = await import("./stub-client.ts");
  const client = stubClient({
    members: { list: async () => ({ members: [stub.ada] }) },
    projects: {
      get: async () => ({
        id: "p1",
        key: "DEV",
        name: "deevy",
        description: null,
        team: null,
        archivedAt: null,
        states: stub.states,
      }),
    },
    workflow: { get: async () => ({ states: stub.states }) },
    issues: {
      list: async (input: { assigneeMemberId?: string }) => ({
        issues: input.assigneeMemberId
          ? stub.issues.filter((issue) => issue.assigneeMemberId === input.assigneeMemberId)
          : stub.issues,
        nextCursor: 2,
      }),
      move: async (input: unknown) => {
        stub.moved.push(input);
        return stub.issues[1];
      },
    },
    gates: {
      approve: async (input: unknown) => {
        stub.approved.push(input);
        return stub.issues[0];
      },
    },
  });
  return { client, orpc: createTanstackQueryUtils(client) };
});

const { mountAt } = await import("./mount.tsx");

/** The board's columns, told apart from Sonner's Toaster, which is also a region. */
async function findColumns() {
  await screen.findByRole("region", { name: "Intent" });
  return [...document.querySelectorAll<HTMLElement>('[data-slot="board-column"]')];
}

describe("the board", () => {
  it("renders one column per State, in Workflow order, marking the Gates", async () => {
    await mountAt("/projects/DEV/board", { memberName: "Ada" });

    const columns = await findColumns();
    const names = columns.map((column) => column.getAttribute("aria-label"));
    expect(names).toEqual(["Intent", "Spec", "Plan", "Build", "Review", "Done"]);
    expect(within(columns[0]!).getByText("Gate")).toBeTruthy();
    expect(within(columns[3]!).queryByText("Gate")).toBeNull();
  });

  it("puts each Issue in its State's column, showing key, title and Assignee", async () => {
    await mountAt("/projects/DEV/board", { memberName: "Ada" });

    const columns = await findColumns();
    const intent = within(columns[0]!);
    expect(intent.getByText("DEV-1")).toBeTruthy();
    expect(intent.getByText("In Intent")).toBeTruthy();
    expect(intent.getByText("Ada Lovelace")).toBeTruthy();
    expect(within(columns[3]!).getByText("DEV-2")).toBeTruthy();
  });

  it("filters by Assignee", async () => {
    await mountAt("/projects/DEV/board", { memberName: "Ada" });

    await findColumns();
    await pickOption(screen.getByLabelText("Assignee"), /Ada/);

    expect(await screen.findByText("DEV-1")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("DEV-2")).toBeNull());
  });
});

describe("the keyboard on the Board", () => {
  it("moves through the cards with j, peeks with Enter, and opens the page with o", async () => {
    const router = await mountAt("/projects/DEV/board", { memberName: "Ada" });
    const columns = await findColumns();

    fireEvent.keyDown(document.body, { key: "j" });
    const first = within(columns[0]!).getByText("DEV-1").closest("article");
    expect(first?.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(document.body, { key: "j" });
    const second = within(columns[3]!).getByText("DEV-2").closest("article");
    expect(second?.getAttribute("aria-selected")).toBe("true");
    expect(first?.getAttribute("aria-selected")).toBeNull();

    fireEvent.keyDown(document.body, { key: "Enter" });
    await act(async () => {
      await router.load();
    });
    expect(router.state.location.search).toMatchObject({ peek: "DEV-2" });
    expect(router.state.location.pathname).toBe("/projects/DEV/board");
    await screen.findByRole("dialog", { name: /DEV-2/ });

    fireEvent.keyDown(document.body, { key: "o" });
    await act(async () => {
      await router.load();
    });
    expect(router.state.location.pathname).toBe("/issues/DEV-2");
  });
});

describe("moving a card out of a Gate column", () => {
  it("asks for a decision instead of moving it", async () => {
    await mountAt("/projects/DEV/board", { memberName: "Ada" });

    await findColumns();
    // The card in Intent carries the Gate affordance rather than a plain move.
    fireEvent.click(screen.getByRole("button", { name: "Decide the Intent Gate on DEV-1" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(stub.approved).toContainEqual(expect.objectContaining({ key: "DEV-1" })),
    );
    expect(stub.moved).toEqual([]);
  });
});

describe("a card", () => {
  it("opens beside the board when clicked, with the peek non-modal so a drag still works", async () => {
    await mountAt("/projects/DEV/board", { memberName: "Ada" });
    const columns = await findColumns();

    fireEvent.click(within(columns[3]!).getByText("In Build"));
    const peek = await screen.findByRole("dialog", { name: /DEV-2/ });
    expect(peek).toBeTruthy();
    // Non-modal: the board behind it is still there to drag.
    expect(document.querySelectorAll('[data-slot="board-column"]')).toHaveLength(6);
  });
});
