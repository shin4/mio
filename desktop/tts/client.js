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
.mio-tts-action[data-error] { color: var(--dsw-alias-state-error-primary, #d4380d); }`
    const zh = { read: "朗读", stop: "停止朗读", loading: "正在合成语音…", failed: "朗读失败：{reason}" }
    const en = { read: "Read aloud", stop: "Stop reading", loading: "Synthesizing speech…", failed: "Read aloud failed: {reason}" }

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
    const start = async (messageId, text, onError) => {
      const current = { messageId, controller: new AbortController(), phase: "loading" }
      publish(current)
      const response = await fetch("/api/mio/tts", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
        signal: current.controller.signal,
      }).catch((error) => ({ ok: false, aborted: current.controller.signal.aborted, error }))
      if (playing !== current) return
      if (!response.ok) {
        const reason = response.json
          ? ((await response.json().catch(() => undefined))?.error ?? `HTTP ${response.status}`)
          : String(response.error?.message ?? response.error)
        publish(undefined)
        onError(reason)
        return
      }
      const blob = await response.blob()
      if (playing !== current) return
      current.url = URL.createObjectURL(blob)
      current.audio = new Audio(current.url)
      current.audio.addEventListener("ended", () => stop(messageId))
      current.phase = "playing"
      publish(current)
      await current.audio.play().catch((error) => {
        if (playing !== current) return
        publish(undefined)
        onError(String(error?.message ?? error))
      })
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
      },
    }
  },
})
