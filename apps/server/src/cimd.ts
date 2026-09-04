import { lookup as dnsLookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import {
  boundMetadataResponse,
  checkMetadataUrl,
  isPubliclyRoutable,
  type MetadataResourceFetch,
} from "@deevy/core/cimd";

/**
 * The strict transport, and the one place deevy's DNS-rebinding gap actually
 * closes. `packages/core/src/cimd.ts` judges a host by its shape and, on
 * Workers, asks a resolver over HTTPS first — but workerd offers no way to
 * fetch by address while keeping the name for SNI and certificate validation,
 * so the answer it checked and the address it connects to are not provably the
 * same. Node has `node:dns` and `node:https`, so here they are: resolve once,
 * check every answer against the rules the core applies to literals, and hand
 * the connection a lookup that can only return the answer that passed
 * (docs/OPERATIONS.md).
 *
 * It lives in the Node entry rather than in `packages/adapters`, where
 * docs/plans/m3.md put it, for one mechanical reason: it needs the core's
 * policy, `packages/core` devDepends on `@deevy/adapters` for the database its
 * tests open, and `vp run -r test` refuses the cycle the reverse dependency
 * would make. `apps/server` already depends on both, and is the only entry
 * that can run this anyway.
 *
 * `@better-auth/cimd/node` ships a transport of this shape and deevy does not
 * use it: it resolves through `node:dns` directly, so no test can stand a
 * resolver in front of it, and it applies its own routability rules and
 * neither the size bound nor the timeout the core transport applies. This one
 * shares the core's whole non-network policy, so the two targets differ in
 * exactly one thing — the pin.
 */

/** How long a metadata document has to arrive, matching the core transport. */
const TIMEOUT_MS = 5_000;

/** One answer from a resolver: the address, and the family it belongs to. */
export interface ResolvedAddress {
  address: string;
  family: number;
}

/** How a name becomes addresses. Every answer must pass before any is used. */
export type AddressLookup = (hostname: string) => Promise<ResolvedAddress[]>;

export interface StrictMetadataFetchOptions {
  /** Defaults to `node:dns`, which is the only reason this cannot be in the core. */
  lookup?: AddressLookup;
}

const defaultLookup: AddressLookup = (hostname) =>
  dnsLookup(hostname, { all: true, verbatim: true });

export function createStrictMetadataFetch(
  options: StrictMetadataFetchOptions = {},
): MetadataResourceFetch {
  const lookup = options.lookup ?? defaultLookup;
  return async (input, init) => {
    const url = checkMetadataUrl(input);
    const address = await pinnedAddress(url.hostname, lookup);
    const response = await get(url, address, init);
    return boundMetadataResponse(response);
  };
}

/** The transport `apps/server` wires in, resolving through `node:dns`. */
export const fetchClientMetadataResource = createStrictMetadataFetch();

/**
 * The one address the connection may use: resolve once, refuse the name if any
 * answer is not publicly routable, and pin the first that is. Refusing on any
 * answer rather than filtering is deliberate — a name that answers with a
 * public and a private address is a name under someone else's control.
 */
async function pinnedAddress(hostname: string, lookup: AddressLookup): Promise<ResolvedAddress> {
  const answers = await lookup(hostname);
  if (answers.length === 0) {
    throw new Error(`${hostname} resolves to no address`);
  }
  for (const answer of answers) {
    if (!isPubliclyRoutable(answer.address)) {
      throw new Error(
        `Refusing to fetch a client metadata resource: ${hostname} resolves to ${answer.address}`,
      );
    }
  }
  return answers[0] as ResolvedAddress;
}

/**
 * A GET to the pinned address with the name kept for the Host header, the TLS
 * server name and certificate validation. `lookup` is what pins it: whatever
 * the name resolves to a moment later, this connection cannot go there.
 */
function get(url: URL, pinned: ResolvedAddress, init: RequestInit | undefined): Promise<Response> {
  const literal = isIP(url.hostname.replace(/^\[|\]$/g, "")) !== 0;
  const signal = init?.signal ?? AbortSignal.timeout(TIMEOUT_MS);
  const headers = Object.fromEntries(new Headers(init?.headers).entries());
  headers.host = url.host;
  return new Promise((resolve, reject) => {
    const outgoing = request(
      url,
      {
        agent: false,
        method: "GET",
        headers,
        ...(literal ? {} : { servername: url.hostname }),
        signal,
        // The agent asks for `all`, and a callback that answers with a bare
        // string then fails the connection with "Invalid IP address:
        // undefined" — which is how `@better-auth/cimd/node` 1.7.2 pins, and
        // one of the reasons this transport is deevy's own.
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, [pinned]);
          else callback(null, pinned.address, pinned.family);
        },
      },
      (incoming) => {
        const status = incoming.statusCode ?? 502;
        // A 204/205/304 carries no body, and neither does a refused redirect.
        const empty = status === 204 || status === 205 || status === 304;
        // Nothing will read it, and an unread socket is a held socket.
        if (empty) incoming.resume();
        resolve(
          new Response(empty ? null : (Readable.toWeb(incoming) as ReadableStream<Uint8Array>), {
            status,
            ...(incoming.statusMessage ? { statusText: incoming.statusMessage } : {}),
            headers: responseHeaders(incoming.headers),
          }),
        );
      },
    );
    outgoing.once("error", reject);
    outgoing.end();
  });
}

function responseHeaders(raw: NodeJS.Dict<string | string[]>): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(raw)) {
    if (Array.isArray(value)) for (const item of value) headers.append(name, item);
    else if (value !== undefined) headers.append(name, value);
  }
  return headers;
}
