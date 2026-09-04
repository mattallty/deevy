/**
 * The smoke's own hand on the queue (docs/plans/m3.md slice 9).
 *
 * Queues are at-least-once, and nothing running locally will duplicate a
 * message on its own, so the script sends the second one itself: a POST to
 * /__smoke/enqueue puts exactly that job on the same binding `createApp`
 * produces to, and the Worker's own `queue` handler is what picks it up.
 *
 * This wraps the built entry rather than replacing anything in it: `queue`,
 * `scheduled` and every other request are forwarded untouched, so what the
 * phase drives is the deployed handler and not a copy of it.
 */
import worker from "./index.stub.js";

export default {
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname === "/__smoke/enqueue") {
      await env.JOBS.send(await request.json());
      return Response.json({ sent: true });
    }
    return worker.fetch(request, env, ctx);
  },
  scheduled: (controller, env, ctx) => worker.scheduled(controller, env, ctx),
  queue: (batch, env, ctx) => worker.queue(batch, env, ctx),
};
