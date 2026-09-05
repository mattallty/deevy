import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { act, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const { stubClient } = await import("./stub-client.ts");
  const client = stubClient();
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
}

describe("the app shell", () => {
  it("names the Workspace and the signed-in Human, and links to the settings", async () => {
    await mountAt("/");

    // shadcn's Sidebar is a div carrying data-slot, not a landmark element.
    await screen.findByText("Flippable Team");
    const sidebar = document.querySelector('[data-slot="sidebar"]') as HTMLElement;
    expect(within(sidebar).getByText("Flippable Team")).toBeTruthy();
    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    expect(within(sidebar).getByRole("link", { name: "Members" }).getAttribute("href")).toBe(
      "/settings/members",
    );
    expect(within(sidebar).getByRole("link", { name: "Agents" }).getAttribute("href")).toBe(
      "/settings/agents",
    );
    expect(within(sidebar).getByRole("link", { name: "Allowlist" }).getAttribute("href")).toBe(
      "/settings/allowlist",
    );
  });

  it("links to the Inbox now that slice 12 has filled it in", async () => {
    await mountAt("/");

    const sidebar = document.querySelector('[data-slot="sidebar"]') as HTMLElement;
    expect(within(sidebar).getByRole("link", { name: /Inbox/ }).getAttribute("href")).toBe(
      "/inbox",
    );
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
