import { afterEach, describe, expect, it } from "vite-plus/test";
import { buildSession } from "../src/sdk.ts";
import { runOnce } from "../src/work.ts";
import { instance, testConfig } from "./helpers.ts";

/**
 * The one test that calls the model, and so the one test that costs money.
 *
 * CI does not set `DEEVY_AGENT_LIVE`, and neither does `vp run -r test`: a
 * milestone whose suite needs a paid key is a milestone nobody runs twice
 * (docs/plans/m4.md, convention 20). Run it by hand, with an Anthropic
 * credential on the environment:
 *
 *     DEEVY_AGENT_LIVE=1 vp run claude-agent#test tests/live.test.ts
 */
const live = process.env.DEEVY_AGENT_LIVE === "1" ? it : it.skip;

const closers: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

describe("Claude, working a real Issue", () => {
  live(
    "reads the intent, writes the plan, and stops at the Gate",
    async () => {
      const deevy = await instance();
      closers.push(deevy.close);
      const server = await deevy.listen();
      closers.push(server.close);

      await deevy.asAda.issues.create({
        projectKey: "DEV",
        title: "Give the runtime a health endpoint",
      });
      await deevy.asAda.documents.write({
        issueKey: "DEV-1",
        name: "intent",
        body: [
          "## Problem",
          "An operator cannot tell whether the runtime is alive.",
          "## Proposed outcome",
          "An HTTP endpoint that answers while the loop is running.",
        ].join("\n\n"),
      });
      // Intent and Spec approved by a Human, so the Issue is in the Plan Gate and
      // the plan Document is the work waiting (docs/agent-loop.md).
      await deevy.asAda.gates.approve({ key: "DEV-1" });
      await deevy.asAda.gates.approve({ key: "DEV-1" });
      await deevy.asAda.issues.update({ key: "DEV-1", assigneeMemberId: deevy.planner.id });

      const config = { ...testConfig, url: server.url, key: deevy.config.key };
      const pass = await runOnce({
        deevy: deevy.deevy,
        session: buildSession(config),
        runTimeoutMs: 10 * 60 * 1000,
      });

      expect(pass.worked[0]).toMatchObject({ issueKey: "DEV-1", status: "awaiting_input" });
      const plan = await deevy.asAda.documents.get({ issueKey: "DEV-1", name: "plan" });
      expect(plan.body.length).toBeGreaterThan(100);
      const feed = await deevy.asAda.runs.get({ runId: pass.worked[0].runId });
      expect(feed.activities.map((activity) => activity.kind)).toContain("elicitation");
    },
    900_000,
  );
});
