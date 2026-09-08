/**
 * Screenshots of every screen, from a running instance, into docs/screens/
 * (docs/plans/ui-redesign.md slice 11). Drives the Google Chrome on this
 * machine headless over the DevTools protocol with Node's own WebSocket, so
 * it needs no dependency: the browser is the one already installed.
 *
 *   vp run web#screens
 *
 * Needs the `dev:stub` instance up on DEEVY_SCREENS_URL (default
 * http://localhost:5173) with a seeded database (docs/DEVELOPMENT.md,
 * "Running without an OAuth App"); it signs in as DEEVY_ADMIN_EMAIL through
 * the stub, the way the dev form does, then walks the routes below in light
 * and dark, at desktop and phone widths.
 */
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const origin = process.env.DEEVY_SCREENS_URL ?? "http://localhost:5173";
const email = process.env.DEEVY_ADMIN_EMAIL;
const chrome =
  process.env.DEEVY_SCREENS_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const out = resolve(import.meta.dirname, "../../../docs/screens");
const port = 9333;

if (!email) throw new Error("DEEVY_ADMIN_EMAIL is not set; it is who the screenshots sign in as");

type Shot = { name: string; path: string; theme?: "dark"; phone?: boolean; settle?: number };
const shots: Shot[] = [
  { name: "sign-in", path: "/" }, // taken before signing in
  { name: "issues", path: "/" },
  { name: "issues-peek", path: "/?peek=DEV-21" },
  { name: "issues-board", path: "/?view=board" },
  { name: "issue", path: "/issues/DEV-21" },
  { name: "inbox", path: "/inbox" },
  { name: "projects", path: "/projects" },
  { name: "project", path: "/projects/DEV" },
  { name: "board", path: "/projects/DEV/board" },
  { name: "workflow", path: "/projects/DEV/workflow" },
  { name: "settings-workspace", path: "/settings/workspace" },
  { name: "settings-agents", path: "/settings/agents" },
  { name: "settings-events", path: "/settings/events" },
  { name: "issues-dark", path: "/", theme: "dark" },
  { name: "issue-dark", path: "/issues/DEV-21", theme: "dark" },
  { name: "inbox-dark", path: "/inbox", theme: "dark" },
  { name: "issues-phone", path: "/", phone: true },
  { name: "issues-peek-phone", path: "/?peek=DEV-21", phone: true },
  { name: "inbox-phone", path: "/inbox", phone: true },
];

/** The little of the DevTools protocol this needs: send a command, await its result, watch one event. */
class Cdp {
  private seq = 0;
  private pending = new Map<
    number,
    (r: { result?: unknown; error?: { message: string } }) => void
  >();
  private listeners = new Set<(method: string, params: unknown) => void>();
  private socket: WebSocket;
  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener("message", (message) => {
      const data = JSON.parse(String(message.data)) as {
        id?: number;
        method?: string;
        params?: unknown;
        result?: unknown;
        error?: { message: string };
      };
      if (data.id !== undefined) {
        this.pending.get(data.id)?.(data);
        this.pending.delete(data.id);
      } else if (data.method) {
        for (const listener of this.listeners) listener(data.method, data.params);
      }
    });
  }
  static connect(url: string): Promise<Cdp> {
    return new Promise((done, fail) => {
      const socket = new WebSocket(url);
      socket.addEventListener("open", () => done(new Cdp(socket)));
      socket.addEventListener("error", () => fail(new Error(`could not connect to ${url}`)));
    });
  }
  send<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = ++this.seq;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((done, fail) => {
      this.pending.set(id, (reply) =>
        reply.error
          ? fail(new Error(`${method}: ${reply.error.message}`))
          : done(reply.result as T),
      );
    });
  }
  once(method: string): Promise<void> {
    return new Promise((done) => {
      const listener = (name: string) => {
        if (name !== method) return;
        this.listeners.delete(listener);
        done();
      };
      this.listeners.add(listener);
    });
  }
  close() {
    this.socket.close();
  }
}

async function evaluate<T>(page: Cdp, expression: string): Promise<T> {
  const { result } = await page.send<{ result: { value: T } }>("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  return result.value;
}

async function goto(page: Cdp, path: string, settle: number) {
  const loaded = page.once("Page.loadEventFired");
  await page.send("Page.navigate", { url: `${origin}${path}` });
  await loaded;
  await evaluate(page, "document.fonts.ready.then(() => true)");
  // Data arrives after the load event, and a peek mounts a beat after the page:
  // give it that beat, then wait until nothing on the page is still loading.
  await new Promise((wait) => setTimeout(wait, 400));
  for (let attempt = 0; attempt < 40; attempt++) {
    const loading = await evaluate<boolean>(
      page,
      `/Loading\\b|Searching…/.test(document.body.innerText) || document.querySelector('[aria-busy="true"]') !== null`,
    );
    if (!loading) break;
    await new Promise((wait) => setTimeout(wait, 250));
  }
  await new Promise((wait) => setTimeout(wait, settle));
}

async function viewport(page: Cdp, phone: boolean) {
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: phone ? 390 : 1280,
    height: phone ? 844 : 800,
    deviceScaleFactor: 1,
    mobile: phone,
  });
}

