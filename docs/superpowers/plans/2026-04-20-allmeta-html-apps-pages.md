# allmeta — HTML Apps GitHub Pages Deployment Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `C:\HTML apps` (30 cards, 25 internal + 5 external, 2.48 GB) as `mahmood726-cyber/allmeta` on GitHub Pages at `https://mahmood726-cyber.github.io/allmeta/`, gated by a Playwright pre-flight that screenshots every internal app and verifies at least one plot surface renders.

**Architecture:** Copy source → trim heavy folders to transitive asset closure → rewrite 5 external hub links to their own Pages URLs → run Playwright harness locally (Chromium + `http-server` on :8080) → human gate on the report → push + enable Pages + wire CI that re-runs Playwright on every commit.

**Tech Stack:** Git + GitHub CLI (`gh`) for remote; Python 3 for trim/verify scripts; Node 20 + `@playwright/test` + `http-server` for the test harness; GitHub Actions (`actions/deploy-pages@v4`) for deploy.

---

## File Structure

```
C:\Projects\allmeta\
├── .gitignore                            (NEW)
├── .nojekyll                             (NEW, empty — disables Jekyll on Pages)
├── .pages-exclude                        (NEW — log of what we trimmed)
├── README.md                             (NEW)
├── index.html                            (COPY from source, unchanged)
├── hub/                                  (COPY from source; projects.js MODIFIED in §2)
│   ├── app.js
│   ├── app-style.css
│   ├── projects.js                       (external `../` paths rewritten)
│   ├── styles.css
│   └── webr-adapter.js
├── <25 internal app folders>             (COPY; heavy ones trimmed)
├── scripts/                              (NEW)
│   ├── trim_audit.py                     (NEW — compute transitive asset closure)
│   └── verify_external_pages.py          (NEW — check gh Pages status of 5 externals)
├── tests/
│   └── playwright/                       (NEW)
│       ├── package.json
│       ├── package-lock.json
│       ├── playwright.config.ts
│       ├── apps.ts                       (reads hub/projects.js, yields internal targets)
│       ├── hub-crawl.spec.ts             (the per-app test body)
│       └── artifacts/                    (gitignored — screenshots + report.json)
├── .github/workflows/                    (NEW)
│   ├── playwright.yml
│   └── pages.yml
└── docs/superpowers/
    ├── specs/2026-04-20-allmeta-html-apps-pages-design.md   (already committed)
    └── plans/2026-04-20-allmeta-html-apps-pages.md          (THIS FILE)
```

**Design note — why not formal TDD on the Python scripts:** `trim_audit.py` and `verify_external_pages.py` are one-shot tooling whose correctness is verified by running them on the real source tree and eyeballing output (file list, HTTP status). The "product" here is the deployed Pages site + passing Playwright harness — and the Playwright harness itself IS the test suite for the product. Adding unit tests on the tooling would be over-engineering.

---

## Phase 0 — Scaffold

### Task 0.1: Create `.gitignore`

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Write the file**

```gitignore
# Playwright
tests/playwright/node_modules/
tests/playwright/artifacts/
tests/playwright/playwright-report/
tests/playwright/test-results/
tests/playwright/blob-report/

# Python
__pycache__/
*.pyc
.pytest_cache/

# OS
.DS_Store
Thumbs.db

# Editor
.vscode/
.idea/
*.swp
```

- [ ] **Step 2: Commit**

```bash
cd C:/Projects/allmeta
git add .gitignore
git commit -m "chore: gitignore for playwright artifacts + python + editor"
```

### Task 0.2: Copy source hub + index

**Files:**
- Create: `index.html` (copied verbatim)
- Create: `hub/` (copied verbatim; edited in Phase 2)

- [ ] **Step 1: Copy**

```bash
cd C:/Projects/allmeta
cp "/c/HTML apps/index.html" ./index.html
cp -r "/c/HTML apps/hub" ./hub
```

- [ ] **Step 2: Verify**

```bash
ls -la hub/
# Expected: app.js, app-style.css, projects.js, styles.css, webr-adapter.js, plus non-code files (E156-PROTOCOL.md, e156-submission/, push.sh)
```

- [ ] **Step 3: Remove hub non-web artifacts**

```bash
cd C:/Projects/allmeta/hub
rm -f push.sh E156-PROTOCOL.md
rm -rf e156-submission/
```

