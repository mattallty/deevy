import { relations, type Db } from "@deevy/db";
import { drizzle, type AnyD1Database } from "drizzle-orm/d1";

/**
 * Wraps a D1 binding. Migrations are applied out of band with
 * `wrangler d1 migrations apply`, never here (ADR-0008).
 */
export function createDb(binding: AnyD1Database): Db {
  return drizzle(binding, { relations });
}