async function snap(page: Cdp, name: string) {
  const { data } = await page.send<{ data: string }>("Page.captureScreenshot", { format: "png" });
  await writeFile(join(out, `${name}.png`), Buffer.from(data, "base64"));
  console.log(`  ${name}.png`);
}

async function waitForChrome(): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
        method: "PUT",
      }).then((r) => r.json() as Promise<{ webSocketDebuggerUrl: string }>);
      return target.webSocketDebuggerUrl;
    } catch {
      await new Promise((wait) => setTimeout(wait, 200));
    }
  }
  throw new Error(`Chrome did not answer on port ${port}`);
}

const profile = await mkdtemp(join(tmpdir(), "deevy-screens-"));
const browser = spawn(
  chrome,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--window-size=1280,800",
    "about:blank",
  ],
  { stdio: "ignore" },
);
// Watched from the start: an exit that happens before the finally block is
// still seen, and a Chrome that cannot be started fails the run instead of
// hanging it — the cleanup below runs either way.
const exited = new Promise<void>((done, fail) => {
  browser.once("exit", () => done());
  browser.once("error", (error) => fail(new Error(`could not start ${chrome}: ${error.message}`)));
});
exited.catch(() => {});

try {
  await mkdir(out, { recursive: true });
  const page = await Promise.race([
    waitForChrome().then((url) => Cdp.connect(url)),
    exited.then(() => {
      throw new Error(`Chrome exited before it answered on port ${port}`);
    }),
  ]);
  await page.send("Page.enable");
  await viewport(page, false);

  console.log(`Screens from ${origin}, into ${out}`);
  const [signedOut, ...signedIn] = shots as [Shot, ...Shot[]];
  await goto(page, signedOut.path, 1500);
  await snap(page, signedOut.name);

  // The stub sign-in, as the dev form does it (apps/web/src/App.tsx DevSignIn).
  const state = await evaluate<string | null>(
    page,
    `fetch("/api/auth/sign-in/social", { method: "POST", credentials: "include",
       headers: { "content-type": "application/json" },
       body: JSON.stringify({ provider: "github", callbackURL: location.origin + "/" }) })
     .then((r) => r.json()).then((j) => new URL(j.url).searchParams.get("state"))`,
  );
  if (!state) throw new Error("the server did not start a sign-in; is DEEVY_DEV_STUB_OAUTH=1 set?");
  await goto(
    page,
    `/api/auth/callback/github?state=${encodeURIComponent(state)}&code=${encodeURIComponent(email)}`,
    1500,
  );
  const who = await evaluate<string>(page, "document.body.innerText.slice(0, 200)");
  if (/Sign in with GitHub/.test(who)) throw new Error(`sign-in as ${email} did not take`);

  // DEEVY_SCREENS_ONLY=issue,inbox-phone takes those shots alone (the sign-in one always).
  const only = process.env.DEEVY_SCREENS_ONLY?.split(",").map((name) => name.trim());
  for (const shot of signedIn.filter((candidate) => !only || only.includes(candidate.name))) {
    // A blank page between shots ends the previous document, and with it the
    // live Event stream it held open; a dozen of those in a row starve the next.
    const blank = page.once("Page.loadEventFired");
    await page.send("Page.navigate", { url: "about:blank" });
    await blank;
    await viewport(page, shot.phone ?? false);
    // next-themes reads this key; "light" is what the default resolves to on this machine's headless Chrome.
    await evaluate(
      page,
      `localStorage.setItem("theme", ${JSON.stringify(shot.theme ?? "light")}); true`,
    );
    await goto(page, shot.path, shot.settle ?? 2000);
    if (process.env.DEEVY_SCREENS_DEBUG) {
      console.log(
        shot.name,
        await evaluate<string>(
          page,
          "JSON.stringify({ loading: /Loading\\b/.test(document.body.innerText), dialog: document.querySelector('[role=dialog]')?.innerText.slice(0, 80) ?? null, theme: document.documentElement.className })",
        ),
      );
      console.log(
        await evaluate<string>(
          page,
          "JSON.stringify(performance.getEntriesByType('resource').filter(e => e.name.includes('/rpc/')).map(e => e.name.split('/rpc/')[1] + ' ' + Math.round(e.duration) + 'ms ' + (e.responseStatus ?? '')))",
        ),
      );
    }
    await snap(page, shot.name);
  }
  page.close();
} finally {
  // Chrome keeps writing its profile until it has exited; remove it after, not during.
  if (browser.exitCode === null && browser.signalCode === null) browser.kill();
  await exited;
  await rm(profile, { recursive: true, force: true });
}
