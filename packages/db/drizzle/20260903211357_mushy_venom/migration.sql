CREATE TABLE `issue_label` (
	`issue_id` text NOT NULL,
	`label_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `issue_label_pk` PRIMARY KEY(`issue_id`, `label_id`),
	CONSTRAINT `fk_issue_label_issue_id_issue_id_fk` FOREIGN KEY (`issue_id`) REFERENCES `issue`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_issue_label_label_id_label_id_fk` FOREIGN KEY (`label_id`) REFERENCES `label`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `label` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`scope` text,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_label_workspace_id_workspace_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `issue_label_labelId_idx` ON `issue_label` (`label_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `label_uidx` ON `label` (`workspace_id`,`scope`,`name`);--> statement-breakpoint
CREATE INDEX `label_workspaceId_idx` ON `label` (`workspace_id`);