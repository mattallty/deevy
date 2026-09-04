import { member as memberTable } from "@deevy/db";
import { createRouterClient } from "@orpc/server";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { router } from "../src/operations/index.ts";
import { countingDb, memberContext } from "./helpers.ts";

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

/**
 * D1 caps the statements one Worker invocation may run, and PLAN.md's risks
 * put that cap at 50. Nobody had counted what deevy's busiest write actually
 * spends, so this test does, and it is the same number on both runtimes: the
 * core has no idea which one it is running on (docs/plans/m3.md slice 5).
 */
const d1StatementsPerInvocation = 50;

/**
 * What creating an Issue costs today, measured rather than guessed. It buys the
 * handler's own reads and writes, `openStateDocument`'s Document and first
 * version, and `appendEvent`'s whole tail twice over — once for `issue.created`
 * and again for the `document.created` that follows it, each paying for
 * `deriveNotifications` with its routing reads and `deriveWebhookDeliveries`.
 *
 * It is a ratchet, not a target: a change that adds a query to any of those
 * fails here, on Node, long before a Worker invocation runs out of statements.
 * The count is asserted exactly rather than as a ceiling, so the test also
 * fails when it stops counting — a `logger` that changes shape, or a
 * `countingDb` swapped back for `testDb`, leaves the array empty and a ceiling
 * is happy with nothing. A change that genuinely spends fewer statements is
 * welcome and edits this number; one that spends more has to explain itself.
 */
const budget = 22;

describe(`the D1 request budget: ${String(budget)} statements, under D1's ${String(d1StatementsPerInvocation)}`, () => {
  it("is what creating an Issue with one mention, one Slack Channel and one webhook subscription costs", async () => {
    const { db, close, statements } = countingDb();
    closers.push(close);
    const ada = await memberContext(db, { role: "admin", name: "Ada" });
    const bob = await memberContext(db, { name: "Bob", email: "bob@example.com" });
    await db.update(memberTable).set({ handle: "bob" }).where(eq(memberTable.id, bob.member.id));
    const asAda = createRouterClient(router, { context: ada });
    const project = await asAda.projects.create({ name: "deevy", key: "DEV" });
    const channel = await asAda.channels.create({
      name: "#deevy",
      webhookUrl: "https://hooks.slack.example/services/T000/B000/xxx",
    });
    await asAda.routing.set({
      rules: [{ notificationKind: null, projectId: null, channelId: channel.id }],
    });
    await asAda.webhooks.create({
      url: "https://agent.example.test/deevy",
      secret: "whsec_deevy_budget_test",
    });

    statements.length = 0;
    await asAda.issues.create({
      projectKey: project.key,
      title: "Ship the Worker",
      // A Member who exists and is findable by handle. `issues.create` never
      // looks: only `issues.update` and `comments.create` resolve mentions, so
      // a mention costs an Issue nothing on the way in and two queries on the
      // next edit (packages/core/src/mentions.ts).
      description: "@bob, the Intent Gate is yours",
    });

    expect(statements.length).toBe(budget);
    expect(budget).toBeLessThan(d1StatementsPerInvocation);
  });
});
