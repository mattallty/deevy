import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

// The keyboard on an Issue (docs/plans/ui-redesign.md, "Keyboard"): letters
// open the rail's pickers, ⇧A/⇧R aim the ruling, [ ] turn the Documents.
const isGate = vi.hoisted(() => ({ value: false }));

vi.mock("../src/lib/orpc.ts", async () => {
  const { createTanstackQueryUtils } = await import("@orpc/tanstack-query");
  const { stubClient } = await import("./stub-client.ts");
  // stubClient is typed `never` on purpose; this reads its default Issue shape.
  const base = stubClient() as unknown as {
    issues: { get: (input: { key: string }) => Promise<Record<string, unknown>> };
  };
  const empty = await base.issues.get({ key: "DEV-1" });
  const issue = () => ({
    ...empty,
    id: "i1",
    key: "DEV-1",
    title: "Ship the Event log",
    project: { ...(empty.project as object), key: "DEV" },
    state: isGate.value
      ? { id: "s-intent", name: "Intent", isGate: true, category: "active", position: 0 }
      : { id: "s-build", name: "Build", isGate: false, category: "active", position: 1 },
    parent: null,
    children: [],
    gateDecisions: [],
    labels: [],
  });
  const client = stubClient({
    issues: {
      get: async () => issue() as never,
      list: async () => ({
        issues: [{ ...issue(), key: "DEV-2", title: "The parent" }] as never,
        nextCursor: null,
      }),
    },
    documents: {
      list: async () => ({
        documents: [
          { name: "intent", currentVersion: 1 },
          { name: "spec", currentVersion: 1 },
        ] as never,
      }),
    },
    labels: {
      list: async () => ({
        labels: [{ id: "l1", name: "backend", scope: null, color: "#333" }] as never,
      }),
    },
    workflow: {
      get: async () =>
        ({
          states: [
            { id: "s-build", name: "Build", isGate: false, category: "active", position: 1 },
            { id: "s-done", name: "Done", isGate: false, category: "done", position: 2 },
          ],
        }) as never,
    },
  });
  return { client, orpc: createTanstackQueryUtils(client) };
});

const { createAppRouter } = await import("../src/router.tsx");

async function mountIssue(path = "/issues/DEV-1") {
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
  await act(async () => {
    await router.load();
  });
  await screen.findByRole("heading", { name: "Ship the Event log" });
}

const press = (key: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(document.body, { key, ...init });

describe("the keyboard on an Issue", () => {
  it("a opens the Assignee picker and s the State picker", async () => {
    isGate.value = false;
    await mountIssue();
    press("a");
    expect(screen.getByRole("combobox", { name: "Assignee" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
    press("Escape");
    press("s");
    expect(screen.getByRole("combobox", { name: "State" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
  });

  it("l lands on the first Label and p opens the Parent picker", async () => {
    isGate.value = false;
    await mountIssue();
    await screen.findByRole("button", { name: "backend" });
    press("l");
    const labels = screen.getByRole("group", { name: "Labels" });
    expect(labels.contains(document.activeElement)).toBe(true);
    press("p");
    expect(await screen.findByRole("combobox", { name: "Parent" })).toBeTruthy();
    expect(await screen.findByRole("option", { name: /DEV-2/ })).toBeTruthy();
  });

  it("[ and ] turn the Document tabs", async () => {
    isGate.value = false;
    await mountIssue();
    const tab = (name: string) => screen.getByRole("tab", { name });
    await screen.findByRole("tab", { name: "intent" });
    expect(tab("intent").getAttribute("aria-selected")).toBe("true");
    press("]");
    expect(tab("spec").getAttribute("aria-selected")).toBe("true");
    press("]");
    expect(tab("intent").getAttribute("aria-selected")).toBe("true");
    press("[");
    expect(tab("spec").getAttribute("aria-selected")).toBe("true");
  });

  it("⇧R aims the ruling at Reject with the cursor in the Note; ⇧A aims it back", async () => {
    isGate.value = true;
    await mountIssue();
    const note = screen.getByLabelText("Note");
    const buttons = () => screen.getByRole("button", { name: "Reject" }).parentElement;
    expect(buttons()?.getAttribute("data-ruling")).toBe("approve");
    press("R", { shiftKey: true });
    expect(document.activeElement).toBe(note);
    expect(buttons()?.getAttribute("data-ruling")).toBe("reject");
    press("A", { shiftKey: true });
    expect(buttons()?.getAttribute("data-ruling")).toBe("approve");
  });
});
