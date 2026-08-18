// Stub: WorkspaceAdapter previously let plugins register custom workspace
// backends (e.g. github-org-based workspaces). mimo-desktop has no
// multi-tenant concept so this type is left intentionally permissive.

export interface WorkspaceAdapter {
  readonly type: string
  readonly [key: string]: unknown
}
