import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const { stubClient } = await import("./stub-client.ts");
  const client = stubClient({
    projects: {
      list: async () => ({
        projects: [
          { id: "p1", key: "DEV", name: "deevy", states: [], team: null },
          { id: "p2", key: "OPS", name: "Operations", states: [], team: null },
        ],
      }),
    },
  });
  return { client, orpc: createTanstackQueryUtils(client) };
});

const { createAppRouter } = await import("../src/router.tsx");

async function mountAt(path: string) {
  const router = createAppRouter(
    { workspaceName: "Flippable Team", memberName: "Ada Lovelace" },
    { memory: true, initialEntries: [path] },
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
  return router;
}

// shadcn's Sidebar is a div carrying data-slot, not a landmark element.
const sidebar = () => document.querySelector('[data-slot="sidebar"]') as HTMLElement;

describe("the app shell", () => {
  it("names the Workspace and the signed-in Human, and links to the work", async () => {
    await mountAt("/");

    await screen.findByText("Flippable Team");
    expect(within(sidebar()).getByText("Flippable Team")).toBeTruthy();
    expect(within(sidebar()).getByText("Ada Lovelace")).toBeTruthy();
    expect(within(sidebar()).getByRole("link", { name: /Inbox/ }).getAttribute("href")).toBe(
      "/inbox",
    );
    expect(
      within(sidebar())
        .getByRole("link", { name: /Settings/ })
        .getAttribute("href"),
    ).toBe("/settings/workspace");
  });

  it("lists every Project in the sidebar", async () => {
    await mountAt("/");

    expect(
      (await within(sidebar()).findByRole("link", { name: /deevy/ })).getAttribute("href"),
    ).toBe("/projects/DEV");
    expect(
      within(sidebar())
        .getByRole("link", { name: /Operations/ })
        .getAttribute("href"),
    ).toBe("/projects/OPS");
  });

  it("renders the Issues home at the root, and links the views", async () => {
    await mountAt("/");

    expect(await screen.findByRole("heading", { name: "All Issues", level: 1 })).toBeTruthy();
    expect(
      within(sidebar())
        .getByRole("link", { name: /My Issues/ })
        .getAttribute("href"),
    ).toBe("/?assignee=me");
    expect(
      within(sidebar())
        .getByRole("link", { name: /Projects/ })
        .getAttribute("href"),
    ).toBe("/projects");
    // Nobody sponsors an Agent in this Workspace, so the view is not offered.
    expect(within(sidebar()).queryByRole("link", { name: /My Agents/ })).toBeNull();
  });

  it("renders the Projects table at /projects", async () => {
    await mountAt("/projects");

    expect(await screen.findByRole("heading", { name: "Projects", level: 1 })).toBeTruthy();
  });

  it("gives Settings its own navigation, grouped, and sends /settings to the first page", async () => {
    await mountAt("/settings");

    expect(await screen.findByRole("heading", { name: "Workspace" })).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Settings" });
    expect(within(nav).getByRole("link", { name: "Members" }).getAttribute("href")).toBe(
      "/settings/members",
    );
    expect(within(nav).getByRole("link", { name: "Agents" }).getAttribute("href")).toBe(
      "/settings/agents",
    );
    expect(within(nav).getByRole("link", { name: "Allowlist" }).getAttribute("href")).toBe(
      "/settings/allowlist",
    );
    expect(within(nav).getByText("Agents and delivery")).toBeTruthy();
    // The primary sidebar no longer carries the eleven; they live here.
    expect(within(sidebar()).queryByRole("link", { name: "Members" })).toBeNull();
  });

  it("renders the Allowlist page at /settings/allowlist", async () => {
    await mountAt("/settings/allowlist");

    expect(await screen.findByRole("heading", { name: "Allowlist" })).toBeTruthy();
    expect(
      screen.getByRole("navigation", { name: "Settings" }).querySelector('[aria-current="page"]')
        ?.textContent,
    ).toBe("Allowlist");
  });

  it("opens the command palette on ⌘K and jumps where it is told", async () => {
    const router = await mountAt("/");

    fireEvent.keyDown(document.body, { key: "k", metaKey: true });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByPlaceholderText("Search Issues, or jump to…")).toBeTruthy();

    fireEvent.click(within(dialog).getByText("Inbox"));
    await act(async () => {
      await router.load();
    });
    expect(router.state.location.pathname).toBe("/inbox");
  });

  it("jumps on the g-chords", async () => {
    const router = await mountAt("/");

    fireEvent.keyDown(document.body, { key: "g" });
    fireEvent.keyDown(document.body, { key: "s" });
    await act(async () => {
      await router.load();
    });
    expect(router.state.location.pathname).toBe("/settings/workspace");
  });

  it("opens the Member menu with the theme and sign-out in it", async () => {
    await mountAt("/");

    fireEvent.click(within(sidebar()).getByRole("button", { name: "Ada Lovelace" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /Sign out/ })).toBeTruthy();
    expect(within(menu).getByRole("menuitemradio", { name: /Dark/ })).toBeTruthy();
  });
});
