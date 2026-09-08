-- Generated from drizzle/20260908105824_sturdy_lifeguard/migration.sql by `vp run db#generate:d1`.
-- Edit packages/db/src/schema instead; wrangler applies this file to D1 (ADR-0008).

ALTER TABLE `workflow_state` ADD `exclude_requester` integer DEFAULT false NOT NULL;
