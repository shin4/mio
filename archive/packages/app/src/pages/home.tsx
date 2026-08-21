import type { Session } from "@opencode-ai/sdk/v2/client"
import { createMemo, createSignal, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useQuery } from "@tanstack/solid-query"
import { Button } from "@opencode-ai/ui/button"
import { Avatar as AvatarV2 } from "@opencode-ai/ui/v2/components/avatar-v2.jsx"
import { ButtonV2 } from "@opencode-ai/ui/v2/components/button-v2.jsx"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/components/icon.jsx"
import { IconButtonV2 } from "@opencode-ai/ui/v2/components/icon-button-v2.jsx"
import { MenuV2 } from "@opencode-ai/ui/v2/components/menu-v2.jsx"
import { getAvatarColors, useLayout, type LocalProject } from "@/context/layout"
import { useNavigate } from "@solidjs/router"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { Icon } from "@opencode-ai/ui/icon"
import { SessionStatusDot } from "@/components/session/session-status-dot"
import { usePlatform } from "@/context/platform"
import { DateTime } from "luxon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DialogSelectDirectory } from "@/components/dialog-select-directory"
import { DialogSelectServer } from "@/components/dialog-select-server"
import { ServerConnection, useServer } from "@/context/server"
import { useServerSync } from "@/context/server-sync"
import { useLanguage } from "@/context/language"
import { useNotification } from "@/context/notification"
import { displayName, getProjectAvatarSource, projectForSession, sortedRootSessions } from "@/pages/layout/helpers"
import { sessionTitle } from "@/utils/session-title"
import { pathKey } from "@/utils/path-key"
import { ServerHealthIndicator } from "@/components/server/server-row"
import { useServers } from "@/context/servers"
import { useSettings } from "@/context/settings"

const HOME_SESSION_LIMIT = 15
// When no project is selected the home groups BY PROJECT (instead of one global
// recency cap that hid whole projects whose sessions were all older). This caps
// how many sessions each project group shows.
const HOME_PROJECT_SESSION_LIMIT = 8
const HOME_ROW =
  "flex min-w-0 w-full shrink-0 cursor-default items-center rounded-[6px] border-0 bg-transparent text-left text-v2-text-text-muted transition-colors duration-[120ms] ease-in-out hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
const HOME_PROJECT_NAV_ROW = `${HOME_ROW} h-7 gap-2 px-1.5 [&>span]:min-w-0 [&>span]:overflow-hidden [&>span]:text-ellipsis [&>span]:whitespace-nowrap`
const HOME_SECTION_LABEL = "text-v2-text-text-muted [font-weight:440]"

type HomeSessionRecord = {
  session: Session
  project: LocalProject
  projectName: string
}

type HomeSessionGroup = {
  // "today" | "yesterday" | "older" in the date-grouped (single-project) view,
  // or the project worktree in the per-project grouped (all-projects) view.
  id: string
  title: string
  sessions: HomeSessionRecord[]
}

export default function Home() {
  return <HomeDesign />
}