- [ ] **Step 4: Commit**

```bash
cd C:/Projects/allmeta
git add index.html hub/
git commit -m "feat: scaffold hub (index.html + hub/ assets)"
```

### Task 0.3: Write README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write the file**

```markdown
# allmeta — HTML Apps Hub

Live site: https://mahmood726-cyber.github.io/allmeta/

Mirror of the portable, browser-only evidence-synthesis tools in `C:\HTML apps`. Each app is a single-file HTML artifact (or a small bundle of HTML + JS + CSS) and runs without a backend.

## Local use

```bash
git clone https://github.com/mahmood726-cyber/allmeta
cd allmeta
python -m http.server 8080
# Open http://localhost:8080
```

## What's shipped

- **25 internal apps** copied into this repo.
- **5 external cards** in the hub (AdaptSim, Al-Mizan, CardioOracle, CardioSynth Phase 0, NICECardiology) link to their own GitHub Pages deployments.

## Testing

Every push runs a Playwright pre-flight that screenshots each app and verifies at least one plot surface renders. See `tests/playwright/`.
```

- [ ] **Step 2: Commit**

```bash
cd C:/Projects/allmeta
git add README.md
git commit -m "docs: README with local-use instructions"
```

---

## Phase 1 — Trim heavy folders

### Task 1.1: Write `scripts/trim_audit.py`

**Files:**
- Create: `scripts/trim_audit.py`

- [ ] **Step 1: Write the script**

