import { createRouterClient } from "@orpc/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { router } from "../src/operations/index.ts";
import { memberContext, testDb } from "./helpers.ts";

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
  vi.unstubAllGlobals();
});

const webhookUrl = "https://hooks.slack.example/services/T000/B000/xxx";

async function workspace() {
  const { db, close } = testDb();
  closers.push(close);
  const admin = await memberContext(db, { role: "admin", name: "Alice" });
  const bob = await memberContext(db, { name: "Bob", email: "bob@flippable.net" });
  return {
    db,
    admin,
    asAdmin: createRouterClient(router, { context: admin }),
    asBob: createRouterClient(router, { context: bob }),
  };
}

describe("a Slack Channel", () => {
  it("is added by an admin, appears in the list, and says so in an Event", async () => {
    const { db, asAdmin } = await workspace();

    const created = await asAdmin.channels.create({ name: "#deevy", webhookUrl });

    expect(created).toMatchObject({ name: "#deevy", kind: "slack" });
    const { channels } = await asAdmin.channels.list({});
    expect(channels).toHaveLength(1);
    expect(channels[0]).toMatchObject({ id: created.id, name: "#deevy" });
    const events = await db.query.event.findMany({ where: { kind: "channel.created" } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ subjectType: "channel", subjectId: created.id });
  });

  it("never hands its webhook URL back, because that URL is the credential", async () => {
    const { asAdmin } = await workspace();

    const created = await asAdmin.channels.create({ name: "#deevy", webhookUrl });

    const { channels } = await asAdmin.channels.list({});
    expect(JSON.stringify(channels)).not.toContain("B000");
    // The host is enough for a Human to recognise where it points.
    expect(channels[0]?.webhookHost).toBe("hooks.slack.example");
    expect(JSON.stringify(created)).not.toContain("B000");
  });

  it("is renamed, repointed and removed, each with its own Event", async () => {
    const { db, asAdmin } = await workspace();
    const created = await asAdmin.channels.create({ name: "#deevy", webhookUrl });

    const renamed = await asAdmin.channels.update({
      channelId: created.id,
      name: "#deevy-alerts",
      webhookUrl: "https://hooks.slack.example/services/T111/B111/yyy",
    });
    await asAdmin.channels.delete({ channelId: created.id });

    expect(renamed.name).toBe("#deevy-alerts");
    expect((await asAdmin.channels.list({})).channels).toEqual([]);
    const kinds = (await db.query.event.findMany()).map((row) => row.kind);
    expect(kinds).toContain("channel.updated");
    expect(kinds).toContain("channel.deleted");
  });

  it("is proved by the Test button, which says what Slack answered", async () => {
    const { asAdmin } = await workspace();
    const created = await asAdmin.channels.create({ name: "#deevy", webhookUrl });
    const posted: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      posted.push(init.body as string);
      expect(url).toBe(webhookUrl);
      return new Response("ok", { status: 200 });
    });

    const result = await asAdmin.channels.test({ channelId: created.id });

    expect(result).toEqual({ delivered: true, status: 200, error: null });
    expect(posted[0]).toContain("deevy");
  });

  it("says what went wrong rather than throwing, when Slack refuses the test", async () => {
    const { asAdmin } = await workspace();
    const created = await asAdmin.channels.create({ name: "#deevy", webhookUrl });
    vi.stubGlobal("fetch", async () => new Response("invalid_token", { status: 403 }));

    const result = await asAdmin.channels.test({ channelId: created.id });

    expect(result).toEqual({ delivered: false, status: 403, error: "invalid_token" });
  });

  it("is an admin's to configure, and nobody else's", async () => {
    const { asBob } = await workspace();

    await expect(asBob.channels.create({ name: "#deevy", webhookUrl })).rejects.toThrow(
      /admin of this Workspace/,
    );
    await expect(asBob.channels.list({})).rejects.toThrow(/admin of this Workspace/);
  });
});
