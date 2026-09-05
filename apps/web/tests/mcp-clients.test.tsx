import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

const stub = vi.hoisted(() => ({
  clients: [
    {
      clientId: "https://claude.ai/mcp/client",
      name: "Claude Code",
      uri: null,
      icon: null,
      scopes: ["openid", "profile"],
      consentedAt: new Date("2026-09-01T10:00:00Z"),
    },
  ],
  revoked: [] as unknown[],
}));

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const { stubClient } = await import("./stub-client.ts");
  const client = stubClient({
    oauthClients: {
      list: async () => ({ clients: stub.clients }),
      revoke: async (input: unknown) => {
        stub.revoked.push(input);
        stub.clients = [];
        return { revoked: true };
      },
    },
  });
  return { client, orpc: createTanstackQueryUtils(client) };
});

const { createAppRouter } = await import("../src/router.tsx");
const { ConsentPage } = await import("../src/routes/consent.tsx");

async function mountAt(path: string) {
  const router = createAppRouter(
    { workspaceName: "Flippable Team", memberName: "Ada" },
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

describe("the MCP clients settings page", () => {
  it("gives the endpoint and the command that needs no header", async () => {
    await mountAt("/settings/mcp-clients");

    expect(await screen.findByText(`${window.location.origin}/mcp`)).toBeTruthy();
    const command = screen.getByText(/claude mcp add/);
    expect(command.textContent).toContain(`--transport http deevy ${window.location.origin}/mcp`);
    // A Human's client signs itself in; only an Agent pastes a key.
    expect(command.textContent).not.toContain("--header");
  });

  it("lists the clients acting as this Human and revokes one", async () => {
    await mountAt("/settings/mcp-clients");

    expect(await screen.findByText("Claude Code")).toBeTruthy();
    expect(screen.getByText("https://claude.ai/mcp/client")).toBeTruthy();
    expect(screen.getByText("openid, profile")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() => expect(stub.revoked).toHaveLength(1));
    expect(stub.revoked[0]).toEqual({ clientId: "https://claude.ai/mcp/client" });
    expect(await screen.findByText(/No MCP client is connected as you yet/)).toBeTruthy();
  });
});

describe("the consent page", () => {
  it("names who is asking and what for, and answers with the signed query it was given", async () => {
    const answered: Array<{ url: string; body: { oauth_query: string; accept: boolean } }> = [];
    // The page only ever asks for a string URL and a string body, which is why
    // this stand-in can be this narrow.
    const fetched = vi.fn(async (url: string, init?: { body?: string }) => {
      if (url.includes("public-client")) {
        return new Response(JSON.stringify({ client_name: "Claude Code" }), {
          headers: { "content-type": "application/json" },
        });
      }
      answered.push({
        url,
        body: JSON.parse(init?.body ?? "{}") as (typeof answered)[number]["body"],
      });
      return new Response(JSON.stringify({ url: "http://127.0.0.1:8765/callback?code=abc" }), {
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetched);
    // jsdom refuses a real navigation; the page only ever asks for one.
    const assign = vi.fn();
    vi.stubGlobal("location", { origin: window.location.origin, assign, search: "" });

    const search = "?client_id=https%3A%2F%2Fclaude.ai%2Fmcp%2Fclient&scope=openid+profile&sig=xyz";
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ConsentPage search={search} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Let Claude Code act as you?")).toBeTruthy();
    expect(screen.getByText("Know who you are")).toBeTruthy();
    expect(screen.getByText("See your name and picture")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Allow" }));

    await waitFor(() => expect(answered).toHaveLength(1));
    const [sent] = answered as [(typeof answered)[number]];
    expect(sent.url).toContain("/api/auth/oauth2/consent");
    expect(sent.body.accept).toBe(true);
    // Handed back whole, signature included: deevy re-derives nothing.
    expect(sent.body.oauth_query).toContain("sig=xyz");
    expect(sent.body.oauth_query).toContain("scope=openid+profile");
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("http://127.0.0.1:8765/callback?code=abc"),
    );

    vi.unstubAllGlobals();
  });
});