```python
"""trim_audit.py — compute transitive asset closure of an HTML entry point.

Usage:
    python trim_audit.py --src "C:/HTML apps/Truthcert1" --entry "index.html"
    python trim_audit.py --src "C:/HTML apps/Truthcert1" --entry "index.html" --apply --dst "C:/Projects/allmeta/Truthcert1"

Walks from the entry HTML, follows src=, href=, import from, fetch("...") references
(two levels deep), returns the set of files needed. Prints a summary table with sizes.
With --apply, copies ONLY those files into --dst (preserving relative structure).
Anything not in the closure is written to stdout as 'EXCLUDED: <path>'.
"""
from __future__ import annotations
import argparse, re, shutil, sys
from pathlib import Path

ASSET_PATTERNS = [
    re.compile(r'''src\s*=\s*["']([^"'#?]+)'''),
    re.compile(r'''href\s*=\s*["']([^"'#?]+)'''),
    re.compile(r'''import\s+[^"']*["']([^"'#?]+)'''),
    re.compile(r'''import\s*\(\s*["']([^"'#?]+)'''),
    re.compile(r'''fetch\s*\(\s*["']([^"'#?]+)'''),
    re.compile(r'''url\s*\(\s*["']?([^"')#?]+)'''),
]

TEXT_SUFFIXES = {".html", ".htm", ".js", ".mjs", ".css", ".json", ".svg"}


def closure(src_root: Path, entry: Path, max_depth: int = 3) -> set[Path]:
    seen: set[Path] = set()
    frontier: list[tuple[Path, int]] = [(entry, 0)]
    while frontier:
        file, depth = frontier.pop()
        if file in seen or not file.exists() or depth > max_depth:
            continue
        seen.add(file)
        if file.suffix.lower() not in TEXT_SUFFIXES:
            continue
        try:
            text = file.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        for pat in ASSET_PATTERNS:
            for m in pat.finditer(text):
                ref = m.group(1)
                if ref.startswith(("http://", "https://", "//", "data:", "mailto:")):
                    continue
                ref = ref.lstrip("./")
                candidate = (file.parent / ref).resolve()
                try:
                    candidate.relative_to(src_root.resolve())
                except ValueError:
                    continue
                frontier.append((candidate, depth + 1))
    return seen


def human(n: int) -> str:
    for u in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f}{u}"
        n /= 1024
    return f"{n:.1f}TB"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--entry", required=True)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--dst", default=None)
    args = ap.parse_args()

    src_root = Path(args.src)
    entry = src_root / args.entry
    if not entry.exists():
        print(f"ERROR: entry not found: {entry}", file=sys.stderr)
        return 2

    kept = closure(src_root, entry)
    all_files = {p for p in src_root.rglob("*") if p.is_file()}
    excluded = all_files - kept

    kept_bytes = sum(p.stat().st_size for p in kept if p.is_file())
    excluded_bytes = sum(p.stat().st_size for p in excluded)

    print(f"SOURCE:   {src_root} ({human(kept_bytes + excluded_bytes)} total, {len(all_files)} files)")
    print(f"KEPT:     {len(kept)} files ({human(kept_bytes)})")
    print(f"EXCLUDED: {len(excluded)} files ({human(excluded_bytes)})")
    print()
    if not args.apply:
        for p in sorted(excluded):
            print(f"EXCLUDED: {p.relative_to(src_root)}")
        return 0

    if not args.dst:
        print("ERROR: --apply requires --dst", file=sys.stderr)
        return 2
    dst_root = Path(args.dst)
    dst_root.mkdir(parents=True, exist_ok=True)
    for p in sorted(kept):
        if not p.is_file():
            continue
        rel = p.relative_to(src_root)
        out = dst_root / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, out)
    print(f"COPIED {len(kept)} files to {dst_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Smoke-test the script in dry-run mode**

```bash
cd C:/Projects/allmeta
python scripts/trim_audit.py --src "C:/HTML apps/Pairwiseai" --entry "index.html" 2>&1 | head -40
```

Expected: a SOURCE/KEPT/EXCLUDED summary. If entry file name differs (e.g. `index.html` vs something else), the script prints "ERROR: entry not found" — adjust entry per folder in Task 1.2.

- [ ] **Step 3: Commit**

```bash
cd C:/Projects/allmeta
git add scripts/trim_audit.py
git commit -m "feat(scripts): trim_audit.py — transitive asset closure for trimming heavy apps"
```

### Task 1.2: Determine entry file per heavy folder

Heavy folders and their entry HTML (from `hub/projects.js`):

| Folder | Entry |
|---|---|
| Truthcert1 | `index.html` |
| living-meta | `index.html` (verify) |
| dosehtml | `dose-response-pro.html` |
| HTA | `index.html` (verify) |
| IPD-Meta-Pro | `index.html` (verify) |
| nma-pro-v2 | `index.html` (verify) |
| nma-dose-response-app | `index.html` (verify) |
| Pairwiseai | `index.html` (verify) |

- [ ] **Step 1: Read `hub/projects.js` and extract exact entry paths**

```bash
grep -A1 -B1 -E '"(Truthcert1|living-meta|dosehtml|HTA|IPD-Meta-Pro|nma-pro-v2|nma-dose-response-app|Pairwiseai)' "C:/HTML apps/hub/projects.js" | head -80
```

Expected: confirms the exact HTML filename used as entry for each. Record them in a local note.

- [ ] **Step 2: Commit the note inline as a script comment**

Edit `scripts/trim_audit.py` if needed so the header usage example reflects the real entry names. (Skip if the dry-run already showed all entries are `index.html` with the two exceptions above.) No code change if nothing to update.

### Task 1.3: Dry-run trim_audit on each heavy folder

- [ ] **Step 1: Run for each heavy folder and capture sizes**

```bash
cd C:/Projects/allmeta
for folder in Truthcert1 living-meta HTA IPD-Meta-Pro nma-pro-v2 nma-dose-response-app Pairwiseai; do
  entry="index.html"
  echo "=== $folder ==="
  python scripts/trim_audit.py --src "C:/HTML apps/$folder" --entry "$entry" 2>&1 | head -5
done
echo "=== dosehtml ==="
python scripts/trim_audit.py --src "C:/HTML apps/dosehtml" --entry "dose-response-pro.html" 2>&1 | head -5
```

Expected: KEPT size for each ≤25 MB. If any is larger, read EXCLUDED list to confirm nothing important is dropped, then consider widening `--max-depth` or patching the script. If any KEPT size is still >25 MB after inspection, stop and flag to user before applying.

- [ ] **Step 2: Write results to `.pages-exclude`**

```bash
cd C:/Projects/allmeta
echo "# Trim audit — $(date -u +%Y-%m-%dT%H:%M:%SZ)" > .pages-exclude
echo "# Heavy folders from C:\\HTML apps, source MB -> kept MB" >> .pages-exclude
for folder in Truthcert1 living-meta HTA IPD-Meta-Pro nma-pro-v2 nma-dose-response-app Pairwiseai; do
  python scripts/trim_audit.py --src "C:/HTML apps/$folder" --entry "index.html" 2>&1 | grep -E "^(SOURCE|KEPT):" >> .pages-exclude
  echo "--- $folder ---" >> .pages-exclude
