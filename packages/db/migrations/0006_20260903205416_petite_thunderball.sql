-- Generated from drizzle/20260903205416_petite_thunderball/migration.sql by `vp run db#generate:d1`.
-- Edit packages/db/src/schema instead; wrangler applies this file to D1 (ADR-0008).

CREATE TABLE `gate_decision` (
	`id` text PRIMARY KEY NOT NULL,
	`issue_id` text NOT NULL,
	`state_id` text NOT NULL,
	`decision` text NOT NULL,
	`note` text,
	`member_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_gate_decision_issue_id_issue_id_fk` FOREIGN KEY (`issue_id`) REFERENCES `issue`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_gate_decision_state_id_workflow_state_id_fk` FOREIGN KEY (`state_id`) REFERENCES `workflow_state`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_gate_decision_member_id_member_id_fk` FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON DELETE SET NULL
);

CREATE INDEX `gate_decision_issueId_idx` ON `gate_decision` (`issue_id`,`created_at`);
