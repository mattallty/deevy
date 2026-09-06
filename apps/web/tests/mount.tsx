import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { createAppRouter } from "../src/router.tsx";
import type { ShellProps } from "../src/routes/shell.tsx";

/**
 * How a test mounts the app (beside `stub-client.ts` and `select.ts`): one
 * QueryClient that never retries, the router on a memory history, and the
 * load inside `act`. The load belongs there because the router settles its
 * matches in React state, and `render` wraps its own work but cannot wrap
 * this — a requirement every copy of this used to carry (#10, item 6). A
 * test mocks `lib/orpc` before importing this, as `vi.mock` is hoisted.
 */
export function newQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** A component on its own, under a QueryClient: for what has no route. */
export function mount(ui: ReactNode) {
  const queryClient = newQueryClient();
  return {
    ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
    queryClient,
  };
}

export interface MountOptions {
  /** The name in the shell's footer; "Ada Lovelace" unless a test says otherwise. */
  memberName?: string;
  /** The signed-in Member, for the chip; absent, the name alone is shown. */
  member?: ShellProps["member"];
  workspaceName?: string;
}

/** The whole app at a path, loaded, with the router for a test to read the location from. */
export async function mountAt(path: string, options: MountOptions = {}) {
  const router = createAppRouter(
    {
      workspaceName: options.workspaceName ?? "Acme Team",
      memberName: options.memberName ?? "Ada Lovelace",
      ...(options.member ? { member: options.member } : {}),
    },
    { initialEntries: [path] },
  );
  const queryClient = newQueryClient();
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