function HomeDesign() {
  const sync = useServerSync()
  const layout = useLayout()
  const platform = usePlatform()
  const dialog = useDialog()
  const navigate = useNavigate()
  const server = useServer()
  const language = useLanguage()
  const notification = useNotification()
  const [state, setState] = createStore({ search: "", project: undefined as string | undefined })

  const projects = createMemo(() => layout.projects.list())
  const selectedProject = createMemo(() => projects().find((project) => project.worktree === state.project))
  const directories = (project: LocalProject) => [project.worktree, ...(project.sandboxes ?? [])]
  const projectDirectories = createMemo(() => {
    const project = selectedProject()
    if (!project) return [...projects().flatMap((project) => directories(project))]
    return directories(project)
  })
  const search = createMemo(() => state.search.trim())
  const sessionLoad = useQuery(() => ({
    queryKey: ["home", "sessions", ...projectDirectories()] as const,
    queryFn: async () => {
      await Promise.all(projectDirectories().map((directory) => sync.project.loadSessions(directory)))
      return null
    },
    // Global default is refetchOnMount:false. Without this override, returning to
    // the home with a cached key would NOT re-run loadSessions, so any project
    // whose directory store had been evicted (idle TTL / overflow) stayed blank.
    // "always" reloads on every mount; loadSessions short-circuits dirs already
    // cached, so it's cheap.
    refetchOnMount: "always" as const,
  }))

  const projectByID = createMemo(
    () => new Map(projects().flatMap((project) => (project.id ? [[project.id, project] as const] : []))),
  )
  const records = createMemo(() => {
    return [
      ...new Map(
        projectDirectories()
          .flatMap((directory) => sortedRootSessions(sync.child(directory, { bootstrap: false })[0], Date.now()))
          .map((session) => [`${pathKey(session.directory)}:${session.id}`, session] as const),
      ).values(),
    ]
      .sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
      .flatMap((session) => {
        const project = projectForSession(session, projects(), projectByID())
        if (!project) return []
        return {
          session,
          project,
          projectName: displayName(project),
        }
      })
      .filter((record) => {
        const value = search().toLowerCase()
        if (!value) return true
        return `${record.session.title} ${record.projectName}`.toLowerCase().includes(value)
      })
      .slice(0, HOME_SESSION_LIMIT)
  })
  // All-projects view: one group per project (each with its most-recent
  // sessions), ordered by the project's latest activity, so no project
  // disappears the way a single global top-N did. Sessions are read directly
  // from each project's own directories, so — unlike the flat list — they never
  // need projectForSession() matching (which silently dropped sessions before
  // project metadata had loaded).
  const projectGroups = createMemo<HomeSessionGroup[]>(() => {
    const query = search().toLowerCase()
    const now = Date.now()
    return projects()
      .flatMap((project) => {
        const projectName = displayName(project)
        const sessions = [
          ...new Map(
            directories(project)
              .flatMap((directory) => sortedRootSessions(sync.child(directory, { bootstrap: false })[0], now))
              .map((session) => [`${pathKey(session.directory)}:${session.id}`, session] as const),
          ).values(),
        ].sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
        const groupRecords = sessions
          .filter((session) => !query || `${session.title} ${projectName}`.toLowerCase().includes(query))
          .map((session) => ({ session, project, projectName }))
        if (groupRecords.length === 0) return []
        const latest = groupRecords[0].session.time.updated ?? groupRecords[0].session.time.created
        return [
          {
            latest,
            group: {
              id: project.worktree,
              title: projectName,
              sessions: groupRecords.slice(0, HOME_PROJECT_SESSION_LIMIT),
            } satisfies HomeSessionGroup,
          },
        ]
      })
      .sort((a, b) => b.latest - a.latest)
      .map((entry) => entry.group)
  })
  const groups = createMemo(() => (selectedProject() ? groupSessions(records(), language) : projectGroups()))

  // The prominent "new session" button falls back to the project picker when
  // no project is selected (openNewSession -> chooseProject), so label + icon
  // it as "new project" in that case to match what the click actually does.
  const newSessionLabel = createMemo(() =>
    selectedProject() ? language.t("command.session.new") : language.t("session.new.project.new"),
  )
  const newSessionIcon = createMemo(() => (selectedProject() ? "edit" : "folder-add-left"))

  function selectProject(directory: string) {
    if (!projects().some((project) => project.worktree === directory)) return
    setState("project", directory)
  }

  function addProject(directory: string) {
    layout.projects.open(directory)
    server.projects.touch(directory)
    setState("project", directory)
  }

  function openNewSession() {
    const project = selectedProject()
    if (!project) {
      void chooseProject()
      return
    }
    layout.projects.open(project.worktree)
    server.projects.touch(project.worktree)
    navigate(`/${base64Encode(project.worktree)}/session`)
  }

  function openProjectNewSession(directory: string) {
    layout.projects.open(directory)
    server.projects.touch(directory)
    navigate(`/${base64Encode(directory)}/session`)
  }

  const showEditProjectDialog = (project: LocalProject) => {
    void import("@/components/dialog-edit-project").then((x) => {
      dialog.show(() => <x.DialogEditProject project={project} />)
    })
  }

  const unseenCount = (project: LocalProject) =>
    directories(project).reduce((total, directory) => total + notification.project.unseenCount(directory), 0)

  const clearNotifications = (project: LocalProject) =>
    directories(project)
      .filter((directory) => notification.project.unseenCount(directory) > 0)
      .forEach((directory) => notification.project.markViewed(directory))

  function openSession(session: Session) {
    const project = projectForSession(session, projects(), projectByID())
    layout.projects.open(project?.worktree ?? session.directory)
    server.projects.touch(project?.worktree ?? session.directory)
    navigate(`/${base64Encode(session.directory)}/session/${session.id}`)
  }

  async function chooseProject() {
    function resolve(result: string | string[] | null) {
      if (Array.isArray(result)) {
        result.forEach(addProject)
        if (result[0]) setState("project", result[0])
        return
      }
      if (result) addProject(result)
    }

    if (platform.openDirectoryPickerDialog && server.isLocal()) {
      const result = await platform.openDirectoryPickerDialog?.({
        title: language.t("command.project.open"),
        multiple: true,
      })
      resolve(result)
      return
    }

    dialog.show(
      () => <DialogSelectDirectory multiple={true} onSelect={resolve} />,
      () => resolve(null),
    )
  }

  function openSettings() {
    void import("@/components/dialog-settings").then((x) => {
      dialog.show(() => <x.DialogSettings />)
    })
  }

  return (
    <div class="grid w-full h-full gap-[14px] p-3.5 bg-v2-background-bg-deep lg:grid-cols-[236px_minmax(0,1fr)]">
      <HomeProjectColumn
        selectedProject={state.project}
        selectProject={selectProject}
        openNewSession={openProjectNewSession}
        chooseProject={() => void chooseProject()}
        editProject={showEditProjectDialog}
        closeProject={(directory) => {
          layout.projects.close(directory)
          if (state.project === directory) setState("project", undefined)
        }}
        clearNotifications={clearNotifications}
        unseenCount={unseenCount}
        openSettings={openSettings}
        language={language}
      />

      <section
        class="min-w-0 flex-1 flex flex-col overflow-y-hidden rounded-[var(--mimo-radius-lg)] bg-v2-background-bg-base p-4 shadow-[var(--v2-elevation-raised)]"
        aria-label={language.t("sidebar.project.recentSessions")}
      >
        <Show
          when={projectDirectories().length > 0}
          fallback={
            <HomeEmptyState
              icon="folder-add-left"
              title={language.t("home.empty.title")}
              description={language.t("home.empty.description")}
              action={language.t("home.project.add")}
              onAction={() => void chooseProject()}
            />
          }
        >
          <HomeSessionSearch
            value={state.search}
            placeholder={language.t("home.sessions.search.placeholder")}
            onInput={(value) => setState("search", value)}
            clearLabel={language.t("common.clear")}
            onClear={() => setState("search", "")}
          />
          <div class="mt-3 overflow-auto flex-1">
            <div class="pt-3 flex flex-col gap-6">
              <Show
                when={!sessionLoad.isLoading}
                fallback={<HomeSessionSkeleton label={language.t("common.loading")} />}
              >
                <Show
                  when={groups().length > 0}
                  fallback={
                    <HomeEmptyState
                      icon={newSessionIcon()}
                      title={language.t("home.sessions.empty")}
                      description={language.t("home.sessions.empty.description")}
                      action={newSessionLabel()}
                      onAction={openNewSession}
                    />
                  }
                >
                  <For each={groups()}>
                    {(group, index) => (
                      <div class="flex min-w-0 flex-col gap-4">
                        <HomeSessionGroupHeader
                          title={group.title}
                          onNewSession={selectedProject() && index() === 0 ? openNewSession : undefined}
                          newSessionLabel={newSessionLabel()}
                          newSessionIcon={newSessionIcon()}
                        />
                        <div class="flex min-w-0 flex-col overflow-hidden rounded-[var(--mimo-radius-md)] border border-v2-border-border-muted bg-v2-background-bg-deep divide-y divide-v2-border-border-muted">
                          <For each={group.sessions}>
                            {(record) => (
                              <HomeSessionRow
                                record={record}
                                openSession={openSession}
                                showProjectBadge={!!selectedProject()}
                              />
                            )}
                          </For>
                        </div>
                      </div>
                    )}
                  </For>
                </Show>
              </Show>
            </div>
          </div>
        </Show>
      </section>
    </div>
  )
}

