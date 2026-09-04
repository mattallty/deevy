/**
 * The transport `@better-auth/cimd` fetches a Client ID Metadata Document
 * with. An MCP client identifies itself by an HTTPS URL rather than a
 * pre-registered id (MCP 2026-07-28), so deevy dereferences a URL an unknown
 * caller chose: the transport is the SSRF boundary, and the plugin makes it the
 * application's to supply for exactly that reason.
 *
 * `@better-auth/cimd/node` ships a stricter one built on `node:dns` and
 * `node:https`. deevy does not use it: `packages/core` is web-standard only
 * (ADR-0006), and M3's Cloudflare Worker has no DNS-resolution primitive at all,
 * so the runtime that matters most could never run it. What is here instead
 * refuses every non-HTTPS scheme, every host that is not publicly routable, and
 * every redirect, and bounds the request in time and size. What it cannot do is
 * pin the address between the check and the connection, so a name that resolves
 * to a public address and then to a private one is not caught (docs/OPERATIONS.md).
 * A deployment that wants that guarantee passes its own transport as
 * `AuthEnv.fetchClientMetadataResource`.
 */

/** How long a metadata document has to arrive. */
const TIMEOUT_MS = 5_000;

/** How much of one a response may be. Draft-02 documents are a few hundred bytes. */
const MAX_BYTES = 128 * 1024;

export type MetadataResourceFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Fetches a CIMD-owned HTTPS resource: the metadata document itself, and any
 * resource it names, such as its `jwks_uri`. A refusal is an error rather than
 * a response, so the plugin fails the client rather than parsing our reason.
 */
export const fetchClientMetadataResource: MetadataResourceFetch = async (input, init) => {
  const url = new URL(urlOf(input));
  if (url.protocol !== "https:") {
    throw new Error("A client metadata resource must be an https URL");
  }
  if (url.username || url.password) {
    throw new Error("A client metadata resource URL must carry no credentials");
  }
  if (!isPubliclyRoutable(url.hostname)) {
    throw new Error(`Refusing to fetch a client metadata resource from ${url.hostname}`);
  }
  const response = await fetch(url, {
    ...init,
    // Never followed: a redirect could leave the address this check approved.
    redirect: "manual",
    signal: init?.signal ?? AbortSignal.timeout(TIMEOUT_MS),
  });
  return bounded(response);
};

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** The response, refused rather than read past `MAX_BYTES`. */
function bounded(response: Response): Response {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    throw new Error("Client metadata resource is too large");
  }
  if (!response.body) return response;
  let seen = 0;
  const limited = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > MAX_BYTES) {
          controller.error(new Error("Client metadata resource is too large"));
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
  return new Response(limited, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/** Reserved IPv4 blocks a metadata document must never be fetched from. */
const reservedV4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

/**
 * Whether a host may be dereferenced. A name is judged by its shape alone,
 * because resolving it here and connecting later would be the very race this
 * cannot close; the literals are judged exactly.
 */
export function isPubliclyRoutable(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host) return false;
  const v4 = parseIpv4(host);
  if (v4 !== null) {
    return !reservedV4.some(([network, bits]) => inNetwork(v4, parseIpv4(network) as number, bits));
  }
  if (host.includes(":")) return isPublicIpv6(host);
  // A single-label name is an intranet name (`localhost`, a container name);
  // the special-use suffixes never leave a private network either (RFC 6762).
  if (!host.includes(".")) return false;
  return !/\.(local|localhost|internal|intranet|home|corp|lan)$/.test(host);
}

function parseIpv4(host: string): number | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

function inNetwork(address: number, network: number, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (address & mask) >>> 0 === (network & mask) >>> 0;
}

function isPublicIpv6(host: string): boolean {
  if (host === "::" || host === "::1") return false;
  // An IPv4-mapped or IPv4-compatible address is judged as the IPv4 it carries.
  const embedded = /^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/.exec(host);
  if (embedded?.[1]) return isPubliclyRoutable(embedded[1]);
  // Unique-local (fc00::/7), link-local (fe80::/10), and the unspecified block.
  return !/^(f[cd]|fe[89ab])/.test(host);
}
