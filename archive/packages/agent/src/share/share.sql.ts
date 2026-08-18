import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../storage/schema.sql"

// Stub for the legacy session-share table.
// Share feature is removed in mimo-desktop. Table definition kept so the
// existing JSON→SQLite migration code can continue to compile; the table
// will simply never be populated. Round 2 will drop the migration code
// and this stub will be removable.
export const SessionShareTable = sqliteTable("session_share", {
  id: text().primaryKey(),
  session_id: text().notNull(),
  // NOT NULL in the DB schema (migration familiar_lady_ursula). Was missing
  // here, so the legacy JSON→SQLite migration's insert silently dropped it and
  // hit a NOT NULL constraint, migrating 0 shares.
  secret: text().notNull(),
  url: text(),
  ...Timestamps,
})
