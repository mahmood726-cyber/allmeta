// toast.js — non-blocking notification helper for inner apps.
//
// Usage: include via `<script src="../shared/toast.js" defer></script>` and
// replace `alert("…")` with `Toast.show("…")`. Long-form: `Toast.show(msg, "warn", 4000)`.
// Levels: "info" (default), "warn", "error". The toast appears bottom-right,
// auto-dismisses after `duration` ms (default 2400), and auto-stacks if
// multiple are active. No external dependencies; CSP-friendly (no inline
// styles after init — uses class selectors only).

(function (global) {
  "use strict";

  let containerEl = null;

  function ensureContainer() {
    if (containerEl && document.body.contains(containerEl)) return containerEl;
    if (!document.getElementById("__toast-style")) {
      const style = document.createElement("style");
      style.id = "__toast-style";
      style.textContent = `
.toast-container { position: fixed; bottom: 1rem; right: 1rem; z-index: 9999; display: flex; flex-direction: column; gap: 0.5rem; pointer-events: none; }
.toast-item { background: #1c1f23; color: #fffaf1; padding: 0.55rem 0.95rem; border-radius: 6px; font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; box-shadow: 0 6px 24px rgba(0,0,0,0.18); max-width: min(420px, 80vw); pointer-events: auto; opacity: 0; transform: translateY(8px); transition: opacity 0.18s ease, transform 0.18s ease; }
.toast-item.is-visible { opacity: 1; transform: translateY(0); }
.toast-item.toast-warn { background: #b05a1c; }
.toast-item.toast-error { background: #912121; }
.toast-item.toast-info { background: #1c1f23; }
@media (prefers-color-scheme: light) {
  .toast-item.toast-info { background: #15181d; color: #fafaf6; }
}
@media (prefers-reduced-motion: reduce) {
  .toast-item { transition: none; }
}
`;
      document.head.appendChild(style);
    }
    containerEl = document.createElement("div");
    containerEl.className = "toast-container";
    // role=status implies aria-live=polite; explicit aria-live is redundant.
    containerEl.setAttribute("role", "status");
    containerEl.setAttribute("aria-atomic", "false");
    document.body.appendChild(containerEl);
    // V8-A11Y-05: keyboard dismissal — Escape removes the most recent visible toast.
    if (!document.__toastEscapeBound) {
      document.addEventListener("keydown", function (e) {
        if (e.key !== "Escape") return;
        // V9-E14: bail if container was detached from DOM (SPA route change);
        // next show() will rebuild via ensureContainer().
        if (!containerEl || !document.body.contains(containerEl)) {
          containerEl = null;
          return;
        }
        const visible = containerEl.querySelectorAll(".toast-item.is-visible");
        if (!visible.length) return;
        const last = visible[visible.length - 1];
        // V12-E04 — clear the auto-dismiss timer so it doesn't fire later
        // on a detached node (and accumulate timers in long sessions).
        if (last.__dismissTimer) { clearTimeout(last.__dismissTimer); last.__dismissTimer = null; }
        last.classList.remove("is-visible");
        setTimeout(() => last.remove(), 220);
      });
      document.__toastEscapeBound = true;
    }
    return containerEl;
  }

  function show(msg, level, duration) {
    if (!msg) return;
    const c = ensureContainer();
    const item = document.createElement("div");
    item.className = "toast-item toast-" + (level || "info");
    item.textContent = String(msg);
    c.appendChild(item);
    requestAnimationFrame(() => item.classList.add("is-visible"));
    const ms = Number.isFinite(duration) ? duration : (level === "error" ? 4000 : 2400);
    // V12-E04 — store timer id on the element so the Escape handler can
    // clearTimeout before manually fading; prevents leaked closures and
    // stranded setTimeout callbacks firing on detached nodes.
    const timerId = setTimeout(() => {
      item.classList.remove("is-visible");
      setTimeout(() => item.remove(), 220);
    }, ms);
    item.__dismissTimer = timerId;
  }

  global.Toast = { show };
})(typeof window !== "undefined" ? window : this);
