import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

const stub = vi.hoisted(() => {
  const base = {
    issueKey: "DEV-1",
    agentMemberId: "m-planner",
    triggeredByMemberId: "m-ada",
    trigger: "assignment" as const,
    summary: null,
    startedAt: new Date("2026-09-04T10:00:00Z"),
    lastActivityAt: new Date("2026-09-04T10:05:00Z"),
    finishedAt: null,
    createdAt: new Date("2026-09-04T09:59:00Z"),
  };
  return {
    waiting: { ...base, id: "run-waiting", status: "awaiting_input" as const },
    done: {
      ...base,
      id: "run-done",
      status: "completed" as const,
      summary: "Wrote the plan",
      finishedAt: new Date("2026-09-04T10:20:00Z"),
    },
    answer: vi.fn(async () => ({ run: {}, activity: {} })),
    gated: { ...base, id: "run-gated", status: "awaiting_input" as const },
    activities: {
      "run-waiting": [
        {
          id: "a0",
          runId: "run-waiting",
          kind: "elicitation",
          body: "Postgres or SQLite?",
          payload: null,
          createdAt: new Date("2026-09-04T10:05:00Z"),
        },
      ],
      "run-gated": [
        {
          id: "a1",
          runId: "run-gated",
          kind: "elicitation",
          body: "Waiting for a Human to decide the Spec Gate on DEV-1",
          payload: { gateStateId: "s2", url: "https://deevy.test/issues/DEV-1?gate=s2" },
          createdAt: new Date("2026-09-04T10:05:00Z"),
        },
      ],
      "run-done": [
        {
          id: "a-thought",
          runId: "run-done",
          kind: "thought",
          body: "Reading intent v2",
          payload: null,
          createdAt: new Date("2026-09-04T10:01:00Z"),
        },
        {
          id: "a-action",
          runId: "run-done",
          kind: "action",
          body: "Wrote plan v1",
          payload: null,
          createdAt: new Date("2026-09-04T10:02:00Z"),
        },
        {
          id: "a2",
          runId: "run-done",
          kind: "elicitation",
          body: "Waiting for a Human to decide the Plan Gate on DEV-1",
          payload: { gateStateId: "s3", url: "https://deevy.test/issues/DEV-1?gate=s3" },
          createdAt: new Date("2026-09-04T10:10:00Z"),
        },
      ],
    } as Record<string, unknown[]>,
    decided: [
      {
        id: "g1",
        stateId: "s3",
        decision: "approved",
        note: "Looks right",
        memberId: "m-ada",
        createdAt: new Date("2026-09-04T10:15:00Z"),
      },
    ],
  };
});

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const { stubClient } = await import("./stub-client.ts");
  const client = stubClient({
    members: {
      list: async () => ({ members: [{ id: "m-ada", user: { name: "Ada" } }] }),
    },
    runs: {
      list: async () => ({ runs: [stub.waiting, stub.gated, stub.done], nextCursor: null }),
      get: async ({ runId }: { runId: string }) => ({ activities: stub.activities[runId] ?? [] }),
      answer: stub.answer,
    },
  });
  return { client, orpc: createTanstackQueryUtils(client) };
});

const { IssueRuns } = await import("../src/components/run-card.tsx");

function mount(ui: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("the Runs section on an Issue", () => {
  it("shows each Run with its status and what triggered it", async () => {
    mount(<IssueRuns issueKey="DEV-1" />);

    const waiting = await screen.findByRole("article", { name: /run-waiting/i });
    expect(within(waiting).getByText(/waiting for input/i)).toBeTruthy();
    expect(within(waiting).getByText(/assignment/i)).toBeTruthy();

    const done = await screen.findByRole("article", { name: /run-done/i });
    expect(within(done).getByText("Wrote the plan")).toBeTruthy();
  });

  it("offers an answer box only for the Run that is waiting", async () => {
    mount(<IssueRuns issueKey="DEV-1" />);

    const waiting = await screen.findByRole("article", { name: /run-waiting/i });
    expect(within(waiting).getByRole("textbox")).toBeTruthy();

    const done = await screen.findByRole("article", { name: /run-done/i });
    await waitFor(() => expect(within(done).queryByRole("textbox")).toBeNull());
  });

  it("says which Run is waiting for a Gate, and afterwards who decided it", async () => {
    mount(<IssueRuns issueKey="DEV-1" decisions={stub.decided} />);

    const gated = await screen.findByRole("article", { name: /run-gated/i });
    expect(await within(gated).findByText(/waiting for approval/i)).toBeTruthy();
    // A Gate is decided in the Gate panel, so the link points there and the
    // free-text answer box is not on offer for this kind of wait.
    const link = within(gated).getByRole("link", { name: /gate/i });
    expect(link.getAttribute("href")).toBe("https://deevy.test/issues/DEV-1?gate=s2");
    await waitFor(() => expect(within(gated).queryByRole("textbox")).toBeNull());

    const done = await screen.findByRole("article", { name: /run-done/i });
    expect(await within(done).findByText(/approved by Ada/i)).toBeTruthy();
  });

  it("puts the Run that is waiting first, open, and draws each kind of Activity", async () => {
    mount(<IssueRuns issueKey="DEV-1" />);

    const articles = await screen.findAllByRole("article");
    // Two are waiting; the finished one is last.
    expect(articles.at(-1)?.getAttribute("aria-label")).toBe("run-done");
    expect(articles[0]?.getAttribute("data-pinned")).toBe("true");

    const done = await screen.findByRole("article", { name: /run-done/i });
    const feed = await within(done).findByRole("list", { name: /Activity of run-done/ });
    const kinds = within(feed)
      .getAllByRole("listitem")
      .map((item) => item.getAttribute("data-kind"));
    expect(kinds).toEqual(["thought", "action", "elicitation"]);
    expect(within(feed).getByText("Reading intent v2")).toBeTruthy();
  });
});
