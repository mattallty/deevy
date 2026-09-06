-- Generated from drizzle/20260906110307_lethal_nightcrawler/migration.sql by `vp run db#generate:d1`.
-- Edit packages/db/src/schema instead; wrangler applies this file to D1 (ADR-0008).

DROP INDEX IF EXISTS `account_issuer_accountId_uidx`;

ALTER TABLE `account` DROP COLUMN `issuer`;
