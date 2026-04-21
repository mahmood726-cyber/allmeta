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
    _cachedModels: null,

    async detect() {
      try {
        const r = await fetch(`${this.base}/api/tags`, { method: "GET" });
        if (!r.ok) return { available: false, error: `HTTP ${r.status}` };
        const j = await r.json();
        const names = (j.models || []).map(m => m.name);
        this._cachedModels = names;
        // Try to pick a reasonable default
        let def = null;
        for (const p of PREFERRED_MODELS) {
          if (names.includes(p)) { def = p; break; }
        }
        if (!def && names.length) def = names[0];
        return { available: true, models: names, default: def };
      } catch (e) {
        return { available: false, error: e.message };
      }
    },

    async generate({ model, prompt, system, format }) {
      const body = { model, prompt, stream: false };
      if (system) body.system = system;
      if (format) body.format = format; // "json" for structured
      const r = await fetch(`${this.base}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`Ollama HTTP ${r.status}: ${t.slice(0, 200)}`);
      }
      const j = await r.json();
      return j.response || "";
    },

    async extractJSON({ model, task, input, schemaHint }) {
      const system = `You are a careful biomedical research assistant. Extract structured data exactly as requested. Output ONLY valid JSON — no prose, no code fences, no commentary.`;
      const prompt = `Task: ${task}

Expected JSON schema (example shape; keep keys, use null if unknown):
${schemaHint}

Input text:
${input}

Respond with JSON only.`;
      const text = await this.generate({ model, prompt, system, format: "json" });
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
      wrap.innerHTML = `
        <summary style="cursor:pointer; padding:0.6rem 0.9rem; font-weight:600; display:flex; align-items:center; gap:0.4rem">
          <span>🤖 ${escapeHtml(opts.title || "Local AI helper")}</span>
          <span class="localllm-status" style="font-size:0.72rem; padding:0.1rem 0.45rem; border-radius:999px; background:#e0e0e0; color:#444">checking…</span>
        </summary>
        <div class="localllm-body" style="padding:0 0.9rem 0.9rem">
          <div class="localllm-setup" style="display:none; background:#fff4d5; border-left:3px solid #b05a1c; padding:0.55rem 0.8rem; border-radius:4px; font-size:0.82rem; margin-bottom:0.6rem">
            <strong>Ollama not detected.</strong> Install from <a href="https://ollama.com" target="_blank" rel="noopener">ollama.com</a>, pull a model (<code>ollama pull llama3.1:8b</code>), set
            <code>OLLAMA_ORIGINS="${escapeHtml(window.location.origin)}"</code>, and restart Ollama. See the <a href="../local-ai/" target="_blank">Local AI setup guide</a>.
          </div>
          <label style="display:block; margin-bottom:0.4rem">
            <span style="display:block; font-size:0.76rem; color:#666; margin-bottom:0.15rem">Model</span>
            <select class="localllm-model" style="width:100%; padding:0.3rem 0.5rem; border:1px solid var(--border, #ccc); background:var(--input-bg, #fff); color:inherit; border-radius:5px; font:inherit; font-size:0.85rem"></select>
          </label>
          <label style="display:block; margin-bottom:0.4rem">
            <span style="display:block; font-size:0.76rem; color:#666; margin-bottom:0.15rem">Paste text</span>
            <textarea class="localllm-input" style="width:100%; min-height:5rem; padding:0.4rem 0.55rem; border:1px solid var(--border, #ccc); background:var(--input-bg, #fff); color:inherit; border-radius:5px; font:inherit; font-size:0.82rem" placeholder="${escapeHtml(opts.placeholder || "Paste the text to extract from…")}">${escapeHtml(opts.defaultInput || "")}</textarea>
          </label>
          <button type="button" class="localllm-run" style="padding:0.4rem 0.9rem; background:var(--accent, #2c5e8a); color:#fff; border:none; border-radius:5px; font-weight:600; font-size:0.85rem; cursor:pointer">Extract</button>
          <pre class="localllm-out" style="margin:0.6rem 0 0; padding:0.6rem 0.8rem; background:var(--input-bg, #f5f5f5); border:1px solid var(--border, #ccc); border-radius:5px; font:0.8rem 'SF Mono', Consolas, monospace; white-space:pre-wrap; max-height:15rem; overflow:auto"></pre>
        </div>`;
      host.appendChild(wrap);

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

      runBtn.addEventListener("click", async () => {
        const model = modelSel.value;
        const input = inputEl.value.trim();
        if (!input) { outEl.textContent = "Paste some text first."; return; }
        if (!model) { outEl.textContent = "Pick a model first."; return; }
        runBtn.disabled = true;
        runBtn.textContent = "Thinking…";
        outEl.textContent = "Sending to local model…";
        try {
          const result = await this.extractJSON({ model, task: opts.task, input, schemaHint: opts.schemaHint });
          outEl.textContent = JSON.stringify(result, null, 2);
          if (typeof opts.onResult === "function") opts.onResult(result);
        } catch (err) {
          outEl.textContent = "Error: " + err.message;
        } finally {
          runBtn.disabled = false;
          runBtn.textContent = "Extract";
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
