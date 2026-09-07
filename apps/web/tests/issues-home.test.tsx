import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { selectedLabel } from "./select.ts";

const ada = {
  id: "m-ada",
  kind: "human" as const,
  role: "admin" as const,
  handle: "ada",
  sponsorId: null,
  suspendedAt: null,
  user: {
    id: "u-ada",
    name: "Ada Lovelace",
    email: "ada@example.com",
    image: null,
    kind: "human" as const,
  },
};
const planner = {
  id: "m-planner",
  kind: "agent" as const,
  role: "member" as const,
  handle: "planner",
  sponsorId: "m-ada",
  suspendedAt: null,
  user: {
    id: "u-planner",
    name: "Planner",
    email: "planner@example.com",
    image: null,
    kind: "agent" as const,
  },
};
const intent = { id: "s-intent", name: "Intent", position: 0, isGate: true, category: "backlog" };
const build = { id: "s-build", name: "Build", position: 3, isGate: false, category: "active" };
const done = { id: "s-done", name: "Done", position: 5, isGate: false, category: "done" };
const todo = { id: "s-todo", name: "Todo", position: 0, isGate: false, category: "backlog" };

const issue = (
  key: string,
  title: string,
  state: typeof intent,
  assignee: typeof ada | typeof planner | null,
) => ({
  id: `i-${key}`,
  key,
  number: Number(key.split("-")[1]),
  title,
  description: null,
  state,
  stateId: state.id,
  assignee,
  assigneeMemberId: assignee?.id ?? null,
  parentId: null,
  labels: key === "DEV-1" ? [{ id: "l1", name: "backend", scope: null, color: "#000" }] : [],
  closedAt: null,
  updatedAt: new Date("2026-09-05T10:00:00Z"),
  createdAt: new Date("2026-09-05T09:00:00Z"),
});

const stub = vi.hoisted(() => ({
  listed: [] as unknown[],
  /** How many Issues a page holds; the real server caps at 200, a test at fewer. */
  pageSize: Number.POSITIVE_INFINITY,
}));

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const { stubClient } = await import("./stub-client.ts");
  const client = stubClient({
    me: {
      get: async () => ({
        user: ada.user,
        member: ada,
        workspace: { id: "w1" },
        principal: "cookie",
      }),
    },
    members: { list: async () => ({ members: [ada, planner] }) },
    projects: {
      list: async () => ({
        projects: [
          { id: "p1", key: "DEV", name: "deevy", states: [intent, build, done], team: null },
          { id: "p2", key: "OPS", name: "Operations", states: [todo], team: null },
        ],
      }),
    },
    issues: {
      // Filters the way the server does, so what the page shows is what it asked for.
      list: async (input: {
        stateName?: string;
        assigneeKind?: string;
        unassigned?: boolean;
        sponsorMemberId?: string;
        assigneeMemberId?: string;
        limit?: number;
      }) => {
        stub.listed.push(input);
        const all = [
          issue("DEV-1", "Ship the Event log", intent, ada),
          issue("DEV-2", "Retry webhook deliveries", build, planner),
          issue("DEV-3", "Already shipped", done, null),
          issue("OPS-1", "Rotate the secret", todo, null),
        ].filter(
          (row) =>
            (!input.stateName || row.state.name === input.stateName) &&
            (!input.assigneeKind || row.assignee?.kind === input.assigneeKind) &&
            (!input.unassigned || row.assignee === null) &&
            (!input.sponsorMemberId || row.assignee?.sponsorId === input.sponsorMemberId) &&
            (!input.assigneeMemberId || row.assignee?.id === input.assigneeMemberId),
        );
        const limit = Math.min(input.limit ?? 50, stub.pageSize);
        return { issues: all.slice(0, limit), nextCursor: null, hasMore: all.length > limit };
      },
      get: async () => ({
        ...issue("DEV-1", "Ship the Event log", intent, ada),
        project: { id: "p1", key: "DEV", name: "deevy" },
        parent: null,
        children: [],
        gateDecisions: [],
      }),
    },
  });
  return { client, orpc: createTanstackQueryUtils(client) };
});

const { mountAt } = await import("./mount.tsx");

