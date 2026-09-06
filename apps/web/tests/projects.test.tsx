import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

const stub = vi.hoisted(() => {
  const states = [
    { id: "s1", name: "Intent", position: 0, isGate: true, category: "backlog" },
    { id: "s2", name: "Spec", position: 1, isGate: true, category: "active" },
    { id: "s3", name: "Plan", position: 2, isGate: true, category: "active" },
    { id: "s4", name: "Build", position: 3, isGate: false, category: "active" },
    { id: "s5", name: "Review", position: 4, isGate: true, category: "active" },
    { id: "s6", name: "Done", position: 5, isGate: false, category: "done" },
  ];
  return {
    states,
    created: [] as unknown[],
    saved: [] as unknown[],
    projects: [
      {
        id: "p1",
        key: "DEV",
        name: "deevy",
        description: "The product itself",
        teamId: "t1",
        team: { id: "t1", name: "Platform", handle: "platform" },
        archivedAt: null,
        states,
      },
      {
        id: "p2",
        key: "WEB",
        name: "Website",
        description: null,
        teamId: null,
        team: null,
        archivedAt: null,
        states,
      },
    ],
    teams: [
      {
        id: "t1",
        name: "Platform",
        handle: "platform",
        members: [
          {
            id: "m-ada",
            role: "admin",
            handle: "ada",
            user: { id: "u-ada", name: "Ada Lovelace", email: "ada@example.com" },
          },
        ],
      },
    ],
  };
});

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const { stubClient } = await import("./stub-client.ts");
  const client = stubClient({
    members: { list: async () => ({ members: stub.teams[0]!.members }) },
    projects: {
      list: async () => ({ projects: stub.projects }),
      get: async ({ key }: { key: string }) => {
        const found = stub.projects.find((p) => p.key === key);
        if (!found) throw new Error("No such Project");
        return found;
      },
      create: async (input: unknown) => {
        stub.created.push(input);
        return stub.projects[0];
      },
      update: async (input: unknown) => {
        stub.saved.push(input);
        return stub.projects[0];
      },
    },
    workflow: { get: async () => ({ states: stub.states }) },
    teams: { list: async () => ({ teams: stub.teams }) },
  });
  return { client, orpc: createTanstackQueryUtils(client) };
});

const { createAppRouter } = await import("../src/router.tsx");

/** Pages link to one another, so they are mounted through the router they live in. */
async function mountAt(path: string) {
  const router = createAppRouter(
    { workspaceName: "Acme Team", memberName: "Ada Lovelace" },
    { initialEntries: [path] },
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  // The router settles its matches in React state, so the load belongs
  // inside act: `render` wraps its own work and cannot wrap this.
  await act(async () => {
    await router.load();
  });
}

describe("the Projects page", () => {
  it("lists each Project by key, name, and owning Team", async () => {
    await mountAt("/projects");

    const table = await screen.findByRole("table");
    expect(within(table).getByText("DEV")).toBeTruthy();
    expect(within(table).getByText("deevy")).toBeTruthy();
    expect(within(table).getByText("WEB")).toBeTruthy();
    expect(within(table).getByText("Platform")).toBeTruthy();
  });

  it("creates a Project from the dialog with the name and key typed in", async () => {
    await mountAt("/projects");

    fireEvent.click(await screen.findByRole("button", { name: "New Project" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Mobile" } });
    fireEvent.change(within(dialog).getByLabelText("Key"), { target: { value: "MOB" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create Project" }));

    await waitFor(() =>
      expect(stub.created).toContainEqual(expect.objectContaining({ name: "Mobile", key: "MOB" })),
    );
  });

  it("upper-cases the key as it is typed, so DEV is what gets sent", async () => {
    await mountAt("/projects");

    fireEvent.click(await screen.findByRole("button", { name: "New Project" }));
    const dialog = await screen.findByRole("dialog");
    const key = within(dialog).getByLabelText("Key") as HTMLInputElement;
    fireEvent.change(key, { target: { value: "mob" } });

    expect(key.value).toBe("MOB");
  });
});

describe("the Project page", () => {
  it("names the Project, and keeps the Workflow for the tabs that show it", async () => {
    await mountAt("/projects/DEV");

    expect(await screen.findByRole("heading", { name: "deevy" })).toBeTruthy();
    // The Issues tab groups by State and the Board's columns are the States: the
    // header does not repeat them (2026-09-06).
    expect(screen.queryByRole("list", { name: "Workflow" })).toBeNull();
  });

  it("offers the new-Issue form and says so when the Project has none", async () => {
    await mountAt("/projects/DEV");

    expect(await screen.findByLabelText("New Issue")).toBeTruthy();
    expect(await screen.findByText("No Issues yet")).toBeTruthy();
  });
});

describe("the Teams settings page", () => {
  it("lists each Team with its handle and its Members", async () => {
    await mountAt("/settings/teams");

    // The shell header also names the signed-in Human, so scope to the Team itself.
    const team = await screen.findByRole("article");
    expect(within(team).getByRole("heading", { name: "Platform" })).toBeTruthy();
    expect(within(team).getByText("@platform")).toBeTruthy();
    expect(within(team).getByText("Ada Lovelace")).toBeTruthy();
  });
});

describe("the Project's tabs", () => {
  it("links Issues, Board, Workflow and Settings, and marks the one you are on", async () => {
    await mountAt("/projects/DEV/settings");

    const nav = await screen.findByRole("navigation", { name: "Project" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual([
      "/projects/DEV",
      "/projects/DEV/board",
      "/projects/DEV/workflow",
      "/projects/DEV/settings",
    ]);
    expect(within(nav).getByRole("link", { name: "Settings" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("edits the Project's name from the Settings tab", async () => {
    await mountAt("/projects/DEV/settings");

    const name = (await screen.findByLabelText("Name")) as HTMLInputElement;
    expect(name.value).toBe("deevy");
    // No Save button: the field saves itself when you leave it, sending only what changed.
    fireEvent.change(name, { target: { value: "deevy, renamed" } });
    fireEvent.blur(name);
    await waitFor(() => expect(stub.saved).toContainEqual({ key: "DEV", name: "deevy, renamed" }));
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect((await screen.findByRole("status")).textContent).toMatch(/Saved/);
  });

  it("refuses an empty name inline and restores the last one", async () => {
    await mountAt("/projects/DEV/settings");

    const name = (await screen.findByLabelText("Name")) as HTMLInputElement;
    fireEvent.change(name, { target: { value: "   " } });
    fireEvent.blur(name);
    expect(await screen.findByText("A Project needs a name")).toBeTruthy();
    expect(name.value).toBe("deevy");
    expect(stub.saved.some((call) => (call as { name?: string }).name === "")).toBe(false);
  });
});
