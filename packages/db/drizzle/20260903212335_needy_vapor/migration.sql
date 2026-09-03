CREATE TABLE `issue_link` (
	`id` text PRIMARY KEY NOT NULL,
	`issue_id` text NOT NULL,
	`kind` text NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`ref` text,
	`repository_id` text,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_issue_link_issue_id_issue_id_fk` FOREIGN KEY (`issue_id`) REFERENCES `issue`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_issue_link_repository_id_repository_id_fk` FOREIGN KEY (`repository_id`) REFERENCES `repository`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_issue_link_created_by_member_id_fk` FOREIGN KEY (`created_by`) REFERENCES `member`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `repository` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`provider` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_repository_workspace_id_workspace_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `issue_link_issueId_idx` ON `issue_link` (`issue_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `repository_url_uidx` ON `repository` (`workspace_id`,`url`);--> statement-breakpoint
CREATE INDEX `repository_workspaceId_idx` ON `repository` (`workspace_id`);