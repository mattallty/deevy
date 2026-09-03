CREATE TABLE `issue` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`state_id` text NOT NULL,
	`state_entered_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`assignee_member_id` text,
	`parent_id` text,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`closed_at` integer,
	CONSTRAINT `fk_issue_project_id_project_id_fk` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_issue_state_id_workflow_state_id_fk` FOREIGN KEY (`state_id`) REFERENCES `workflow_state`(`id`),
	CONSTRAINT `fk_issue_assignee_member_id_member_id_fk` FOREIGN KEY (`assignee_member_id`) REFERENCES `member`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_issue_created_by_member_id_fk` FOREIGN KEY (`created_by`) REFERENCES `member`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `issue_number_uidx` ON `issue` (`project_id`,`number`);--> statement-breakpoint
CREATE INDEX `issue_projectId_stateId_idx` ON `issue` (`project_id`,`state_id`);--> statement-breakpoint
CREATE INDEX `issue_assignee_idx` ON `issue` (`assignee_member_id`);--> statement-breakpoint
CREATE INDEX `issue_parentId_idx` ON `issue` (`parent_id`);