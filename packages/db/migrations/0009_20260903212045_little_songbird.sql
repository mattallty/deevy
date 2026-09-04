-- Generated from drizzle/20260903212045_little_songbird/migration.sql by `vp run db#generate:d1`.
-- Edit packages/db/src/schema instead; wrangler applies this file to D1 (ADR-0008).

CREATE TABLE `comment` (
	`id` text PRIMARY KEY NOT NULL,
	`issue_id` text NOT NULL,
	`author_member_id` text,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`edited_at` integer,
	`deleted_at` integer,
	CONSTRAINT `fk_comment_issue_id_issue_id_fk` FOREIGN KEY (`issue_id`) REFERENCES `issue`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_comment_author_member_id_member_id_fk` FOREIGN KEY (`author_member_id`) REFERENCES `member`(`id`) ON DELETE SET NULL
);

CREATE INDEX `comment_issueId_idx` ON `comment` (`issue_id`,`created_at`);
