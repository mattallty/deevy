-- Generated from drizzle/20260904062118_blue_tusk/migration.sql by `vp run db#generate:d1`.
-- Edit packages/db/src/schema instead; wrangler applies this file to D1 (ADR-0008).

CREATE TABLE `delivery` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`target` text NOT NULL,
	`target_id` text NOT NULL,
	`event_seq` integer NOT NULL,
	`recipient_member_id` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`locked_until` integer,
	`last_status` integer,
	`last_error` text,
	`delivered_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_delivery_workspace_id_workspace_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_delivery_event_seq_event_seq_fk` FOREIGN KEY (`event_seq`) REFERENCES `event`(`seq`) ON DELETE CASCADE,
	CONSTRAINT `fk_delivery_recipient_member_id_member_id_fk` FOREIGN KEY (`recipient_member_id`) REFERENCES `member`(`id`) ON DELETE CASCADE
);

CREATE INDEX `delivery_due_idx` ON `delivery` (`delivered_at`,`next_attempt_at`);

CREATE INDEX `delivery_target_idx` ON `delivery` (`target_id`,`event_seq`);
