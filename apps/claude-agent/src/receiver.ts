import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";

/**
 * deevy telling the runtime there is work, so a Run starts when it arrives
 * rather than when the interval comes round.
 *
 * Written here against `docs/OPERATIONS.md` rather than imported from
 * `packages/core`, and the boundary rule that forbids the import is the point:
 * this is the first thing anywhere that verifies a deevy signature without also
 * having produced it. A test signs with deevy's own signer and verifies with
 * this, which is the check a shared function could never make.
 */
export interface VerifyInput {
  secret: string;
  /** The `deevy-signature` header as it arrived. */
  header: string | undefined;
  /** The raw body, exactly as it was read off the wire. */
  body: string;
  now?: Date;
  toleranceSeconds?: number;
}

/** `t=<unix seconds>,v1=<hex>`, HMAC-SHA256 over `<seconds>.<the raw body>`. */
export function verifySignature(input: VerifyInput): boolean {
  const parts = new Map(
    (input.header ?? "")
      .split(",")
      .map((part) => part.trim().split("="))
      .filter((pair): pair is [string, string] => pair.length === 2),
  );
  const seconds = Number(parts.get("t"));
  if (!Number.isFinite(seconds)) return false;

  const now = input.now ?? new Date();
  const tolerance = input.toleranceSeconds ?? 5 * 60;
  // The timestamp is inside the signed message, so it cannot be moved forward
  // to keep an old body alive; this is the receiver refusing one that was not.
  if (Math.abs(Math.floor(now.getTime() / 1000) - seconds) > tolerance) return false;

  const expected = createHmac("sha256", input.secret)
    .update(`${seconds}.${input.body}`)
    .digest("hex");
  const given = Buffer.from(parts.get("v1") ?? "", "utf8");
  const mine = Buffer.from(expected, "utf8");
  return given.length === mine.length && timingSafeEqual(given, mine);
}

export interface ReceiverOptions {
  /** The secret chosen when the Agent's webhook URL was set. */
  secret: string;
  /** Called when a delivery verifies. It takes no argument, and that is the point. */
  wake: () => void;
  now?: () => Date;
  /** How many delivery ids to remember, so a redelivery wakes nothing twice. */
  remember?: number;
}

export interface Received {
  status: number;
  body: string;
  /** Whether this delivery woke the loop. */
  woke: boolean;
}

export interface Receiver {
  /** One delivery, from its headers and the bytes of its body. */
  receive(headers: Record<string, string | undefined>, body: string): Received;
}

/**
 * A delivery is a hint that there may be work, and carries no authority beyond
 * that: the pass that follows re-reads `runs.list` and decides for itself. A
 * body that lies costs one wasted poll, which is the right blast radius for an
 * endpoint on the public internet.
 */
export function createReceiver(options: ReceiverOptions): Receiver {
  const limit = options.remember ?? 512;
  const seen = new Set<string>();

  return {
    receive(headers, body) {
      const verified = verifySignature({
        secret: options.secret,
        header: headers["deevy-signature"],
        body,
        ...(options.now ? { now: options.now() } : {}),
      });
      if (!verified) return { status: 401, body: "bad signature", woke: false };

      // Every retry of one Event carries the same delivery id, so this is what
      // makes an at-least-once sender cost one wake.
      const delivery = headers["deevy-delivery"];
      if (delivery && seen.has(delivery)) return { status: 200, body: "seen", woke: false };
      if (delivery) {
        if (seen.size >= limit) seen.delete(seen.values().next().value as string);
        seen.add(delivery);
      }

      options.wake();
      return { status: 200, body: "ok", woke: true };
    },
  };
}

export interface ListenerOptions {
  port: number;
  /** Absent when no secret is configured: the runtime polls and listens to nobody. */
  receiver?: Receiver;
}

export interface Listener {
  port: number;
  close(): Promise<void>;
}

/**
 * The listener, on `node:http` so the runtime keeps its one dependency.
 *
 * The body is read as bytes and verified as the string they decode to, never
 * re-serialised: parsing the JSON and stringifying it again changes the body,
 * and the signature is over what was sent.
 */
export function startListener(options: ListenerOptions): Promise<Listener> {
  const server: Server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/healthz") {
      response.writeHead(200).end("ok");
      return;
    }
    const receiver = options.receiver;
    if (request.method !== "POST" || !receiver) {
      response.writeHead(404).end("not found");
      return;
    }
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const headers: Record<string, string | undefined> = {};
      for (const [name, value] of Object.entries(request.headers)) {
        headers[name] = Array.isArray(value) ? value[0] : value;
      }
      const received = receiver.receive(headers, Buffer.concat(chunks).toString("utf8"));
      response.writeHead(received.status).end(received.body);
    });
  });

  return new Promise((resolve) => {
    server.listen(options.port, () => {
      const address = server.address();
      resolve({
        port: typeof address === "object" && address ? address.port : options.port,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}
