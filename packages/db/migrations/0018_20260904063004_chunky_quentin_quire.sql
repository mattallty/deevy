-- Generated from drizzle/20260904063004_chunky_quentin_quire/migration.sql by `vp run db#generate:d1`.
-- Edit packages/db/src/schema instead; wrangler applies this file to D1 (ADR-0008).

CREATE TABLE `webhook_subscription` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`member_id` text,
	`url` text NOT NULL,
	`secret` text NOT NULL,
	`kinds` text,
	`project_id` text,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`disabled_at` integer,
	CONSTRAINT `fk_webhook_subscription_workspace_id_workspace_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_webhook_subscription_member_id_member_id_fk` FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_webhook_subscription_project_id_project_id_fk` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_webhook_subscription_created_by_member_id_fk` FOREIGN KEY (`created_by`) REFERENCES `member`(`id`) ON DELETE SET NULL
);

CREATE INDEX `webhook_subscription_workspace_idx` ON `webhook_subscription` (`workspace_id`,`disabled_at`);

CREATE INDEX `webhook_subscription_memberId_idx` ON `webhook_subscription` (`member_id`);
