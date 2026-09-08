-- Generated from drizzle/20260908095928_simple_romulus/migration.sql by `vp run db#generate:d1`.
-- Edit packages/db/src/schema instead; wrangler applies this file to D1 (ADR-0008).

ALTER TABLE `workflow_state` ADD `approvals_required` integer DEFAULT 1 NOT NULL;
