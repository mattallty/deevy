-- Generated from drizzle/20260903195154_nervous_dakota_north/migration.sql by `vp run db#generate:d1`.
-- Edit packages/db/src/schema instead; wrangler applies this file to D1 (ADR-0008).

CREATE TABLE `event` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`workspace_id` text NOT NULL,
	`actor_member_id` text,
	`kind` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`project_id` text,
	`payload` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_event_workspace_id_workspace_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_event_actor_member_id_member_id_fk` FOREIGN KEY (`actor_member_id`) REFERENCES `member`(`id`) ON DELETE SET NULL
);

CREATE INDEX `event_workspaceId_seq_idx` ON `event` (`workspace_id`,`seq`);

CREATE INDEX `event_subject_idx` ON `event` (`subject_type`,`subject_id`);

CREATE INDEX `event_projectId_seq_idx` ON `event` (`project_id`,`seq`);
