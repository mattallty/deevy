import { fetchClientMetadataResource } from "@deevy/core/cimd";
import { describe, expect, it } from "vite-plus/test";
import { isolateFor } from "../src/worker.ts";

/**
 * The half of the wiring `apps/server/tests/server.test.ts` asserts from the
 * other side, and asserted at the entry rather than at the helper that builds
 * the object: what the Worker actually hands Better Auth, so a refactor that
 * inlines `workerAuthEnv` at the call site cannot quietly change the transport
 * either way. workerd has no way to fetch by address while keeping the name
 * for SNI, so the Worker takes the core's shape-checking transport with its
 * DNS-over-HTTPS pre-resolution, and the residual race is documented rather
 * than claimed away (docs/plans/m3.md slice 8, docs/OPERATIONS.md).
 */
describe("the Worker's identity configuration", () => {
  it("dereferences a client metadata document through the core transport", () => {
    const isolate = isolateFor({
      DB: undefined as never,
      BETTER_AUTH_URL: "https://deevy.example.com",
      BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters",
    });

    expect(isolate.authEnv.fetchClientMetadataResource).toBe(fetchClientMetadataResource);
  });
});
