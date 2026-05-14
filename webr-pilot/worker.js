// SharedWorker pilot for WebR. Cycle 6.5.
//
// Goal: determine empirically whether WebR can run inside a SharedWorker,
// so multiple tabs / iframes in the allmeta hub can share a single R session.
//
// Each connecting port sends string commands; we reply with structured
// {type, ...} messages so the test harness can drive each capability probe.
//
// Capability checks the harness sends, in order:
//   "import"   -> import('../r-shiny/shinylive/webr/webr.mjs')
//   "init"     -> new WebR({baseUrl}); await webR.init()
//   "math"     -> evalRString("2+2"); expect "[1] 4"
//   "vector"   -> evalRString("sum(1:100)"); expect "[1] 5050"
//   "metafor"  -> installPackages(['metafor']); library it
//   "rma"      -> run a tiny rma() call and capture summary text
//   "plot"     -> capture a base-graphics plot to an image
//   "shared-count" -> how many ports are connected (proves sharing)
//   "session" -> globalThis.SESSION_ID (proves session reuse across tabs)

let webR = null;
let importedMod = null;
let modErr = null;
const ports = new Set();

// Stable session ID — same value for every port = proof of session sharing
self.SESSION_ID = Math.random().toString(36).slice(2, 10);
self.SESSION_STARTED_AT = Date.now();

function broadcast(msg) {
  for (const p of ports) {
    try { p.postMessage(msg); } catch (_) {}
  }
}

async function handleCommand(port, cmd) {
  const reply = (data) => port.postMessage({ ...data, cmd, t: Date.now() });

  try {
    if (cmd === "session") {
      reply({ ok: true, sessionId: self.SESSION_ID, age_ms: Date.now() - self.SESSION_STARTED_AT, ports: ports.size });
      return;
    }

    if (cmd === "import") {
      if (importedMod) { reply({ ok: true, cached: true }); return; }
      const t0 = Date.now();
      try {
        importedMod = await import("../r-shiny/shinylive/webr/webr.mjs");
        reply({ ok: true, ms: Date.now() - t0, hasWebR: !!importedMod.WebR });
      } catch (e) {
        modErr = String(e);
        reply({ ok: false, error: modErr });
      }
      return;
    }

    if (cmd === "init") {
      if (webR) { reply({ ok: true, cached: true }); return; }
      if (!importedMod) { reply({ ok: false, error: "webr.mjs not imported yet" }); return; }
      const t0 = Date.now();
      try {
        const baseUrl = new URL("../r-shiny/shinylive/webr/", self.location.href).href;
        webR = new importedMod.WebR({ interactive: false, baseUrl });
        await webR.init();
        reply({ ok: true, ms: Date.now() - t0 });
      } catch (e) {
        reply({ ok: false, error: String(e), stack: (e && e.stack) || null });
        webR = null;
      }
      return;
    }

    if (!webR && cmd !== "ping") {
      reply({ ok: false, error: "WebR not initialised" });
      return;
    }

    if (cmd === "math") {
      const t0 = Date.now();
      const shelter = await new webR.Shelter();
      try {
        const r = await shelter.captureR("2+2");
        const out = r.output.map(o => o.data).join("\n");
        reply({ ok: true, ms: Date.now() - t0, out });
      } finally { shelter.purge(); }
      return;
    }

    if (cmd === "vector") {
      const t0 = Date.now();
      const shelter = await new webR.Shelter();
      try {
        const r = await shelter.captureR("sum(1:100)");
        const out = r.output.map(o => o.data).join("\n");
        reply({ ok: true, ms: Date.now() - t0, out });
      } finally { shelter.purge(); }
      return;
    }

    if (cmd === "metafor") {
      const t0 = Date.now();
      try {
        await webR.installPackages(["metafor"], { quiet: true });
        const shelter = await new webR.Shelter();
        try {
          const r = await shelter.captureR("library(metafor); 'loaded'");
          const out = r.output.map(o => o.data).join("\n");
          reply({ ok: true, ms: Date.now() - t0, out });
        } finally { shelter.purge(); }
      } catch (e) {
        reply({ ok: false, error: String(e), stack: (e && e.stack) || null });
      }
      return;
    }

    if (cmd === "rma") {
      const t0 = Date.now();
      const shelter = await new webR.Shelter();
      try {
        const r = await shelter.captureR(`
library(metafor)
dat <- data.frame(
  yi = c(0.10, -0.05, 0.25, 0.30, -0.10, 0.15, 0.40, 0.05, 0.20, -0.15),
  vi = c(0.02, 0.03, 0.04, 0.02, 0.05, 0.03, 0.04, 0.06, 0.02, 0.05)
)
res <- rma(yi=yi, vi=vi, data=dat, method="REML")
print(summary(res))
`);
        const out = r.output.map(o => o.data).join("\n");
        reply({ ok: true, ms: Date.now() - t0, out: out.slice(0, 4000) });
      } catch (e) {
        reply({ ok: false, error: String(e), stack: (e && e.stack) || null });
      } finally { shelter.purge(); }
      return;
    }

    if (cmd === "plot") {
      const t0 = Date.now();
      const shelter = await new webR.Shelter();
      try {
        const r = await shelter.captureR(`
plot(1:10, (1:10)^2, type="b", main="pilot plot", col="steelblue")
`, { captureGraphics: true });
        const imgCount = (r.images || []).length;
        reply({ ok: imgCount > 0, ms: Date.now() - t0, imageCount: imgCount, outputLines: r.output.length });
      } catch (e) {
        reply({ ok: false, error: String(e), stack: (e && e.stack) || null });
      } finally { shelter.purge(); }
      return;
    }

    if (cmd === "shared-count") {
      reply({ ok: true, ports: ports.size });
      return;
    }

    if (cmd === "ping") {
      reply({ ok: true });
      return;
    }

    reply({ ok: false, error: "unknown command: " + cmd });

  } catch (e) {
    reply({ ok: false, error: String(e), stack: (e && e.stack) || null });
  }
}

self.onconnect = (event) => {
  const port = event.ports[0];
  ports.add(port);
  port.onmessage = (m) => handleCommand(port, m.data);
  port.onmessageerror = () => {};
  port.start();
  port.postMessage({ type: "hello", sessionId: self.SESSION_ID, ports: ports.size });
};
