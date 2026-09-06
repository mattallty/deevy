import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { openGitProxy } from "../src/git-proxy.ts";
import type { RepoConfig } from "../src/workspace.ts";
import { openWorkspace } from "../src/workspace.ts";
import { runOnce } from "../src/work.ts";
import { finished, instance, scripted } from "./helpers.ts";

const run = promisify(execFile);
const scratch: string[] = [];
const closers: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
  for (const dir of scratch.splice(0)) await rm(dir, { recursive: true, force: true });
});

/** A bare repository with one commit on `main`, and no server in front of it. */
async function remote(): Promise<RepoConfig> {
  const dir = await mkdtemp(join(tmpdir(), "deevy-remote-"));
  scratch.push(dir);
  const bare = join(dir, "origin.git");
  const seed = join(dir, "seed");
  await run("git", ["init", "--bare", "--initial-branch", "main", "--quiet", bare]);
  await run("git", ["clone", "--quiet", bare, seed]);
  await run("git", ["-C", seed, "config", "user.email", "seed@deevy.test"]);
  await run("git", ["-C", seed, "config", "user.name", "seed"]);
  await writeFile(join(seed, "README.md"), "# a repository\n");
  await run("git", ["-C", seed, "add", "-A"]);
  await run("git", ["-C", seed, "commit", "--quiet", "-m", "first"]);
  await run("git", ["-C", seed, "push", "--quiet", "origin", "main"]);
  return { url: bare, baseBranch: "main" };
}

async function refsOn(repo: RepoConfig): Promise<string> {
  const { stdout } = await run("git", ["ls-remote", repo.url]);
  return stdout;
}

/** deevy with one Issue assigned to the Agent, ready to be worked. */
async function assigned() {
  const deevy = await instance();
  closers.push(deevy.close);
  await deevy.asAda.issues.create({ projectKey: "DEV", title: "Ship it" });
  await deevy.asAda.issues.update({ key: "DEV-1", assigneeMemberId: deevy.planner.id });
  return deevy;
}

/** What `workRun` is given, with the git proxy the session pushes through. */
function work(deevy: Awaited<ReturnType<typeof instance>>, repo: RepoConfig) {
  return {
    deevy: deevy.deevy,
    proxy: deevy.proxy,
    runTimeoutMs: 20_000,
    gitProxy: async () => {
      const proxy = await openGitProxy({ upstream: repo.url });
      closers.push(() => proxy.close());
      return proxy;
    },
    workspace: (options: { runId: string; originUrl?: string }) =>
      openWorkspace({ ...options, repo }),
  };
}

describe("a session that runs its own git", () => {
  it("pushes the branch it chose, and the remote has it", async () => {
    const deevy = await assigned();
    const repo = await remote();

    let pushedTo = "";
    const session = scripted([
      async (input) => {
        const git = (args: string[]) => run("git", ["-C", input.cwd, ...args]);
        pushedTo = (await git(["remote", "get-url", "origin"])).stdout.trim();
        await git(["checkout", "--quiet", "-b", "the-branch-it-chose"]);
        await writeFile(join(input.cwd, "feature.ts"), "export const x = 1;\n");
        await git(["add", "-A"]);
        await git([
          "-c",
          "user.name=a",
          "-c",
          "user.email=a@b.c",
          "commit",
          "-qm",
          "its own words",
        ]);
        await git(["push", "--quiet", "origin", "the-branch-it-chose"]);
      },
      finished,
    ]);

    await runOnce({ ...work(deevy, repo), session });

    expect(await refsOn(repo)).toContain("refs/heads/the-branch-it-chose");
    // And it went through the supervisor rather than straight to the remote,
    // which is the only way it could have carried a credential.
    expect(pushedTo).toMatch(/^http:\/\/127\.0\.0\.1:/);
  });

  it("carries the supervisor's own delivery through the proxy as well", async () => {
    const deevy = await assigned();
    const repo = await remote();

    // A session that writes a file and runs no git: the supervisor branches,
    // commits and pushes for it — through the same proxy, which is what a
    // proxy closed too early quietly breaks.
    const session = scripted([
      async (input) => {
        await writeFile(join(input.cwd, "written-by-the-session.ts"), "export const y = 2;\n");
      },
      finished,
    ]);

    const pass = await runOnce({ ...work(deevy, repo), session });

    expect(pass.worked[0]?.delivered?.branch).toMatch(/^deevy\/dev-1-/);
    expect(await refsOn(repo)).toContain("refs/heads/deevy/dev-1-");
  });

  it("never holds the credential that made the push possible", async () => {
    const deevy = await assigned();
    const repo = { ...(await remote()), token: "ghp_the_supervisors_own" };
    let sawInConfig = "";

    const session = scripted([
      async (input) => {
        const { stdout } = await run("git", ["-C", input.cwd, "config", "--list"]);
        sawInConfig = stdout;
      },
      finished,
    ]);

    await runOnce({ ...work(deevy, repo), session });

    // The clone was made with the credential and the session inherits a
    // loopback address: there is nothing in its checkout to find.
    expect(sawInConfig).not.toContain("ghp_the_supervisors_own");
    expect(sawInConfig).toContain("127.0.0.1");
  });
});
