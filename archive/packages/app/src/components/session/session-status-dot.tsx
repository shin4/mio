import { createMemo, Match, Show, Switch, type Accessor } from "solid-js"
import type { Session } from "@opencode-ai/sdk/v2/client"
import { Spinner } from "@opencode-ai/ui/spinner"
import { useServerSync } from "@/context/server-sync"
import { useNotification } from "@/context/notification"
import { usePermission } from "@/context/permission"
import { messageAgentColor } from "@/utils/agent"
import { sessionPermissionRequest } from "@/pages/session/composer/session-request-tree"

/**
 * Shared session activity state, lifted from HomeSessionRow so the home list
 * and the session-nav sidebar compute working/permission/error/unseen status
 * the same way (single source of precedence). `session` is an accessor; the
 * directory is read once for the child store (sessions don't migrate dirs),
 * id-based lookups read it reactively inside memos.
 */
export function useSessionStatus(session: Accessor<Session>) {
  const serverSync = useServerSync()
  const notification = useNotification()
  const permission = usePermission()
  const [sessionStore] = serverSync.child(session().directory, { bootstrap: false })

  const unseenCount = createMemo(() => notification.session.unseenCount(session().id))
  const hasError = createMemo(() => notification.session.unseenHasError(session().id))
  const hasPermissions = createMemo(
    () =>
      !!sessionPermissionRequest(sessionStore.session, sessionStore.permission, session().id, (item) => {
        return !permission.autoResponds(item, session().directory)
      }),
  )
  const isWorking = createMemo(() => {
    if (hasPermissions()) return false
    return sessionStore.session_working(session().id)
  })
  const tint = createMemo(() => messageAgentColor(sessionStore.message[session().id], sessionStore.agent))
  const showStatus = createMemo(() => isWorking() || hasPermissions() || hasError() || unseenCount() > 0)

  return { isWorking, hasPermissions, hasError, unseenCount, tint, showStatus }
}

/**
 * The status indicator from HomeSessionRow: a Spinner while working, else a
 * colored dot for permission / error / unseen. Renders nothing when the session
 * has no notable state.
 */
export function SessionStatusDot(props: { session: Accessor<Session> }) {
  const status = useSessionStatus(props.session)
  return (
    <Show when={status.showStatus()}>
      <div
        class="flex size-4 shrink-0 items-center justify-center"
        style={{ color: status.tint() ?? "var(--icon-interactive-base)" }}
      >
        <Switch>
          <Match when={status.isWorking()}>
            <Spinner class="size-[15px]" />
          </Match>
          <Match when={status.hasPermissions()}>
            <div class="size-1.5 rounded-full bg-surface-warning-strong" />
          </Match>
          <Match when={status.hasError()}>
            <div class="size-1.5 rounded-full bg-text-diff-delete-base" />
          </Match>
          <Match when={status.unseenCount() > 0}>
            <div class="size-1.5 rounded-full bg-text-interactive-base" />
          </Match>
        </Switch>
      </div>
    </Show>
  )
}
