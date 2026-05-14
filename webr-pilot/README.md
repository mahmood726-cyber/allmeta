# WebR-in-SharedWorker pilot (Cycle 6.5)

This folder is a **documented dead-end**. It is the evidence behind the
decision to *not* pursue a shared-R-session architecture for allmeta.
Keep it in the tree so a future contributor doesn't re-propose the
same approach without seeing why it was ruled out.

## What it tests

A standalone two-file harness:

- `worker.js` — a SharedWorker that imports WebR and exposes 9 probe
  commands over its message port (`import`, `init`, `math`, `vector`,
  `metafor`, `rma`, `plot`, `session`, `shared-count`).
- `index.html` — a button row that drives each probe sequentially and
  logs the structured reply.

Open it directly at
`https://mahmood726-cyber.github.io/allmeta/webr-pilot/` and click
**Run all in order**. A second tab opened to the same URL would (if
WebR initialised) share the same SharedWorker instance.

## Why we wanted this

If WebR could run inside a SharedWorker, the allmeta hub could keep
one R session warm across every tab/iframe. Navigating into
`/webr-studio/` would attach to an already-booted R session — the
real ~28 s cold load would drop to ~1 s. This is the only known way
to break through WebR's intrinsic WASM-compile + R-interpreter-init
ceiling on a hub like ours.

## Result — decisive failure at step 4

Probe run 2026-05-14 against Chromium via Playwright (deployed live
site):

```
1.  SharedWorker constructs                     OK
2.  Port communication / HELLO message          OK
3.  import('../r-shiny/shinylive/webr/webr.mjs')   OK  (149 ms)
4.  new WebR({...}).init()                      FAIL
        ReferenceError: Worker is not defined
        at new Le (webr.mjs:1:54240)
        at ls (webr.mjs:1:55041)
        at new Bt (webr.mjs:2:3286)
5-9. (blocked by step 4)                        n/a
```

## Why it fails

WebR's constructor immediately calls `new Worker(...)` to spawn its
R-interpreter thread. The HTML spec permits nested workers (a
SharedWorker creating a DedicatedWorker), but **Chromium does not
implement that part of the spec**. The `Worker` global is simply not
exposed inside a SharedWorker scope in any Blink-based browser
(Chrome, Edge, Brave, Opera) or in WebKit (Safari).

Firefox is the only major engine that implements nested workers from
a SharedWorker. Shipping an architecture that only works in Firefox
is not viable for the allmeta audience.

The relevant upstream issue has been open on `bugs.chromium.org` for
many years. Until it lands, every approach that relies on running
WebR inside a SharedWorker is blocked at this exact line.

## What would unblock this

Any one of the following would re-open this avenue:

1. Chromium ships nested workers from SharedWorker. (Out of our
   control; track the open bug.)
2. WebR upstream changes its internal model so it does *not* spawn a
   nested Worker — e.g. running R directly in the SharedWorker
   thread, or using a ServiceWorker only. Significant rewrite of how
   R is hosted; unlikely without an explicit upstream push.
3. We accept Firefox-only for this code path and gate it accordingly.
   Possible but adds maintenance cost; not currently justified.

## What we shipped instead

See Cycle 6.3 (local-baseUrl WASM caching), Cycle 6.3.1 (absolute
baseUrl fix), Cycle 6.3.2 (hub SW registration from webr-studio /
webr-validator) and Cycle 6.4 (progressive boot UX). The combined
effect:

- Cold first-ever visit: ~30 s, but visible progress + editable
  textareas so the wait *feels* like ~10 s.
- Warm revisits: ~4–8 s (everything served from the SW cache, zero
  CDN).
- Zero dependency on `webr.r-wasm.org` for the bundled-app flow.

## How to re-run this pilot

```
# from anywhere
xdg-open https://mahmood726-cyber.github.io/allmeta/webr-pilot/   # Linux
start    https://mahmood726-cyber.github.io/allmeta/webr-pilot/   # Windows
open     https://mahmood726-cyber.github.io/allmeta/webr-pilot/   # macOS
```

Or programmatically via the Playwright probe that produced the result
above:

```
node hub/shared/tests/.sharedworker-pilot-probe.mjs
```

Re-run the pilot whenever Chromium updates a major version
(`chrome://version`) and `caniuse.com` shows movement on
"Nested workers from SharedWorker". When step 4 turns green, the
shared-R-session architecture becomes available and Cycle 6.5 can be
revisited.
