// Multimodal "Try it" playground controller.
//
// Framework-free ESM. Lazy-loads ./demos.json when #playground scrolls into
// view, then renders one of three demo kinds (image-to-code, video-understanding,
// asr-execute) into .pg-panel, switching by tab and by document language.
//
// Honesty: every output is a pre-captured real MiMo response replayed with a
// typewriter; nothing here calls a model live. See
// docs/superpowers/specs/2026-06-08-multimodal-playground-design.md.

import { runTypewriter } from "./typewriter.js";

/* ---------- tiny DOM helpers ---------- */

const el = (tag, props = {}, kids = []) => {
  const node = document.createElement(tag);
  const apply = (k, v) => {
    if (v == null) return;
    if (k === "class") {
      node.className = v;
      return;
    }
    if (k === "text") {
      node.textContent = v;
      return;
    }
    if (k === "html") {
      node.innerHTML = v;
      return;
    }
    if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
      return;
    }
    if (k in node) {
      node[k] = v;
      return;
    }
    node.setAttribute(k, v);
  };
  Object.entries(props).forEach(([k, v]) => apply(k, v));
  (Array.isArray(kids) ? kids : [kids])
    .filter((k) => k != null)
    .forEach((k) =>
      node.appendChild(typeof k === "string" ? document.createTextNode(k) : k),
    );
  return node;
};

const clear = (node) => {
  while (node.firstChild) node.removeChild(node.firstChild);
};

const lang = () =>
  document.documentElement.lang.startsWith("zh") ? "zh" : "en";

// Pick the current-language string from a {en, zh} bag, gracefully degrading.
const t = (bag) => {
  if (bag == null) return "";
  if (typeof bag === "string") return bag;
  return bag[lang()] ?? bag.en ?? bag.zh ?? "";
};

// Activate keyboard on a clickable element: Enter / Space fire the handler.
const onActivate = (node, handler) => {
  node.addEventListener("click", handler);
  node.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
    e.preventDefault();
    handler(e);
  });
};

/* ---------- controller state ---------- */

