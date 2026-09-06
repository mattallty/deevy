import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { act, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const { stubClient } = await import("./stub-client.ts");
  const client = stubClient({
    issues: {
      get: async () => {
        throw Object.assign(new Error("No such Issue"), { code: "NOT_FOUND" });
      },
    },
  });
  return { client, orpc: createTanstackQueryUtils(client) };
});

const { createAppRouter } = await import("../src/router.tsx");

async function mountAt(path: string) {
  const router = createAppRouter(
    { workspaceName: "Acme Team", memberName: "Ada Lovelace" },
    { memory: true, initialEntries: [path] },
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

describe("a URL that leads nowhere", () => {
  it("renders the not-found page inside the shell, naming the path", async () => {
    await mountAt("/nowhere/at/all");

    expect(await screen.findByRole("heading", { name: "There is nothing here" })).toBeTruthy();
    expect(screen.getByText("/nowhere/at/all")).toBeTruthy();
    // The top bar does not spell the path back; it says what happened.
    const crumbs = screen.getByRole("navigation", { name: "breadcrumb" });
    expect(crumbs.textContent).toBe("Not found");
    // The shell is still around it (the sidebar is one landmark), and the page
    // itself offers the way out: back, or the two places most links come from.
    expect(document.querySelector('[data-slot="sidebar"]')).toBeTruthy();
    const page = screen
      .getByRole("heading", { name: "There is nothing here" })
      .closest('[data-slot="empty"]') as HTMLElement;
    expect(within(page).getByRole("button", { name: "Go back" })).toBeTruthy();
    expect(within(page).getByRole("link", { name: "All Issues" })).toBeTruthy();
    expect(within(page).getByRole("link", { name: "Inbox" })).toBeTruthy();
  });

  it("keeps the real crumbs on a page that exists", async () => {
    await mountAt("/");

    await screen.findByRole("heading", { name: "All Issues" });
    const crumbs = screen.getByRole("navigation", { name: "breadcrumb" });
    expect(crumbs.textContent).toBe("All Issues");
  });

  it("says which Issue does not exist when the API says NOT_FOUND", async () => {
    await mountAt("/issues/DEV-999");

    expect(await screen.findByRole("heading", { name: "There is no Issue DEV-999" })).toBeTruthy();
    expect(screen.getByText("No such Issue")).toBeTruthy();
  });
});
