/** Read-aloud action beside each finalized assistant reply; one reply plays at a time. */
window.__ModuleLoader__.load({
  id: "@mio/tts",
  factory(require) {
    const { createElement, useState, useEffect } = require("react")
    const NS = "mio-tts"
    // The shipped message actions' tokens, so this button reads as one of them.
    const CSS = `
.mio-tts-action { display: inline-flex; align-items: center; justify-content: center; padding: 0; border: none;
  width: calc(28px + var(--dsh-content-font-delta, 0px)); height: calc(28px + var(--dsh-content-font-delta, 0px));
  border-radius: var(--dsw-radius-sm); background: none; color: var(--dsw-alias-label-tertiary); cursor: pointer; }
.mio-tts-action svg { width: calc(15px + var(--dsh-content-font-delta, 0px)); height: calc(15px + var(--dsh-content-font-delta, 0px)); }
.mio-tts-action:hover, .mio-tts-action[aria-pressed="true"] { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary); }
.mio-tts-action[data-mio-tts="loading"] { opacity: 0.6; cursor: progress; }
.mio-tts-action[data-error] { color: var(--dsw-alias-state-error-primary, #d4380d); }
.mio-tts-row { display: flex; align-items: center; gap: 8px; padding: 16px 0; border-bottom: .5px solid var(--dsw-alias-border-l2); }
.mio-tts-row-text { display: flex; flex: 1 1 0%; flex-direction: column; gap: 4px; min-width: 0; padding-right: 48px; }
.mio-tts-row-title { color: var(--dsw-alias-label-primary); font-size: 14px; line-height: 22px; }
.mio-tts-row-desc { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.mio-tts-row-desc[data-error] { color: var(--dsw-alias-state-error-primary, #d4380d); }
.mio-tts-row-control { display: inline-flex; align-items: center; gap: 8px; }
.mio-tts-select, .mio-tts-preview { height: 36px; border: none; border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-primary); font: inherit; font-size: 14px; cursor: pointer; }
.mio-tts-select { appearance: none; padding: 0 34px 0 14px; background-repeat: no-repeat; background-position: right 12px center;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='M4 6L7.3 9.3a1 1 0 0 0 1.4 0L12 6' stroke='%23999'/%3E%3C/svg%3E"); }
.mio-tts-preview { padding: 0 14px; }
.mio-tts-select:hover, .mio-tts-preview:hover { background-color: var(--dsw-alias-interactive-bg-hover); }
.mio-tts-select:disabled, .mio-tts-preview:disabled { opacity: 0.5; cursor: default; }`
    const zh = {
      read: "朗读",
      stop: "停止朗读",
      loading: "正在合成语音…",
      failed: "朗读失败：{reason}",
      "voice.title": "朗读音色",
      "voice.desc": "使用 MiMo TTS 朗读助手回复时所用的音色",
      "voice.default": "默认",
      "voice.preview": "试听",
      "voice.previewStop": "停止",
      "voice.saveFailed": "保存失败：{reason}",
    }
    const en = {
      read: "Read aloud",
      stop: "Stop reading",
      loading: "Synthesizing speech…",
      failed: "Read aloud failed: {reason}",
      "voice.title": "Read-aloud voice",
      "voice.desc": "Voice MiMo TTS uses to read assistant replies aloud",
      "voice.default": "Default",
      "voice.preview": "Preview",
      "voice.previewStop": "Stop",
      "voice.saveFailed": "Could not save: {reason}",
    }
    // Preview lines follow the voice's own language, not the interface's.
    const ENGLISH_VOICES = ["Mia", "Chloe", "Milo", "Dean"]
    const sample = (voice) =>
      ENGLISH_VOICES.includes(voice) ? "Hello, this is a MiMo voice preview." : "你好，这是一段 MiMo 语音试听。"
    const PREVIEW = "mio-tts/preview"

    /** The reply text of one durable assistant message, as the copy action sees it. */
    const replyText = (snapshot, messageId) => {
      for (const key of snapshot.order) {
        const closing = snapshot.nodes.get(key)?.data?.closing
        if (closing?.finalNode?.messageId !== messageId) continue
        return closing.blocks.flatMap((block) => (block.kind === "text" ? [block.text] : [])).join("")
      }
      return ""
    }

    // The single playback shared by every action; starting one stops the other.
    let playing
    const listeners = new Set()
    const publish = (next) => {
      if (playing && playing !== next) {
        playing.controller.abort()
        playing.audio?.pause()
        if (playing.url) URL.revokeObjectURL(playing.url)
      }
      playing = next
      for (const listener of listeners) listener()
    }
    const stop = (messageId) => {
      if (playing?.messageId === messageId) publish(undefined)
    }
    /** One synthesized part and how many parts the reply has. */
    const synthesize = (current, text, voice, part) =>
      fetch("/api/mio/tts", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(voice === undefined ? { text, part } : { text, voice, part }),
        signal: current.controller.signal,
      }).then(async (response) => {
        if (!response.ok) {
          throw new Error((await response.json().catch(() => undefined))?.error ?? `HTTP ${response.status}`)
        }
        return { blob: await response.blob(), parts: Number(response.headers.get("x-mio-tts-parts") ?? 1) }
      })

    // Parts play in order; the next one is synthesized while the current one plays.
    const start = (messageId, text, onError, voice) => {
      const current = { messageId, controller: new AbortController(), phase: "loading" }
      publish(current)
      const fail = (error) => {
        if (playing !== current) return
        publish(undefined)
        onError(String(error?.message ?? error))
      }
      const play = async (part, pending) => {
        const result = await pending.catch(fail)
        if (playing !== current || result === undefined) return
        const next = part + 1 < result.parts ? synthesize(current, text, voice, part + 1) : undefined
        next?.catch(() => {})
        if (current.url) URL.revokeObjectURL(current.url)
        current.url = URL.createObjectURL(result.blob)
        current.audio = new Audio(current.url)
        const ended = new Promise((resolve) => current.audio.addEventListener("ended", resolve, { once: true }))
        current.phase = "playing"
        publish(current)
        const started = await current.audio.play().then(() => true, fail)
        if (!started) return
        await ended
        if (playing !== current) return
        if (next === undefined) return stop(messageId)
        await play(part + 1, next)
      }
      return play(0, synthesize(current, text, voice, 0))
    }

    const usePlayback = (messageId) => {
      const [, rerender] = useState(0)
      useEffect(() => {
        const listener = () => rerender((count) => count + 1)
        listeners.add(listener)
        return () => listeners.delete(listener)
      }, [])
      return playing?.messageId === messageId ? playing.phase : "idle"
    }

    const Speaker = ({ phase }) =>
      createElement(
        "svg",
        { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "aria-hidden": true },
        createElement("path", {
          d: "M4 9.5h3.5L12 5.5v13l-4.5-4H4z",
          strokeWidth: 1.7,
          strokeLinejoin: "round",
          fill: phase === "idle" ? "none" : "currentColor",
        }),
        phase === "playing"
          ? createElement("path", { d: "M15.5 9.5v5M18.5 8v8", strokeWidth: 1.7, strokeLinecap: "round" })
          : createElement("path", {
              d: "M15.5 9a4 4 0 0 1 0 6M17.8 6.8a7 7 0 0 1 0 10.4",
              strokeWidth: 1.7,
              strokeLinecap: "round",
              opacity: phase === "loading" ? 0.35 : 1,
            }),
      )

    const ReadAloud = ({ messageId, useChat, t }) => {
      const text = useChat((snapshot) => replyText(snapshot, messageId))
      const phase = usePlayback(messageId)
      const [error, setError] = useState(null)
      if (text.trim() === "") return null
      const label = phase === "idle" ? t("read") : phase === "loading" ? t("loading") : t("stop")
      return createElement(
        "button",
        {
          type: "button",
          "data-mio-tts": phase,
          "aria-label": label,
          "aria-pressed": phase !== "idle",
          title: error ?? label,
          onClick: () => {
            setError(null)
            if (phase !== "idle") return stop(messageId)
            void start(messageId, text, (reason) => setError(t("failed", { reason })))
          },
          className: "mio-tts-action",
          "data-error": error ? "" : undefined,
        },
        createElement(Speaker, { phase }),
      )
    }

    const VoiceRow = ({ t }) => {
      const [state, setState] = useState({ voices: [], voice: undefined })
      const [error, setError] = useState(null)
      const phase = usePlayback(PREVIEW)
      useEffect(() => {
        const controller = new AbortController()
        fetch("/api/mio/tts/voice", { credentials: "same-origin", signal: controller.signal })
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
          .then(setState, (reason) => controller.signal.aborted || setError(String(reason?.message ?? reason)))
        return () => controller.abort()
      }, [])
      const choose = (voice) => {
        const previous = state.voice
        setError(null)
        setState({ ...state, voice })
        fetch("/api/mio/tts/voice", {
          method: "PUT",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ voice }),
        })
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
          .then(setState, (reason) => {
            setState((current) => ({ ...current, voice: previous }))
            setError(t("voice.saveFailed", { reason: String(reason?.message ?? reason) }))
          })
      }
      const option = (voice) =>
        createElement("option", { key: voice, value: voice }, voice === "mimo_default" ? t("voice.default") : voice)
      return createElement(
        "div",
        { className: "mio-tts-row", "data-mio-tts-voice": "" },
        createElement(
          "div",
          { className: "mio-tts-row-text" },
          createElement("div", { className: "mio-tts-row-title" }, t("voice.title")),
          createElement("div", { className: "mio-tts-row-desc", "data-error": error ? "" : undefined }, error ?? t("voice.desc")),
        ),
        createElement(
          "div",
          { className: "mio-tts-row-control" },
          createElement(
            "select",
            {
              className: "mio-tts-select",
              "aria-label": t("voice.title"),
              value: state.voice ?? "",
              disabled: state.voice === undefined,
              onChange: (event) => choose(event.target.value),
            },
            state.voices.map(option),
          ),
          createElement(
            "button",
            {
              type: "button",
              className: "mio-tts-preview",
              "data-mio-tts-preview": phase,
              disabled: state.voice === undefined || phase === "loading",
              onClick: () => {
                setError(null)
                if (phase !== "idle") return stop(PREVIEW)
                void start(PREVIEW, sample(state.voice), (reason) => setError(t("failed", { reason })), state.voice)
              },
            },
            phase === "playing" ? t("voice.previewStop") : t("voice.preview"),
          ),
        ),
      )
    }

    return {
      inject: ["slots", "locale"],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }))
        ctx.effect(() => {
          const style = document.createElement("style")
          style.dataset.mioTtsStyle = ""
          style.textContent = CSS
          document.head.append(style)
          return () => style.remove()
        })
        ctx.effect(() => () => publish(undefined))
        ctx.slots.inject("conversation.chat.assistant-actions", () =>
          ctx.slots.register(
            { name: "conversation.chat.assistant-actions", id: "mio-tts", order: 5, locale: NS },
            ReadAloud,
          ),
        )
        ctx.slots.inject("settings.general.item", () =>
          ctx.slots.register({ name: "settings.general.item", id: "mio-tts-voice", order: 60, locale: NS }, VoiceRow),
        )
      },
    }
  },
})
