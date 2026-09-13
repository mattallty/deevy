import { Hocuspocus } from "@hocuspocus/server";
import { ORPCError } from "@orpc/server";
import type { AppContext, ContextFor } from "./operations/registry.ts";
import { authorizeRoom, type Room } from "./rooms.ts";

/**
 * The room server: one live text per Document, and per Issue description, that
 * several Members may type in at once (docs/plans/collaborative-documents.md,
 * ADR-0021). Hocuspocus holds the Yjs documents and speaks the protocol; what
 * is deevy's is the hooks — who may join, and what a version is.
 *
 * It is not an operation and does not pretend to be one (ADR-0009 stands):
 * nothing travels over this socket but Yjs updates and awareness, and every
 * rule it applies is the one the Document's own operations apply.
 */
export interface RoomServerOptions {
  /**
   * The same context the rest of the app builds per request — `buildContext` in
   * `app.ts`, over the upgrade request's own headers, so a room is joined with
   * the session the page was loaded with. Injected rather than imported so a
   * test can hand over a caller without minting a session for them.
   */
  contextFrom: (request: Request) => Promise<AppContext>;
}

/** What every later hook is given about a connection. */
export interface RoomContext {
  member: ContextFor<"member">["member"];
  room: Room;
  issueKey: string;
  issueId: string;
  /** The Document's id, or null for an Issue's description. */
  documentId: string | null;
}

/** Hocuspocus hands this the document name and the upgrade request, and nothing else. */
export interface Joining {
  documentName: string;
  request: Request;
}

/**
 * Who may open this room, as a function, so it can be tested without a socket.
 * Throws the same refusals the operations throw: UNAUTHORIZED for a caller who
 * is no Member, FORBIDDEN for an Agent, NOT_FOUND for a room that is not ours.
 */
export function roomAuthenticator({ contextFrom }: RoomServerOptions) {
  return async ({ documentName, request }: Joining): Promise<RoomContext> => {
    const context = await contextFrom(request);
    if (!context.member || !context.workspace) {
      throw new ORPCError("UNAUTHORIZED", {
        message: "Sign in to open this Document",
      });
    }

    const opened = await authorizeRoom(context as ContextFor<"member">, documentName);
    return {
      member: context.member,
      room: opened.room,
      issueKey: opened.issue.key,
      issueId: opened.issue.id,
      documentId: opened.document?.id ?? null,
    };
  };
}

/** The server itself: the hooks above, wired to Hocuspocus. */
export function createRoomServer(options: RoomServerOptions): Hocuspocus {
  const authenticate = roomAuthenticator(options);
  return new Hocuspocus({
    // Every connection authenticates; there is no anonymous room.
    onAuthenticate: (payload) =>
      authenticate({ documentName: payload.documentName, request: payload.request }),
  });
}

/**
 * The socket half of a connection, which every runtime spells differently: a
 * `ws` socket on Node, one end of a `WebSocketPair` in a Durable Object. All
 * the room needs is somewhere to send bytes and somewhere to hear them, so
 * that is all this asks for — and it is why the same room serves both.
 */
export interface RoomSocket {
  send(data: ArrayBuffer | Uint8Array | string): void;
  close(code?: number, reason?: string): void;
  readonly readyState: number;
  /** Called by the runtime for each frame the client sent. */
  deliver?: (data: Uint8Array) => void;
  onClientClose?: () => void;
}

/** What a runtime's own socket looks like: the WHATWG interface, as far as it goes. */
export interface RuntimeSocket {
  readyState: number;
  send(data: ArrayBuffer | Uint8Array | string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, listener: (event: never) => void): void;
}

/**
 * A `RoomSocket` over a runtime's own WebSocket: one end of a `WebSocketPair`
 * in a Durable Object, a `ws` socket on Node. Both dispatch `message` and
 * `close` events, and both hand the bytes over in whichever shape they feel
 * like — an `ArrayBuffer`, a view onto one — so this is where that is settled.
 */
export function roomSocket(ws: RuntimeSocket): RoomSocket {
  const socket: RoomSocket = {
    send: (data) => {
      ws.send(data);
    },
    close: (code, reason) => {
      ws.close(code, reason);
    },
    get readyState() {
      return ws.readyState;
    },
  };
  ws.addEventListener("message", ((event: { data: ArrayBuffer | Uint8Array | string }) => {
    const { data } = event;
    if (typeof data === "string") return;
    socket.deliver?.(data instanceof Uint8Array ? data : new Uint8Array(data));
  }) as (event: never) => void);
  ws.addEventListener("close", (() => {
    socket.onClientClose?.();
  }) as (event: never) => void);
  return socket;
}

/**
 * Hand a socket to the room. Hocuspocus does not listen to the socket itself —
 * `handleConnection` gives back a connection, and whoever owns the socket feeds
 * it (`handleMessage`, `handleClose`). That indirection is the whole reason one
 * room implementation runs on two runtimes, so this is the only place that
 * knows how the two are joined.
 */
export function serveRoomSocket(server: Hocuspocus, socket: RoomSocket, request: Request): void {
  const connection = server.handleConnection(socket, request);
  socket.deliver = (data) => {
    connection.handleMessage(data);
  };
  socket.onClientClose = () => {
    connection.handleClose();
  };
}
