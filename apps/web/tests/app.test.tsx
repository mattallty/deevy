import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const stub = vi.hoisted(() => ({ devSignIn: false }));

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const { stubClient } = await import("./stub-client.ts");
  const client = stubClient({
    health: {
      ping: async () => ({ ok: true, time: new Date(0).toISOString(), devSignIn: stub.devSignIn }),
    },
  });
  return { client, orpc: createTanstackQueryUtils(client) };
});

const { DevSignIn, SignedOut } = await import("../src/App.tsx");

function mount(node: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

afterEach(() => {
  stub.devSignIn = false;
  vi.unstubAllGlobals();
});

describe("SignedOut", () => {
  it("offers GitHub sign-in, and nothing else on a real instance", async () => {
    mount(<SignedOut />);
    expect(screen.getByRole("button", { name: "Sign in with GitHub" })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("form")).toBeNull());
    expect(screen.queryByLabelText("Email")).toBeNull();
  });

  it("offers the development form only when health.ping says GitHub is a stub", async () => {
    stub.devSignIn = true;
    mount(<SignedOut />);
    expect(await screen.findByRole("form", { name: "Development sign-in" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in with GitHub" })).toBeTruthy();
  });
});

describe("DevSignIn", () => {
  /**
   * The stub makes the OAuth `code` the email address, so the form only has to
   * do what the browser would: start the social sign-in for a `state`, then
   * land on the callback with that state and the email.
   */
  it("starts the social sign-in and lands on the callback with the email as the code", async () => {
    const fetchSpy = vi.fn(async () =>
      Response.json({ url: "https://github.com/login/oauth/authorize?state=s3cret&client_id=x" }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const navigate = vi.fn();
    mount(<DevSignIn navigate={navigate} />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in as this email" }));

    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    const landed = new URL(navigate.mock.calls[0]?.[0] as string);
    expect(landed.pathname).toBe("/api/auth/callback/github");
    expect(landed.searchParams.get("state")).toBe("s3cret");
    expect(landed.searchParams.get("code")).toBe("ada@example.com");

    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/sign-in/social");
    expect(JSON.parse(init.body as string)).toMatchObject({ provider: "github" });
  });

  it("says so when the server does not start a sign-in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({})),
    );
    const navigate = vi.fn();
    mount(<DevSignIn navigate={navigate} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in as this email" }));
    expect(await screen.findByText(/did not start a sign-in/)).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });
});
