-- Generated from drizzle/20260912074029_watery_blazing_skull/migration.sql by `vp run db#generate:d1`.
-- Edit packages/db/src/schema instead; wrangler applies this file to D1 (ADR-0008).

CREATE TABLE `gate_decision_document` (
	`decision_id` text NOT NULL,
	`document_id` text NOT NULL,
	`name` text NOT NULL,
	`version` integer NOT NULL,
	CONSTRAINT `gate_decision_document_pk` PRIMARY KEY(`decision_id`, `document_id`),
	CONSTRAINT `fk_gate_decision_document_decision_id_gate_decision_id_fk` FOREIGN KEY (`decision_id`) REFERENCES `gate_decision`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_gate_decision_document_document_id_document_id_fk` FOREIGN KEY (`document_id`) REFERENCES `document`(`id`) ON DELETE CASCADE
);

CREATE INDEX `gate_decision_document_documentId_idx` ON `gate_decision_document` (`document_id`,`version`);
