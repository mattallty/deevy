import { serve } from "@hono/node-server";
import { readEnv } from "./env.ts";
import { buildServer } from "./server.ts";

const env = readEnv();
const { app, close } = buildServer(env);

const server = serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`deevy listening on http://localhost:${info.port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close();
    close();
    process.exit(0);
  });
}
