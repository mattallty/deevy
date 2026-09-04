import { describe, expect, it } from "vite-plus/test";
import { createClientMetadataFetch } from "../src/cimd.ts";

/**
 * One DNS-over-HTTPS answer in the JSON form Cloudflare and Google both
 * serve. The shape is copied from a live `cloudflare-dns.com` reply for
 * `example.com` rather than from the implementation: `Status`, then `Answer`
 * entries carrying a numeric `type` (1 for A, 28 for AAAA) and a `data`
 * string.
 */
function dnsJson(type: 1 | 28, addresses: string[]): Response {
  return Response.json({
    Status: 0,
    Question: [{ name: "mcp.example.com", type }],
    Answer: addresses.map((data) => ({ name: "mcp.example.com", type, TTL: 51, data })),
  });
}

interface StubOptions {
  /** What the resolver answers, by record type. */
  a?: string[];
  aaaa?: string[];
  /** What the document itself answers. */
  document?: () => Response;
}

/** The transport's only contact with the outside world, and its record of it. */
function stub(options: StubOptions) {
  const asked: string[] = [];
  const fetch: typeof globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    asked.push(url.href);
    if (url.hostname.endsWith("dns.com") || url.pathname === "/dns-query") {
      const type = url.searchParams.get("type");
      if (type === "AAAA") return dnsJson(28, options.aaaa ?? []);
      return dnsJson(1, options.a ?? []);
    }
    return options.document?.() ?? Response.json({ client_name: "Example" });
  };
  return { asked, fetch };
}

describe("the Workers client metadata transport", () => {
  it("refuses a document whose name resolves to a private address", async () => {
    const { asked, fetch } = stub({ a: ["10.0.0.1"] });
    const fetchResource = createClientMetadataFetch({ fetch });

    await expect(fetchResource("https://mcp.example.com/client")).rejects.toThrow(/10\.0\.0\.1/);
    expect(asked.some((href) => href.startsWith("https://mcp.example.com/"))).toBe(false);
  });

  it("fetches a document whose name resolves publicly, asking for A and AAAA", async () => {
    const { asked, fetch } = stub({
      a: ["104.20.23.154", "172.66.147.243"],
      aaaa: ["2606:4700:10::ac42:93f3"],
      document: () => Response.json({ client_name: "Example", redirect_uris: [] }),
    });
    const fetchResource = createClientMetadataFetch({ fetch });

    const response = await fetchResource("https://mcp.example.com/client");

    expect(await response.json()).toEqual({ client_name: "Example", redirect_uris: [] });
    expect(asked).toEqual([
      "https://cloudflare-dns.com/dns-query?name=mcp.example.com&type=A",
      "https://cloudflare-dns.com/dns-query?name=mcp.example.com&type=AAAA",
      "https://mcp.example.com/client",
    ]);
  });

  it("refuses a redirect rather than following it or handing it back", async () => {
    const { fetch } = stub({
      a: ["104.20.23.154"],
      document: () =>
        new Response(null, { status: 302, headers: { location: "https://elsewhere.example/" } }),
    });
    const fetchResource = createClientMetadataFetch({ fetch });

    await expect(fetchResource("https://mcp.example.com/client")).rejects.toThrow(/redirect/i);
  });

  it("refuses a scheme that is not https and a URL carrying credentials", async () => {
    const { asked, fetch } = stub({ a: ["104.20.23.154"] });
    const fetchResource = createClientMetadataFetch({ fetch });

    await expect(fetchResource("http://mcp.example.com/client")).rejects.toThrow(/https/);
    await expect(fetchResource("https://user:pass@mcp.example.com/client")).rejects.toThrow(
      /credentials/,
    );
    expect(asked).toEqual([]);
  });

  it("refuses a document larger than 128 KB, declared or not", async () => {
    const oversize = "x".repeat(128 * 1024 + 1);
    const declared = stub({
      a: ["104.20.23.154"],
      document: () =>
        new Response(oversize, { headers: { "content-length": String(oversize.length) } }),
    });
    await expect(
      createClientMetadataFetch({ fetch: declared.fetch })("https://mcp.example.com/client"),
    ).rejects.toThrow(/too large/);

    const chunked = stub({
      a: ["104.20.23.154"],
      document: () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(oversize));
              controller.close();
            },
          }),
        ),
    });
    const response = await createClientMetadataFetch({ fetch: chunked.fetch })(
      "https://mcp.example.com/client",
    );

    await expect(response.text()).rejects.toThrow(/too large/);
  });

  /**
   * The plugin revalidates a cached document with `If-None-Match` and reads
   * the 304 it hopes for (`@better-auth/cimd` 1.7.2), so "refuses a redirect"
   * has to mean the 3xx that carry a Location and not the one that does not.
   */
  it("passes a 304 through, so a conditional revalidation still works", async () => {
    const { fetch } = stub({
      a: ["104.20.23.154"],
      document: () => new Response(null, { status: 304, headers: { etag: '"v1"' } }),
    });

    const response = await createClientMetadataFetch({ fetch })("https://mcp.example.com/client", {
      headers: { "if-none-match": '"v1"' },
    });

    expect(response.status).toBe(304);
  });
});
