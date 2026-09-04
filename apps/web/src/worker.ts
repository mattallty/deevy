import { createDb } from "@deevy/adapters/workers";
import type { App } from "@deevy/core/app";
import { createApp } from "@deevy/core/app";
import type { WorkerBindings } from "./env.ts";
import { readWorkerEnv } from "./env.ts";

/**
 * One app per isolate, not one per request. `createApp` builds the oRPC
 * handlers, the OpenAPI document and the MCP server, none of which depend on
 * the request; `buildContext` is the only per-request work. The key is the
 * binding set itself, so there is no global to reset between tests and an
 * isolate serving a second environment builds a second app (docs/plans/m3.md).
 */
const apps = new WeakMap<WorkerBindings, App>();

function appFor(bindings: WorkerBindings): App {
  const cached = apps.get(bindings);
  if (cached) return cached;
  const env = readWorkerEnv(bindings);
  const app = createApp({
    db: createDb(bindings.DB),
    // The Worker serves the SPA from the same origin, so the only cross-origin
    // caller is a browser on a separately deployed one.
    origin: [env.webOrigin, env.baseURL].filter((o): o is string => Boolean(o)),
    baseURL: env.baseURL,
    secret: env.secret,
  });
  apps.set(bindings, app);
  return app;
}

// Sign-in on Workers arrives with M3 slice 5, so `createApp` still gets no
// auth: every call that needs a Member is UNAUTHORIZED, and /mcp answers with
// its challenge (ADR-0006).
export default {
  fetch(request: Request, bindings: WorkerBindings): Response | Promise<Response> {
    return appFor(bindings).fetch(request);
  },
};
