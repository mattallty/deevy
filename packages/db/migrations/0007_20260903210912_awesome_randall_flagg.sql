-- Generated from drizzle/20260903210912_awesome_randall_flagg/migration.sql by `vp run db#generate:d1`.
-- Edit packages/db/src/schema instead; wrangler applies this file to D1 (ADR-0008).

CREATE TABLE `document` (
	`id` text PRIMARY KEY NOT NULL,
	`issue_id` text NOT NULL,
	`name` text NOT NULL,
	`current_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_document_issue_id_issue_id_fk` FOREIGN KEY (`issue_id`) REFERENCES `issue`(`id`) ON DELETE CASCADE
);

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

ALTER TABLE `workflow_state` ADD `document_name` text;

ALTER TABLE `workflow_state` ADD `document_template` text;

CREATE UNIQUE INDEX `document_name_uidx` ON `document` (`issue_id`,`name`);

CREATE UNIQUE INDEX `document_version_uidx` ON `document_version` (`document_id`,`version`);

CREATE INDEX `document_version_documentId_idx` ON `document_version` (`document_id`);
