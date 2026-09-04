/**
 * Drives the built Worker over HTTP on workerd (docs/plans/m3.md slices 4 and 5).
 *
 * `wrangler dev --local` is miniflare with a real local D1, so this needs no
 * Cloudflare account. It is a script rather than a vitest file because
 * apps/web's test environment is jsdom and this is neither jsdom nor node's
 * own: what it tests is the deployed shape, bindings and asset routing
 * included, which a unit test of anything the Worker calls cannot see.
 *
 * Three phases, three servers, over one build and one D1. The first serves
 * deevy on a configured origin the request did not arrive on, which is how it
 * proves the bindings reached the app. The second signs a Human in, and a
 * sign-in needs BETTER_AUTH_URL to be the origin the browser is on — so it
 * picks its port first, and takes the stubbed GitHub with it. The third fires
 * the Cron Trigger by hand and watches the background work happen on D1, and
 * it signs in too, because what it reads back it reads over the API.
 */
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const here = new URL(".", import.meta.url).pathname;
const wrangler = join(here, "../node_modules/.bin/wrangler");
const vp = join(here, "../node_modules/.bin/vp");
/** What the Cloudflare plugin writes: the committed configuration plus the built assets. */
const config = join(here, "../dist/deevy/wrangler.json");
const database = "deevy";
/**
 * The configured origin of the first phase, deliberately not the one the
 * request arrives on: the RFC 9728 challenge names it, so a challenge carrying
 * it proves readWorkerEnv reached the app.
 *
 * Every binding rides on `--var` rather than `.dev.vars`, which wrangler
 * resolves beside the configuration it was handed: naming the built one skips
 * the developer's own file, and that is what these runs want.
 */
const baseURL = "https://deevy.example.test";
/** The email DEEVY_ADMIN_EMAIL names, whose first sign-in bootstraps the Workspace. */
const adminEmail = "ada@flippable.net";

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

export interface StartOptions {
  /** The wrangler configuration to serve, which decides the Worker bundle. */
  config: string;
  /** 0 lets wrangler choose; a sign-in needs a port its BETTER_AUTH_URL can name. */
  port: number;
  /** What `readWorkerEnv` will see, as `wrangler dev --var` pairs. */
  vars: Record<string, string>;
}

/** wrangler dev, up and answering, and the origin it chose. */
function start(
  persistTo: string,
  options: StartOptions,
): Promise<{ origin: string; child: ChildProcess }> {
  const child = spawn(
    wrangler,
    [
      "dev",
      "--local",
      "--config",
      options.config,
      "--persist-to",
      persistTo,
      "--ip",
      "127.0.0.1",
      ...Object.entries(options.vars).flatMap(([name, value]) => ["--var", `${name}:${value}`]),
      "--port",
      String(options.port),
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

/** A port nothing else holds, so BETTER_AUTH_URL can name the origin in advance. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => {
        resolve(port);
      });
    });
  });
}

/**
 * The same built Worker with GitHub replaced, and the configuration that
 * serves it. Better Auth hardcodes GitHub's endpoints, so the seam is the
 * isolate's global `fetch`: scripts/stub-github.js goes in front of the bundle
 * and everything else — the D1 binding, the routing table, createApp itself —
 * is what a deployment gets (docs/plans/m3.md slice 5).
 */
async function stubbedGitHub(): Promise<string> {
  const stubConfig = join(here, "../dist/deevy/wrangler.github-stub.json");
  const stubMain = "index.github-stub.js";
  const [stub, bundle, written] = await Promise.all([
    readFile(join(here, "stub-github.js"), "utf8"),
    readFile(join(here, "../dist/deevy/index.js"), "utf8"),
    readFile(config, "utf8"),
  ]);
  await writeFile(join(here, "../dist/deevy", stubMain), `${stub}\n${bundle}`);
  await writeFile(stubConfig, JSON.stringify({ ...JSON.parse(written), main: stubMain }));
  return stubConfig;
}

/** Every cookie a response set, as one request header. */
function cookiesOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

interface SignedIn {
  /** Where Better Auth sent the browser next: `/api/auth/error?...` when it refused. */
  location: string;
  /** The session cookie the Worker minted. */
  cookie: string;
}

/**
 * One Human signing in with GitHub, as the browser would do it: ask for the
 * authorization URL, then come back to the callback with the state it carried
 * and the code GitHub would have handed out. The code is the email address,
 * which is how the stub knows who arrived.
 */
async function signIn(origin: string, email: string): Promise<SignedIn> {
  const started = await fetch(`${origin}/api/auth/sign-in/social`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "github", callbackURL: "/" }),
  });
  const text = await started.text();
  let url: string | undefined;
  try {
    url = (JSON.parse(text) as { url?: string }).url;
  } catch {
    url = undefined;
  }
  if (!url) {
    throw new Error(
      `no authorization URL for ${email}: ${String(started.status)} ${text.slice(0, 200)}`,
    );
  }
  const state = new URL(url).searchParams.get("state") ?? "";

  const callback = await fetch(
    `${origin}/api/auth/callback/github?state=${encodeURIComponent(state)}&code=${encodeURIComponent(email)}`,
    { headers: { cookie: cookiesOf(started) }, redirect: "manual" },
  );
  return { location: callback.headers.get("location") ?? "", cookie: cookiesOf(callback) };
}

