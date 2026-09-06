-- Generated from drizzle/20260906092039_famous_iron_monger/migration.sql by `vp run db#generate:d1`.
-- Edit packages/db/src/schema instead; wrangler applies this file to D1 (ADR-0008).

CREATE INDEX `issue_updatedAt_idx` ON `issue` (`updated_at`);
