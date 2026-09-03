import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workspace } from "@deevy/db";
import { Hono } from "hono";
import { describe, expect, it } from "vite-plus/test";
import { mountSpa, openDatabase } from "../src/node/index.ts";

const migrationsFolder = new URL("../../db/drizzle", import.meta.url).pathname;

describe("node adapters", () => {
  it("opens an in-memory database with migrations applied and foreign keys on", async () => {
    const { db, close } = openDatabase({ path: ":memory:", migrationsFolder });
    await db.insert(workspace).values({ id: "w1", name: "deevy", slug: "deevy" });
    expect((await db.query.workspace.findMany()).map((w) => w.slug)).toEqual(["deevy"]);
    const [pragma] = await db.all<{ foreign_keys: number }>("PRAGMA foreign_keys");
    expect(pragma?.foreign_keys).toBe(1);
    close();
  });

  it("serves files and falls back to index.html", async () => {
    const dir = await mkdtemp(join(tmpdir(), "deevy-spa-"));
    await writeFile(join(dir, "index.html"), "<h1>spa</h1>");
    await writeFile(join(dir, "app.js"), "console.log(1)");
    const app = new Hono();
    mountSpa(app, dir);
    expect(await (await app.request("/app.js")).text()).toBe("console.log(1)");
    expect(await (await app.request("/issues/DEV-42")).text()).toBe("<h1>spa</h1>");
  });
});
