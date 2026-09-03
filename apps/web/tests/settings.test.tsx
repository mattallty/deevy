import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

const stub = vi.hoisted(() => ({
  members: [
    {
      id: "m-ada",
      role: "admin",
      kind: "human",
      handle: "ada",
      suspendedAt: null,
      user: { id: "u-ada", name: "Ada Lovelace", email: "ada@flippable.net", image: null },
    },
    {
      id: "m-bob",
      role: "member",
      kind: "human",
      handle: "bob",
      suspendedAt: new Date(),
      user: { id: "u-bob", name: "Bob Vance", email: "bob@flippable.net", image: null },
    },
  ],
  rules: [
    { id: "r-1", kind: "email_domain", value: "flippable.net", createdAt: new Date() },
    { id: "r-2", kind: "github_org", value: "flippable", createdAt: new Date() },
  ],
}));

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const client = {
    members: {
      list: async () => ({ members: stub.members }),
      updateRole: async () => stub.members[0],
      suspend: async () => stub.members[1],
      reinstate: async () => stub.members[1],
    },
    allowlist: {
      list: async () => ({ rules: stub.rules }),
      add: async () => stub.rules[0],
      remove: async () => ({ removed: true }),
    },
  };
  return { client, orpc: createTanstackQueryUtils(client) };
});

const { MembersPage } = await import("../src/routes/settings/members.tsx");
const { AllowlistPage } = await import("../src/routes/settings/allowlist.tsx");

function mount(ui: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("the Members settings page", () => {
  it("lists every Member with their role and handle", async () => {
    mount(<MembersPage />);

    expect(await screen.findByText("Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("Bob Vance")).toBeTruthy();
    expect(screen.getByText("@ada")).toBeTruthy();
    expect(screen.getAllByText("admin").length).toBeGreaterThan(0);
  });

  it("marks a suspended Member as suspended", async () => {
    mount(<MembersPage />);

    await waitFor(() => expect(screen.getByText("Bob Vance")).toBeTruthy());
    expect(screen.getByText("Suspended")).toBeTruthy();
  });
});

describe("the allowlist settings page", () => {
  it("lists the rules that admit a sign-in", async () => {
    mount(<AllowlistPage />);

    const rules = await screen.findByRole("table");
    expect(within(rules).getByText("flippable.net")).toBeTruthy();
    expect(within(rules).getByText("flippable")).toBeTruthy();
    expect(within(rules).getByText("Email domain")).toBeTruthy();
    expect(within(rules).getByText("GitHub organization")).toBeTruthy();
  });
});
