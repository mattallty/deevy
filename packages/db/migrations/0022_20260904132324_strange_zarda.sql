-- Generated from drizzle/20260904132324_strange_zarda/migration.sql by `vp run db#generate:d1`.
-- Edit packages/db/src/schema instead; wrangler applies this file to D1 (ADR-0008).

DELETE FROM `notification` WHERE `rowid` NOT IN (SELECT min(`rowid`) FROM `notification` GROUP BY `recipient_member_id`, `kind`, `event_id`);

CREATE UNIQUE INDEX `notification_event_uidx` ON `notification` (`recipient_member_id`,`kind`,`event_id`);

DELETE FROM `delivery` WHERE `rowid` NOT IN (SELECT min(`rowid`) FROM `delivery` GROUP BY `target`, `target_id`, `event_seq`);

CREATE UNIQUE INDEX `delivery_event_uidx` ON `delivery` (`target`,`target_id`,`event_seq`);
