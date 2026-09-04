import { createDb } from "@deevy/adapters/workers";
import type { App } from "@deevy/core/app";
import { createApp, createAuth } from "@deevy/core";
import type { WorkerBindings } from "./env.ts";
import { readWorkerEnv } from "./env.ts";

/**
 * One app per isolate, not one per request. `createApp` builds the oRPC
 * handlers, the OpenAPI document and the MCP server, none of which depend on
 * the request; `buildContext` is the only per-request work. Better Auth is
 * built here for the same reason and one more: its constructor touches the
 * database, and `principal.ts` caches a verified JWKS keyed by the `Auth`
 * object, so an instance per request would re-fetch the key set for every
 * token it verifies. The key is the binding set itself, so there is no global
 * to reset between tests and an isolate serving a second environment builds a
 * second app (docs/plans/m3.md).
 */
const apps = new WeakMap<WorkerBindings, Isolate>();

/** The app this isolate serves, and the initialisation it owes the next request. */
interface Isolate {
  app: App;
  /**
   * Better Auth starts initialising inside its constructor, and that touches
   * the database. workerd abandons any I/O still in flight when the request
   * that started it returns, so a `$context` left pending by the request that
   * built the app never settles and every later request that awaits it hangs
   * — silently, with no error to read. The request that builds the app
   * therefore finishes the initialisation too, and every later one awaits a
   * promise that has already settled, which is free and crosses no context.
   * A failed initialisation stays failed for the isolate, exactly as it does
   * on Node, and is reported by the handler that needed it. The smoke's
   * sign-in phase opens with a `/healthz` for this reason and no other: it
   * makes the request that builds the app one that needs no auth, so deleting
   * the await below hangs the sign-in that follows (apps/web/scripts/smoke-workers.ts).
   */
  ready: Promise<void>;
}

function isolateFor(bindings: WorkerBindings): Isolate {
  const cached = apps.get(bindings);
  if (cached) return cached;
  const env = readWorkerEnv(bindings);
  const db = createDb(bindings.DB);
  // The Worker serves the SPA from the same origin, so the only cross-origin
  // caller is a browser on a separately deployed one.
  const origin = [env.webOrigin, env.baseURL].filter((o): o is string => Boolean(o));
  const auth = createAuth({
    db,
    env: {
      baseURL: env.baseURL,
      secret: env.secret,
      trustedOrigins: origin,
      github: env.github,
      adminEmail: env.adminEmail,
      workspaceName: env.workspaceName,
    },
  });
  const isolate: Isolate = {
    app: createApp({ db, auth, origin, baseURL: env.baseURL, secret: env.secret }),
    ready: auth.$context.then(
      () => undefined,
      () => undefined,
    ),
  };
  apps.set(bindings, isolate);
  return isolate;
}

export default {
  async fetch(request: Request, bindings: WorkerBindings): Promise<Response> {
    const isolate = isolateFor(bindings);
    await isolate.ready;
    return isolate.app.fetch(request);
  },
};