function initPlayground() {
  const root = document.getElementById("playground");
  if (!root) return;

  const panel = root.querySelector(".pg-panel");
  const tabs = [...root.querySelectorAll(".pg-tab[data-demo]")];

  // Single in-flight typewriter handle ({ cancel() }); replaced on every (re)render.
  let cancelTyping = null;
  const stopTyping = () => {
    if (cancelTyping) cancelTyping.cancel();
    cancelTyping = null;
  };

  let demos = null; // cached manifest demo list
  let activeId = null; // currently selected demo id
  const selected = new Map(); // demo id -> selected sample index

  const findDemo = (id) =>
    demos.find((d) => d.id === id) ?? demos[0];

  const sampleIndex = (demo) => {
    const i = selected.get(demo.id);
    if (i != null && i >= 0 && i < demo.samples.length) return i;
    return 0;
  };

  /* ---------- renderers per kind ---------- */

  const renderImageToCode = (demo) => {
    const idx = sampleIndex(demo);
    const sample = demo.samples[idx];

    const thumbs = el(
      "div",
      { class: "pg-thumbs", role: "group", "aria-label": "samples" },
      demo.samples.map((s, i) => {
        const active = i === idx;
        const img = el("img", {
          class: "pg-thumb" + (active ? " is-active" : ""),
          src: s.input.image,
          alt: t(s.input.alt),
          tabindex: "0",
          role: "button",
          "aria-pressed": active ? "true" : "false",
          loading: "lazy",
        });
        onActivate(img, () => {
          if (i === idx) return;
          selected.set(demo.id, i);
          render();
        });
        return img;
      }),
    );

    const shot = el("img", {
      class: "pg-shot",
      src: sample.input.image,
      alt: t(sample.input.alt),
      loading: "lazy",
    });

    const code = el("code", { class: "pg-code mono" });
    const codeArea = el("pre", { class: "pg-codearea" }, [code]);

    stopTyping();
    cancelTyping = runTypewriter({
      // Code samples are long; reveal faster so the full component lands in a
      // few seconds rather than ~20s of typing.
      text: sample.output.code,
      charsPerTick: 6,
      onUpdate: (s) => {
        code.textContent = s;
        // Keep the latest typed line in view within the bounded code pane.
        codeArea.scrollTop = codeArea.scrollHeight;
      },
    });

    return el("div", { class: "pg-demo pg-demo-img2code" }, [
      el("div", { class: "pg-col pg-col-input" }, [thumbs, shot]),
      el("div", { class: "pg-col pg-col-output" }, [codeArea]),
    ]);
  };

  const renderVideo = (demo) => {
    const idx = sampleIndex(demo);
    const sample = demo.samples[idx];

    const source = el("source", {
      src: sample.input.video,
      type: "video/mp4",
    });
    const video = el(
      "video",
      {
        class: "pg-video",
        controls: true,
        preload: "none",
        playsinline: true,
        poster: sample.input.poster,
      },
      [source],
    );

    const answer = el("div", { class: "pg-answer" });

    const ask = el("button", {
      class: "pg-ask",
      type: "button",
      text: lang() === "zh" ? "问 MiMo" : "Ask MiMo",
    });
    ask.addEventListener("click", () => {
      stopTyping();
      cancelTyping = runTypewriter({
        text: t(sample.output),
        onUpdate: (s) => {
          answer.textContent = s;
        },
      });
    });

    const chips = el(
      "div",
      { class: "pg-chips", role: "group", "aria-label": "highlights" },
      (sample.highlights ?? []).map((h) => {
        const chip = el("button", {
          class: "pg-chip",
          type: "button",
          text: t(h.label),
        });
        chip.addEventListener("click", () => {
          video.currentTime = h.t;
          video.play().catch(() => {});
        });
        return chip;
      }),
    );

    return el("div", { class: "pg-demo pg-demo-video" }, [
      el("div", { class: "pg-col pg-col-input" }, [video, chips]),
      el("div", { class: "pg-col pg-col-output" }, [
        el("p", { class: "pg-question", text: t(sample.question) }),
        ask,
        answer,
      ]),
    ]);
  };

  const renderAsr = (demo) => {
    const idx = sampleIndex(demo);
    const sample = demo.samples[idx];

    const transcript = el("div", { class: "pg-transcript" });
    const action = el("div", { class: "pg-action" });

    const reveal = () => {
      clear(action);
      stopTyping();
      cancelTyping = runTypewriter({
        text: t(sample.transcript),
        onUpdate: (s) => {
          transcript.textContent = s;
        },
        onDone: () => {
          const mark = el("span", { class: "pg-check", text: "✓ " });
          const body = el("span", { class: "pg-action-body" });
          clear(action);
          action.appendChild(mark);
          action.appendChild(body);
          cancelTyping = runTypewriter({
            text: t(sample.action),
            onUpdate: (s) => {
              body.textContent = s;
            },
          });
        },
      });
    };

    // input.audio is a per-language {en,zh} bag (or a plain string); pick the
    // current language and derive the MIME from the file extension.
    const audioSrc = t(sample.input && sample.input.audio);
    const audioType = audioSrc.endsWith(".wav")
      ? "audio/wav"
      : audioSrc.endsWith(".ogg")
        ? "audio/ogg"
        : "audio/mpeg";
    const audio = audioSrc
      ? el(
          "audio",
          { class: "pg-audio", controls: true, preload: "none" },
          [el("source", { src: audioSrc, type: audioType })],
        )
      : null;

    const play = el("button", {
      class: "pg-play",
      type: "button",
      text: lang() === "zh" ? "▶ 播放示例" : "▶ Play sample",
    });
    play.addEventListener("click", () => {
      if (audio) audio.play().catch(() => {});
      reveal();
    });

    const inputCol = [audio, play].filter((n) => n != null);

    return el("div", { class: "pg-demo pg-demo-asr" }, [
      el("div", { class: "pg-col pg-col-input" }, inputCol),
      el("div", { class: "pg-col pg-col-output" }, [transcript, action]),
    ]);
  };

  const RENDERERS = {
    "image-to-code": renderImageToCode,
    "video-understanding": renderVideo,
    "asr-execute": renderAsr,
  };

  /* ---------- render orchestration ---------- */

  const render = () => {
    if (!demos || !panel) return;
    stopTyping();
    const demo = findDemo(activeId);
    activeId = demo.id;

    tabs.forEach((tab) => {
      const on = tab.dataset.demo === activeId;
      tab.setAttribute("aria-selected", on ? "true" : "false");
      tab.setAttribute("tabindex", on ? "0" : "-1");
      tab.classList.toggle("is-active", on);
    });

    const build = RENDERERS[demo.kind];
    clear(panel);
    if (!build) {
      panel.appendChild(el("p", { class: "pg-fallback", text: t(demo.tab) }));
      return;
    }
    panel.appendChild(build(demo));
  };

  const renderFallback = () => {
    if (!panel) return;
    clear(panel);
    panel.appendChild(
      el("p", {
        class: "pg-fallback",
        text:
          lang() === "zh"
            ? "演示暂时无法加载。"
            : "The demo could not load right now.",
      }),
    );
  };

  /* ---------- wiring ---------- */

  const activateTab = (id) => {
    activeId = id;
    loadOnce(); // idempotent; renders once the manifest is in
    if (demos) render();
  };

  // WAI-ARIA tablist keyboard pattern: click + Arrow/Home/End roving focus.
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => activateTab(tab.dataset.demo));
    tab.addEventListener("keydown", (e) => {
      const isArrow = e.key === "ArrowRight" || e.key === "ArrowLeft";
      if (!isArrow && e.key !== "Home" && e.key !== "End") return;
      e.preventDefault();
      const delta = e.key === "ArrowRight" ? 1 : -1;
      const next =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? tabs.length - 1
            : (i + delta + tabs.length) % tabs.length;
      tabs[next].focus();
      activateTab(tabs[next].dataset.demo);
    });
  });

  // Re-render on language switch, preserving the active tab + sample selection.
  const langObserver = new MutationObserver(() => {
    if (demos) render();
  });
  langObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang"],
  });

  // Lazy load the manifest once, from whichever trigger fires first (scroll-in,
  // already-visible at init, or a tab interaction). Idempotent.
  let loadStarted = false;
  const loadOnce = () => {
    if (loadStarted) return;
    loadStarted = true;
    fetch(new URL("./demos.json", import.meta.url))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("manifest"))))
      .then((data) => {
        demos = (data && data.demos) || [];
        if (!demos.length) return renderFallback();
        if (!activeId) {
          activeId =
            tabs.map((tab) => tab.dataset.demo).find((id) => demos.some((d) => d.id === id)) ?? demos[0].id;
        }
        render();
      })
      .catch(() => {
        loadStarted = false;
        renderFallback();
      });
  };

  const io = new IntersectionObserver(
    (entries, obs) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      obs.disconnect();
      loadOnce();
    },
    { rootMargin: "200px 0px", threshold: 0 },
  );
  io.observe(root);

  // If the section is already in (or near) the viewport at init, don't wait for
  // a scroll event — load right away.
  const rect = root.getBoundingClientRect();
  if (rect.top < window.innerHeight + 200 && rect.bottom > -200) loadOnce();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPlayground);
} else {
  initPlayground();
}
