CREATE TABLE `notification` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_member_id` text NOT NULL,
	`kind` text NOT NULL,
	`event_id` integer NOT NULL,
	`issue_id` text,
	`read_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_notification_recipient_member_id_member_id_fk` FOREIGN KEY (`recipient_member_id`) REFERENCES `member`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_notification_event_id_event_seq_fk` FOREIGN KEY (`event_id`) REFERENCES `event`(`seq`) ON DELETE CASCADE,
	CONSTRAINT `fk_notification_issue_id_issue_id_fk` FOREIGN KEY (`issue_id`) REFERENCES `issue`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `notification_recipient_idx` ON `notification` (`recipient_member_id`,`read_at`);--> statement-breakpoint
CREATE INDEX `notification_eventId_idx` ON `notification` (`event_id`);