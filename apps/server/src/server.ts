import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { mountSpa, openDatabase } from "@deevy/adapters/node";
import { createApp, createAuth } from "@deevy/core";
import type { ServerEnv } from "./env.ts";

/**
 * Builds the fully wired Node app. Separate from the listener so tests can
 * drive it with Request objects — and so the background runner starts beside
 * the listener rather than inside `createApp`, which the Worker calls once per
 * request (apps/server/src/runner.ts).
 */
export function buildServer(env: ServerEnv) {
  if (env.databasePath !== ":memory:")
    mkdirSync(dirname(resolve(env.databasePath)), { recursive: true });
  const { db, close } = openDatabase({
    path: env.databasePath,
    migrationsFolder: env.migrationsFolder,
  });
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
  const app = createApp({ db, auth, origin, baseURL: env.baseURL, secret: env.secret });
  if (env.webDist) mountSpa(app, resolve(env.webDist));
  return { app, db, close };
}
