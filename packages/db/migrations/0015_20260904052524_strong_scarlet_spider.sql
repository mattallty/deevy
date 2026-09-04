-- Generated from drizzle/20260904052524_strong_scarlet_spider/migration.sql by `vp run db#generate:d1`.
-- Edit packages/db/src/schema instead; wrangler applies this file to D1 (ADR-0008).

ALTER TABLE `issue_link` ADD `run_id` text REFERENCES run(id) ON DELETE SET NULL;