function HomeProjectColumn(props: {
  selectedProject?: string
  selectProject: (directory: string) => void
  openNewSession: (directory: string) => void
  chooseProject: () => void
  editProject: (project: LocalProject) => void
  closeProject: (directory: string) => void
  clearNotifications: (project: LocalProject) => void
  unseenCount: (project: LocalProject) => number
  openSettings: () => void
  language: ReturnType<typeof useLanguage>
}) {
  const servers = useServers()
  const layout = useLayout()
  const projects = createMemo(() => layout.projects.list())
  return (
    <aside
      class="flex min-w-0 flex-col gap-3 rounded-[var(--mimo-radius-lg)] bg-v2-background-bg-base p-3 shadow-[var(--v2-elevation-raised)]"
      aria-label={props.language.t("home.projects")}
    >
      <div class="flex h-7 min-w-0 items-center justify-between pl-1.5">
        <div class={HOME_SECTION_LABEL}>{props.language.t("home.projects")}</div>
        {/* Hide the small add-project button when the project list is empty —
            the HomeEmptyState in the right column shows a larger CTA with the
            same folder-add-left icon, so two visible buttons would be redundant. */}
        <Show when={projects().length > 0}>
          <IconButtonV2
            data-action="home-add-project"
            variant="ghost-muted"
            size="large"
            class="titlebar-icon [&_[data-slot=icon-svg]]:text-v2-icon-icon-muted"
            icon={<IconV2 name="folder-add-left" />}
            onClick={props.chooseProject}
            aria-label={props.language.t("home.project.add")}
          />
        </Show>
      </div>
      <Show
        when={servers.list().length > 1}
        fallback={
          <ProjectList
            projects={projects()}
            selectedProject={props.selectedProject}
            onSelectedProjectChange={props.selectProject}
            onChooseProject={props.chooseProject}
            openNewSession={props.openNewSession}
            editProject={props.editProject}
            closeProject={props.closeProject}
            clearNotifications={props.clearNotifications}
            unseenCount={props.unseenCount}
            language={props.language}
          />
        }
      >
        <For each={servers.list()}>
          {(server) => {
            const key = ServerConnection.key(server)
            const healthy = () => !!servers.health[key]?.healthy
            const [open, setOpen] = createSignal(true)

            return (
              <div class="max-h-[min(572px,calc(100vh_-_300px))] min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div class="relative h-7 group">
                  <button
                    class="w-full h-full px-1.5 gap-2 flex flex-row items-center hover:not-disabled:bg-v2-overlay-simple-overlay-hover rounded-[4px]"
                    disabled={!healthy()}
                    onClick={() => setOpen((o) => !o)}
                  >
                    <div class="size-4 flex items-center justify-center">
                      <ServerHealthIndicator health={servers.health[key]} />
                    </div>
                    <div class="flex flex-row items-center gap-1">
                      <span>{server.displayName ?? new URL(server.http.url).host}</span>
                      <Show when={healthy()}>
                        <IconV2
                          name="outline-chevron-down"
                          class="text-v2-icon-icon-muted data-[open=false]:-rotate-90"
                          data-open={open()}
                        />
                      </Show>
                    </div>
                  </button>
                  <IconButtonV2
                    class="absolute right-1 inset-y-1 opacity-0 group-hover:opacity-100"
                    name="out"
                    variant="ghost-muted"
                    size="small"
                    icon={<IconV2 name="outline-dots" class="text-v2-icon-icon-muted" />}
                  />
                </div>
                <Show when={healthy() && open()}>
                  <div class="h-px bg-v2-border-border-base mx-3 my-1" />
                  <ProjectList
                    projects={projects()}
                    selectedProject={props.selectedProject}
                    onSelectedProjectChange={props.selectProject}
                    onChooseProject={props.chooseProject}
                    openNewSession={props.openNewSession}
                    editProject={props.editProject}
                    closeProject={props.closeProject}
                    clearNotifications={props.clearNotifications}
                    unseenCount={props.unseenCount}
                    language={props.language}
                  />
                </Show>
              </div>
            )
          }}
        </For>
      </Show>
      <div class="mt-auto flex min-w-0 flex-col gap-1 border-t border-v2-border-border-muted pt-2">
        <button
          type="button"
          class={`${HOME_PROJECT_NAV_ROW} text-v2-text-text-faint [&>[data-slot=icon-svg]]:text-v2-icon-icon-muted`}
          onClick={props.openSettings}
        >
          <IconV2 name="settings-gear" size="small" />
          <span>{props.language.t("sidebar.settings")}</span>
        </button>
      </div>
    </aside>
  )
}

