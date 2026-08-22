/**
 * Mio's first-run step: connect a MiMo account.
 *
 * This exists because dsh's own onboarding cannot serve Mio. Its only
 * credential step is hard-wired to the `deepseek-official` route
 * (`DeepSeekOnboardingDialog` in `dsh-client-ui-settings-models`), and Mio
 * disables that provider — so without this step a fresh install has no in-app
 * way to enter a key at all.
 *
 * Three rules the surface imposes, all load-bearing here:
 *
 * 1. **Only `complete()` advances.** A step that renders null does not skip —
 *    it stalls the whole sequence, because the coordinator has exactly one
 *    advance edge and no null-detection or timeout. Every path out of this
 *    component therefore ends in `finish()`.
 * 2. **The mask is the step's job.** The coordinator paints no chrome, so a
 *    visible step must wrap itself in `OnboardingSurface`, which portals the
 *    overlay and marks the app root `inert`.
 * 3. **A throw during render abdicates the entry**, retiring it from its cell
 *    and handing the cell to the next survivor. Rendering stays total.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { OnboardingSurface } from "@deepseek-ai/dsh-client-ui-primitives"
import { MioBrandMark } from "./Brand.tsx"
import type { MioMessageKey } from "./locale.ts"
import { BASE_URL_PATH, endpointFor, isTokenPlan, KEY_REF, PLATFORM_URL, PROTOCOL, REGIONS, SETTINGS_NS, type Region } from "./mimo.ts"

/** The slice of dsh's wire API this step uses. */
export interface ConnectApi {
  credentials: {
    describe(payload: { refs: string[] }): Promise<Envelope<{ credentials: Record<string, CredentialRecord | undefined> }>>
    set(payload: { ref: string; value: string }): Promise<Envelope<unknown>>
  }
  llm: {
    discoverModels(payload: { settingsNs: string; baseURL: string; api: string; apiKey: string }): Promise<Envelope<unknown>>
  }
  settings: {
    describe(payload: Record<string, never>): Promise<Envelope<{ namespaces: { ns: string; revision: number }[] }>>
    mutate(payload: {
      ns: string
      ops: { op: "set"; path: string[]; value: unknown }[]
      expectedRevision: number
    }): Promise<Envelope<unknown>>
  }
}

type Envelope<T> = { result: { ok: true; value: T } | { ok: false; error: { code?: string; message: string } } }

interface CredentialRecord {
  configured: boolean
  writable: boolean
  source?: string
}

export interface ConnectProps {
  /** Advances the onboarding sequence. Supplied by the surface. */
  complete: () => void
  /** Namespace-bound translator for {@link MioMessageKey}. */
  t: (key: MioMessageKey, params?: Record<string, string>) => string
  /** The wire API, supplied by this plugin's own registration. */
  api: ConnectApi
  /** Opens a URL the way the host prefers (external browser under Electron). */
  openLink: (url: string) => void
}

type Phase = "checking" | "welcome" | "connect"

const failureOf = (envelope: Envelope<unknown>) => (envelope.result.ok ? undefined : envelope.result.error.message)

