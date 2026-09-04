/**
 * Drives the built Worker over HTTP on workerd (docs/plans/m3.md slice 4).
 *
 * `wrangler dev --local` is miniflare with a real local D1, so this needs no
 * Cloudflare account. It is a script rather than a vitest file because
 * apps/web's test environment is jsdom and this is neither jsdom nor node's
 * own: what it tests is the deployed shape, bindings and asset routing
 * included, which a unit test of anything the Worker calls cannot see.
 */
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const here = new URL(".", import.meta.url).pathname;
const wrangler = join(here, "../node_modules/.bin/wrangler");
const vp = join(here, "../node_modules/.bin/vp");
/** What the Cloudflare plugin writes: the committed configuration plus the built assets. */
const config = join(here, "../dist/deevy/wrangler.json");
const database = "deevy";
/**
 * The one binding this slice's Worker reads. Its effect is visible: the RFC
 * 9728 challenge names the configured origin rather than the one the request
 * arrived on, so a challenge carrying it proves readWorkerEnv reached the app.
 *
 * It rides on `--var` rather than `.dev.vars`, which wrangler resolves beside
 * the configuration it was handed: naming the built one skips the developer's
 * own file, and that is what this run wants.
 */
const baseURL = "https://deevy.example.test";

const childEnv = { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" };

function run(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env: childEnv, ...options });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${String(code)}`)),
    );
  });
}

/**
 * The SPA and the Worker bundle wrangler serves. Always rebuilt: `wrangler dev`
 * reads the configuration the Cloudflare plugin writes, not the committed one,
 * so a left-over `dist` would answer for a routing table nobody has any more —
 * the exact silence this script exists to break (apps/web/vite.config.ts).
 */
async function build(): Promise<void> {
  await run(vp, ["build"], {
    cwd: join(here, ".."),
    env: { ...childEnv, DEEVY_TARGET: "workers" },
  });
}

/** wrangler dev, up and answering, and the origin it chose. */
function start(persistTo: string): Promise<{ origin: string; child: ChildProcess }> {
  const child = spawn(
    wrangler,
    [
      "dev",
      "--local",
      "--config",
      config,
      "--persist-to",
      persistTo,
      "--ip",
      "127.0.0.1",
      "--var",
      `BETTER_AUTH_URL:${baseURL}`,
      "--port",
      "0",
    ],
    { stdio: ["ignore", "pipe", "pipe"], env: childEnv },
  );
  return new Promise((resolve, reject) => {
    // Nothing outside this promise holds the process yet, so a start that never
    // finishes has to take its own server down with it.
    const fail = (error: Error) => {
      child.kill("SIGTERM");
      reject(error);
    };
    let output = "";
    const watch = (chunk: Buffer) => {
      output += chunk.toString();
      const ready = /Ready on (https?:\/\/[^\s]+?)\/?\s/.exec(output);
      if (ready?.[1]) resolve({ origin: ready[1], child });
    };
    child.stdout?.on("data", watch);
    child.stderr?.on("data", watch);
    child.on("error", reject);
    child.on("exit", (code) => {
      reject(new Error(`wrangler dev exited ${String(code)} before it was ready:\n${output}`));
    });
    setTimeout(() => {
      fail(new Error(`wrangler dev was not ready in 60s:\n${output}`));
    }, 60_000).unref();
  });
}

/** Two JSON documents compared by value, whatever whitespace they arrived in. */
function canonical(json: string): string {
  return JSON.stringify(JSON.parse(json));
}

const failures: string[] = [];
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) console.log(`  ok  ${name}`);
  else failures.push(detail ? `${name}: ${detail}` : name);
}

const persistTo = await mkdtemp(join(tmpdir(), "deevy-worker-"));
let server: ChildProcess | undefined;
try {
  await build();
  await run(wrangler, [
    "d1",
    "migrations",
    "apply",
    database,
    "--local",
    "--config",
    config,
    "--persist-to",
    persistTo,
  ]);

  const started = await start(persistTo);
  server = started.child;
  const { origin } = started;

  const health = await fetch(`${origin}/healthz`);
  const healthBody = (await health.json()) as { ok?: boolean };
  check(
    "/healthz answers",
    health.status === 200 && healthBody.ok === true,
    `status ${String(health.status)}`,
  );

  const docs = await fetch(`${origin}/api/docs`);
  check(
    "/api/docs renders",
    docs.status === 200 && (docs.headers.get("content-type") ?? "").includes("text/html"),
    `status ${String(docs.status)}, ${docs.headers.get("content-type") ?? "no content-type"}`,
  );

  const spec = await fetch(`${origin}/api/spec.json`);
  const committed = await readFile(join(here, "../../../packages/core/openapi.json"), "utf8");
  check(
    "/api/spec.json is the committed OpenAPI document",
    spec.status === 200 && canonical(await spec.text()) === canonical(committed),
    `status ${String(spec.status)}`,
  );

  // The pair run_worker_first gets wrong silently: both are 200, and only the
  // body says which handler answered.
  const spa = await fetch(`${origin}/issues/DEV-1`);
  const index = await readFile(join(here, "../dist/client/index.html"), "utf8");
  check(
    "/issues/DEV-1 is the SPA",
    spa.status === 200 && (await spa.text()) === index,
    `status ${String(spa.status)}`,
  );

  const issue = await fetch(`${origin}/api/issues/DEV-1`);
  check(
    "/api/issues/DEV-1 is the API",
    (issue.headers.get("content-type") ?? "").includes("application/json") && issue.status === 401,
    `status ${String(issue.status)}, ${issue.headers.get("content-type") ?? "no content-type"}`,
  );

  const rpc = await fetch(`${origin}/rpc/me/get`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ json: undefined }),
  });
  const rpcBody = await rpc.text();
  check(
    "an unauthenticated /rpc call is UNAUTHORIZED, in JSON",
    rpc.status === 401 &&
      (rpc.headers.get("content-type") ?? "").includes("application/json") &&
      JSON.stringify(JSON.parse(rpcBody)).includes("UNAUTHORIZED"),
    `status ${String(rpc.status)}: ${rpcBody.slice(0, 200)}`,
  );

  const mcp = await fetch(`${origin}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  check(
    "an unauthenticated POST /mcp is the RFC 9728 challenge, at the configured origin",
    mcp.status === 401 &&
      (mcp.headers.get("www-authenticate") ?? "").includes(
        `resource_metadata="${baseURL}/.well-known/oauth-protected-resource/mcp"`,
      ),
    `status ${String(mcp.status)}, ${mcp.headers.get("www-authenticate") ?? "no challenge"}`,
  );
} finally {
  server?.kill("SIGTERM");
  await rm(persistTo, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`\nthe Worker did not serve deevy:\n${failures.map((f) => `  ${f}`).join("\n")}`);
  process.exit(1);
}
console.log("\nthe Worker serves deevy");