function HomeProjectRow(props: {
  project: LocalProject
  selected: boolean
  unseenCount: number
  selectProject: (directory: string) => void
  openNewSession: (directory: string) => void
  editProject: (project: LocalProject) => void
  closeProject: (directory: string) => void
  clearNotifications: (project: LocalProject) => void
  language: ReturnType<typeof useLanguage>
}) {
  const name = createMemo(() => displayName(props.project))
  const [menuOpen, setMenuOpen] = createSignal(false)

  return (
    <div class="group/project relative flex h-8 min-w-0 items-center rounded-[6px]">
      <button
        type="button"
        data-component="home-project-row"
        class={`${HOME_PROJECT_NAV_ROW} pr-16 peer`}
        classList={{
          "bg-[var(--mimo-accent-soft)] text-[var(--mimo-accent-text)]! [font-weight:600]": props.selected,
        }}
        data-selected={props.selected ? "" : undefined}
        aria-current={props.selected ? "page" : undefined}
        onClick={() => props.selectProject(props.project.worktree)}
      >
        <HomeProjectAvatar project={props.project} />
        <span>{name()}</span>
      </button>
      <div
        class="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover/project:opacity-100 peer-focus-visible:opacity-100 focus-within:opacity-100 data-[menu=true]:opacity-100"
        data-menu={menuOpen()}
      >
        <MenuV2 gutter={4} modal={false} placement="bottom-end" open={menuOpen()} onOpenChange={setMenuOpen}>
          <MenuV2.Trigger
            as={IconButtonV2}
            data-action="home-project-menu"
            variant="ghost-muted"
            size="small"
            icon={<IconV2 name="outline-dots" />}
            aria-label={props.language.t("common.moreOptions")}
          />
          <MenuV2.Portal>
            <MenuV2.Content>
              <MenuV2.Item onSelect={() => props.openNewSession(props.project.worktree)}>
                {props.language.t("command.session.new")}
              </MenuV2.Item>
              <MenuV2.Item onSelect={() => props.editProject(props.project)}>
                {props.language.t("common.edit")}
              </MenuV2.Item>
              <MenuV2.Item disabled={props.unseenCount === 0} onSelect={() => props.clearNotifications(props.project)}>
                {props.language.t("sidebar.project.clearNotifications")}
              </MenuV2.Item>
              <MenuV2.Separator />
              <MenuV2.Item onSelect={() => props.closeProject(props.project.worktree)}>
                {props.language.t("common.close")}
              </MenuV2.Item>
            </MenuV2.Content>
          </MenuV2.Portal>
        </MenuV2>
        <IconButtonV2
          data-action="home-project-new-session"
          variant="ghost-muted"
          size="small"
          icon={<IconV2 name="edit" />}
          aria-label={props.language.t("command.session.new")}
          onClick={(event) => {
            event.stopPropagation()
            props.openNewSession(props.project.worktree)
          }}
        />
      </div>
    </div>
  )
}

