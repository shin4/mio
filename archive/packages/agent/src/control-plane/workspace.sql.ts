import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
import type { WorkspaceID } from "./schema"
import type { ProjectID } from "../project/schema"

// Stub for the legacy workspace table.
// mimo-desktop is single-machine so multi-workspace logic collapses.
// Table is kept as a no-op definition to preserve schema and migration
// compatibility. Round 2 will drop it.
// NOTE: do NOT spread ...Timestamps here — the workspace migrations never
// added time_created/time_updated columns, and Timestamps.time_updated uses
// drizzle's $onUpdate hook which would auto-inject `SET time_updated = ?`
// into every UPDATE, breaking session.create with "no such column".
export const WorkspaceTable = sqliteTable("workspace", {
  id: text().$type<WorkspaceID>().primaryKey(),
  project_id: text().$type<ProjectID>(),
  type: text(),
  time_used: integer(),
})
