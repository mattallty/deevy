-- Generated from drizzle/20260904051428_shallow_leo/migration.sql by `vp run db#generate:d1`.
-- Edit packages/db/src/schema instead; wrangler applies this file to D1 (ADR-0008).

CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`payload` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_activity_run_id_run_id_fk` FOREIGN KEY (`run_id`) REFERENCES `run`(`id`) ON DELETE CASCADE
);

CREATE TABLE `run` (
	`id` text PRIMARY KEY NOT NULL,
	`issue_id` text NOT NULL,
	`agent_member_id` text NOT NULL,
	`triggered_by_member_id` text,
	`trigger` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`summary` text,
	`started_at` integer,
	`last_activity_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`finished_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_run_issue_id_issue_id_fk` FOREIGN KEY (`issue_id`) REFERENCES `issue`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_run_agent_member_id_member_id_fk` FOREIGN KEY (`agent_member_id`) REFERENCES `member`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_run_triggered_by_member_id_member_id_fk` FOREIGN KEY (`triggered_by_member_id`) REFERENCES `member`(`id`) ON DELETE SET NULL
);

CREATE INDEX `activity_runId_idx` ON `activity` (`run_id`,`created_at`);

CREATE INDEX `run_issueId_idx` ON `run` (`issue_id`,`created_at`);

CREATE INDEX `run_agent_status_idx` ON `run` (`agent_member_id`,`status`);

CREATE INDEX `run_status_lastActivityAt_idx` ON `run` (`status`,`last_activity_at`);
