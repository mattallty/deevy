import { chown, lchown, lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Config } from "./config.ts";

/**
 * Who a session runs as, when the runtime can make it somebody other than
 * itself.
 *
 * The container was assumed to be the boundary between a session and the
 * supervisor, and it is not: on one user, a session with a shell reads the
 * supervisor's environment out of `/proc`, and the Agent's key and the git
 * token are in it. The environment allowlist decides what is *handed* to a
 * session (src/harness/env.ts); only a second user decides what can be
 * *taken* (docs/plans/agent-owns-git.md).
 */
export interface SessionUser {
  uid: number;
  gid: number;
}

/**
 * The user a session runs as, or `null` for "the same one the supervisor
 * runs as".
 *
 * Becoming another user needs the privilege to do it, which in the image means
 * running as root. A runtime started as anybody else — a laptop, or a container
 * run with `--user` — keeps its old shape and says so, because a bound that
 * quietly is not there is worse than one that is not claimed
 * (ADR-0014: the container is the sandbox, and a runtime on a laptop has no
 * boundary at all).
 */
export function sessionUserFor(
  config: Config,
  getuid: () => number | undefined = () => process.getuid?.(),
): SessionUser | null {
  if (config.sessionUid <= 0) return null;
  return getuid() === 0 ? { uid: config.sessionUid, gid: config.sessionGid } : null;
}

/**
 * Gives a tree to the session's user, so the session can write in it and the
 * supervisor can still read it afterwards.
 *
 * Symbolic links are changed rather than followed: a link in a cloned
 * repository can point anywhere, and following one would hand its target to
 * the session as well.
 */
export async function handOver(path: string, user: SessionUser): Promise<void> {
  const stats = await lstat(path);
  if (stats.isDirectory()) {
    for (const entry of await readdir(path)) await handOver(join(path, entry), user);
  }
  await (stats.isSymbolicLink() ? lchown : chown)(path, user.uid, user.gid);
}
