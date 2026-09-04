/**
 * The far side of a webhook, as far as a Worker under test can tell
 * (docs/plans/m3.md slice 9).
 *
 * A subscription URL has to be https (packages/core/src/operations/shared.ts)
 * and a server on 127.0.0.1 has no certificate workerd would accept, so this
 * maps the one host the smoke subscribes to onto the plain HTTP receiver the
 * script is counting POSTs at. The port travels in the URL, so nothing has to
 * be passed in, and every other host — GitHub included — goes straight past.
 *
 * Prepended to the built bundle beside scripts/stub-github.js: the signature,
 * the body, the retry and the delivery row are all the real ones, and only the
 * transport underneath them is the smoke's.
 */
const beyond = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (url.hostname !== "receiver.smoke.test") return beyond(input, init);

  url.protocol = "http:";
  url.hostname = "127.0.0.1";
  // Rebuilt field by field rather than handed the Request as an init: a body
  // that is still a stream needs `duplex`, and deevy's POSTs are small JSON.
  const body =
    request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
  return beyond(url.toString(), { method: request.method, headers: request.headers, body });
};
