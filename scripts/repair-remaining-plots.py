"""One-time, source-guarded repair. Source is committed only after browser tests."""
from pathlib import Path
import hashlib

def load(path, expected):
    raw = Path(path).read_bytes()
    actual = hashlib.sha1(f'blob {len(raw)}\0'.encode() + raw).hexdigest()
    assert actual == expected, f'Source changed: {path}: {actual}'
    return raw.decode('utf-8')

p = Path('IPD-Meta-Pro/ipd-meta-pro.html')
t = load(str(p), '7c0ea6608f22f5b30d12563220d39075856e73cc')
module = Path('IPD-Meta-Pro/src/diagnostic-plots.js').read_text()
assert '</script' not in module.lower()
assert 'BEGIN IPD DIAGNOSTIC PLOT COMPLETION' not in t
pos = t.rfind('</body>')
assert pos > 0
block = '\n<!-- BEGIN IPD DIAGNOSTIC PLOT COMPLETION -->\n<script>\n' + module + '\n</script>\n<!-- END IPD DIAGNOSTIC PLOT COMPLETION -->\n'
p.write_bytes((t[:pos] + block + t[pos:]).encode('utf-8'))

p = Path('webr-studio/index.html')
t = load(str(p), '1e894ff56049cd70f9675d0ba80cbcfbdcf01942')
a = t.index('    btnRun.addEventListener("click", async () => {')
b = t.index('    // Escape out of the R editor', a)
t = t[:a] + '''    btnRun.addEventListener("click", async () => {
      if (!webR || btnRun.disabled) return;
      const key = document.getElementById("tpl").value;
      const tpl = TEMPLATES[key];
      const parsed = tpl.parse(document.getElementById("data").value);
      if (parsed.length === 0) { outEl.textContent = "No valid rows parsed from input."; return; }
      const dfCode = toRDataFrame(parsed);
      const userCode = document.getElementById("r-code").value;
      btnRun.disabled = true;
      outEl.textContent = "Running…";
      plotWrap.style.display = "none";
      plotHost.replaceChildren();
      plotHost.dataset.plotCount = "0";
      let shelter = null, capture = null;
      try {
        await ensurePackages(["metafor", ...(tpl.packages || [])]);
        statusEl.textContent = "running"; statusEl.className = "status-badge loading";
        shelter = await new webR.Shelter();
        await webR.evalRVoid(dfCode);
        // captureR owns its graphics device. Display every returned page,
        // including boxplot/barplot/ggplot and plots invoked through functions.
        // A command-name regexp or a second SVG device loses real R output.
        capture = await shelter.captureR(userCode, {
          withAutoprint: true,
          captureGraphics: { width: 800, height: 600 }
        });
        for (const [index, image] of (capture.images || []).entries()) {
          const figure = document.createElement("figure");
          figure.style.margin = "0 0 1rem";
          const canvas = document.createElement("canvas");
          canvas.width = image.width; canvas.height = image.height;
          canvas.style.cssText = "display:block;width:100%;height:auto;background:white";
          canvas.setAttribute("role", "img");
          canvas.setAttribute("aria-label", "R plot " + (index + 1));
          canvas.dataset.plotPage = String(index + 1);
          canvas.getContext("2d").drawImage(image, 0, 0);
          const caption = document.createElement("figcaption");
          caption.textContent = "R plot " + (index + 1);
          figure.append(canvas, caption);
          plotHost.appendChild(figure);
        }
        const count = capture.images?.length || 0;
        plotHost.dataset.plotCount = String(count);
        if (count) plotWrap.style.display = "block";
        const output = capture.output.filter(x => ["stdout", "stderr", "message", "warning", "error"].includes(x.type))
          .map(x => typeof x.data === "string" ? x.data : (x.data?.message || JSON.stringify(x.data))).join("\\n");
        const hasError = capture.output.some(x => x.type === "error");
        outEl.textContent = (output || "(no textual output)") + (count ? "\\n" + count + " plot page(s) displayed." : "\\nThis run produced no plots.");
        statusEl.textContent = hasError ? "R error" : "ready";
        statusEl.className = "status-badge " + (hasError ? "error" : "ready");
      } catch (err) {
        outEl.textContent = "R error:\\n" + String(err);
        statusEl.textContent = "R error"; statusEl.className = "status-badge error";
      } finally {
        for (const image of capture?.images || []) image.close();
        if (shelter) { try { await shelter.purge(); } catch (_) {} }
        btnRun.disabled = false;
      }
    });

''' + t[b:]
p.write_bytes(t.encode('utf-8'))
print('IPD diagnostics embedded; WebR Studio now renders every captured plot page.')
