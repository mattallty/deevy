-- Generated from drizzle/20260904070500_calm_whizzer/migration.sql by `vp run db#generate:d1`.
-- Edit packages/db/src/schema instead; wrangler applies this file to D1 (ADR-0008).

ALTER TABLE `agent` DROP COLUMN `webhook_url`;

ALTER TABLE `agent` DROP COLUMN `webhook_secret`;
