CREATE TABLE `agent` (
	`member_id` text PRIMARY KEY NOT NULL,
	`webhook_url` text,
	`webhook_secret` text,
	`schedule_minutes` integer,
	`schedule_ran_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_agent_member_id_member_id_fk` FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `project_grant` (
	`member_id` text NOT NULL,
	`project_id` text NOT NULL,
	`granted_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `project_grant_pk` PRIMARY KEY(`member_id`, `project_id`),
	CONSTRAINT `fk_project_grant_member_id_member_id_fk` FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_project_grant_project_id_project_id_fk` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_project_grant_granted_by_member_id_fk` FOREIGN KEY (`granted_by`) REFERENCES `member`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `project_grant_projectId_idx` ON `project_grant` (`project_id`);