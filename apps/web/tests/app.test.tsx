import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

interface StubProvider {
  id: string;
  label: string;
  kind: "social";
}

const github: StubProvider = { id: "github", label: "GitHub", kind: "social" };
const stub = vi.hoisted(() => ({
  devSignIn: false,
  providers: [{ id: "github", label: "GitHub", kind: "social" }] as StubProvider[],
  /** The ping fails: the instance is unreachable rather than unconfigured. */
  unreachable: false,
  /** What `authClient.signIn.social` answers — an error is a button that did not start. */
  signInError: null as { message: string } | null,
}));

vi.mock("../src/lib/auth.ts", () => ({
  authClient: {
    signIn: { social: async () => ({ data: null, error: stub.signInError }) },
  },
}));

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const { stubClient } = await import("./stub-client.ts");
  const client = stubClient({
    health: {
      ping: async () => {
        if (stub.unreachable) throw new Error("unreachable");
        return {
          ok: true,
          time: new Date(0).toISOString(),
          devSignIn: stub.devSignIn,
          providers: stub.providers,
        };
      },
    },
  });
  return { client, orpc: createTanstackQueryUtils(client) };
});

const { DevSignIn, SignedOut } = await import("../src/App.tsx");
const { mount } = await import("./mount.tsx");
const { orpc } = await import("../src/lib/orpc.ts");

afterEach(() => {
  stub.devSignIn = false;
  stub.providers = [github];
  stub.unreachable = false;
  stub.signInError = null;
  vi.unstubAllGlobals();
});

describe("SignedOut", () => {
  it("offers the providers this deployment configured, and nothing else", async () => {
    const { queryClient } = mount(<SignedOut />);
    expect(await screen.findByRole("button", { name: "Sign in with GitHub" })).toBeTruthy();
    // The form's absence means something only once health.ping has answered.
    await waitFor(() =>
      expect(queryClient.getQueryState(orpc.health.ping.queryKey())?.status).toBe("success"),
    );
    expect(screen.queryByRole("form")).toBeNull();
    expect(screen.queryByLabelText("Email")).toBeNull();
  });

  it("renders one button per provider, in the order the server sent", async () => {
    stub.providers = [github, { id: "google", label: "Google", kind: "social" }];
    mount(<SignedOut />);
    await screen.findByRole("button", { name: "Sign in with Google" });
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Sign in with GitHub",
      "Sign in with Google",
    ]);
  });

  it("says so when the deployment configured no provider at all", async () => {
    stub.providers = [];
    mount(<SignedOut />);
    expect(await screen.findByText(/no sign-in provider configured/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers the development form only when health.ping says GitHub is a stub", async () => {
    stub.devSignIn = true;
    mount(<SignedOut />);
    expect(await screen.findByRole("form", { name: "Development sign-in" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in with GitHub" })).toBeTruthy();
  });

  /**
   * An instance that cannot be asked what it offers is not an instance that
   * offers nothing: without this the buttons and the "no provider configured"
   * line are both absent and the card is empty (docs/plans/sign-in.md).
   */
  it("says so when it could not ask what this deployment offers", async () => {
    stub.unreachable = true;
    mount(<SignedOut />);
    expect(await screen.findByText(/could not be reached/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Sign in with/ })).toBeNull();
    expect(screen.queryByText(/no sign-in provider configured/)).toBeNull();
  });

  /**
   * A provider the page was told about but Better Auth never registered — a
   * discovery document that could not be fetched at startup leaves exactly
   * this — answers the click with an error rather than a redirect.
   */
  it("says so when a button does not start a sign-in", async () => {
    stub.signInError = { message: "PROVIDER_NOT_FOUND" };
    mount(<SignedOut />);
    fireEvent.click(await screen.findByRole("button", { name: "Sign in with GitHub" }));
    expect(await screen.findByText(/could not start/)).toBeTruthy();
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
