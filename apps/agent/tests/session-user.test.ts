import { mkdtemp, mkdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { handOver, sessionUserFor } from "../src/session-user.ts";
import { testConfig } from "./helpers.ts";

const scratch: string[] = [];
afterEach(async () => {
  for (const path of scratch.splice(0)) await rm(path, { recursive: true, force: true });
});

async function tree(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "deevy-hand-over-"));
  scratch.push(root);
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "a.ts"), "export const a = 1;\n");
  await symlink("/etc/passwd", join(root, "src", "link"));
  return root;
}

/** This process's own ids: chowning to yourself is the one chown anybody may do. */
const me = { uid: process.getuid?.() ?? 0, gid: process.getgid?.() ?? 0 };

describe("who a session runs as", () => {
  it("is the configured user when the runtime is root, and so can make it one", () => {
    expect(sessionUserFor(testConfig, () => 0)).toEqual({ uid: 10002, gid: 10002 });
  });

  it("is the supervisor's own user when the runtime is not root", () => {
    // Not a fallback that hides anything: becoming another user needs the
    // privilege to do it, and the runtime says so in its first line rather
    // than claiming a boundary it does not have.
    expect(sessionUserFor(testConfig, () => 10001)).toBeNull();
    expect(sessionUserFor(testConfig, () => undefined)).toBeNull();
  });

  it("is the supervisor's own user when the operator asked for that", () => {
    const same = { ...testConfig, sessionUid: 0, sessionGid: 0 };

    expect(sessionUserFor(same, () => 0)).toBeNull();
  });
});

describe("handing a tree to the session", () => {
  it("reaches every file and directory under it", async () => {
    const root = await tree();

    await handOver(root, me);

    for (const path of [root, join(root, "src"), join(root, "src", "a.ts")]) {
      expect(await stat(path).then((s) => [s.uid, s.gid])).toEqual([me.uid, me.gid]);
    }
  });

  it("changes a link rather than what it points at", async () => {
    const root = await tree();
    const before = await stat("/etc/passwd");

    await handOver(root, me);

    // A cloned repository can link anywhere, and following one would hand its
    // target to the session as well.
    const after = await stat("/etc/passwd");
    expect([after.uid, after.gid]).toEqual([before.uid, before.gid]);
  });
});
