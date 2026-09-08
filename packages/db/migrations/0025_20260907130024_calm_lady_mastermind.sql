-- Generated from drizzle/20260907130024_calm_lady_mastermind/migration.sql by `vp run db#generate:d1`.
-- Edit packages/db/src/schema instead; wrangler applies this file to D1 (ADR-0008).

CREATE TABLE `invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`token_hash` text NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`accepted_member_id` text,
	`revoked_at` integer,
	CONSTRAINT `fk_invitation_workspace_id_workspace_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_invitation_created_by_member_id_fk` FOREIGN KEY (`created_by`) REFERENCES `member`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_invitation_accepted_member_id_member_id_fk` FOREIGN KEY (`accepted_member_id`) REFERENCES `member`(`id`) ON DELETE SET NULL
);

CREATE UNIQUE INDEX `invitation_live_uidx` ON `invitation` (`workspace_id`,`email`) WHERE accepted_at is null and revoked_at is null;

CREATE UNIQUE INDEX `invitation_tokenHash_uidx` ON `invitation` (`token_hash`);

CREATE INDEX `invitation_workspaceId_idx` ON `invitation` (`workspace_id`);
