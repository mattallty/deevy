/**
 * What the session's process is allowed to see of this one's environment.
 *
 * An allowlist rather than a denylist, and that distinction was earned: the
 * first version removed `DEEVY_AGENT_KEY` and the git token and passed
 * everything else through, which meant a session with a shell inherited every
 * other credential the operator happened to have — cloud tokens, registry
 * tokens, and on a laptop the operator's own Anthropic credentials. It was
 * found by setting `ANTHROPIC_API_KEY` to a deliberately invalid value and
 * watching a live run succeed anyway, on host credentials nobody had passed it.
 *
 * A denylist can only remove what somebody thought of. This removes everything
 * nobody named. `HOME` is on the list and is then overridden by the runner with
 * a directory made for the session (src/harness/run.ts).
 */
export const sessionEnvAllowed: ReadonlyArray<string> = [
  // Enough to run a process and for git to find its own configuration.
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TMPDIR",
  "TERM",
  "LANG",
  "LC_ALL",
  "TZ",
];

/**
 * The environment a session runs with: the allowlist above, whatever the
 * harness names for its own credential, and whatever the operator names in
 * `DEEVY_AGENT_PASS_ENV`.
 *
 * The passthrough exists because an allowlist that cannot be extended gets
 * worked around: a proxy, a private registry or a custom CA is a real need, and
 * naming the variable is better than turning the list off.
 */
export function sessionEnv(
  env: Record<string, string | undefined>,
  alsoPass: ReadonlyArray<string> = [],
  prefixes: ReadonlyArray<string> = [],
): Record<string, string> {
  const named = new Set([...sessionEnvAllowed, ...alsoPass]);
  const kept: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (named.has(name) || prefixes.some((prefix) => name.startsWith(prefix))) {
      kept[name] = value;
    }
  }
  return kept;
}
