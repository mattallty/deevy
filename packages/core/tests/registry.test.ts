import { Procedure } from "@orpc/server";
import { describe, expect, it } from "vite-plus/test";
import { generateSpec } from "../src/openapi.ts";
import { router } from "../src/operations/index.ts";
import { getOperationMeta } from "../src/operations/registry.ts";

describe("operation registry", () => {
  it("projects an operation to an oRPC procedure carrying our meta", () => {
    expect(router.health.ping).toBeInstanceOf(Procedure);
    expect(getOperationMeta(router.health.ping)).toMatchObject({
      name: "health.ping",
      auth: "public",
      method: "GET",
      path: "/health/ping",
    });
    expect(getOperationMeta(router.workspace.get)?.auth).toBe("member");
  });

  it("projects the router to OpenAPI 3.1 with our operation ids", async () => {
    const spec = await generateSpec();
    expect(spec.openapi).toMatch(/^3\.1/);
    const paths = spec.paths as Record<string, Record<string, { operationId?: string }>>;
    expect(paths["/health/ping"]?.get?.operationId).toBe("health.ping");
    expect(paths["/me"]?.get?.operationId).toBe("me.get");
    expect(paths["/workspace"]?.get?.operationId).toBe("workspace.get");
  });
});
