CREATE TABLE `channel` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`config` text,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_channel_workspace_id_workspace_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_channel_created_by_member_id_fk` FOREIGN KEY (`created_by`) REFERENCES `member`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `notification_preference` (
	`member_id` text NOT NULL,
	`kind` text NOT NULL,
	`inbox` integer DEFAULT true NOT NULL,
	`slack` integer DEFAULT true NOT NULL,
	CONSTRAINT `notification_preference_pk` PRIMARY KEY(`member_id`, `kind`),
	CONSTRAINT `fk_notification_preference_member_id_member_id_fk` FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `routing_rule` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`notification_kind` text,
	`project_id` text,
	`channel_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_routing_rule_workspace_id_workspace_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_routing_rule_project_id_project_id_fk` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_routing_rule_channel_id_channel_id_fk` FOREIGN KEY (`channel_id`) REFERENCES `channel`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `workflow_state` ADD `trigger_agent_member_id` text REFERENCES member(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `channel_workspaceId_idx` ON `channel` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `routing_rule_workspaceId_idx` ON `routing_rule` (`workspace_id`);