describe("the Issues home", () => {
  it("lists every open Issue grouped by State, folding Done", async () => {
    await mountAt("/", { member: { ...ada, image: null } });

    const table = await screen.findByRole("table", { name: "Issues" });
    expect(within(table).getByRole("row", { name: /DEV-1 Ship the Event log/ })).toBeTruthy();
    expect(within(table).getByRole("row", { name: /OPS-1 Rotate the secret/ })).toBeTruthy();
    // Group rows carry the State and its count; Done is folded.
    expect(within(table).getByText("Intent")).toBeTruthy();
    expect(within(table).getByText("Gate")).toBeTruthy();
    expect(within(table).queryByRole("row", { name: /Already shipped/ })).toBeNull();
    // Asked the server for open Issues across the Workspace, once.
    expect(stub.listed.at(-1)).toMatchObject({ open: true, limit: 200 });
    expect(stub.listed.at(-1)).not.toHaveProperty("projectKey");
  });

  it("unfolds Done on click", async () => {
    await mountAt("/", { member: { ...ada, image: null } });
    const table = await screen.findByRole("table", { name: "Issues" });
    fireEvent.click(within(table).getByText("Done"));
    expect(await within(table).findByRole("row", { name: /Already shipped/ })).toBeTruthy();
  });

  it("reads the filters from the URL and titles the view by them", async () => {
    await mountAt("/?assignee=me&kind=human", { member: { ...ada, image: null } });

    expect(await screen.findByRole("heading", { name: "My Issues", level: 1 })).toBeTruthy();
    // "me" became the Member id on the way to the server.
    expect(stub.listed.at(-1)).toMatchObject({ assigneeMemberId: "m-ada" });
    const table = await screen.findByRole("table", { name: "Issues" });
    expect(within(table).getByRole("row", { name: /DEV-1/ })).toBeTruthy();
  });

  it("offers My Agents to a Sponsor and asks the server for their Issues", async () => {
    await mountAt("/?assignee=agents:me", { member: { ...ada, image: null } });

    expect(await screen.findByRole("heading", { name: "My Agents' Issues" })).toBeTruthy();
    const table = await screen.findByRole("table", { name: "Issues" });
    expect(within(table).getByRole("row", { name: /DEV-2/ })).toBeTruthy();
    expect(within(table).queryByRole("row", { name: /DEV-1/ })).toBeNull();
    // The Sponsor, not a fold over the page: past 200 Issues the fold lied.
    expect(stub.listed.at(-1)).toMatchObject({ sponsorMemberId: "m-ada" });
    expect(stub.listed.at(-1)).not.toHaveProperty("assigneeMemberId");
  });

  it("sends every filter to the server: State by name, kind, and Unassigned", async () => {
    await mountAt("/?state=Build&kind=agent", { member: { ...ada, image: null } });
    const table = await screen.findByRole("table", { name: "Issues" });
    expect(within(table).getByRole("row", { name: /DEV-2/ })).toBeTruthy();
    expect(within(table).queryByRole("row", { name: /DEV-1/ })).toBeNull();
    expect(stub.listed.at(-1)).toMatchObject({ stateName: "Build", assigneeKind: "agent" });

    await mountAt("/?assignee=none", { member: { ...ada, image: null } });
    await waitFor(() => expect(stub.listed.at(-1)).toMatchObject({ unassigned: true }));
  });

  it("says when the page is the first 200 of more, and counts with a plus", async () => {
    stub.pageSize = 2;
    try {
      await mountAt("/", { member: { ...ada, image: null } });
      const table = await screen.findByRole("table", { name: "Issues" });
      expect(within(table).getAllByRole("row").length).toBeGreaterThan(1);
      expect(stub.listed.at(-1)).toMatchObject({ limit: 200 });
      expect(
        screen.getByText("Showing the first 200 Issues. Narrow the filters to see the rest."),
      ).toBeTruthy();
      expect(screen.getByText("2+ Issues open")).toBeTruthy();
    } finally {
      stub.pageSize = Number.POSITIVE_INFINITY;
    }
  });

  it("writes a filter to the URL", async () => {
    const router = await mountAt("/", { member: { ...ada, image: null } });
    await screen.findByRole("table", { name: "Issues" });

    fireEvent.click(screen.getByRole("button", { name: "All", pressed: false }));
    await act(async () => {
      await router.load();
    });
    expect(router.state.location.search).toMatchObject({ open: "0" });
    expect(stub.listed.at(-1)).not.toHaveProperty("open");
  });

  it("opens a row beside the list with Enter, and the page with o", async () => {
    const router = await mountAt("/", { member: { ...ada, image: null } });
    const table = await screen.findByRole("table", { name: "Issues" });

    fireEvent.keyDown(document.body, { key: "j" });
    expect(within(table).getByRole("row", { name: /DEV-1/ }).getAttribute("aria-selected")).toBe(
      "true",
    );
    fireEvent.keyDown(document.body, { key: "Enter" });
    await act(async () => {
      await router.load();
    });
    expect(router.state.location.search).toMatchObject({ peek: "DEV-1" });
    const peek = await screen.findByRole("dialog", { name: /DEV-1/ });
    expect(await within(peek).findByRole("heading", { name: "Ship the Event log" })).toBeTruthy();

    fireEvent.keyDown(document.body, { key: "o" });
    await act(async () => {
      await router.load();
    });
    expect(router.state.location.pathname).toBe("/issues/DEV-1");
  });

  it("opens a row by clicking it", async () => {
    const router = await mountAt("/", { member: { ...ada, image: null } });
    const table = await screen.findByRole("table", { name: "Issues" });
    fireEvent.click(within(table).getByRole("row", { name: /OPS-1/ }));
    await act(async () => {
      await router.load();
    });
    expect(router.state.location.search).toMatchObject({ peek: "OPS-1" });
  });
});

