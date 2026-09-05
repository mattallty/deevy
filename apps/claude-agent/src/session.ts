/**
 * The seam every other part of the runtime hangs off: something that, given a
 * prompt and a working directory, does the work and says what happened.
 *
 * It is not the Agent SDK's own shape. The supervisor's job is about Runs, and
 * `subtype === "error_during_execution"` is not a fact about a Run — so the
 * events below are the runtime's own, slice 3's `buildSession` maps the SDK's
 * messages onto them, and every test in this package scripts a session in four
 * lines instead of constructing SDK objects (docs/plans/m4.md).
 */
export interface SessionInput {
  /** What this session is being asked to do, in words. */
  prompt: string;
  /** The directory the session runs in. Empty until slice 5 clones into it. */
  cwd: string;
  /** Aborted when the Run's timeout elapses, or when the process is stopping. */
  signal: AbortSignal;
}

export type SessionEvent =
  /**
   * The session is up and can reach what it needs. `servers` is every MCP
   * server it connected to and the status of each: a `deevy` that is not usable
   * is the one condition worth abandoning a Run over, because a session that
   * cannot reach deevy will improvise instead of stopping.
   */
  | { type: "ready"; tools: string[]; servers: Array<{ name: string; status: string }> }
  /** A tool the session called, by its namespaced name. */
  | { type: "tool"; name: string }
  /**
   * A tool the session asked for and was refused. With no approval surface
   * every unlisted tool lands here, and a Human reading the Run should see that
   * the agent reached for something it may not do — the model itself only sees
   * an error and will often report it as something else.
   */
  | { type: "denied"; name: string; reason: string }
  /** Something the session said. Kept for the log; the Run's own narration is the model's. */
  | { type: "text"; text: string }
  /** The session ended. `ok` is whether it ended on purpose. */
  | { type: "done"; ok: boolean; detail: string };

export type Session = (input: SessionInput) => AsyncIterable<SessionEvent>;

/** Whether a `ready` event says deevy is reachable from inside the session. */
export function deevyIsReachable(event: Extract<SessionEvent, { type: "ready" }>): boolean {
  const deevy = event.servers.find((server) => server.name === "deevy");
  return deevy !== undefined && deevy.status !== "failed" && deevy.status !== "needs-auth";
}
