/**
 * The transport `@better-auth/cimd` fetches a Client ID Metadata Document
 * with. An MCP client identifies itself by an HTTPS URL rather than a
 * pre-registered id (MCP 2026-07-28), so deevy dereferences a URL an unknown
 * caller chose: the transport is the SSRF boundary, and the plugin makes it the
 * application's to supply for exactly that reason.
 *
 * This is the transport the Cloudflare Worker uses, and it is the weaker of
 * deevy's two. It refuses every non-HTTPS scheme, every URL carrying
 * credentials, every host that is not publicly routable, every redirect and
 * every response over 128 KB; then, for a name, it asks a resolver over HTTPS
 * for A and AAAA and refuses the name if any answer is private. That last step
 * is new in M3 and closes the door on every name that resolves privately at the
 * moment of the check. What it cannot close is the gap between the check and
 * the connection: `fetch` resolves the name again itself, so a name that
 * answers publicly here and privately a millisecond later is still not caught.
 *
 * That is a workerd limitation, not a choice. M3 spiked the two ways out and
 * took neither: `cf.resolveOverride` only redirects to a host proxied on the
 * Worker's own zone, and `connect()` from `cloudflare:sockets` — which can pin
 * an address and still validate the certificate against the name, via an
 * undocumented `startTls({ expectedServerHostname })` — is blocked in
 * production for Cloudflare's own IP ranges, where a large share of the
 * internet's CIMD hosts live. `wrangler dev --local` allows both, so no test
 * on workerd could tell the difference (docs/OPERATIONS.md).
 *
 * On Node there is no such gap: `apps/server/src/cimd.ts` resolves once,
 * checks every answer with the rules below, and hands the connection a lookup
 * that can only return the answer that passed. It is wired in as
 * `AuthEnv.fetchClientMetadataResource`, the seam M2 left for exactly this.
 */

/** How long a metadata document has to arrive. */
const TIMEOUT_MS = 5_000;

/** How much of one a response may be. Draft-02 documents are a few hundred bytes. */
const MAX_BYTES = 128 * 1024;

export type MetadataResourceFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

/** The resolver a name is checked against before it is dereferenced. */
const DEFAULT_RESOLVER = "https://cloudflare-dns.com/dns-query";

export interface ClientMetadataFetchOptions {
  /**
   * The DNS-over-HTTPS endpoint the pre-resolution asks. Anything speaking the
   * `application/dns-json` profile Cloudflare and Google both serve.
   */
  resolver?: string;
  /** The transport's only contact with the outside world. */
  fetch?: typeof globalThis.fetch;
}

/**
 * A transport that resolves the name over HTTPS first, refuses it if any
 * answer is not publicly routable, and only then fetches by name. That closes
 * the door on every name resolving privately at the moment of the check; what
 * it cannot close is the gap between that check and the connection, because
 * workerd offers no way to fetch by address while keeping the name for SNI
 * and certificate validation (docs/OPERATIONS.md).
 */
export function createClientMetadataFetch(
  options: ClientMetadataFetchOptions = {},
): MetadataResourceFetch {
  const resolver = options.resolver ?? DEFAULT_RESOLVER;
  const call = options.fetch ?? globalThis.fetch;
  return async (input, init) => {
    const url = checkMetadataUrl(input);
    await assertResolvesPublicly(url.hostname, resolver, call);
    const response = await call(url, {
      ...init,
      // Never followed: a redirect could leave the address this check approved.
      redirect: "manual",
      signal: init?.signal ?? AbortSignal.timeout(TIMEOUT_MS),
    });
    return boundMetadataResponse(response);
  };
}

/** A `data` string from every A and AAAA answer the resolver returns. */
interface DnsJsonAnswer {
  type: number;
  data: string;
}

async function assertResolvesPublicly(
  hostname: string,
  resolver: string,
  call: typeof globalThis.fetch,
): Promise<void> {
  // A literal was judged exactly by the shape check; there is nothing to ask.
  if (!isName(hostname)) return;
  const answers = await Promise.all([
    resolveOverHttps(hostname, "A", resolver, call),
    resolveOverHttps(hostname, "AAAA", resolver, call),
  ]);
  const addresses = answers.flat();
  if (addresses.length === 0) {
    throw new Error(`${hostname} resolves to no address`);
  }
  for (const address of addresses) {
    if (!isPubliclyRoutable(address)) {
      throw new Error(
        `Refusing to fetch a client metadata resource: ${hostname} resolves to ${address}`,
      );
    }
  }
}

async function resolveOverHttps(
  hostname: string,
  type: "A" | "AAAA",
  resolver: string,
  call: typeof globalThis.fetch,
): Promise<string[]> {
  const query = new URL(resolver);
  query.searchParams.set("name", hostname);
  query.searchParams.set("type", type);
  const response = await call(query, {
    headers: { accept: "application/dns-json" },
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Could not resolve ${hostname}: the resolver answered ${response.status}`);
  }
  const body = (await response.json()) as { Answer?: DnsJsonAnswer[] };
  const wanted = type === "A" ? 1 : 28;
  return (body.Answer ?? [])
    .filter((answer) => answer.type === wanted)
    .map((answer) => answer.data);
}

/** Whether a host is a name rather than an address literal. */
function isName(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "");
  return !host.includes(":") && !/^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

/**
 * Fetches a CIMD-owned HTTPS resource: the metadata document itself, and any
 * resource it names, such as its `jwks_uri`. A refusal is an error rather than
 * a response, so the plugin fails the client rather than parsing our reason.
 */
export const fetchClientMetadataResource: MetadataResourceFetch = createClientMetadataFetch();

/**
 * The URL a metadata resource may be fetched from, refused as an error rather
 * than a response so the plugin fails the client rather than parsing our
 * reason. Shared with the Node transport, which applies the same rules to the
 * addresses the name resolves to (apps/server/src/cimd.ts).
 */
export function checkMetadataUrl(input: RequestInfo | URL): URL {
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
  return url;
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** The response, refused if it redirects or runs past `MAX_BYTES`. */
export function boundMetadataResponse(response: Response): Response {
  // A metadata document is fetched at an address this transport approved, and
  // a redirect is an invitation to leave it. Refused rather than handed back,
  // so a 302 cannot reach the plugin as a document it fails to parse. 304 is
  // not one of those: the plugin revalidates a cached document and reads the
  // answer, so the one 3xx carrying no Location goes through.
  if (response.status >= 300 && response.status < 400 && response.status !== 304) {
    throw new Error("A client metadata resource must not redirect");
  }
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
