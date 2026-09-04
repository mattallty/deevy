DELETE FROM `notification` WHERE `rowid` NOT IN (SELECT min(`rowid`) FROM `notification` GROUP BY `recipient_member_id`, `kind`, `event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `notification_event_uidx` ON `notification` (`recipient_member_id`,`kind`,`event_id`);--> statement-breakpoint
DELETE FROM `delivery` WHERE `rowid` NOT IN (SELECT min(`rowid`) FROM `delivery` GROUP BY `target`, `target_id`, `event_seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_event_uidx` ON `delivery` (`target`,`target_id`,`event_seq`);