done
python scripts/trim_audit.py --src "C:/HTML apps/dosehtml" --entry "dose-response-pro.html" 2>&1 | grep -E "^(SOURCE|KEPT):" >> .pages-exclude
echo "--- dosehtml ---" >> .pages-exclude
```

### Task 1.4: Apply trim — copy heavy folders

- [ ] **Step 1: Apply per heavy folder**

```bash
cd C:/Projects/allmeta
for folder in Truthcert1 living-meta HTA IPD-Meta-Pro nma-pro-v2 nma-dose-response-app Pairwiseai; do
  python scripts/trim_audit.py --src "C:/HTML apps/$folder" --entry "index.html" --apply --dst "./$folder"
done
python scripts/trim_audit.py --src "C:/HTML apps/dosehtml" --entry "dose-response-pro.html" --apply --dst "./dosehtml"
```

- [ ] **Step 2: Verify each folder size**

```bash
cd C:/Projects/allmeta
du -sh Truthcert1 living-meta dosehtml HTA IPD-Meta-Pro nma-pro-v2 nma-dose-response-app Pairwiseai
```

Expected: each ≤25 MB. If any exceeds, stop and investigate before committing.

- [ ] **Step 3: Commit heavy folders**

```bash
cd C:/Projects/allmeta
git add .pages-exclude Truthcert1 living-meta dosehtml HTA IPD-Meta-Pro nma-pro-v2 nma-dose-response-app Pairwiseai
git commit -m "feat: import 8 heavy apps trimmed to asset closure"
```

### Task 1.5: Copy lightweight folders as-is

Lightweight folders (<1 MB each) from `hub/projects.js`: `bayesian-ma`, `cumulative-subgroup`, `dta-sroc`, `evidence-board`, `focus-studio`, `forest-plot`, `funnel-plot`, `grade-sof`, `heterogeneity`, `kanban-lab`, `meta-regression`, `nma`, `prisma-flow`, `prisma-screen`, `rob-traffic-light`, `tsa`, `webr-validator`, `workbench`.

- [ ] **Step 1: Copy them**

```bash
cd C:/Projects/allmeta
for folder in bayesian-ma cumulative-subgroup dta-sroc evidence-board focus-studio forest-plot funnel-plot grade-sof heterogeneity kanban-lab meta-regression nma prisma-flow prisma-screen rob-traffic-light tsa webr-validator workbench; do
  if [ -d "/c/HTML apps/$folder" ]; then
    cp -r "/c/HTML apps/$folder" "./$folder"
  fi
done
```

- [ ] **Step 2: Strip any `__pycache__/`, `.pytest_cache/`, or `node_modules/` that snuck in**

```bash
cd C:/Projects/allmeta
find . -type d \( -name __pycache__ -o -name .pytest_cache -o -name node_modules \) -not -path "./tests/*" -exec rm -rf {} + 2>/dev/null
```

- [ ] **Step 3: Size check**

```bash
cd C:/Projects/allmeta
du -sh .
```

Expected: <500 MB total. If larger, re-audit — a subfolder still has bloat.

- [ ] **Step 4: Commit**

```bash
cd C:/Projects/allmeta
git add .
git commit -m "feat: import 18 lightweight apps as-is"
```

---

## Phase 2 — Rewrite external hub links

### Task 2.1: Write `scripts/verify_external_pages.py`

**Files:**
- Create: `scripts/verify_external_pages.py`

- [ ] **Step 1: Write the script**

```python
"""verify_external_pages.py — check GitHub Pages status for the 5 external hub cards.

Usage: python scripts/verify_external_pages.py

Calls `gh api repos/mahmood726-cyber/<repo>/pages` for each candidate repo.
Prints a table of: repo, pages_enabled, built, html_url, final_link_for_hub.
"""
from __future__ import annotations
import json, subprocess, sys

CANDIDATES = [
    ("AdaptSim",        "../AdaptSim/index.html",                         ""),
    ("AlMizan",         "../AlMizan/index.html",                          ""),
    ("CardioOracle",    "../Models/CardioOracle/index.html",              ""),
    ("cardiosynth",     "../cardiosynth/phase0/colchicine-stemi.html",    "phase0/colchicine-stemi.html"),
    ("NICECardiology",  "../NICECardiology/index.html",                   ""),
]


