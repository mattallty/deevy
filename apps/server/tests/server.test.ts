import { describe, expect, it } from "vite-plus/test";
import { readEnv } from "../src/env.ts";
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
});
