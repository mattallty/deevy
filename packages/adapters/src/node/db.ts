import { readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { relations, type Db } from "@deevy/db";
import { drizzle } from "drizzle-orm/node-sqlite";
import { migrate } from "drizzle-orm/node-sqlite/migrator";

export interface OpenDatabaseOptions {
  /** File path, or ":memory:" for a throwaway database. */
  path: string;
  /** Folder holding drizzle-kit's generated migrations (packages/db/drizzle). */
  migrationsFolder: string;
  /**
   * Told about every statement drizzle runs, migrations included. deevy's own
   * budget test counts them with it, because on D1 the number of statements
   * one request runs is a limit rather than a detail (docs/plans/m3.md).
   */
  logger?: { logQuery: (query: string, params: unknown[]) => void };
}

export interface OpenedDatabase {
  db: Db;
  close: () => void;
}

/**
 * Opens (creating if needed) a SQLite database with Node's built-in driver and
 * applies pending migrations (ADR-0008). Foreign keys are switched off while
 * migrating because table rebuilds would otherwise cascade-delete children.
 */
export function openDatabase({
  path,
  migrationsFolder,
  logger,
}: OpenDatabaseOptions): OpenedDatabase {
  if (!hasMigrations(migrationsFolder)) {
    throw new Error(
      `no migrations found in ${migrationsFolder}; expected drizzle-kit output (<timestamp>_<name>/migration.sql)`,
    );
  }
  const client = new DatabaseSync(path);
  if (path !== ":memory:") client.exec("PRAGMA journal_mode = WAL");
  client.exec("PRAGMA foreign_keys = OFF");
  const db = drizzle({ client, relations, ...(logger ? { logger } : {}) });
  const failure = migrate(db, { migrationsFolder });
  if (failure) throw new Error(`migration failed: ${JSON.stringify(failure)}`);
  client.exec("PRAGMA foreign_keys = ON");
  return { db, close: () => client.close() };
}

function hasMigrations(folder: string): boolean {
  try {
    return readdirSync(folder, { withFileTypes: true }).some((entry) => entry.isDirectory());
  } catch {
    return false;
  }
}
