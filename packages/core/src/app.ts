import type { Db } from "@deevy/db";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferenceHandlerPlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { CORSHandlerPlugin } from "@orpc/server/plugins";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Auth } from "./auth.ts";
import { generateSpec } from "./openapi.ts";
import { router } from "./operations/index.ts";
import type { AppContext } from "./operations/registry.ts";

export interface AppOptions {
  db: Db;
  /** Omitted only by the Workers smoke build in M0. */
  auth?: Auth;
  /** Browser origins allowed to call the API with credentials. */
  origin?: string[];
  /** Called with errors thrown by operations. */
  onError?: (error: unknown) => void;
}

/**
 * The Hono app shared by the Node server and the Cloudflare Worker (ADR-0005,
 * ADR-0006): Better Auth under /api/auth, the RPC surface under /rpc, the
 * OpenAPI surface with its reference UI under /api.
 */
export function createApp({ db, auth, origin = [], onError: report = console.error }: AppOptions) {
  const app = new Hono<{ Variables: { ctx: AppContext } }>();

  app.get("/healthz", (c) => c.json({ ok: true }));

  if (auth) {
    app.use("/api/auth/*", cors({ origin, credentials: true }));
    app.all("/api/auth/*", (c) => auth.handler(c.req.raw));
  }

  app.use("/rpc/*", async (c, next) => {
    c.set("ctx", await buildContext(db, auth, c.req.raw.headers));
    await next();
  });
  app.use("/api/*", async (c, next) => {
    c.set("ctx", await buildContext(db, auth, c.req.raw.headers));
    await next();
  });

  const corsPlugin = new CORSHandlerPlugin<AppContext>({ origin, credentials: true });
  const rpc = new RPCHandler(router, { plugins: [corsPlugin], interceptors: [onError(report)] });
  const api = new OpenAPIHandler(router, {
    plugins: [
      corsPlugin,
      new OpenAPIReferenceHandlerPlugin({
        docsPath: "/docs",
        specPath: "/spec.json",
        spec: () => generateSpec(),
      }),
    ],
    interceptors: [onError(report)],
  });

  app.use("/rpc/*", async (c, next) => {
    const { matched, response } = await rpc.handle(c.req.raw, {
      prefix: "/rpc",
      context: c.get("ctx"),
    });
    if (matched) return c.newResponse(response.body, response);
    await next();
  });
  app.use("/api/*", async (c, next) => {
    const { matched, response } = await api.handle(c.req.raw, {
      prefix: "/api",
      context: c.get("ctx"),
    });
    if (matched) return c.newResponse(response.body, response);
    await next();
  });

  return app;
}

export type App = ReturnType<typeof createApp>;

async function buildContext(db: Db, auth: Auth | undefined, headers: Headers): Promise<AppContext> {
  const session = auth ? await auth.api.getSession({ headers }) : null;
  if (!session) return { db, session: null, member: null, workspace: null };
  const found = await db.query.member.findFirst({
    where: { userId: session.user.id },
    with: { workspace: true },
  });
  if (!found) return { db, session, member: null, workspace: null };
  const { workspace, ...member } = found;
  return { db, session, member, workspace };
}
