import { openDatabase } from "@deevy/adapters/node";

export const migrationsFolder = new URL("../../db/drizzle", import.meta.url).pathname;

export function testDb() {
  return openDatabase({ path: ":memory:", migrationsFolder });
}