describe("the Issues home with nothing to show", () => {
  it("says the filters are what emptied it, and clears them", async () => {
    const router = await mountAt("/?state=Nowhere", { member: { ...ada, image: null } });

    expect(await screen.findByText("No Issues match your filters")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await act(async () => {
      await router.load();
    });
    expect(router.state.location.search).not.toHaveProperty("state");
    expect(await screen.findByRole("table", { name: "Issues" })).toBeTruthy();
  });
});

describe("the board view of the Issues home", () => {
  it("toggles to the Board, writing view to the URL and keeping Group by", async () => {
    const router = await mountAt("/", { member: { ...ada, image: null } });
    await screen.findByRole("table", { name: "Issues" });
    fireEvent.click(screen.getByRole("button", { name: "Board" }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ view: "board" }));
    expect(await screen.findByRole("region", { name: "Intent" })).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Issues" })).toBeNull();
    // The columns are what it groups by, so this is where you most want to say.
    expect(screen.getByRole("combobox", { name: "Group by" })).toBeTruthy();
  });

  it("offers no ungrouped board: a board is columns of something", async () => {
    await mountAt("/?view=board", { member: { ...ada, image: null } });
    await screen.findByRole("region", { name: "Intent" });

    const groupBy = screen.getByRole("combobox", { name: "Group by" });
    expect(selectedLabel(groupBy)).toBe("Group by State");
    fireEvent.keyDown(groupBy, { key: "ArrowDown" });
    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).not.toContain("No grouping");
  });

  it("keeps the Board when its toggle is pressed again", async () => {
    const router = await mountAt("/?view=board", { member: { ...ada, image: null } });
    await screen.findByRole("region", { name: "Intent" });
    // Base UI hands a single-select group [] on a second click; the view stays.
    fireEvent.click(screen.getByRole("button", { name: "Board" }));
    await act(async () => {
      await new Promise((tick) => setTimeout(tick, 0));
    });
    expect(router.state.location.search).toMatchObject({ view: "board" });
    expect(screen.getByRole("region", { name: "Intent" })).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Issues" })).toBeNull();
  });

  it("folds same-named States into one column across Projects and keeps the Gate ruling on a card", async () => {
    await mountAt("/?view=board", { member: { ...ada, image: null } });
    const intent = await screen.findByRole("region", { name: "Intent" });
    const names = [...document.querySelectorAll('[data-slot="board-column"]')].map((column) =>
      column.getAttribute("aria-label"),
    );
    expect(new Set(names).size).toBe(names.length);
    expect(within(intent).getByText("Gate")).toBeTruthy();
    expect(
      within(intent).getByRole("button", { name: "Decide the Intent Gate on DEV-1" }),
    ).toBeTruthy();
    expect(
      screen.getByText("Rotate the secret").closest('[data-slot="board-column"]'),
    ).not.toBeNull();
  });
});
