import type { WorkspaceAdapter } from "./types"

// Stub: in mimo-desktop the workspace concept is collapsed to the local
// project, so adapter registration is a no-op. Round 2 will remove this
// API entirely along with the plugin.workspace hook.

export function registerAdapter(_projectID: string, _type: string, _adapter: WorkspaceAdapter) {
  // no-op
}

export function listAdapters(_projectID: string): readonly WorkspaceAdapter[] {
  return []
}
