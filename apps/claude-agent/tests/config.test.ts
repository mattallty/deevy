import { describe, expect, it } from "vite-plus/test";
import { readConfig } from "../src/config.ts";

const enough = { DEEVY_URL: "https://deevy.example.com", DEEVY_AGENT_KEY: "deevy_sk_x" };

describe("configuration", () => {
  it("refuses to start without an identity, naming what is missing", () => {
    expect(() => readConfig({ DEEVY_URL: enough.DEEVY_URL })).toThrow("DEEVY_AGENT_KEY");
    expect(() => readConfig({ DEEVY_AGENT_KEY: enough.DEEVY_AGENT_KEY })).toThrow("DEEVY_URL");
  });

  it("takes the defaults, and a trailing slash off the URL", () => {
    expect(readConfig({ ...enough, DEEVY_URL: "https://deevy.example.com/" })).toEqual({
      url: "https://deevy.example.com",
      key: "deevy_sk_x",
      harness: "claude-code",
      pollSeconds: 30,
      model: "claude-opus-5",
      effort: "high",
      maxTurns: 100,
      repo: null,
      listenPort: 8787,
      // deevy calls a Run stale after thirty minutes of silence, so a session
      // allowed to outlive that would be reported stale while still working.
      runTimeoutSeconds: 1800,
    });
  });

  it("ignores a number that is not one", () => {
    const config = readConfig({ ...enough, DEEVY_AGENT_POLL_SECONDS: "soon" });

    expect(config.pollSeconds).toBe(30);
  });
});
