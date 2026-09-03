import type { SQLiteAsyncDatabase } from "drizzle-orm/sqlite-core";
import type { relations } from "./relations.ts";

export * from "./schema/index.ts";
export { relations } from "./relations.ts";

/**
 * The database handle the core works with. Both `drizzle-orm/node-sqlite` and
 * `drizzle-orm/d1` produce one of these, so nothing outside packages/adapters
 * knows which driver is underneath (ADR-0006).
 */
export type Db = SQLiteAsyncDatabase<"sync" | "async", unknown, typeof relations>;

export type Workspace = typeof import("./schema/workspace.ts").workspace.$inferSelect;
export type Member = typeof import("./schema/workspace.ts").member.$inferSelect;
export type User = typeof import("./schema/auth.ts").user.$inferSelect;
export type Event = typeof import("./schema/event.ts").event.$inferSelect;
export type AllowlistRule = typeof import("./schema/allowlist.ts").allowlistRule.$inferSelect;
export type Team = typeof import("./schema/project.ts").team.$inferSelect;
export type Project = typeof import("./schema/project.ts").project.$inferSelect;
export type WorkflowState = typeof import("./schema/project.ts").workflowState.$inferSelect;
export type Issue = typeof import("./schema/issue.ts").issue.$inferSelect;
export type GateDecision = typeof import("./schema/gate.ts").gateDecision.$inferSelect;
export type Document = typeof import("./schema/document.ts").document.$inferSelect;
export type DocumentVersion = typeof import("./schema/document.ts").documentVersion.$inferSelect;
