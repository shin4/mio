import { Schema } from "effect"

// Stub for legacy WorkspaceID — multi-tenant control plane was removed
// in mimo-desktop. Kept as a string-branded type to avoid touching every
// route handler and Effect runtime piece in a single sweep.
//
// Round 2 will rip these out entirely; for now this lets Round 1 finish
// without breaking the import graph.
export const WorkspaceID = Schema.String.pipe(Schema.brand("WorkspaceID"))
export type WorkspaceID = typeof WorkspaceID.Type
