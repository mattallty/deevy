import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const client = {
    members: {
      list: async () => ({ members: [] }),
      updateRole: async () => ({}),
      suspend: async () => ({}),
      reinstate: async () => ({}),
    },
    allowlist: {
      list: async () => ({ rules: [] }),
      add: async () => ({}),
      remove: async () => ({ removed: true }),
    },
    projects: {
      list: async () => ({ projects: [] }),
      get: async () => ({}),
      create: async () => ({}),
      update: async () => ({}),
      archive: async () => ({}),
    },
    teams: {
      list: async () => ({ teams: [] }),
      create: async () => ({}),
      update: async () => ({}),
      delete: async () => ({ deleted: true }),
      addMember: async () => ({}),
      removeMember: async () => ({}),
    },
  };
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
  await router.load();
}

describe("the app shell", () => {
  it("names the Workspace and the signed-in Human, and links to the settings", async () => {
    await mountAt("/");

    // The Workspace is named twice, once per breakpoint; the sidebar is the desktop one.
    const sidebar = await screen.findByRole("complementary");
    expect(within(sidebar).getByText("Flippable Team")).toBeTruthy();
    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    expect(within(sidebar).getByRole("link", { name: "Members" }).getAttribute("href")).toBe(
      "/settings/members",
    );
    expect(within(sidebar).getByRole("link", { name: "Allowlist" }).getAttribute("href")).toBe(
      "/settings/allowlist",
    );
  });

  it("shows Inbox as a placeholder rather than a link, until its slice", async () => {
    await mountAt("/");

    expect(screen.queryByRole("link", { name: /Inbox/ })).toBeNull();
    expect(screen.getByText("soon")).toBeTruthy();
  });

  it("renders the Projects page at the root", async () => {
    await mountAt("/");

    expect(await screen.findByRole("heading", { name: "Projects", level: 1 })).toBeTruthy();
  });

  it("renders the Allowlist page at /settings/allowlist", async () => {
    await mountAt("/settings/allowlist");

    expect(await screen.findByRole("heading", { name: "Allowlist" })).toBeTruthy();
  });
});
