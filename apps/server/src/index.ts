import { createTimerCron } from "@deevy/adapters/node";
import { serve } from "@hono/node-server";
import { readEnv } from "./env.ts";
import { startRunner } from "./runner.ts";
import { buildServer } from "./server.ts";

const env = readEnv();
const { app, db, close } = buildServer(env);

const server = serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`deevy listening on http://localhost:${info.port}`);
});

// The background work runs beside the listener, never inside createApp: the
// Cloudflare Worker calls createApp per request (apps/server/src/runner.ts).
const runner = startRunner({
  db,
  cron: createTimerCron(),
  staleMinutes: env.runStaleMinutes,
  sweepIntervalSeconds: env.sweepIntervalSeconds,
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close();
    // The sweep in flight finishes before the database closes under it.
    void runner.stop().then(() => {
      close();
      process.exit(0);
    });
  });
}
