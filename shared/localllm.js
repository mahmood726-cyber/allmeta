// localllm.js — tiny browser shim for a locally-running Ollama instance.
// Detects Ollama on 127.0.0.1:11434, lists models, and runs JSON-structured prompts.
// Data never leaves the user's machine: Ollama runs locally; this script just speaks HTTP to it.
//
// Requires the user to set OLLAMA_ORIGINS to include the page's origin, e.g.:
//   macOS / Linux:   export OLLAMA_ORIGINS='https://mahmood726-cyber.github.io'
//   Windows (CMD):   setx OLLAMA_ORIGINS "https://mahmood726-cyber.github.io"
// Then restart Ollama.

(function (global) {
  "use strict";

  const DEFAULT_BASE = "http://127.0.0.1:11434";
  const PREFERRED_MODELS = ["llama3.1:8b", "llama3.1", "qwen2.5-coder:7b", "qwen2.5-coder", "mistral:7b", "mistral", "gemma2:9b", "gemma2", "gpt-oss:20b"];

  const LocalLLM = {
    base: DEFAULT_BASE,
    _detectPromise: null,   // coalesced detect() across concurrent callers
    DEFAULT_TIMEOUT_MS: 180_000,
    escapeHtml,             // exposed so consumers can avoid duplicate defs

    async detect(opts) {
      // Coalesce concurrent detect calls. opts.force bypasses the cache.
      if (this._detectPromise && !(opts && opts.force)) return this._detectPromise;
      const p = (async () => {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 4_000);
        try {
          const r = await fetch(`${this.base}/api/tags`, { method: "GET", signal: ctl.signal });
          if (!r.ok) return { available: false, error: `HTTP ${r.status}` };
          const j = await r.json();
          const names = (j.models || []).map(m => typeof m.name === "string" ? m.name : null).filter(Boolean);
          let def = null;
          for (const pref of PREFERRED_MODELS) { if (names.includes(pref)) { def = pref; break; } }
          if (!def && names.length) def = names[0];
          return { available: true, models: names, default: def, raw: j };
        } catch (e) {
          return { available: false, error: e.message };
        } finally {
          clearTimeout(t);
        }
      })();
      this._detectPromise = p;
      // Clear the cache after a short window so the status pill can refresh on demand
      setTimeout(() => { if (this._detectPromise === p) this._detectPromise = null; }, 2_000);
      return p;
    },

    async generate({ model, prompt, system, format, signal, timeoutMs }) {
      const body = { model, prompt, stream: false };
      if (system) body.system = system;
      if (format) body.format = format; // "json" for structured
      const ctl = signal ? null : new AbortController();
      const effectiveSignal = signal || ctl.signal;
      const t = ctl ? setTimeout(() => ctl.abort(), timeoutMs || this.DEFAULT_TIMEOUT_MS) : null;
      try {
        const r = await fetch(`${this.base}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: effectiveSignal,
        });
        if (!r.ok) {
          const t2 = await r.text();
          throw new Error(`Ollama HTTP ${r.status}: ${t2.slice(0, 200)}`);
        }
        const j = await r.json();
        return j.response || "";
      } finally {
        if (t) clearTimeout(t);
      }
    },

    async extractJSON({ model, task, input, schemaHint, signal, timeoutMs }) {
      const system = `You are a careful biomedical research assistant. Extract structured data exactly as requested. Output ONLY valid JSON — no prose, no code fences, no commentary.`;
      const prompt = `Task: ${task}

Expected JSON schema (example shape; keep keys, use null if unknown):
${schemaHint}

Input text:
${input}

Respond with JSON only.`;
      const text = await this.generate({ model, prompt, system, format: "json", signal, timeoutMs });
      // Ollama with format=json returns strictly JSON but guard with try/catch
      try { return JSON.parse(text); }
      catch (_) {
        // Try to extract first JSON object via balanced braces
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start >= 0 && end > start) {
          try { return JSON.parse(text.slice(start, end + 1)); } catch (__) { /* fall through */ }
        }
        throw new Error("Model returned non-JSON: " + text.slice(0, 160));
      }
    },

    /**
     * Attach a collapsible AI panel to a host element. Returns the panel node.
     * opts:
     *   title        — panel heading
     *   placeholder  — textarea placeholder
     *   defaultInput — initial textarea content
     *   task         — short task description passed to the model
     *   schemaHint   — JSON schema example string
     *   onResult(obj)— called with parsed JSON from the model
     */
    attachPanel(host, opts) {
      const wrap = document.createElement("details");
      wrap.className = "localllm-panel";
      wrap.style.cssText = "margin-top:1rem; border:1px solid var(--border, #ccc); border-radius:8px; background:var(--panel, #fff); font-size:0.86rem";
      // Build stable IDs so labels can be properly associated
      const uid = `llm-${Math.random().toString(36).slice(2, 8)}`;
      const modelId = `${uid}-model`;
      const inputId = `${uid}-input`;
      const hintId = `${uid}-hint`;
      wrap.innerHTML = `
        <summary style="cursor:pointer; padding:0.6rem 0.9rem; font-weight:600; display:flex; align-items:center; gap:0.4rem">
          <span>🤖 ${escapeHtml(opts.title || "Local AI helper")}</span>
          <span class="localllm-status" role="status" aria-live="polite" aria-atomic="true" style="font-size:0.72rem; padding:0.1rem 0.45rem; border-radius:999px; background:var(--accent-soft, #e0e0e0); color:var(--muted, #444)">checking…</span>
        </summary>
        <div class="localllm-body" style="padding:0 0.9rem 0.9rem">
          <div class="localllm-setup" role="region" aria-label="Ollama setup instructions" style="display:none; background:var(--warn-soft, #fff4d5); border-left:3px solid var(--warn, #b05a1c); padding:0.55rem 0.8rem; border-radius:4px; font-size:0.82rem; margin-bottom:0.6rem">
            <strong>Ollama not detected.</strong> Install from <a href="https://ollama.com" target="_blank" rel="noopener">ollama.com</a>, pull a model (<code>ollama pull llama3.1:8b</code>), set
            <code>OLLAMA_ORIGINS="${escapeHtml(window.location.origin)}"</code>, and restart Ollama. See the <a href="../local-ai/" target="_blank">Local AI setup guide</a>.
          </div>
          <label for="${modelId}" style="display:block; margin-bottom:0.4rem">
            <span style="display:block; font-size:0.76rem; color:var(--muted, #666); margin-bottom:0.15rem">Model</span>
            <select id="${modelId}" class="localllm-model" style="width:100%; padding:0.3rem 0.5rem; border:1px solid var(--border, #ccc); background:var(--input-bg, #fff); color:inherit; border-radius:5px; font:inherit; font-size:0.85rem"></select>
          </label>
          <label for="${inputId}" style="display:block; margin-bottom:0.4rem">
            <span style="display:block; font-size:0.76rem; color:var(--muted, #666); margin-bottom:0.15rem">Paste text</span>
            <textarea id="${inputId}" class="localllm-input" aria-describedby="${hintId}" style="width:100%; min-height:5rem; padding:0.4rem 0.55rem; border:1px solid var(--border, #ccc); background:var(--input-bg, #fff); color:inherit; border-radius:5px; font:inherit; font-size:0.82rem" placeholder="${escapeHtml(opts.placeholder || "Paste the text to extract from…")}">${escapeHtml(opts.defaultInput || "")}</textarea>
            <span id="${hintId}" style="display:block; font-size:0.7rem; color:var(--muted, #666); margin-top:0.2rem">Runs locally via Ollama; data never leaves your device.</span>
          </label>
          <button type="button" class="localllm-run" style="padding:0.4rem 0.9rem; background:var(--accent, #2c5e8a); color:#fff; border:none; border-radius:5px; font-weight:600; font-size:0.85rem; cursor:pointer">Extract</button>
          <pre class="localllm-out" role="status" aria-live="polite" aria-atomic="true" style="margin:0.6rem 0 0; padding:0.6rem 0.8rem; background:var(--input-bg, #f5f5f5); border:1px solid var(--border, #ccc); border-radius:5px; font:0.8rem 'SF Mono', Consolas, monospace; white-space:pre-wrap; max-height:15rem; overflow:auto"></pre>
        </div>`;
      host.appendChild(wrap);

      // Focus management: when the panel opens, move focus into the first input.
      // When it closes, return focus to the <summary>.
      wrap.addEventListener("toggle", () => {
        if (wrap.open) {
          const first = wrap.querySelector(".localllm-input");
          if (first) first.focus();
        }
      });

      const statusEl = wrap.querySelector(".localllm-status");
      const setupEl = wrap.querySelector(".localllm-setup");
      const modelSel = wrap.querySelector(".localllm-model");
      const inputEl = wrap.querySelector(".localllm-input");
      const runBtn = wrap.querySelector(".localllm-run");
      const outEl = wrap.querySelector(".localllm-out");

      this.detect().then(res => {
        if (res.available) {
          statusEl.textContent = `${res.models.length} model${res.models.length === 1 ? "" : "s"}`;
          statusEl.style.background = "#dff3e0"; statusEl.style.color = "#0d7a27";
          modelSel.innerHTML = res.models.map(m => `<option value="${escapeHtml(m)}"${m === res.default ? " selected" : ""}>${escapeHtml(m)}</option>`).join("");
        } else {
          statusEl.textContent = "not detected";
          statusEl.style.background = "#fbd2d2"; statusEl.style.color = "#912121";
          setupEl.style.display = "block";
          runBtn.disabled = true;
          runBtn.style.opacity = "0.5";
          runBtn.style.cursor = "not-allowed";
          modelSel.innerHTML = `<option>(no models)</option>`;
          modelSel.disabled = true;
        }
      });

      // Cancellation: replace the "Extract" button with a "Cancel" button while running.
      let activeAbort = null;
      const self = this;
      runBtn.addEventListener("click", async () => {
        if (activeAbort) {
          activeAbort.abort();
          return;
        }
        const model = modelSel.value;
        const input = inputEl.value.trim();
        if (!input) { outEl.textContent = "Paste some text first."; return; }
        if (!model) { outEl.textContent = "Pick a model first."; return; }
        activeAbort = new AbortController();
        runBtn.textContent = "Cancel";
        runBtn.style.background = "var(--warn, #b05a1c)";
        const started = Date.now();
        outEl.textContent = "Sending to local model… (click Cancel to abort)";
        const tickEl = document.createElement("span");
        tickEl.style.cssText = "font-size:0.75rem; color:var(--muted, #666); margin-left:0.5rem";
        runBtn.after(tickEl);
        const tick = setInterval(() => {
          tickEl.textContent = `${((Date.now() - started) / 1000).toFixed(0)}s`;
        }, 500);
        try {
          const result = await self.extractJSON({
            model, task: opts.task, input, schemaHint: opts.schemaHint,
            signal: activeAbort.signal,
          });
          outEl.textContent = JSON.stringify(result, null, 2);
          if (typeof opts.onResult === "function") opts.onResult(result);
        } catch (err) {
          outEl.textContent = err.name === "AbortError" ? "Cancelled." : "Error: " + err.message;
        } finally {
          clearInterval(tick);
          tickEl.remove();
          activeAbort = null;
          runBtn.textContent = "Extract";
          runBtn.style.background = "";
        }
      });

      return wrap;
    },
  };

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  global.LocalLLM = LocalLLM;
})(typeof window !== "undefined" ? window : this);
