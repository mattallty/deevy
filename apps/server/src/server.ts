import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { mountSpa, openDatabase } from "@deevy/adapters/node";
import { createApp, createAuth, type AuthEnv } from "@deevy/core";
import { fetchClientMetadataResource } from "./cimd.ts";
import type { ServerEnv } from "./env.ts";

/**
 * The identity configuration this entry hands Better Auth. Node dereferences a
 * Client ID Metadata Document through the pinning transport in
 * `apps/server/src/cimd.ts`, which resolves the name once and connects to the
 * address it checked; the Worker cannot, and passes the core's shape-checking
 * one (docs/plans/m3.md slice 8, docs/OPERATIONS.md). That is the one thing
 * that differs between the two runtimes, so `buildServer` hands back what it
 * built with this — assertable where it is decided rather than where it is
 * assembled, because a test of this function alone stays green through a
 * refactor that inlines the object below and loses the transport with it.
 */
function authEnv(env: ServerEnv): AuthEnv {
  return {
    baseURL: env.baseURL,
    secret: env.secret,
    trustedOrigins: [env.webOrigin, env.baseURL].filter((o): o is string => Boolean(o)),
    github: env.github,
    adminEmail: env.adminEmail,
    workspaceName: env.workspaceName,
    fetchClientMetadataResource,
  };
}

/**
 * Builds the fully wired Node app. Separate from the listener so tests can
 * drive it with Request objects — and so the background runner starts beside
 * the listener rather than inside `createApp`, which owns no schedule on
 * either runtime (apps/server/src/runner.ts).
 */
export function buildServer(env: ServerEnv) {
  if (env.databasePath !== ":memory:")
    mkdirSync(dirname(resolve(env.databasePath)), { recursive: true });
  const { db, close } = openDatabase({
    path: env.databasePath,
    migrationsFolder: env.migrationsFolder,
  });
  const origin = [env.webOrigin, env.baseURL].filter((o): o is string => Boolean(o));
  const identity = authEnv(env);
  const auth = createAuth({ db, env: identity });
  const app = createApp({ db, auth, origin, baseURL: env.baseURL, secret: env.secret });
  if (env.webDist) mountSpa(app, resolve(env.webDist));
  return { app, db, close, authEnv: identity };
}
