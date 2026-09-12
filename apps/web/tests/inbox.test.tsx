import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

const stub = vi.hoisted(() => ({
  notifications: [
    {
      id: "n1",
      kind: "assignment",
      readAt: null,
      createdAt: new Date(),
      eventId: 9,
      issue: { id: "i1", key: "DEV-1", title: "Ship it", state: { name: "Build", isGate: false } },
      event: { kind: "issue.assigned", payload: { from: null, to: "me" }, actorMemberId: "m-ada" },
      actor: { id: "m-ada", kind: "human", handle: "ada", user: { name: "Ada", image: null } },
      comment: null,
    },
    {
      id: "n2",
      kind: "mention",
      readAt: new Date(),
      createdAt: new Date(),
      eventId: 8,
      issue: { id: "i1", key: "DEV-1", title: "Ship it", state: { name: "Build", isGate: false } },
      event: { kind: "comment.created", payload: { commentId: "c1" }, actorMemberId: "m-grace" },
      actor: {
        id: "m-grace",
        kind: "human",
        handle: "grace",
        user: { name: "Grace", image: null },
      },
      comment: { id: "c1", body: "Look at this before Friday, @ada" },
    },
    {
      id: "n3",
      kind: "gate_awaiting",
      readAt: null,
      createdAt: new Date(),
      eventId: 7,
      issue: {
        id: "i2",
        key: "DEV-2",
        title: "Needs a decision",
        state: { name: "Intent", isGate: true },
      },
      event: {
        kind: "gate.rejected",
        payload: { state: "Spec", to: "Intent", note: "Not yet: the ledger write is missing." },
        actorMemberId: "m-grace",
      },
      actor: {
        id: "m-grace",
        kind: "human",
        handle: "grace",
        user: { name: "Grace", image: null },
      },
      comment: null,
    },
  ],
  read: [] as unknown[],
  allRead: 0,
  /** When set, a markRead also flips readAt, as the server's list would show it. */
  persistReads: false,
}));

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const { stubClient } = await import("./stub-client.ts");
  const gateState = { id: "s1", name: "Intent", position: 0, isGate: true, category: "backlog" };
  const client = stubClient({
    // The Issue a Gate Notification opens: in a Gate, so the ruling card shows.
    issues: {
      get: async ({ key }: { key: string }) => ({
        id: key === "DEV-2" ? "i2" : "i1",
        key,
        number: key === "DEV-2" ? 2 : 1,
        title: key === "DEV-2" ? "Needs a decision" : "Ship it",
        description: null,
        state:
          key === "DEV-2"
            ? gateState
            : { ...gateState, id: "s4", name: "Build", isGate: false, category: "active" },
        assignee: null,
        assigneeMemberId: null,
        parent: null,
        parentId: null,
        children: [],
        gateDecisions: [],
        labels: [],
        closedAt: null,
        updatedAt: new Date(),
        createdAt: new Date(),
        project: { id: "p1", key: "DEV", name: "deevy" },
      }),
    },
    inbox: {
      // Fresh rows each time: a row marked read in place would look unchanged
      // to the query's structural sharing, and the list would not re-render.
      list: async () => ({
        notifications: stub.notifications.map((row) => ({ ...row })),
        nextCursor: 7,
      }),
      unreadCount: async () => ({ unread: 2 }),
      markRead: async (input: { ids: string[] }) => {
        stub.read.push(input);
        if (stub.persistReads) {
          for (const row of stub.notifications) {
            if (input.ids.includes(row.id)) row.readAt = new Date();
          }
        }
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

const { mountAt } = await import("./mount.tsx");

describe("the inbox", () => {
  it("says who did what on which Issue, and quotes what they wrote", async () => {
    await mountAt("/inbox", { memberName: "Ada" });

    const list = await screen.findByRole("list", { name: "Notifications" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(within(list).getByText("rejected the Spec Gate")).toBeTruthy();
    expect(within(list).getByText(/the ledger write is missing/)).toBeTruthy();
    expect(within(list).getByText("mentioned you")).toBeTruthy();
    expect(within(list).getByText(/Look at this before Friday/)).toBeTruthy();
    expect(within(list).getByText("assigned it to you")).toBeTruthy();
    expect(within(list).getAllByText("Grace")).toHaveLength(2);
  });

  it("offers Mark read only on the ones still unread", async () => {
    await mountAt("/inbox", { memberName: "Ada" });

    const list = await screen.findByRole("list", { name: "Notifications" });
    const buttons = within(list).getAllByRole("button", { name: "Mark read" });
    expect(buttons).toHaveLength(2);

    fireEvent.click(buttons[0]!);
    await waitFor(() => expect(stub.read).toContainEqual({ ids: ["n1"] }));
  });

  it("marks several selected rows read at once", async () => {
    await mountAt("/inbox", { memberName: "Ada" });

    await screen.findByRole("list", { name: "Notifications" });
    fireEvent.click(screen.getByRole("checkbox", { name: "Select assigned it to you" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select rejected the Spec Gate" }));
    const bar = screen.getByRole("toolbar", { name: "Selection" });
    expect(within(bar).getByText("2 selected")).toBeTruthy();

    fireEvent.click(within(bar).getByRole("button", { name: "Mark read" }));
    await waitFor(() => expect(stub.read).toContainEqual({ ids: ["n1", "n3"] }));
  });

  it("marks everything read at once", async () => {
    await mountAt("/inbox", { memberName: "Ada" });

    fireEvent.click(await screen.findByRole("button", { name: "Mark all read" }));

    await waitFor(() => expect(stub.allRead).toBeGreaterThan(0));
  });

  it("opens the Issue a Notification is about beside the list, marks it read, and puts the Gate in front", async () => {
    await mountAt("/inbox", { memberName: "Ada" });

    const list = await screen.findByRole("list", { name: "Notifications" });
    fireEvent.click(within(list).getByText("rejected the Spec Gate"));

    // Reading is what was owed, so opening marks it read.
    await waitFor(() => expect(stub.read).toContainEqual({ ids: ["n3"] }));
    // The Issue, with the ruling card and the banner a Gate Notification earns.
    expect(await screen.findByRole("button", { name: "Approve" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reject" })).toBeTruthy();
    expect(await screen.findByText(/Waiting on your ruling/)).toBeTruthy();
  });

  it("shows only what is unread when asked", async () => {
    await mountAt("/inbox?unread=1", { memberName: "Ada" });

    const list = await screen.findByRole("list", { name: "Notifications" });
    // n2 is read, so two rows stay.
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  });

  it("under Unread, j from the row just opened goes to the next unread one, not the first", async () => {
    // A fourth, unread, after the Gate one: opening n3 marks it read and drops
    // it from the list, and j must still land on n4 rather than start over at n1.
    const n1 = stub.notifications[0]!;
    const n3 = stub.notifications[2]!;
    stub.notifications.push({ ...n1, id: "n4", eventId: 6 });
    stub.persistReads = true;
    try {
      await mountAt("/inbox?unread=1", { memberName: "Ada" });
      const list = await screen.findByRole("list", { name: "Notifications" });
      expect(within(list).getAllByRole("listitem")).toHaveLength(3);

      const reads = stub.read.length;
      fireEvent.click(within(list).getByText("rejected the Spec Gate"));
      await waitFor(() => expect(stub.read).toHaveLength(reads + 1));
      // Read now, so gone from the filtered list.
      await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(2));

      fireEvent.keyDown(document.body, { key: "j" });
      await waitFor(() => expect(stub.read.at(-1)).toEqual({ ids: ["n4"] }));
      expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    } finally {
      stub.persistReads = false;
      stub.notifications.pop();
      n3.readAt = null;
    }
  });
});

describe("the sidebar", () => {
  it("badges the Inbox with the unread count", async () => {
    await mountAt("/", { memberName: "Ada" });

    expect(await screen.findByLabelText("2 unread")).toBeTruthy();
  });
});