def gh_pages(repo: str) -> dict | None:
    try:
        out = subprocess.run(
            ["gh", "api", f"repos/mahmood726-cyber/{repo}/pages"],
            capture_output=True, text=True, timeout=15,
        )
    except FileNotFoundError:
        print("ERROR: gh CLI not on PATH", file=sys.stderr)
        sys.exit(2)
    if out.returncode != 0:
        return None
    try:
        return json.loads(out.stdout)
    except json.JSONDecodeError:
        return None


def main() -> int:
    print(f"{'repo':<20} {'enabled':<8} {'status':<10} {'html_url'}")
    print("-" * 90)
    for repo, old_path, suffix in CANDIDATES:
        info = gh_pages(repo)
        if info is None:
            print(f"{repo:<20} {'no':<8} {'-':<10} (404 or auth failure — check)")
            continue
        status = info.get("status", "?")
        url = info.get("html_url", "")
        final = url.rstrip("/") + "/" + suffix if suffix else url
        print(f"{repo:<20} {'yes':<8} {status:<10} {final}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Run it**

```bash
cd C:/Projects/allmeta
python scripts/verify_external_pages.py
```

Expected: a table with 5 rows. Record which are enabled+built and their URLs. For any `no` / non-`built`, note — we decide per-card in Step 3.

- [ ] **Step 3: Commit**

```bash
cd C:/Projects/allmeta
git add scripts/verify_external_pages.py
git commit -m "feat(scripts): verify_external_pages.py — check Pages status for 5 external cards"
```

### Task 2.2: Rewrite `hub/projects.js` external paths

- [ ] **Step 1: Read current external entries**

```bash
cd C:/Projects/allmeta
grep -n 'path: "\.\./' hub/projects.js
```

Expected: exactly 5 lines, one per external card.

- [ ] **Step 2: Edit `hub/projects.js`** — replace each `path: "../<X>/..."` with `path: "<real-github-io-url>"` from the Task 2.1 output. For any card that verify_external_pages.py flagged as not-built, ask user before editing that one card.

Use `Edit` tool for each line. Example for AdaptSim (replace with real URL from verify output):

```
old: path: "../AdaptSim/index.html",
new: path: "https://mahmood726-cyber.github.io/AdaptSim/",
```

Also update the `mode` field from `"file"` to `"url"` for each rewritten card (so `hub/app.js` can render them as "opens in new tab" if that distinction exists; if not, harmless).

- [ ] **Step 3: Verify no `../` paths remain**

```bash
cd C:/Projects/allmeta
grep -c 'path: "\.\./' hub/projects.js
```

Expected: `0`. If non-zero, a card was missed or dropped.

- [ ] **Step 4: Commit**

```bash
cd C:/Projects/allmeta
git add hub/projects.js
git commit -m "feat(hub): rewrite 5 external ../ paths to canonical github.io URLs"
```

---

## Phase 3 — Playwright harness

### Task 3.1: Initialise `tests/playwright/` package

**Files:**
- Create: `tests/playwright/package.json`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "allmeta-playwright",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "playwright test",
    "report": "playwright show-report"
  },
  "devDependencies": {
    "@playwright/test": "^1.47.0",
    "http-server": "^14.1.1",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Install**

```bash
cd C:/Projects/allmeta/tests/playwright
npm install
npx playwright install --with-deps chromium
```

Expected: `node_modules/` populated; Chromium browser binary downloaded.

- [ ] **Step 3: Commit**

```bash
cd C:/Projects/allmeta
git add tests/playwright/package.json tests/playwright/package-lock.json
git commit -m "feat(playwright): scaffold @playwright/test package"
```

### Task 3.2: Playwright config

**Files:**
- Create: `tests/playwright/playwright.config.ts`

- [ ] **Step 1: Write the config**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 45_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "artifacts/html-report", open: "never" }],
    ["json", { outputFile: "artifacts/report.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:8080",
    trace: "retain-on-failure",
    screenshot: "on",
    video: "off",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npx http-server ../.. -p 8080 -c-1 --silent",
    url: "http://127.0.0.1:8080/index.html",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
```

- [ ] **Step 2: Commit**

```bash
cd C:/Projects/allmeta
git add tests/playwright/playwright.config.ts
git commit -m "feat(playwright): config with http-server webServer + JSON/HTML reporters"
```

### Task 3.3: App enumeration

**Files:**
- Create: `tests/playwright/apps.ts`

- [ ] **Step 1: Write the module**

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectsJs = readFileSync(resolve(__dirname, "../../hub/projects.js"), "utf8");

// projects.js assigns to window.HTML_APPS_PROJECTS. Strip the wrapper and eval.
const raw = projectsJs.replace(/^\s*window\.HTML_APPS_PROJECTS\s*=\s*/, "").replace(/;\s*$/, "");
let parsed: any[];
try {
  parsed = eval(raw);
} catch (e) {
  throw new Error(`Failed to parse projects.js: ${(e as Error).message}`);
}

export interface AppTarget {
  name: string;
  slug: string;
  path: string;
  external: boolean;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const APPS: AppTarget[] = parsed.map((p) => {
  const external = /^https?:/.test(p.path);
  return {
    name: p.name,
    slug: slugify(p.name),
    path: p.path,
    external,
  };
});

export const INTERNAL_APPS = APPS.filter((a) => !a.external);
```

- [ ] **Step 2: Smoke-test parsing**

```bash
cd C:/Projects/allmeta/tests/playwright
npx tsc --noEmit apps.ts
```

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
cd C:/Projects/allmeta
git add tests/playwright/apps.ts
git commit -m "feat(playwright): apps.ts — parse hub/projects.js for test targets"
```

### Task 3.4: Per-app crawl spec

**Files:**
- Create: `tests/playwright/hub-crawl.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";
import { INTERNAL_APPS } from "./apps";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifactsDir = resolve(__dirname, "artifacts");
if (!existsSync(artifactsDir)) mkdirSync(artifactsDir, { recursive: true });

const PLOT_SELECTOR = [
  "canvas",
  "svg:not([width='0']):not([height='0'])",
  ".plotly",
  ".js-plotly-plot",
  "[id*='chart']",
  "[id*='plot']",
].join(", ");

const DEMO_BUTTON_RE = /load\s*(demo|example|data)|^\s*(run|calculate|analy[sz]e|plot|compute)\s*$/i;

interface Row {
  app: string;
  path: string;
  status: "pass" | "fail-load" | "fail-plot-missing" | "fail-console-error";
  duration_ms: number;
  console_errors: string[];
  clicked_demo: boolean;
  notes: string;
}

const results: Row[] = [];

test.afterAll(async () => {
  writeFileSync(
    resolve(artifactsDir, "summary.json"),
    JSON.stringify(results, null, 2),
  );
  const table = results.map(r => `${r.status.padEnd(22)} ${r.app}`).join("\n");
  writeFileSync(resolve(artifactsDir, "summary.txt"), table);
});

for (const app of INTERNAL_APPS) {
  test(`${app.name}`, async ({ page }) => {
    const started = Date.now();
    const consoleErrors: string[] = [];
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    let clicked = false;
    const normalizedPath = app.path.replace(/^\.\//, "/");
    let loadError: string | null = null;
    try {
      await page.goto(normalizedPath, { waitUntil: "networkidle", timeout: 15_000 });
    } catch (e) {
      loadError = (e as Error).message;
    }

    if (loadError) {
      results.push({
        app: app.name, path: app.path, status: "fail-load",
        duration_ms: Date.now() - started,
        console_errors: consoleErrors, clicked_demo: false, notes: loadError,
      });
      await page.screenshot({ path: resolve(artifactsDir, `${app.slug}.png`), fullPage: true })
        .catch(() => { /* page may be in a bad state */ });
      test.fail(true, `Load failed: ${loadError}`);
      return;
    }

    let plotCount = await countPlots(page);
    if (plotCount === 0) {
      const button = await page.locator("button, input[type=button], input[type=submit]")
        .filter({ hasText: DEMO_BUTTON_RE })
        .first();
      if (await button.count() > 0) {
        await button.click({ timeout: 2_000 }).catch(() => {});
        await page.waitForTimeout(3_000);
        clicked = true;
        plotCount = await countPlots(page);
      }
    }

    await page.screenshot({ path: resolve(artifactsDir, `${app.slug}.png`), fullPage: true });

    if (consoleErrors.length > 0) {
      results.push({
        app: app.name, path: app.path, status: "fail-console-error",
        duration_ms: Date.now() - started,
        console_errors: consoleErrors, clicked_demo: clicked, notes: "",
      });
      test.fail(true, `Console errors: ${consoleErrors.slice(0, 3).join(" | ")}`);
      return;
    }

    if (plotCount === 0) {
      results.push({
        app: app.name, path: app.path, status: "fail-plot-missing",
        duration_ms: Date.now() - started,
        console_errors: [], clicked_demo: clicked,
        notes: "No plot surface found (canvas/svg/plotly/[id*=chart|plot]).",
      });
      test.fail(true, "No plot surface rendered.");
      return;
    }

    results.push({
      app: app.name, path: app.path, status: "pass",
      duration_ms: Date.now() - started,
      console_errors: [], clicked_demo: clicked, notes: "",
    });
    expect(plotCount).toBeGreaterThan(0);
  });
}

async function countPlots(page: Page): Promise<number> {
  const handles = await page.locator(PLOT_SELECTOR).all();
  let count = 0;
  for (const h of handles) {
    const box = await h.boundingBox().catch(() => null);
    if (box && box.width >= 40 && box.height >= 40) count += 1;
  }
  return count;
}
```

- [ ] **Step 2: Run it**

```bash
cd C:/Projects/allmeta/tests/playwright
npx playwright test --reporter=list
```

Expected: 25 tests run. Mix of pass / fail-plot-missing expected; `fail-load` is the real red flag.

- [ ] **Step 3: Inspect `artifacts/summary.txt`**

```bash
cat artifacts/summary.txt
```

- [ ] **Step 4: Commit the spec (NOT artifacts)**

```bash
cd C:/Projects/allmeta
git add tests/playwright/hub-crawl.spec.ts
git commit -m "feat(playwright): hub-crawl.spec.ts — per-app plot-render pre-flight"
```

### Task 3.5: Commit the report snapshot

- [ ] **Step 1: Copy report snapshot into a committed location**

```bash
cd C:/Projects/allmeta
mkdir -p tests/playwright/reports/2026-04-20
cp tests/playwright/artifacts/summary.json tests/playwright/reports/2026-04-20/
cp tests/playwright/artifacts/summary.txt  tests/playwright/reports/2026-04-20/
cp tests/playwright/artifacts/report.json  tests/playwright/reports/2026-04-20/
```

- [ ] **Step 2: Commit**

```bash
cd C:/Projects/allmeta
git add tests/playwright/reports/2026-04-20/
git commit -m "test(playwright): initial pre-flight report snapshot 2026-04-20"
```

---

## Phase 4 — User gate on report

### Task 4.1: Present the report

- [ ] **Step 1: Render a human summary**

```bash
cd C:/Projects/allmeta
echo "=== Playwright pre-flight summary ==="
cat tests/playwright/reports/2026-04-20/summary.txt
echo
echo "=== Counts ==="
awk '{print $1}' tests/playwright/reports/2026-04-20/summary.txt | sort | uniq -c
```

Show this plus the `artifacts/html-report/` gallery to the user.

- [ ] **Step 2: Wait for ship decisions**

For each `fail-*` row, user marks one of: **fix**, **ship anyway**, **drop card**. Record decisions in a short scratch file, then Phase 5 acts on them. Do NOT proceed without user sign-off.

---

## Phase 5 — Push + enable Pages

### Task 5.1: `.nojekyll`

- [ ] **Step 1: Create it**

```bash
cd C:/Projects/allmeta
touch .nojekyll
git add .nojekyll
git commit -m "chore: .nojekyll for underscore-prefixed asset paths"
```

### Task 5.2: Create remote + push

- [ ] **Step 1: Create the repo**

```bash
cd C:/Projects/allmeta
gh repo create mahmood726-cyber/allmeta --public --description "HTML apps hub — evidence-synthesis tools, browser-only" --source . --remote origin
```

- [ ] **Step 2: Push**

```bash
cd C:/Projects/allmeta
git push -u origin main
```

Expected: `main` branch at GitHub. If push rejects for size, stop and audit.

### Task 5.3: Enable Pages

- [ ] **Step 1: Enable from main**

```bash
gh api \
  --method POST \
  -H "Accept: application/vnd.github+json" \
  repos/mahmood726-cyber/allmeta/pages \
  -f "source[branch]=main" \
  -f "source[path]=/"
```

- [ ] **Step 2: Wait for build**

```bash
for i in 1 2 3 4 5 6 7 8 9 10; do
  STATUS=$(gh api repos/mahmood726-cyber/allmeta/pages --jq '.status' 2>/dev/null)
  echo "poll $i: $STATUS"
  if [ "$STATUS" = "built" ]; then break; fi
  sleep 15
done
```

Expected: `built` within ~2 minutes.

- [ ] **Step 3: Smoke-test deployed URL**

```bash
HUB_URL="https://mahmood726-cyber.github.io/allmeta/"
curl -sSI "$HUB_URL" | head -1
curl -sSI "${HUB_URL}forest-plot/" | head -1
curl -sSI "${HUB_URL}Truthcert1/" | head -1
```

Expected: three `HTTP/2 200`. If any 404, check path case sensitivity (Pages is case-sensitive; source tree on Windows is not).

---

## Phase 6 — CI workflows

### Task 6.1: Playwright workflow

**Files:**
- Create: `.github/workflows/playwright.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: playwright

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: tests/playwright
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
          cache-dependency-path: tests/playwright/package-lock.json
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test --reporter=list,json
        env:
          CI: "true"
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-artifacts
          path: tests/playwright/artifacts/
          if-no-files-found: warn
          retention-days: 14
```

- [ ] **Step 2: Commit**

```bash
cd C:/Projects/allmeta
git add .github/workflows/playwright.yml
git commit -m "ci: playwright pre-flight on every push"
```

### Task 6.2: Pages deploy workflow

**Files:**
- Create: `.github/workflows/pages.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build _site
        run: |
          mkdir -p _site
          rsync -a --exclude='tests/' --exclude='.github/' --exclude='docs/' \
                   --exclude='scripts/' --exclude='node_modules/' \
                   --exclude='.pages-exclude' --exclude='*.md' \
                   --include='README.md' \
                   ./ _site/
          touch _site/.nojekyll
      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Commit**

```bash
cd C:/Projects/allmeta
git add .github/workflows/pages.yml
git commit -m "ci: pages deploy workflow (excludes tests/docs/scripts)"
```

### Task 6.3: Verify CI end-to-end

- [ ] **Step 1: Push both workflows**

```bash
cd C:/Projects/allmeta
git push origin main
```

- [ ] **Step 2: Watch both runs**

```bash
gh run list --limit 5
# Wait for both 'playwright' and 'pages' to complete
gh run watch $(gh run list --workflow=playwright.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch $(gh run list --workflow=pages.yml --limit 1 --json databaseId --jq '.[0].databaseId')
```

Expected: both green.

- [ ] **Step 3: Re-smoke-test the live URL**

```bash
curl -sSI "https://mahmood726-cyber.github.io/allmeta/" | head -1
```

Expected: `HTTP/2 200`.

---

## Self-review

**1. Spec coverage** — spec sections vs tasks:
- §1 Goal → Phases 1–5 deliver it.
- §2 Non-goals → Task 0.2 strip-hub-non-web, Task 1.5 strip-cache, workflow excludes docs/tests.
- §3 Scope → Task 1.2–1.5 (trim), Task 2.2 (external rewrite).
- §4 Architecture → File Structure section above matches 1-for-1.
- §5 Trim plan → Task 1.3 (dry-run), 1.4 (apply).
- §6 External verify → Task 2.1–2.2.
- §7 Playwright harness → Task 3.1–3.4 implement every step of the per-app test body.
- §8 CI → Task 6.1–6.2.
- §9 Execution phases → this plan's 7 phases.
- §10 Risks → mitigated via hard smoke-tests (Task 5.3 deployed URL) and Playwright gate (Task 4.1).
- §11 Success criteria → Task 5.3 (hub 200), Task 6.3 (CI green), Task 3.5 (committed report).

**2. Placeholder scan** — no TBD/TODO strings; every code step has complete code. Two content placeholders are unavoidable-by-design: "real URL from Task 2.1 output" (Task 2.2) and "user ship decisions" (Task 4.1) — these are data that only exists at runtime, not spec gaps.

**3. Type consistency** — `AppTarget.slug` in apps.ts is referenced as `app.slug` in spec; `INTERNAL_APPS` named consistently. `Row.status` union matches the four-way status in the spec §7.

---

Plan complete.
