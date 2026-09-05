import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

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

const stub = vi.hoisted(() => ({ listed: [] as unknown[] }));

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
      list: async (input: unknown) => {
        stub.listed.push(input);
        return {
          issues: [
            issue("DEV-1", "Ship the Event log", intent, ada),
            issue("DEV-2", "Retry webhook deliveries", build, planner),
            issue("DEV-3", "Already shipped", done, null),
            issue("OPS-1", "Rotate the secret", todo, null),
          ],
          nextCursor: null,
        };
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

const { createAppRouter } = await import("../src/router.tsx");

async function mountAt(path: string) {
  const router = createAppRouter(
    {
      workspaceName: "Flippable Team",
      memberName: "Ada Lovelace",
      member: { ...ada, image: null },
    },
    { initialEntries: [path] },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await act(async () => {
    await router.load();
  });
  return router;
}

describe("the Issues home", () => {
  it("lists every open Issue grouped by State, folding Done", async () => {
    await mountAt("/");

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
    await mountAt("/");
    const table = await screen.findByRole("table", { name: "Issues" });
    fireEvent.click(within(table).getByText("Done"));
    expect(await within(table).findByRole("row", { name: /Already shipped/ })).toBeTruthy();
  });

  it("reads the filters from the URL and titles the view by them", async () => {
    await mountAt("/?assignee=me&kind=human");

    expect(await screen.findByRole("heading", { name: "My Issues", level: 1 })).toBeTruthy();
    // "me" became the Member id on the way to the server.
    expect(stub.listed.at(-1)).toMatchObject({ assigneeMemberId: "m-ada" });
    const table = await screen.findByRole("table", { name: "Issues" });
    expect(within(table).getByRole("row", { name: /DEV-1/ })).toBeTruthy();
  });

  it("offers My Agents to a Sponsor and folds their Issues client-side", async () => {
    await mountAt("/?assignee=agents:me");

    expect(await screen.findByRole("heading", { name: "My Agents' Issues" })).toBeTruthy();
    const table = await screen.findByRole("table", { name: "Issues" });
    expect(within(table).getByRole("row", { name: /DEV-2/ })).toBeTruthy();
    expect(within(table).queryByRole("row", { name: /DEV-1/ })).toBeNull();
  });

  it("writes a filter to the URL", async () => {
    const router = await mountAt("/");
    await screen.findByRole("table", { name: "Issues" });

    fireEvent.click(screen.getByRole("button", { name: "All", pressed: false }));
    await act(async () => {
      await router.load();
    });
    expect(router.state.location.search).toMatchObject({ open: "0" });
    expect(stub.listed.at(-1)).not.toHaveProperty("open");
  });

  it("opens a row beside the list with Enter, and the page with o", async () => {
    const router = await mountAt("/");
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
    const router = await mountAt("/");
    const table = await screen.findByRole("table", { name: "Issues" });
    fireEvent.click(within(table).getByRole("row", { name: /OPS-1/ }));
    await act(async () => {
      await router.load();
    });
    expect(router.state.location.search).toMatchObject({ peek: "OPS-1" });
  });
});