interface RpcResult {
  status: number;
  /** The `json` field of an oRPC response, or null when there was none to read. */
  output: unknown;
  body: string;
  /** What the response called itself, or "" when it said nothing. */
  contentType: string;
  /**
   * Whether the body was JSON at all. A failed parse is a fact a caller can
   * assert on rather than something this helper swallows: an error page that
   * happens to contain the right word is exactly what "in JSON" rules out.
   */
  parsed: boolean;
}

/** One oRPC call over the Worker's /rpc surface, as the SPA makes it. */
async function rpc(
  origin: string,
  procedure: string,
  input: unknown,
  cookie?: string,
): Promise<RpcResult> {
  const response = await fetch(`${origin}/rpc/${procedure}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ json: input }),
  });
  const body = await response.text();
  let output: unknown = null;
  let parsed = false;
  try {
    output = (JSON.parse(body) as { json?: unknown }).json;
    parsed = true;
  } catch {
    output = null;
  }
  return {
    status: response.status,
    output,
    body,
    contentType: response.headers.get("content-type") ?? "",
    parsed,
  };
}

/** One statement or many, against the local D1 this run persists to. */
function execute(persistTo: string, sql: string): Promise<void> {
  return run(wrangler, [
    "d1",
    "execute",
    database,
    "--local",
    "--config",
    config,
    "--persist-to",
    persistTo,
    "--command",
    sql,
  ]);
}

/** The Issue every seeded Run is on, so the phase can ask for them by key. */
const sweptIssueKey = "SWP-1";

/**
 * An Agent with `count` Runs that have been silent for 31 minutes, straight
 * into the tables of the D1 the sign-in phase left behind.
 *
 * Seeded rather than driven through the API for two reasons: an Agent has one
 * open Run per Issue, so sixty of them is not a shape the API will make, and
 * the server is down while this runs, which keeps one SQLite file to one
 * writer. The Agent gets no schedule, so the only sweep with anything to do is
 * the stale one.
 */
function seedSilentRuns(persistTo: string, count: number): Promise<void> {
  const silentFor = 31 * 60 * 1000;
  const runs = Array.from(
    { length: count },
    (_, at) =>
      `('swept-run-${String(at)}', 'swept-issue', 'swept-member', 'manual', 'active', ` +
      `cast(unixepoch('subsecond') * 1000 as integer) - ${String(silentFor)})`,
  ).join(", ");
  return execute(
    persistTo,
    [
      `INSERT INTO user (id, name, email, kind) VALUES ('swept-user', 'Sweeper', 'sweeper@example.test', 'agent')`,
      `INSERT INTO member (id, workspace_id, user_id, role, kind) SELECT 'swept-member', id, 'swept-user', 'member', 'agent' FROM workspace LIMIT 1`,
      `INSERT INTO agent (member_id) VALUES ('swept-member')`,
      `INSERT INTO project (id, workspace_id, key, name) SELECT 'swept-project', id, 'SWP', 'Sweeping' FROM workspace LIMIT 1`,
      `INSERT INTO workflow_state (id, project_id, name, position, category) VALUES ('swept-state', 'swept-project', 'Doing', 1, 'active')`,
      `INSERT INTO issue (id, project_id, number, title, state_id) VALUES ('swept-issue', 'swept-project', 1, 'Ship the thing', 'swept-state')`,
      `INSERT INTO run (id, issue_id, agent_member_id, trigger, status, last_activity_at) VALUES ${runs}`,
    ].join("; "),
  );
}

/**
 * Fires one Cron Trigger and waits for it, which is what the response means:
 * workerd holds the invocation open for `ctx.waitUntil`, so a 200 here is the
 * pass having finished and an exception in it comes back as a 500.
 *
 * `wrangler dev --test-scheduled` advertises `/__scheduled` for this, and on a
 * Worker that also serves assets it does not work: the path is not in
 * `assets.run_worker_first` — and must not be, since `createApp` does not
 * mount it — so the asset handler answers with the SPA's index.html and a 200
 * that ran nothing. `/cdn-cgi/handler/scheduled` is the route `/__scheduled`
 * forwards to, and `/cdn-cgi/*` is the platform's, so nothing intercepts it.
 */
async function trigger(origin: string): Promise<number> {
  const fired = await fetch(
    `${origin}/cdn-cgi/handler/scheduled?cron=${encodeURIComponent("* * * * *")}`,
  );
  await fired.text();
  return fired.status;
}

/** The status of every Run on the swept Issue, as the API reports them. */
async function sweptStatuses(origin: string, cookie: string): Promise<string[]> {
  const listed = await rpc(origin, "runs/list", { issueKey: sweptIssueKey, limit: 200 }, cookie);
  const runs = (listed.output as { runs?: Array<{ status?: string }> } | null)?.runs;
  if (!runs) throw new Error(`the Runs could not be read: ${listed.body.slice(0, 300)}`);
  return runs.map((run) => run.status ?? "");
}

/** How many Runs the Event log says went stale, and which ones. */
async function wentStale(origin: string, cookie: string): Promise<string[]> {
  const listed = await rpc(origin, "events/list", { limit: 500 }, cookie);
  const events = (listed.output as { events?: Array<{ kind?: string; subjectId?: string }> } | null)
    ?.events;
  if (!events) throw new Error(`the Events could not be read: ${listed.body.slice(0, 300)}`);
  return events.filter((event) => event.kind === "run.went_stale").map((e) => e.subjectId ?? "");
}

function countOf(statuses: string[], status: string): number {
  return statuses.filter((each) => each === status).length;
}

/** Slice 6: the background work, on a Cron Trigger, inside one trigger's budget. */
async function backgroundWorkOnACronTrigger(origin: string): Promise<void> {
  const admin = await signIn(origin, adminEmail);
  if (admin.cookie.length === 0) throw new Error(`the admin could not sign in: ${admin.location}`);

  // A trigger has a CPU budget and a per-invocation query cap, and Cloudflare
  // brings it back a minute later, so the Worker asks for one pass of twenty
  // and no more. Sixty due Runs and one trigger states that as a fact.
  const status = await trigger(origin);
  const afterOne = await sweptStatuses(origin, admin.cookie);
  const eventsAfterOne = await wentStale(origin, admin.cookie);
  check(
    "one trigger moves one bounded pass of the backlog, and no more",
    status === 200 && countOf(afterOne, "stale") === 20,
    `status ${String(status)}, ${String(countOf(afterOne, "stale"))} of ${String(afterOne.length)} stale`,
  );
  check(
    "every Run it moved says so in a run.went_stale Event",
    eventsAfterOne.length === 20 && new Set(eventsAfterOne).size === 20,
    `${String(eventsAfterOne.length)} Events, ${String(new Set(eventsAfterOne).size)} distinct`,
  );

  await trigger(origin);
  await trigger(origin);
  const afterThree = await sweptStatuses(origin, admin.cookie);
  check(
    "three triggers move all sixty",
    countOf(afterThree, "stale") === 60,
    `${String(countOf(afterThree, "stale"))} of ${String(afterThree.length)} stale`,
  );

  // Nothing is due any more, and a Run already `stale` is never swept twice:
  // the sweep only ever looks at `pending` and `active`. So the Event log holds
  // one run.went_stale per seeded Run and the fourth trigger adds none. Counted
  // as an array either side of that trigger, not only as a set of subjects: a
  // second Event for a Run already stale would leave the set at sixty, and the
  // set is what makes the rest of this check readable.
  const before = await wentStale(origin, admin.cookie);
  await trigger(origin);
  const after = await wentStale(origin, admin.cookie);
  const stale = new Set(after);
  const seeded = Array.from({ length: 60 }, (_, at) => `swept-run-${String(at)}`);
  check(
    "a further trigger changes nothing, and every Run has exactly its own Event",
    countOf(await sweptStatuses(origin, admin.cookie), "stale") === 60 &&
      after.length === 60 &&
      after.length === before.length &&
      stale.size === 60 &&
      seeded.every((id) => stale.has(id)),
    `${String(after.length)} Events after the trigger and ${String(before.length)} before, ${String(stale.size)} distinct for ${String(seeded.filter((id) => stale.has(id)).length)} of the seeded Runs`,
  );
}

const failures: string[] = [];
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) console.log(`  ok  ${name}`);
  else failures.push(detail ? `${name}: ${detail}` : name);
}

