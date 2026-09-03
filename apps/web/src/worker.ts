import { createDb } from "@deevy/adapters/workers";
import { createApp } from "@deevy/core/app";

interface Env {
  DB: Parameters<typeof createDb>[0];
}

// M0 smoke build (ADR-0006): the core app on workerd with D1 storage and no
// auth. Sign-in on Workers arrives with M3.
export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const app = createApp({ db: createDb(env.DB), origin: [new URL(request.url).origin] });
    return app.fetch(request);
  },
};