function HomeProjectAvatar(props: { project: LocalProject }) {
  const name = createMemo(() => displayName(props.project))
  return (
    <AvatarV2
      fallback={name()}
      src={getProjectAvatarSource(props.project.id, props.project.icon)}
      kind="org"
      size="small"
      {...getAvatarColors(props.project.icon?.color)}
      class="size-4 rounded"
    />
  )
}

function HomeSessionSearch(props: {
  value: string
  placeholder: string
  clearLabel: string
  onInput: (value: string) => void
  onClear: () => void
}) {
  return (
    <label class="flex h-11 w-full shrink-0 items-center gap-2.5 rounded-[13px] bg-v2-background-bg-deep px-4 text-v2-icon-icon-muted transition-[background-color,box-shadow] duration-[120ms] ease-in-out focus-within:bg-v2-background-bg-base focus-within:shadow-[0_0_0_1px_var(--v2-border-border-focus),var(--v2-elevation-raised)]">
      <IconV2 name="magnifying-glass" size="small" />
      <input
        class="min-w-0 flex-1 border-0 bg-transparent text-v2-text-text-base outline-0 [font-weight:440] placeholder:text-v2-text-text-faint"
        value={props.value}
        placeholder={props.placeholder}
        aria-label={props.placeholder}
        onInput={(event) => props.onInput(event.currentTarget.value)}
      />
      <Show when={props.value.trim()}>
        <button
          type="button"
          class="flex size-5 shrink-0 items-center justify-center rounded text-v2-icon-icon-muted hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:outline-none"
          aria-label={props.clearLabel}
          onClick={(event) => {
            event.preventDefault()
            props.onClear()
          }}
        >
          <Icon name="close-small" size="small" />
        </button>
      </Show>
    </label>
  )
}

