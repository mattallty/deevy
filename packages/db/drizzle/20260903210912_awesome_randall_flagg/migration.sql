CREATE TABLE `document` (
	`id` text PRIMARY KEY NOT NULL,
	`issue_id` text NOT NULL,
	`name` text NOT NULL,
	`current_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_document_issue_id_issue_id_fk` FOREIGN KEY (`issue_id`) REFERENCES `issue`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `document_version` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`version` integer NOT NULL,
	`body` text NOT NULL,
	`author_member_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_document_version_document_id_document_id_fk` FOREIGN KEY (`document_id`) REFERENCES `document`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_document_version_author_member_id_member_id_fk` FOREIGN KEY (`author_member_id`) REFERENCES `member`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
ALTER TABLE `workflow_state` ADD `document_name` text;--> statement-breakpoint
ALTER TABLE `workflow_state` ADD `document_template` text;--> statement-breakpoint
CREATE UNIQUE INDEX `document_name_uidx` ON `document` (`issue_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `document_version_uidx` ON `document_version` (`document_id`,`version`);--> statement-breakpoint
CREATE INDEX `document_version_documentId_idx` ON `document_version` (`document_id`);