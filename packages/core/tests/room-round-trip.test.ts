import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { createRouterClient } from "@orpc/server";
import * as Y from "yjs";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createRoomServer, serveRoomSocket } from "../src/room-server.ts";
import { router } from "../src/operations/index.ts";
import { memberContext, testDb, type MemberContext } from "./helpers.ts";

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

/**
 * A WebSocket that goes nowhere: the client half is what the provider drives,
 * and everything it sends is handed straight to the room. No port, no protocol
 * of our own — the real messages, in one process.
 */
function loopback(open: (socket: LoopbackServerHalf) => void) {
  return class LoopbackSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    binaryType = "arraybuffer";
    readyState = 0;
    private listeners: Record<string, Array<(event: unknown) => void>> = {};
    // Both shapes, because the provider uses one for the socket and the other
    // for the document on it, and a fake that offers only one is silent.
    onopen: ((event: unknown) => void) | null = null;
    onmessage: ((event: unknown) => void) | null = null;
    onclose: ((event: unknown) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    private server: LoopbackServerHalf;

    constructor(_url: string) {
      this.server = {
        readyState: 1,
        send: (data) => {
          const bytes =
            typeof data === "string"
              ? new TextEncoder().encode(data)
              : data instanceof Uint8Array
                ? data
                : new Uint8Array(data);
          // A copy, because lib0 hands back views into a shared buffer and the
          // client decodes its own frame rather than whatever else was in it.
          const frame = bytes.slice();
          queueMicrotask(() => this.emit("message", { data: frame.buffer }));
        },
        close: (code = 1000, reason = "") => {
          this.readyState = 3;
          queueMicrotask(() => this.emit("close", { code, reason }));
        },
        deliver: () => undefined,
      };
      open(this.server);
      // A task rather than a microtask: the provider is built in two halves —
      // the socket, then the document on it — and a socket that opened before
      // the second half existed would send its first message into nothing.
      setTimeout(() => {
        this.readyState = 1;
        this.emit("open", {});
      }, 0);
    }

    private emit(type: string, event: unknown) {
      for (const listener of this.listeners[type] ?? []) listener(event);
      const handler = { open: this.onopen, message: this.onmessage, close: this.onclose }[type];
      handler?.(event);
    }

    addEventListener(type: string, listener: (event: unknown) => void) {
      (this.listeners[type] ??= []).push(listener);
    }

    removeEventListener(type: string, listener: (event: unknown) => void) {
      this.listeners[type] = (this.listeners[type] ?? []).filter((one) => one !== listener);
    }

    send(data: ArrayBuffer | Uint8Array) {
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
      this.server.deliver(bytes.slice());
    }

    close() {
      this.readyState = 3;
      this.server.onClientClose?.();
      queueMicrotask(() => this.emit("close", { code: 1000, reason: "" }));
    }
  };
}

interface LoopbackServerHalf {
  readyState: number;
  send: (data: ArrayBuffer | Uint8Array | string) => void;
  close: (code?: number, reason?: string) => void;
  /** Set by `serveRoomSocket`: how a client's bytes reach the room. */
  deliver: (data: Uint8Array) => void;
  onClientClose?: () => void;
}

async function withIssue(db: MemberContext["db"]) {
  const admin = await memberContext(db, { role: "admin", name: "Ada" });
  const client = createRouterClient(router, { context: admin });
  await client.projects.create({ name: "deevy", key: "DEV" });
  await client.issues.create({ projectKey: "DEV", title: "Ship it" });
  return admin;
}

/** A provider on the given room, over a socket that reaches `server` in-process. */
function join(server: ReturnType<typeof createRoomServer>, name: string, doc: Y.Doc) {
  // The socket is its own object in v4, and it is the half that takes the
  // WebSocket implementation — here, one that reaches the room in-process.
  const websocketProvider = new HocuspocusProviderWebsocket({
    url: "ws://loopback/collab",
    WebSocketPolyfill: loopback((half) => {
      serveRoomSocket(server, half, new Request("https://deevy.test/collab"));
    }),
  });
  const provider = new HocuspocusProvider({
    websocketProvider,
    name,
    document: doc,
    token: "cookie",
  });
  // A provider handed a socket it did not make does not attach itself: that is
  // how one socket carries several Documents, and it is the client shape the
  // SPA will use too.
  provider.attach();
  closers.push(() => {
    provider.destroy();
    websocketProvider.destroy();
  });
  return provider;
}

const settle = async (times = 40) => {
  for (let index = 0; index < times; index++) await new Promise((r) => setTimeout(r, 5));
};

describe("two Members in one room", () => {
  it("shows each of them what the other typed", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await withIssue(db);
    const server = createRoomServer({ contextFrom: async () => admin });

    const ada = new Y.Doc();
    const grace = new Y.Doc();
    const hers = join(server, "document:DEV-1:intent", ada);
    join(server, "document:DEV-1:intent", grace);
    await settle();

    // The socket really opened and the room really let her in, so what follows
    // is a test of the room rather than of two Y.Docs sitting in silence.
    expect(hers.isAuthenticated).toBe(true);

    ada.getText("body").insert(0, "The problem is real. ");
    await settle();

    expect(grace.getText("body").toJSON()).toBe("The problem is real. ");

    // And the other way, so this is a room rather than a broadcast.
    grace.getText("body").insert(21, "Go and spec it.");
    await settle();
    expect(ada.getText("body").toJSON()).toBe("The problem is real. Go and spec it.");
  });

  it("keeps two rooms on one Issue apart", async () => {
    const { db, close } = testDb();
    closers.push(close);
    const admin = await withIssue(db);
    const server = createRoomServer({ contextFrom: async () => admin });

    // The intent Document and the Issue's own description: two texts, two
    // rooms, one Issue and one socket each.
    const intent = new Y.Doc();
    const alsoIntent = new Y.Doc();
    const description = new Y.Doc();
    join(server, "document:DEV-1:intent", intent);
    join(server, "document:DEV-1:intent", alsoIntent);
    join(server, "description:DEV-1", description);
    await settle();

    intent.getText("body").insert(0, "why");
    await settle();

    // The other Member in the same room has it; the description does not.
    expect(alsoIntent.getText("body").toJSON()).toBe("why");
    expect(description.getText("body").toJSON()).toBe("");
  });

  it("closes the socket of somebody who may not be in the room", async () => {
    const { db, close } = testDb();
    closers.push(close);
    await withIssue(db);
    const planner = await memberContext(db, { kind: "agent", name: "Planner" });
    const server = createRoomServer({ contextFrom: async () => planner });

    const doc = new Y.Doc();
    const provider = join(server, "document:DEV-1:intent", doc);
    await settle();

    // An Agent writes markdown; the room is not for it (ADR-0021). A Human on
    // the same Issue is let in, so this is the rule and not a broken socket.
    expect(provider.isAuthenticated).toBe(false);
    expect(doc.getText("body").toJSON()).toBe("");

    const human = await memberContext(db, { name: "Grace" });
    const open = createRoomServer({ contextFrom: async () => human });
    const hers = join(open, "document:DEV-1:intent", new Y.Doc());
    await settle();
    expect(hers.isAuthenticated).toBe(true);
  });
});
