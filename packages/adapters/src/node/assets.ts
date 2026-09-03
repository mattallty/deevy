import { serveStatic } from "@hono/node-server/serve-static";
import type { Env, Hono, Schema } from "hono";

/**
 * Serves a built single-page app from `dir`: real files first, `index.html`
 * for everything else so client-side routes deep-link.
 */
export function mountSpa<E extends Env, S extends Schema, P extends string>(
  app: Hono<E, S, P>,
  dir: string,
): void {
  app.use("*", serveStatic({ root: dir }));
  app.get("*", serveStatic({ root: dir, path: "index.html" }));
}