/** wrangler dev for the length of one phase, and down again whatever happens. */
async function withServer(
  persistTo: string,
  options: StartOptions,
  phase: (origin: string) => Promise<void>,
): Promise<void> {
  const { origin, child } = await start(persistTo, options);
  try {
    await phase(origin);
  } finally {
    child.kill("SIGTERM");
  }
}

/** Slice 4: everything deevy serves that needs no signed-in Human. */
async function theWorkerServesDeevy(origin: string): Promise<void> {
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

  const unauthenticated = await rpc(origin, "me/get", undefined);
  check(
    "an unauthenticated /rpc call is UNAUTHORIZED, in JSON",
    unauthenticated.status === 401 &&
      unauthenticated.contentType.includes("application/json") &&
      unauthenticated.parsed &&
      unauthenticated.body.includes("UNAUTHORIZED"),
    `status ${String(unauthenticated.status)}, ${unauthenticated.contentType || "no content-type"}${
      unauthenticated.parsed ? "" : ", unparseable"
    }: ${unauthenticated.body.slice(0, 200)}`,
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
}

/** Slice 5: a Human signs in with GitHub and lands in the Workspace, on D1. */
async function aHumanSignsIn(origin: string): Promise<void> {
  // The isolate is built by whichever request arrives first, and this phase
  // makes that a request needing no auth on purpose. Better Auth starts
  // initialising in its constructor and workerd abandons the I/O still in
  // flight when the request that began it returns, so unless the Worker
  // finishes that initialisation before answering, the sign-in below awaits a
  // `$context` that never settles and hangs until wrangler closes the socket
  // (apps/web/src/worker.ts). A sign-in that arrives first would build the app
  // and await it inside its own live request, and never see the bug.
  const health = await fetch(`${origin}/healthz`);
  check(
    "a request that needs no auth builds the isolate",
    health.status === 200,
    `status ${String(health.status)}`,
  );

  const admin = await signIn(origin, adminEmail);
  check(
    "the admin email's sign-in mints a session cookie",
    admin.cookie.length > 0 && !admin.location.includes("/api/auth/error"),
    `sent to ${admin.location || "nowhere"}`,
  );

  const members = await rpc(origin, "members/list", {}, admin.cookie);
  const listed = (members.output as { members?: Array<Record<string, unknown>> } | null)?.members;
  check(
    "the admin email's sign-in creates the Workspace and one admin Member on D1",
    members.status === 200 &&
      listed?.length === 1 &&
      listed[0]?.role === "admin" &&
      listed[0]?.kind === "human",
    `status ${String(members.status)}: ${members.body.slice(0, 300)}`,
  );

  const events = await rpc(origin, "events/list", {}, admin.cookie);
  const kinds = ((events.output as { events?: Array<{ kind?: string }> } | null)?.events ?? []).map(
    (event) => event.kind,
  );
  check(
    "it appends workspace.created then member.joined",
    kinds.join(",") === "workspace.created,member.joined",
    `events ${kinds.join(",") || "none"}`,
  );

  // Both hooks run again on the second sign-in, and both are idempotent: the
  // Workspace is created once and the admin joins it once (ADR-0007).
  const again = await signIn(origin, adminEmail);
  check(
    "a second sign-in adds nothing",
    (await membersOn(origin, again.cookie)).length === 1 &&
      (await eventKindsOn(origin, again.cookie)).length === kinds.length,
    "the Workspace or the Event log grew",
  );

  const anonymous = await rpc(origin, "members/list", {});
  check(
    "only the session cookie the Worker minted authenticates /rpc/members.list",
    anonymous.status === 401 && (await membersOn(origin, admin.cookie)).length === 1,
    `an anonymous call was ${String(anonymous.status)}`,
  );

  const rule = await rpc(
    origin,
    "allowlist/add",
    { kind: "email_domain", value: "example.com" },
    admin.cookie,
  );
  if (rule.status !== 200) throw new Error(`the allowlist rule was refused: ${rule.body}`);

  const joined = await whoAmI(origin, await signIn(origin, "bob@example.com"));
  check(
    "a sign-in matching an allowlisted email domain auto-joins",
    joined.user?.email === "bob@example.com" && joined.member?.role === "member",
    JSON.stringify(joined),
  );

  const refused = await whoAmI(origin, await signIn(origin, "carol@example.org"));
  check(
    "a sign-in matching nothing gets a user row and no Member",
    refused.user?.email === "carol@example.org" && refused.member === null,
    JSON.stringify(refused),
  );
}

interface WhoAmI {
  user?: { email?: string };
  member?: { role?: string } | null;
}

/** What deevy says about the Human behind a session: the user row, and the Member or none. */
async function whoAmI(origin: string, session: SignedIn): Promise<WhoAmI> {
  const response = await rpc(origin, "me/get", undefined, session.cookie);
  return (response.output as WhoAmI | null) ?? {};
}

/** The Workspace's Members, as this caller sees them. */
async function membersOn(origin: string, cookie: string): Promise<Array<Record<string, unknown>>> {
  const response = await rpc(origin, "members/list", {}, cookie);
  return (response.output as { members?: Array<Record<string, unknown>> } | null)?.members ?? [];
}

/** Every Event in the Workspace, in order, as this caller sees them. */
async function eventKindsOn(origin: string, cookie: string): Promise<string[]> {
  const response = await rpc(origin, "events/list", {}, cookie);
  const events = (response.output as { events?: Array<{ kind?: string }> } | null)?.events ?? [];
  return events.map((event) => event.kind ?? "");
}

const persistTo = await mkdtemp(join(tmpdir(), "deevy-worker-"));
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

  await withServer(
    persistTo,
    { config, port: 0, vars: { BETTER_AUTH_URL: baseURL } },
    theWorkerServesDeevy,
  );

  // A sign-in needs BETTER_AUTH_URL to be the origin the browser actually
  // uses, because that is what the OAuth callback and the session cookie are
  // built from (docs/OPERATIONS.md). So this phase picks the port first, and
  // keeps its own server rather than weakening the one above, whose whole
  // point is a configured origin the request did not arrive on.
  const port = await freePort();
  await withServer(
    persistTo,
    {
      config: await stubbedGitHub(),
      port,
      vars: {
        BETTER_AUTH_URL: `http://127.0.0.1:${String(port)}`,
        BETTER_AUTH_SECRET: "smoke-secret-that-is-at-least-32-characters",
        GITHUB_CLIENT_ID: "stub-client-id",
        GITHUB_CLIENT_SECRET: "stub-client-secret",
        DEEVY_ADMIN_EMAIL: adminEmail,
        DEEVY_WORKSPACE_NAME: "Flippable",
      },
    },
    aHumanSignsIn,
  );

  // The Cron Trigger, on the Workspace the sign-in just created. The rows go
  // in while nothing is serving, so one SQLite file has one writer, and the
  // phase reads them back over the API rather than reaching past the Worker.
  await seedSilentRuns(persistTo, 60);
  const cronPort = await freePort();
  await withServer(
    persistTo,
    {
      config: await stubbedGitHub(),
      port: cronPort,
      vars: {
        BETTER_AUTH_URL: `http://127.0.0.1:${String(cronPort)}`,
        BETTER_AUTH_SECRET: "smoke-secret-that-is-at-least-32-characters",
        GITHUB_CLIENT_ID: "stub-client-id",
        GITHUB_CLIENT_SECRET: "stub-client-secret",
        DEEVY_ADMIN_EMAIL: adminEmail,
        DEEVY_WORKSPACE_NAME: "Flippable",
      },
    },
    backgroundWorkOnACronTrigger,
  );
} finally {
  await rm(persistTo, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`\nthe Worker did not serve deevy:\n${failures.map((f) => `  ${f}`).join("\n")}`);
  process.exit(1);
}
console.log("\nthe Worker serves deevy");
