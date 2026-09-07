import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

const stub = vi.hoisted(() => ({
  members: [
    {
      id: "m-ada",
      role: "admin",
      kind: "human",
      handle: "ada",
      suspendedAt: null,
      user: { id: "u-ada", name: "Ada Lovelace", email: "ada@example.com", image: null },
    },
    {
      id: "m-bob",
      role: "member",
      kind: "human",
      handle: "bob",
      suspendedAt: new Date(),
      user: { id: "u-bob", name: "Bob Vance", email: "bob@example.com", image: null },
    },
  ],
  rules: [
    { id: "r-1", kind: "email_domain", value: "example.com", createdAt: new Date() },
    { id: "r-2", kind: "github_org", value: "acme", createdAt: new Date() },
  ],
}));

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const { stubClient } = await import("./stub-client.ts");
  const client = stubClient({
    members: { list: async () => ({ members: stub.members }) },
    allowlist: { list: async () => ({ rules: stub.rules }) },
  });
  return { client, orpc: createTanstackQueryUtils(client) };
});

const { MembersPage } = await import("../src/routes/settings/members.tsx");
const { mount } = await import("./mount.tsx");
const { AllowlistRow } = await import("../src/routes/settings/allowlist.tsx");

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

describe("the Allowlist row of Workspace › General", () => {
  it("shows every rule that admits a sign-in, each one droppable", async () => {
    mount(<AllowlistRow />);

    // Chips, not a table: nearly every rule is one domain, and a rule is two words.
    expect(await screen.findByText("example.com")).toBeTruthy();
    expect(screen.getByText("acme")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stop allowing example.com" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stop allowing acme" })).toBeTruthy();
  });

  it("keeps the form for a new rule behind Add rule", async () => {
    mount(<AllowlistRow />);

    await screen.findByText("example.com");
    expect(screen.queryByLabelText("Match on")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));

    expect(await screen.findByLabelText("Match on")).toBeTruthy();
    expect(screen.getByLabelText("Domain")).toBeTruthy();
  });
});
