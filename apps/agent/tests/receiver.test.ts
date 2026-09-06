import { signPayload } from "@deevy/core";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { startLoop } from "../src/loop.ts";
import { createReceiver, startListener, verifySignature } from "../src/receiver.ts";
import { finished, instance, scripted } from "./helpers.ts";

const closers: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const secret = "a-secret-only-deevy-and-the-receiver-hold";
const body = JSON.stringify({ seq: 12, kind: "run.started", subjectId: "run-1" });

function headers(signature: string, delivery = "delivery-1") {
  return { "deevy-signature": signature, "deevy-delivery": delivery };
}

describe("verifying what deevy signed", () => {
  /**
   * The check a shared function could never make: deevy produces the header and
   * something that has never seen its code verifies it. That is what the rule
   * against importing `packages/core` buys (docs/plans/m4.md).
   */
  it("accepts a header deevy's own signer wrote", async () => {
    const signature = await signPayload(secret, new Date(), body);

    expect(verifySignature({ secret, header: signature, body })).toBe(true);
  });

  it("refuses a signature that is right for different bytes", async () => {
    const signature = await signPayload(secret, new Date(), body);

    expect(verifySignature({ secret, header: signature, body: `${body} ` })).toBe(false);
  });

  it("refuses a body that was parsed and serialised again", async () => {
    const signature = await signPayload(secret, new Date(), body);
    // The mistake docs/OPERATIONS.md warns about: same JSON, different bytes.
    const round = JSON.stringify(JSON.parse(body) as unknown, null, 2);

    expect(verifySignature({ secret, header: signature, body: round })).toBe(false);
  });

  it("refuses a signature older than the window, however valid", async () => {
    const then = new Date(Date.now() - 6 * 60_000);
    const signature = await signPayload(secret, then, body);

    expect(verifySignature({ secret, header: signature, body })).toBe(false);
    // The timestamp is inside the signed message, so moving the clock is the
    // only thing that would make it live again.
    expect(verifySignature({ secret, header: signature, body, now: then })).toBe(true);
  });

  it("refuses another secret, a malformed header and no header at all", async () => {
    const signature = await signPayload("someone-else's-secret", new Date(), body);

    expect(verifySignature({ secret, header: signature, body })).toBe(false);
    expect(verifySignature({ secret, header: "nonsense", body })).toBe(false);
    expect(verifySignature({ secret, header: undefined, body })).toBe(false);
    expect(verifySignature({ secret, header: "t=abc,v1=00", body })).toBe(false);
  });
});

describe("a delivery", () => {
  it("wakes the loop once, however many times it is redelivered", async () => {
    let wakes = 0;
    const receiver = createReceiver({ secret, wake: () => (wakes += 1) });
    const signature = await signPayload(secret, new Date(), body);

    expect(receiver.receive(headers(signature), body)).toMatchObject({ status: 200, woke: true });
    // Every retry of one Event carries the same delivery id.
    expect(receiver.receive(headers(signature), body)).toMatchObject({ status: 200, woke: false });
    expect(wakes).toBe(1);
  });

  it("wakes nothing when it does not verify", async () => {
    let wakes = 0;
    const receiver = createReceiver({ secret, wake: () => (wakes += 1) });

    const refused = receiver.receive(headers("t=1,v1=deadbeef", "d-9"), body);

    expect(refused).toMatchObject({ status: 401, woke: false });
    expect(wakes).toBe(0);
  });

  it("forgets the oldest ids rather than remembering every delivery forever", async () => {
    let wakes = 0;
    const receiver = createReceiver({ secret, wake: () => (wakes += 1), remember: 2 });
    const signature = await signPayload(secret, new Date(), body);

    for (const delivery of ["a", "b", "c", "a"]) {
      receiver.receive(headers(signature, delivery), body);
    }

    expect(wakes).toBe(4);
  });
});

describe("the listener", () => {
  it("answers a delivery over a real socket, and says it is alive", async () => {
    let wakes = 0;
    const listener = await startListener({
      port: 0,
      receiver: createReceiver({ secret, wake: () => (wakes += 1) }),
    });
    closers.push(() => listener.close());
    const signature = await signPayload(secret, new Date(), body);

    const health = await fetch(`http://localhost:${listener.port}/healthz`);
    const delivered = await fetch(`http://localhost:${listener.port}/`, {
      method: "POST",
      headers: headers(signature),
      body,
    });

    expect(health.status).toBe(200);
    expect(delivered.status).toBe(200);
    expect(wakes).toBe(1);
  });

  it("is health only when no secret is configured, and takes no deliveries", async () => {
    const listener = await startListener({ port: 0 });
    closers.push(() => listener.close());

    expect((await fetch(`http://localhost:${listener.port}/healthz`)).status).toBe(200);
    expect((await fetch(`http://localhost:${listener.port}/`, { method: "POST" })).status).toBe(
      404,
    );
  });
});

/** Resolves on the nth pass, so a test waits for the loop rather than for a clock. */
function passes() {
  const waiting: Array<() => void> = [];
  let seen = 0;
  return {
    get seen() {
      return seen;
    },
    onPass: () => {
      seen += 1;
      for (const resolve of waiting.splice(0)) resolve();
    },
    next: () => new Promise<void>((resolve) => waiting.push(resolve)),
  };
}

describe("waking the loop", () => {
  it("makes the next pass happen now rather than at the next interval", async () => {
    const it = await instance();
    closers.push(it.close);
    const counted = passes();
    const first = counted.next();
    const loop = startLoop({
      deevy: it.deevy,
      proxy: it.proxy,
      runTimeoutMs: 5_000,
      // An hour, so a second pass arriving at all can only be the wake.
      pollSeconds: 3600,
      session: scripted([finished]),
      onPass: counted.onPass,
    });
    closers.push(() => loop.stop());

    await first;
    expect(counted.seen).toBe(1);
    const second = counted.next();
    loop.wake();
    await second;

    expect(counted.seen).toBe(2);
  });

  it("carries no authority: the pass it starts reads deevy and decides for itself", async () => {
    const it = await instance();
    closers.push(it.close);
    // Nothing is assigned, so a delivery that claims otherwise costs one poll.
    const counted = passes();
    const first = counted.next();
    let worked = 0;
    const loop = startLoop({
      deevy: it.deevy,
      proxy: it.proxy,
      runTimeoutMs: 5_000,
      pollSeconds: 3600,
      session: scripted([finished]),
      onPass: (pass) => {
        worked += pass.worked.length + pass.resumed.length + pass.takenUp.length;
        counted.onPass();
      },
    });
    closers.push(() => loop.stop());

    await first;
    const second = counted.next();
    loop.wake();
    await second;

    expect(counted.seen).toBe(2);
    expect(worked).toBe(0);
  });
});
