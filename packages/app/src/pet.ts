import type { Part } from "@opencode-ai/sdk/v2/client"

// Desktop-pet shared types and pure helpers. Kept platform-agnostic so the
// renderer bridge, the desktop main process, and the pet window can all share
// the same shape. The pet window itself is purely presentational — it renders
// whatever PetState it is handed.

export type PetSessionStatus = "idle" | "busy" | "retry"

export type PetState = {
  // Whether the main window currently has a session open. When false the pet
  // shows an idle "no session" form.
  hasSession: boolean
  status: PetSessionStatus
  // Current session title, already trimmed by the producer (or null).
  title: string | null
  // A short, human-readable line describing the latest activity (or null).
  activity: string | null
  // Route to navigate to when the pet is clicked (e.g. "/<dir64>/session/<id>"),
  // or null when there is nothing to jump to.
  href: string | null
}

export const PET_IDLE_STATE: PetState = {
  hasSession: false,
  status: "idle",
  title: null,
  activity: null,
  href: null,
}

// Shallow value-equality over the flat PetState shape. Used to suppress no-op
// relays: while a session streams, the deriving effect re-runs on every part
// delta even when none of the displayed fields change.
export function petStateEquals(a: PetState | null, b: PetState | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.hasSession === b.hasSession &&
    a.status === b.status &&
    a.title === b.title &&
    a.activity === b.activity &&
    a.href === b.href
  )
}

// Parts that carry no user-facing activity text and should never become the
// bubble's "latest activity" line.
const SKIP_PART_TYPES = new Set(["step-start", "step-finish", "snapshot", "patch", "compaction"])
const MAX_ACTIVITY_LENGTH = 80

function partLabel(part: Part): string | null {
  if (SKIP_PART_TYPES.has(part.type)) return null
  if (part.type === "text" || part.type === "reasoning") return part.text?.trim() || null
  if (part.type === "tool") return part.tool
  return null
}

function truncate(value: string): string {
  const collapsed = value.replace(/\s+/g, " ").trim()
  if (collapsed.length <= MAX_ACTIVITY_LENGTH) return collapsed
  return `${collapsed.slice(0, MAX_ACTIVITY_LENGTH - 1)}…`
}

// Derive the latest meaningful activity line from a message's parts. Picks the
// most recent part that yields displayable text (assistant text/reasoning) or a
// tool name, ignoring structural bookkeeping parts.
export function derivePetActivity(parts: readonly Part[] | undefined): string | null {
  const labels = (parts ?? []).map(partLabel).filter((label): label is string => Boolean(label))
  const last = labels.at(-1)
  return last ? truncate(last) : null
}

// Build the in-app route for jumping to a session. dir64 is the base64-encoded
// directory segment already present in the router params.
export function petSessionHref(dir64: string | undefined, sessionID: string | undefined): string | null {
  if (!dir64 || !sessionID) return null
  return `/${dir64}/session/${sessionID}`
}
