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
  };
});

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const { stubClient } = await import("./stub-client.ts");
  const client = stubClient({
    runs: {
      list: async () => ({ runs: [stub.waiting, stub.done], nextCursor: null }),
      answer: stub.answer,
    },
  });
  return { client, orpc: createTanstackQueryUtils(client) };
});

const { IssueRuns } = await import("../src/components/issue-runs.tsx");

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
});
