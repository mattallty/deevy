import { fetchClientMetadataResource as shapeCheckTransport } from "@deevy/core/cimd";
import { describe, expect, it } from "vite-plus/test";
import { readEnv } from "../src/env.ts";
import { fetchClientMetadataResource as strictTransport } from "../src/cimd.ts";
import { buildServer } from "../src/server.ts";

const migrationsFolder = new URL("../../../packages/db/drizzle", import.meta.url).pathname;

function testServer() {
  return buildServer({
    ...readEnv({}),
    databasePath: ":memory:",
    migrationsFolder,
    baseURL: "http://localhost:3000",
    secret: "test-secret-test-secret-test-secret-1234",
  });
}

describe("server", () => {
  it("answers the health check", async () => {
    const { app, close } = testServer();
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    close();
  });

  it("serves the OpenAPI document", async () => {
    const { app, close } = testServer();
    const res = await app.request("/api/spec.json");
    expect(res.status).toBe(200);
    const spec = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(spec.openapi).toMatch(/^3\.1/);
    expect(Object.keys(spec.paths)).toContain("/health/ping");
    close();
  });

  it("exposes Better Auth", async () => {
    const { app, close } = testServer();
    const res = await app.request("/api/auth/get-session");
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
    close();
  });

  /**
   * Node is the target where the DNS-rebinding gap actually closes, and the
   * only thing that closes it is the transport this entry passes. Asserted by
   * identity, and on what `buildServer` handed Better Auth rather than on what
   * the helper returns, so a refactor that inlines the object at the call site
   * and loses the transport with it cannot leave Node quietly on the weaker,
   * shape-checking one the Worker has to live with (docs/plans/m3.md slice 8).
   */
  it("dereferences a client metadata document through the pinning transport", () => {
    const { authEnv, close } = testServer();

    expect(authEnv.fetchClientMetadataResource).toBe(strictTransport);
    expect(authEnv.fetchClientMetadataResource).not.toBe(shapeCheckTransport);
    close();
  });
});

describe("the runner's environment", () => {
  it("defaults the stale window to thirty minutes and the sweep to every minute", () => {
    const env = readEnv({});
    expect(env.runStaleMinutes).toBe(30);
    expect(env.sweepIntervalSeconds).toBe(60);
  });

  it("takes both from the environment", () => {
    const env = readEnv({ DEEVY_RUN_STALE_MINUTES: "5", DEEVY_SWEEP_INTERVAL_SECONDS: "10" });
    expect(env.runStaleMinutes).toBe(5);
    expect(env.sweepIntervalSeconds).toBe(10);
  });
});