function HomeEmptyState(props: {
  icon: Parameters<typeof IconV2>[0]["name"]
  title: string
  description: string
  action: string
  onAction: () => void
}) {
  return (
    <div class="flex min-h-[320px] flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <div class="flex size-10 items-center justify-center rounded-[10px] bg-v2-background-bg-deep text-v2-icon-icon-muted shadow-[var(--v2-elevation-raised)]">
        <IconV2 name={props.icon} />
      </div>
      <div class="flex max-w-[320px] flex-col gap-1">
        <div class="text-v2-text-text-base [font-weight:530]">{props.title}</div>
        <div class="text-v2-text-text-muted [font-weight:440]">{props.description}</div>
      </div>
      <ButtonV2 variant="neutral" size="normal" icon={props.icon} onClick={props.onAction}>
        {props.action}
      </ButtonV2>
    </div>
  )
}

function HomeSessionGroupHeader(props: {
  title: string
  onNewSession?: () => void
  newSessionLabel?: string
  newSessionIcon?: Parameters<typeof IconV2>[0]["name"]
}) {
  const language = useLanguage()
  return (
    <div class="flex h-7 min-w-0 items-center justify-between px-1">
      <div class={HOME_SECTION_LABEL}>{props.title}</div>
      <Show when={props.onNewSession}>
        {(onNewSession) => (
          <button
            type="button"
            data-action="home-new-session"
            class="flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-v2-background-bg-accent px-3 text-[12px] [font-weight:560] text-white shadow-[0_2px_8px_var(--mimo-accent-ring)] transition-colors hover:bg-[var(--mimo-accent-press)] [&_[data-slot=icon-svg]]:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v2-border-border-focus)]"
            onClick={onNewSession()}
          >
            <IconV2 name={props.newSessionIcon ?? "edit"} size="small" />
            {props.newSessionLabel ?? language.t("command.session.new")}
          </button>
        )}
      </Show>
    </div>
  )
}

