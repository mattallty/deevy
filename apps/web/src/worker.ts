import { createDb } from "@deevy/adapters/workers";
import type { App } from "@deevy/core/app";
import { createApp, createAuth, runDueWork, type DueWorkLimits } from "@deevy/core";
import type { WorkerBindings, WorkerEnv } from "./env.ts";
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
  /** The same D1 the app writes through, for work no request asked for. */
  db: ReturnType<typeof createDb>;
  /** The bindings, read once, so the Cron Trigger configures itself like the app. */
  env: WorkerEnv;
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
    db,
    env,
    ready: auth.$context.then(
      () => undefined,
      () => undefined,
    ),
  };
  apps.set(bindings, isolate);
  return isolate;
}

/**
 * What Cloudflare hands a Cron Trigger, narrowed to what deevy uses. The types
 * are written out rather than imported from `@cloudflare/workers-types`
 * because `tsconfig.app.json` compiles this file beside the SPA, and pulling
 * the Workers globals in would put `caches` and `fetch` on the browser too.
 */
interface ScheduledContext {
  waitUntil(work: Promise<unknown>): void;
}

/**
 * Tighter than Node's on purpose. A Cron Trigger has a CPU budget and a
 * per-invocation D1 query cap, and it comes back on its own a minute later, so
 * one bounded pass is the whole strategy: `more: true` has meant "come back
 * rather than raise the limit" since M2, and here the thing that comes back is
 * the platform (docs/plans/m3.md). Twenty is also the chunk `work.ts` writes
 * Events in, so a full pass is one SELECT, one UPDATE and one INSERT.
 */
const cronLimits: DueWorkLimits = { maxPasses: 1, sweepLimit: 20, deliveryLimit: 10 };

export default {
  async fetch(request: Request, bindings: WorkerBindings): Promise<Response> {
    const isolate = isolateFor(bindings);
    await isolate.ready;
    return isolate.app.fetch(request);
  },

  /**
   * deevy's background work, once per trigger: the same `runDueWork` the Node
   * runner's timer calls, with the limits a trigger can afford. There is no
   * `Cron` port here on purpose — Cloudflare owns the schedule, and a port
   * handing back a stop function would be lying about who holds the timer.
   *
   * `ready` is awaited for the reason a request awaits it: whichever
   * invocation builds the isolate has to finish Better Auth's initialisation
   * before it returns, or workerd abandons the I/O and every later awaiter
   * hangs on a promise that never settles.
   */
  scheduled(_controller: unknown, bindings: WorkerBindings, ctx: ScheduledContext): void {
    const isolate = isolateFor(bindings);
    ctx.waitUntil(
      isolate.ready.then(() =>
        runDueWork({
          db: isolate.db,
          limits: {
            ...cronLimits,
            silenceMs: isolate.env.runStaleMinutes * 60_000,
            gateSilenceMs: isolate.env.gateReminderHours * 3_600_000,
          },
          ...(isolate.env.baseURL ? { baseUrl: isolate.env.baseURL } : {}),
        }),
      ),
    );
  },
};
