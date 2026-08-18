import type { Session } from "@opencode-ai/sdk/v2/client"
import { createEffect, createMemo, For, Show } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { Avatar as AvatarV2 } from "@opencode-ai/ui/v2/components/avatar-v2.jsx"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/components/icon.jsx"
import { IconButtonV2 } from "@opencode-ai/ui/v2/components/icon-button-v2.jsx"
import { Icon } from "@opencode-ai/ui/icon"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { getAvatarColors, useLayout, type LocalProject } from "@/context/layout"
import { useServerSync } from "@/context/server-sync"
import { useLanguage } from "@/context/language"
import { displayName, getProjectAvatarSource, sortedRootSessions } from "@/pages/layout/helpers"
import { createSizing } from "@/pages/session/helpers"
import { sessionTitle } from "@/utils/session-title"
import { pathKey } from "@/utils/path-key"
import { decode64 } from "@/utils/base64"
import { SessionStatusDot } from "@/components/session/session-status-dot"

// Match the home list cap so a project with hundreds of sessions can't blow up
// the persistent sidebar DOM. Overflow links to the home all-sessions view.
const MAX_SESSIONS_PER_PROJECT = 15
const SECTION_LABEL = "text-v2-text-text-muted [font-weight:440]"
const SIDEBAR_MIN_WIDTH = 200
const SIDEBAR_MAX_WIDTH = 480

/**
 * Persistent left-side session navigation: every open project is a group header
 * with its root sessions listed beneath. Mounted at the layout level (see
 * pages/layout.tsx) so it survives session navigation. Read-only with respect
 * to UI state — it only reads projects + child stores, so it can't interfere
 * with the prefetch/visible-dir machinery in layout.tsx.
 */
export function SessionNavSidebar() {
  const layout = useLayout()
  const serverSync = useServerSync()
  const language = useLanguage()
  const params = useParams()
  const navigate = useNavigate()
  const dialog = useDialog()

  function openSettings() {
    void import("@/components/dialog-settings").then((x) => {
      dialog.show(() => <x.DialogSettings />)
    })
  }

  const projects = createMemo(() => layout.projects.list())
  const currentDirectory = createMemo(() => (params.dir ? decode64(params.dir) || "" : ""))
  const opened = createMemo(() => layout.sidebar.opened())
  // Suppresses the width transition while the resize handle is being dragged,
  // so dragging tracks the cursor instead of easing behind it (same helper the
  // session review/file-tree panels use).
  const sizing = createSizing()

  // Ensure sessions for every open project are loaded (the layout's loader only
  // covers the active project's dirs). Guarded so each dir is requested once.
  const requested = new Set<string>()
  createEffect(() => {
    for (const project of projects()) {
      for (const dir of [project.worktree, ...(project.sandboxes ?? [])]) {
        if (requested.has(dir)) continue
        requested.add(dir)
        void serverSync.project.loadSessions(dir)
      }
    }
  })

  return (
    <aside
      // The outer element animates width 0 ↔ sidebar.width() so the panel slides
      // open/closed; the inner column keeps a fixed width and is clipped by
      // overflow-hidden, so its content never reflows mid-animation.
      class="relative flex shrink-0 flex-col overflow-hidden bg-v2-background-bg-deep"
      classList={{
        "border-r border-v2-border-border-muted": opened(),
        "pointer-events-none": !opened(),
        "transition-[width] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] motion-reduce:transition-none":
          !sizing.active(),
      }}
      style={{ width: opened() ? `${layout.sidebar.width()}px` : "0px" }}
      aria-hidden={!opened()}
      inert={!opened()}
      aria-label={language.t("sidebar.nav.title")}
    >
      <div class="relative flex h-full flex-col" style={{ width: `${layout.sidebar.width()}px` }}>
        <div class="flex h-11 shrink-0 items-center px-3">
          <div class={SECTION_LABEL}>{language.t("sidebar.nav.title")}</div>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          <Show
            when={projects().length > 0}
            fallback={
              <div class="flex flex-col gap-1 px-2 py-6 text-center">
                <div class="text-v2-text-text-base [font-weight:530]">{language.t("sidebar.empty.title")}</div>
                <div class="text-v2-text-text-muted [font-weight:440]">{language.t("sidebar.empty.description")}</div>
              </div>
            }
          >
            <div class="flex flex-col gap-4 pt-2">
              <For each={projects()}>
                {(project) => (
                  <ProjectGroup
                    project={project}
                    currentDirectory={currentDirectory()}
                    activeId={params.id}
                    navigate={navigate}
                    language={language}
                  />
                )}
              </For>
            </div>
          </Show>
        </div>
        <div class="shrink-0 border-t border-v2-border-border-muted px-2 py-2">
          <button
            type="button"
            data-action="session-nav-settings"
            class="flex h-8 w-full items-center gap-2 rounded-[6px] border-0 bg-transparent px-2 text-left text-v2-text-text-faint transition-colors duration-[120ms] ease-in-out hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none [&_[data-slot=icon-svg]]:text-v2-icon-icon-muted"
            onClick={openSettings}
          >
            <IconV2 name="settings-gear" size="small" />
            <span class="min-w-0 flex-1 truncate">{language.t("sidebar.settings")}</span>
          </button>
        </div>
        <div onPointerDown={() => sizing.start()}>
          <ResizeHandle
            direction="horizontal"
            edge="end"
            size={layout.sidebar.width()}
            min={SIDEBAR_MIN_WIDTH}
            max={SIDEBAR_MAX_WIDTH}
            onResize={(width) => {
              sizing.touch()
              layout.sidebar.resize(width)
            }}
            class="absolute inset-y-0 right-0 w-1 cursor-col-resize hover:bg-v2-overlay-simple-overlay-hover"
          />
        </div>
      </div>
    </aside>
  )
}