export function MioConnect({ complete, t, api, openLink }: ConnectProps) {
  // dsh's own step guards completion this way: the shell recreates `complete`
  // inline on every render, so a bare effect dependency would re-fire it.
  const finished = useRef(false)
  const finish = useCallback(() => {
    if (finished.current) return
    finished.current = true
    complete()
  }, [complete])

  const [phase, setPhase] = useState<Phase>("checking")
  const [key, setKey] = useState("")
  const [region, setRegion] = useState<Region>("cn")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    let live = true
    void (async () => {
      const described = await api.credentials.describe({ refs: [KEY_REF] }).catch(() => undefined)
      if (!live) return
      const record = described?.result.ok === true ? described.result.value.credentials[KEY_REF] : undefined
      // Already connected, or supplied read-only by the launching environment
      // (`MIO_API_KEY` in the shell), where a form could only offer a write that
      // the credential service refuses. Either way there is nothing to ask.
      if (record?.configured === true || record?.writable === false) {
        finish()
        return
      }
      setPhase("welcome")
    })()
    return () => {
      live = false
    }
  }, [api, finish])

  const submit = useCallback(async () => {
    const value = key.trim()
    if (value.length === 0 || busy) return
    setBusy(true)
    setError(undefined)

    const baseURL = endpointFor(value, region)
    // Prove the key before storing it. `discoverModels` carries the endpoint and
    // a one-shot credential the harness never persists, so a rejected key never
    // reaches the credential store. `provider` is deliberately NOT sent: naming
    // a route lets the adapter answer from its own model list without a network
    // call, which would "succeed" for any key at all.
    const discovered = await api.llm
      .discoverModels({ settingsNs: SETTINGS_NS, baseURL, api: PROTOCOL, apiKey: value })
      .catch(() => undefined)
    if (discovered === undefined) {
      setBusy(false)
      setError(t("error.unreachable"))
      return
    }
    if (!discovered.result.ok) {
      setBusy(false)
      setError(t("error.rejected"))
      return
    }

    const stored = await api.credentials.set({ ref: KEY_REF, value }).catch(() => undefined)
    const storeFailure = stored === undefined ? t("error.unreachable") : failureOf(stored)
    if (storeFailure !== undefined) {
      setBusy(false)
      setError(t("error.store", { message: storeFailure }))
      return
    }

    // The endpoint only needs recording when it differs from the composition's
    // default, which is pay-as-you-go. A token plan always does.
    if (isTokenPlan(value)) {
      // Read the revision here rather than at mount: a write is refused outright
      // on a stale one, so the shortest possible window between reading it and
      // using it is the one least likely to lose a race with another surface.
      const described = await api.settings.describe({}).catch(() => undefined)
      const revision =
        described?.result.ok === true
          ? described.result.value.namespaces.find((entry) => entry.ns === SETTINGS_NS)?.revision
          : undefined
      const written =
        revision === undefined
          ? undefined
          : await api.settings
              .mutate({ ns: SETTINGS_NS, ops: [{ op: "set", path: BASE_URL_PATH, value: baseURL }], expectedRevision: revision })
              .catch(() => undefined)
      const endpointFailure = written === undefined ? t("error.unreachable") : failureOf(written)
      if (endpointFailure !== undefined) {
        // The key is stored and valid; only the endpoint record failed. Say so
        // and let the user retry rather than silently connecting to the wrong
        // region.
        setBusy(false)
        setError(t("error.endpoint", { message: endpointFailure }))
        return
      }
    }

    finish()
  }, [api, busy, finish, key, region, t])

  if (phase === "checking") return null

  return (
    <OnboardingSurface>
      <div className="mio-onboarding">
        <MioBrandMark size={56} />
        {phase === "welcome" ? (
          <>
            <h1>{t("welcome.title")}</h1>
            <p className="mio-onboarding__lead">{t("welcome.subtitle")}</p>
            <p>{t("welcome.body")}</p>
            <div className="mio-onboarding__actions">
              <button type="button" className="mio-onboarding__primary" onClick={() => openLink(PLATFORM_URL)}>
                {t("welcome.getKey")}
              </button>
              <button type="button" onClick={() => setPhase("connect")}>
                {t("welcome.continue")}
              </button>
            </div>
          </>
        ) : (
          <>
            <h1>{t("connect.title")}</h1>
            <p>{t("connect.subtitle")}</p>
            <label className="mio-onboarding__field">
              <span>{t("connect.keyLabel")}</span>
              <input
                type="password"
                autoFocus
                value={key}
                placeholder={t("connect.keyPlaceholder")}
                onChange={(event) => setKey(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submit()
                }}
              />
            </label>
            {isTokenPlan(key.trim()) ? (
              <label className="mio-onboarding__field">
                <span>{t("connect.regionLabel")}</span>
                <select value={region} onChange={(event) => setRegion(event.target.value as Region)}>
                  {REGIONS.map((id) => (
                    <option key={id} value={id}>
                      {t(`connect.region.${id}` as MioMessageKey)}
                    </option>
                  ))}
                </select>
                <small>{t("connect.regionHint")}</small>
              </label>
            ) : null}
            {error === undefined ? null : <p className="mio-onboarding__error">{error}</p>}
            <div className="mio-onboarding__actions">
              <button
                type="button"
                className="mio-onboarding__primary"
                disabled={busy || key.trim().length === 0}
                onClick={() => void submit()}
              >
                {busy ? t("connect.submitting") : t("connect.submit")}
              </button>
              <button type="button" onClick={() => setPhase("welcome")} disabled={busy}>
                {t("connect.back")}
              </button>
              {/* Escape hatch: the Models page can do this later, and a step with
                  no way out would trap a user who cannot reach their key now. */}
              <button type="button" className="mio-onboarding__quiet" onClick={finish} disabled={busy}>
                {t("connect.later")}
              </button>
            </div>
          </>
        )}
      </div>
    </OnboardingSurface>
  )
}
