-- Generated from drizzle/20260903200512_lazy_dark_phoenix/migration.sql by `vp run db#generate:d1`.
-- Edit packages/db/src/schema instead; wrangler applies this file to D1 (ADR-0008).

CREATE TABLE `allowlist_rule` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_allowlist_rule_workspace_id_workspace_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_allowlist_rule_created_by_member_id_fk` FOREIGN KEY (`created_by`) REFERENCES `member`(`id`) ON DELETE SET NULL
);

ALTER TABLE `member` ADD `handle` text;

CREATE UNIQUE INDEX `member_handle_uidx` ON `member` (`handle`);

CREATE UNIQUE INDEX `allowlist_rule_uidx` ON `allowlist_rule` (`workspace_id`,`kind`,`value`);

CREATE INDEX `allowlist_rule_workspaceId_idx` ON `allowlist_rule` (`workspace_id`);
