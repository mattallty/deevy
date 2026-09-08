-- Generated from drizzle/20260908083309_marvelous_cammi/migration.sql by `vp run db#generate:d1`.
-- Edit packages/db/src/schema instead; wrangler applies this file to D1 (ADR-0008).

CREATE TABLE `__new_issue_link` (
	`id` text PRIMARY KEY NOT NULL,
	`issue_id` text NOT NULL,
	`kind` text NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`ref` text,
	`run_id` text,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_issue_link_issue_id_issue_id_fk` FOREIGN KEY (`issue_id`) REFERENCES `issue`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_issue_link_run_id_run_id_fk` FOREIGN KEY (`run_id`) REFERENCES `run`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_issue_link_created_by_member_id_fk` FOREIGN KEY (`created_by`) REFERENCES `member`(`id`) ON DELETE SET NULL
);

INSERT INTO `__new_issue_link`(`id`, `issue_id`, `kind`, `url`, `title`, `ref`, `run_id`, `created_by`, `created_at`) SELECT `id`, `issue_id`, `kind`, `url`, `title`, `ref`, `run_id`, `created_by`, `created_at` FROM `issue_link`;

DROP TABLE `issue_link`;

ALTER TABLE `__new_issue_link` RENAME TO `issue_link`;

CREATE INDEX `issue_link_issueId_idx` ON `issue_link` (`issue_id`,`created_at`);

DROP TABLE `repository`;