function HomeSessionRow(props: {
  record: HomeSessionRecord
  openSession: (session: Session) => void
  showProjectBadge?: boolean
}) {
  const title = createMemo(() => sessionTitle(props.record.session.title) || props.record.session.id)

  return (
    <button
      type="button"
      data-component="home-session-row"
      class={`${HOME_ROW} h-[52px] gap-3 rounded-none px-4`}
      onClick={() => props.openSession(props.record.session)}
    >
      <AvatarV2
        fallback={displayName(props.record.project)}
        src={getProjectAvatarSource(props.record.project.id, props.record.project.icon)}
        kind="org"
        size="small"
        {...getAvatarColors(props.record.project.icon?.color)}
        class="size-7 shrink-0 rounded-[8px]"
      />
      <SessionStatusDot session={() => props.record.session} />
      <span class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-v2-text-text-base [font-weight:530]">
        {title()}
      </span>
      <Show when={props.showProjectBadge !== false && props.record.projectName}>
        <span class="ml-2 max-w-[40%] shrink-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-v2-border-border-muted bg-v2-background-bg-base px-2 py-0.5 text-v2-text-text-muted [font-weight:440]">
          {props.record.projectName}
        </span>
      </Show>
    </button>
  )
}

function HomeSessionSkeleton(props: { label: string }) {
  return (
    <div class="flex min-w-0 flex-col gap-4">
      <div class="flex h-7 min-w-0 items-center justify-between px-4">
        <div class={HOME_SECTION_LABEL}>{props.label}</div>
      </div>
      <div class="flex min-w-0 flex-col gap-px" aria-hidden="true">
        <For each={[0, 1, 2, 3]}>{() => <div class="h-10 rounded-[6px] bg-v2-background-bg-deep opacity-70" />}</For>
      </div>
    </div>
  )
}

function groupSessions(records: HomeSessionRecord[], language: ReturnType<typeof useLanguage>): HomeSessionGroup[] {
  const now = DateTime.local()
  const yesterday = now.minus({ days: 1 })
  const todaySessions = records.filter((record) =>
    DateTime.fromMillis(record.session.time.updated ?? record.session.time.created).hasSame(now, "day"),
  )
  const yesterdaySessions = records.filter((record) =>
    DateTime.fromMillis(record.session.time.updated ?? record.session.time.created).hasSame(yesterday, "day"),
  )
  const olderSessions = records.filter((record) => {
    const time = DateTime.fromMillis(record.session.time.updated ?? record.session.time.created)
    return !time.hasSame(now, "day") && !time.hasSame(yesterday, "day")
  })
  const olderTitle =
    todaySessions.length === 0 && yesterdaySessions.length === 0
      ? language.t("sidebar.project.recentSessions")
      : language.t("home.sessions.group.older")

  return [
    { id: "today" as const, title: language.t("home.sessions.group.today"), sessions: todaySessions },
    { id: "yesterday" as const, title: language.t("home.sessions.group.yesterday"), sessions: yesterdaySessions },
    { id: "older" as const, title: olderTitle, sessions: olderSessions },
  ].filter((group) => group.sessions.length > 0)
}

function ProjectList(props: {
  projects: LocalProject[]
  selectedProject?: string
  onSelectedProjectChange?(project: string): void
  onChooseProject?(): void
  openNewSession: (directory: string) => void
  editProject: (project: LocalProject) => void
  closeProject: (directory: string) => void
  clearNotifications: (project: LocalProject) => void
  unseenCount: (project: LocalProject) => number
  language: ReturnType<typeof useLanguage>
}) {
  return (
    <Show
      when={props.projects.length > 0}
      fallback={
        <button
          type="button"
          class={`${HOME_PROJECT_NAV_ROW} text-v2-text-text-faint [&>[data-slot=icon-svg]]:text-v2-icon-icon-muted`}
          onClick={() => props.onChooseProject?.()}
        >
          <IconV2 name="folder-add-left" size="small" />
          <span>{props.language.t("home.project.add")}</span>
        </button>
      }
    >
      <div class="flex flex-col gap-1">
        <For each={props.projects}>
          {(project) => (
            <HomeProjectRow
              project={project}
              selected={props.selectedProject === project.worktree}
              unseenCount={props.unseenCount(project)}
              selectProject={(directory) => props.onSelectedProjectChange?.(directory)}
              openNewSession={props.openNewSession}
              editProject={props.editProject}
              closeProject={props.closeProject}
              clearNotifications={props.clearNotifications}
              language={props.language}
            />
          )}
        </For>
      </div>
    </Show>
  )
}
