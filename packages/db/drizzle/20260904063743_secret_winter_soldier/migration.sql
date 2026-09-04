CREATE TABLE `gate_approver` (
	`state_id` text NOT NULL,
	`member_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `gate_approver_pk` PRIMARY KEY(`state_id`, `member_id`),
	CONSTRAINT `fk_gate_approver_state_id_workflow_state_id_fk` FOREIGN KEY (`state_id`) REFERENCES `workflow_state`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_gate_approver_member_id_member_id_fk` FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `gate_approver_memberId_idx` ON `gate_approver` (`member_id`);