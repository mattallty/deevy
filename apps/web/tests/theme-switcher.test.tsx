import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

// The switcher exists only on an instance whose GitHub is the stub.
const flags = vi.hoisted(() => ({ devSignIn: false }));

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const { stubClient } = await import("./stub-client.ts");
  const client = stubClient({
    health: { ping: async () => ({ ok: true, devSignIn: flags.devSignIn }) as never },
  });
  return { client, orpc: createTanstackQueryUtils(client) };
});

const { ThemeCandidateSwitcher } = await import("../src/dev/theme-switcher.tsx");

function mount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeCandidateSwitcher />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  delete document.documentElement.dataset.themeCandidate;
  localStorage.clear();
});

describe("ThemeCandidateSwitcher", () => {
  it("is absent unless the instance signs in through the stub", async () => {
    flags.devSignIn = false;
    mount();
    await new Promise((settle) => setTimeout(settle, 20));
    expect(screen.queryByLabelText("Theme candidate")).toBeNull();
  });

  it("puts the chosen candidate on <html> and remembers it", async () => {
    flags.devSignIn = true;
    mount();
    const select = await screen.findByLabelText("Theme candidate");
    fireEvent.change(select, { target: { value: "graphite" } });
    await waitFor(() => expect(document.documentElement.dataset.themeCandidate).toBe("graphite"));
    expect(localStorage.getItem("deevy.theme-candidate")).toBe("graphite");
    fireEvent.change(select, { target: { value: "plex-warm" } });
    await waitFor(() => expect(document.documentElement.dataset.themeCandidate).toBeUndefined());
  });
});