function ProjectGroup(props: {
  project: LocalProject
  currentDirectory: string
  activeId?: string
  navigate: (href: string) => void
  language: ReturnType<typeof useLanguage>
}) {
  const serverSync = useServerSync()
  const dirs = createMemo(() => [props.project.worktree, ...(props.project.sandboxes ?? [])])
  const sessions = createMemo(() => {
    const now = Date.now()
    return dirs().flatMap((dir) => sortedRootSessions(serverSync.child(dir, { bootstrap: false })[0], now))
  })
  const visible = createMemo(() => sessions().slice(0, MAX_SESSIONS_PER_PROJECT))
  const overflow = createMemo(() => Math.max(0, sessions().length - MAX_SESSIONS_PER_PROJECT))

  return (
    <div class="flex min-w-0 flex-col gap-0.5">
      <div class="group/project relative flex h-7 min-w-0 items-center gap-2 px-2">
        <AvatarV2
          fallback={displayName(props.project)}
          src={getProjectAvatarSource(props.project.id, props.project.icon)}
          kind="org"
          size="small"
          {...getAvatarColors(props.project.icon?.color)}
          class="size-4 shrink-0 rounded"
        />
        <span class={`min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap ${SECTION_LABEL}`}>
          {displayName(props.project)}
        </span>
        <IconButtonV2
          variant="ghost-muted"
          size="small"
          class="shrink-0 opacity-0 transition-opacity group-hover/project:opacity-100"
          icon={<Icon name="plus" size="small" />}
          aria-label={props.language.t("command.session.new")}
          onClick={() => props.navigate(`/${base64Encode(props.project.worktree)}/session`)}
        />
      </div>
      <For each={visible()}>
        {(session) => (
          <SessionRow
            session={session}
            currentDirectory={props.currentDirectory}
            activeId={props.activeId}
            navigate={props.navigate}
          />
        )}
      </For>
      <Show when={overflow() > 0}>
        <a
          href="/"
          class="flex h-7 items-center pl-8 pr-2 text-v2-text-text-faint [font-weight:440] hover:text-v2-text-text-muted"
        >
          {props.language.t("sidebar.project.viewAllSessions")}
        </a>
      </Show>
    </div>
  )
}

function SessionRow(props: {
  session: Session
  currentDirectory: string
  activeId?: string
  navigate: (href: string) => void
}) {
  const title = createMemo(() => sessionTitle(props.session.title) || props.session.id)
  const selected = createMemo(
    () => props.session.id === props.activeId && pathKey(props.session.directory) === pathKey(props.currentDirectory),
  )

  return (
    <button
      type="button"
      data-component="session-nav-row"
      class="flex h-8 w-full min-w-0 cursor-default items-center gap-2 rounded-[6px] border-0 bg-transparent px-2 text-left text-v2-text-text-muted transition-colors duration-[120ms] ease-in-out hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
      classList={{
        "bg-[var(--mimo-accent-soft)] text-[var(--mimo-accent-text)]! [font-weight:600]": selected(),
      }}
      data-selected={selected() ? "" : undefined}
      aria-current={selected() ? "page" : undefined}
      onClick={() => props.navigate(`/${base64Encode(props.session.directory)}/session/${props.session.id}`)}
    >
      <span class="flex size-4 shrink-0 items-center justify-center">
        <Show when={selected()} fallback={<SessionStatusDot session={() => props.session} />}>
          <span class="size-1.5 rounded-full bg-current" />
        </Show>
      </span>
      <span class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{title()}</span>
    </button>
  )
}
