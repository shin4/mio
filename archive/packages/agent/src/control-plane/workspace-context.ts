import { WorkspaceID } from "./schema"

// Stub for the multi-tenant workspace context. In mimo-desktop the
// workspace is implicit (single-machine) and degrades to a fixed sentinel.
// Round 2 will replace this with proper InstanceContext-only flow.

const DEFAULT_WORKSPACE_ID = WorkspaceID.make("local")

export const WorkspaceContext = {
  workspaceID: DEFAULT_WORKSPACE_ID,
  restore: <A>(_workspace: WorkspaceID | string | undefined, fn: () => A): A => fn(),
}
