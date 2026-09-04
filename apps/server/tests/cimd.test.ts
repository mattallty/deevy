import { createServer, type AddressInfo } from "node:net";
import { describe, expect, it } from "vite-plus/test";
import { createStrictMetadataFetch } from "../src/cimd.ts";

describe("the strict client metadata transport", () => {
  it("refuses a name that resolves to a private address", async () => {
    const fetchResource = createStrictMetadataFetch({
      lookup: async () => [{ address: "10.0.0.1", family: 4 }],
    });

    await expect(fetchResource("https://mcp.example.com/client")).rejects.toThrow(/10\.0\.0\.1/);
  });

  /**
   * The case a shape check can never catch. The resolver answers a public
   * address first — which passes — and a private one on every call after,
   * which is what a rebinding attack looks like from inside the process.
   *
   * What tells the two transports apart is the error, not the listener. A
   * transport that re-resolves for the connection hands the name to Node,
   * `mcp.example.com` resolves nowhere, and the attempt dies in DNS with
   * ENOTFOUND before a socket is opened. One that pins the answer it checked
   * dials 203.0.113.9 — TEST-NET-3, which answers nothing — and ends on the
   * signal or on a connect error carrying that address. `contacted` is a
   * backstop against the second answer being used, not the discriminator:
   * neither transport would ever reach the listener below for this name.
   */
  it("connects to the address it checked, not to the one that answers next", async () => {
    const listener = createServer();
    let contacted = 0;
    listener.on("connection", (socket) => {
      contacted += 1;
      socket.destroy();
    });
    await new Promise<void>((ready) => listener.listen(0, "127.0.0.1", ready));
    const { port } = listener.address() as AddressInfo;

    let lookups = 0;
    const fetchResource = createStrictMetadataFetch({
      lookup: async () => {
        lookups += 1;
        return lookups === 1
          ? [{ address: "203.0.113.9", family: 4 }]
          : [{ address: "127.0.0.1", family: 4 }];
      },
    });

    const thrown = await fetchResource(`https://mcp.example.com:${port}/client`, {
      signal: AbortSignal.timeout(1500),
    }).then(
      () => undefined,
      (error: unknown) => error as { code?: string; message?: string; address?: string },
    );

    expect(thrown).toBeDefined();
    expect(thrown?.code).not.toBe("ENOTFOUND");
    expect(`${thrown?.message} ${thrown?.address ?? ""}`).toMatch(/203\.0\.113\.9|aborted/);
    expect({ contacted, lookups }).toEqual({ contacted: 0, lookups: 1 });
    await new Promise<void>((closed) => listener.close(() => closed()));
  });
});
