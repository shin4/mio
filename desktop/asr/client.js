/** Voice input preferences in Settings → General: recognition language and microphone access. */
window.__ModuleLoader__.load({
  id: "@mio/asr",
  factory(require) {
    const { createElement, useState, useEffect } = require("react")
    const NS = "mio-asr"
    // Matches the official General rows, as the read-aloud voice row does.
    const CSS = `
.mio-asr-row { display: flex; align-items: center; gap: 8px; padding: 16px 0; border-bottom: .5px solid var(--dsw-alias-border-l2); }
.mio-asr-row-text { display: flex; flex: 1 1 0%; flex-direction: column; gap: 4px; min-width: 0; padding-right: 48px; }
.mio-asr-row-title { color: var(--dsw-alias-label-primary); font-size: 14px; line-height: 22px; }
.mio-asr-row-desc { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 18px; }
.mio-asr-row-desc[data-error] { color: var(--dsw-alias-state-error-primary, #d4380d); }
.mio-asr-select, .mio-asr-button { height: 36px; border: none; border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-primary); font: inherit; font-size: 14px; cursor: pointer; }
.mio-asr-select { appearance: none; padding: 0 34px 0 14px; background-repeat: no-repeat; background-position: right 12px center;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='M4 6L7.3 9.3a1 1 0 0 0 1.4 0L12 6' stroke='%23999'/%3E%3C/svg%3E"); }
.mio-asr-button { padding: 0 14px; }
.mio-asr-select:hover, .mio-asr-button:hover { background-color: var(--dsw-alias-interactive-bg-hover); }
.mio-asr-select:disabled, .mio-asr-button:disabled { opacity: 0.5; cursor: default; }`
    const zh = {
      "language.title": "语音输入语言",
      "language.desc": "点击输入框旁的麦克风录音，MiMo ASR 转写为文字；音频会发送至 MiMo API",
      "language.inactive": "语音输入当前未使用 MiMo ASR，可在插件 → 语音输入中切换",
      "language.auto": "自动识别",
      "language.zh": "中文",
      "language.saveFailed": "保存失败：{reason}",
      "mic.title": "麦克风权限",
      "mic.granted": "已允许 Mio 使用麦克风",
      "mic.missing": "尚未允许。点击「授权」后在系统提示中允许；若曾拒绝，请在系统设置 → 隐私与安全性 → 麦克风中打开 Mio",
      "mic.request": "授权",
      "mic.failed": "未能获得麦克风：{reason}",
    }
    const en = {
      "language.title": "Voice input language",
      "language.desc": "Record with the microphone beside the composer; MiMo ASR transcribes it and audio is sent to the MiMo API",
      "language.inactive": "Voice input is not using MiMo ASR; switch it under Plugins → Voice input",
      "language.auto": "Auto-detect",
      "language.zh": "Chinese",
      "language.saveFailed": "Could not save: {reason}",
      "mic.title": "Microphone access",
      "mic.granted": "Mio may use the microphone",
      "mic.missing": "Not allowed yet. Click Allow and accept the system prompt; if you denied it before, turn on Mio in System Settings → Privacy & Security → Microphone",
      "mic.request": "Allow",
      "mic.failed": "Could not open the microphone: {reason}",
    }
    const reasonOf = (error) => String(error?.message ?? error)
    const request = (init) =>
      fetch("/api/mio/asr", { credentials: "same-origin", ...init }).then(async (response) =>
        response.ok
          ? response.json()
          : Promise.reject(new Error((await response.json().catch(() => undefined))?.error ?? `HTTP ${response.status}`)),
      )

    const Row = ({ title, desc, error, children }) =>
      createElement(
        "div",
        { className: "mio-asr-row" },
        createElement(
          "div",
          { className: "mio-asr-row-text" },
          createElement("div", { className: "mio-asr-row-title" }, title),
          createElement("div", { className: "mio-asr-row-desc", "data-error": error ? "" : undefined }, error ?? desc),
        ),
        children,
      )

    const LanguageRow = ({ t }) => {
      const [state, setState] = useState(undefined)
      const [error, setError] = useState(null)
      useEffect(() => {
        const controller = new AbortController()
        request({ signal: controller.signal }).then(setState, (reason) => controller.signal.aborted || setError(reasonOf(reason)))
        return () => controller.abort()
      }, [])
      const choose = (language) => {
        const previous = state
        setError(null)
        setState({ ...state, language })
        request({ method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ language }) }).then(
          setState,
          (reason) => {
            setState(previous)
            setError(t("language.saveFailed", { reason: reasonOf(reason) }))
          },
        )
      }
      return createElement(
        Row,
        { title: t("language.title"), desc: t(state?.active === false ? "language.inactive" : "language.desc"), error },
        createElement(
          "select",
          {
            className: "mio-asr-select",
            "aria-label": t("language.title"),
            value: state?.active ? state.language : "",
            disabled: !state?.active,
            onChange: (event) => choose(event.target.value),
          },
          (state?.languages ?? []).map((language) =>
            createElement("option", { key: language, value: language }, t(`language.${language}`)),
          ),
        ),
      )
    }

    // Desktop answers the permission query from the operating system's microphone decision.
    const microphoneGranted = () =>
      navigator.permissions
        .query({ name: "microphone" })
        .then((status) => status.state === "granted", () => false)

    const MicrophoneRow = ({ t }) => {
      const [granted, setGranted] = useState(undefined)
      const [error, setError] = useState(null)
      useEffect(() => {
        let live = true
        void microphoneGranted().then((value) => live && setGranted(value))
        return () => {
          live = false
        }
      }, [])
      const ask = () => {
        setError(null)
        void navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) => stream.getTracks().forEach((track) => track.stop()))
          .catch((reason) => setError(t("mic.failed", { reason: reasonOf(reason) })))
          .then(microphoneGranted)
          .then(setGranted)
      }
      return createElement(
        Row,
        { title: t("mic.title"), desc: granted ? t("mic.granted") : t("mic.missing"), error },
        granted === false &&
          createElement("button", { type: "button", className: "mio-asr-button", onClick: ask }, t("mic.request")),
      )
    }

    return {
      inject: ["slots", "locale"],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }))
        ctx.effect(() => {
          const style = document.createElement("style")
          style.dataset.mioAsrStyle = ""
          style.textContent = CSS
          document.head.append(style)
          return () => style.remove()
        })
        // Directly after the read-aloud voice (order 60), so the voice controls read as one group.
        ctx.slots.inject("settings.general.item", () =>
          ctx.slots.register({ name: "settings.general.item", id: "mio-asr-language", order: 61, locale: NS }, LanguageRow),
        )
        ctx.slots.inject("settings.general.item", () =>
          ctx.slots.register({ name: "settings.general.item", id: "mio-asr-microphone", order: 62, locale: NS }, MicrophoneRow),
        )
      },
    }
  },
})
