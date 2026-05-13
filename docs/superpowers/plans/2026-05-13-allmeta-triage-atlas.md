# allmeta Triage Atlas v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Python scanner that scores every allmeta app on tier 1–5, emit four artifacts (`triage.{json,csv,md,html}`), and wire the hub to badge Tier-1 apps + populate the featured strip + add a "Needs polish" filter — fail-open if the atlas is missing.

**Architecture:** Pure-Python scanner with one module per concern (signals, rubric, overrides, render); single CLI entry (`scan.py`). Hub edits are additive to `hub/app.js` + `hub/styles.css` only; `hub/projects.js` is untouched. Fail-closed on operator error, fail-open on missing-data signals.

**Tech Stack:** Python 3.13, pyyaml, jsonschema, pytest, Playwright (existing), plain vanilla JS for the hub side.

**Spec:** `docs/superpowers/specs/2026-05-13-allmeta-triage-atlas-design.md`

**Canonical app key:** the folder name under `C:\Projects\allmeta\` (e.g. `forest-plot`, `Truthcert1`). Derivable from `project.path` in `hub/projects.js` by stripping the leading `./` and the trailing `/index.html`. Two parallel implementations exist: `triage.projects_js.path_to_key` (Python, Task 7) and `projectKey()` in `hub/app.js` (Task 21). They MUST produce identical output for any input; review both sides together when changing either. A contract test linking them is signposted for v0.2.

**Known JS-parser risk:** Task 7's `_js_to_json` is a naive JS-object-literal → JSON converter. It assumes `hub/projects.js` does not use template literals, regex literals, function values, or escaped single quotes in strings. The current `hub/projects.js` is clean of these; Task 27 (first real scan) is the empirical check. If it fails there, fix `_js_to_json` or fall back to `node -e 'JSON.stringify(...)'` shell-out.

---

## Task 1: Scaffolding

**Files:**
- Create: `triage/__init__.py`
- Create: `triage/signals.py` (empty)
- Create: `triage/rubric.py` (empty)
- Create: `triage/render.py` (empty)
- Create: `triage/overrides.py` (empty)
- Create: `triage/scan.py` (empty)
- Create: `triage/triage-overrides.yaml`
- Create: `triage/schema/triage.schema.json` (stub)
- Create: `triage/tests/__init__.py`
- Create: `triage/tests/conftest.py`
- Create: `triage/tests/fixtures/.gitkeep`
- Create: `triage/README.md`
- Create: `triage/pytest.ini`

- [ ] **Step 1: Create directory tree and empty modules**

```powershell
New-Item -ItemType Directory -Path "C:\Projects\allmeta\triage\schema","C:\Projects\allmeta\triage\tests\fixtures" -Force | Out-Null
"" | Out-File -Encoding utf8 "C:\Projects\allmeta\triage\__init__.py"
"" | Out-File -Encoding utf8 "C:\Projects\allmeta\triage\signals.py"
"" | Out-File -Encoding utf8 "C:\Projects\allmeta\triage\rubric.py"
"" | Out-File -Encoding utf8 "C:\Projects\allmeta\triage\render.py"
"" | Out-File -Encoding utf8 "C:\Projects\allmeta\triage\overrides.py"
"" | Out-File -Encoding utf8 "C:\Projects\allmeta\triage\scan.py"
"" | Out-File -Encoding utf8 "C:\Projects\allmeta\triage\tests\__init__.py"
"" | Out-File -Encoding utf8 "C:\Projects\allmeta\triage\tests\fixtures\.gitkeep"
```

- [ ] **Step 2: Write conftest.py with shared fixtures-root fixture**

`triage/tests/conftest.py`:
```python
from pathlib import Path
import pytest

FIXTURES = Path(__file__).parent / "fixtures"

@pytest.fixture
def fixtures_root() -> Path:
    return FIXTURES
```

- [ ] **Step 3: Write triage/pytest.ini**

```ini
[pytest]
testpaths = tests
python_files = test_*.py
addopts = -ra --strict-markers
```

- [ ] **Step 4: Write empty overrides YAML and JSON schema stub**

`triage/triage-overrides.yaml`:
```yaml
# Human always wins. auto_tier preserved in triage.json for transparency.
# Schema: apps.<folder-name>: {tier?: 1-5, kind?: 'numerical'|'non-numerical', reason: str, expires?: ISO-date}
apps: {}
```

`triage/schema/triage.schema.json`:
```json
{ "$schema": "https://json-schema.org/draft-07/schema#", "type": "object", "properties": { "scanner_version": {"type": "string"} }, "required": ["scanner_version"] }
```

- [ ] **Step 5: Write triage/README.md**

```markdown
# allmeta triage atlas

Run: `python triage/scan.py`. Emits `triage.{json,csv,md,html}` at the repo root.

See `docs/superpowers/specs/2026-05-13-allmeta-triage-atlas-design.md` for the rubric.
```

- [ ] **Step 6: Verify pytest discovers an empty suite**

Run: `cd C:\Projects\allmeta\triage; python -m pytest -q`
Expected: `no tests ran in N.NNs` (exit 5 is OK at this stage).

- [ ] **Step 7: Commit**

```powershell
git -C C:\Projects\allmeta add triage/
git -C C:\Projects\allmeta commit -m "feat(triage): scaffold v0.1 atlas folder + empty modules"
```

---

## Task 2: Tunable constants in rubric.py

**Files:**
- Modify: `triage/rubric.py`
- Test: `triage/tests/test_rubric_constants.py` (new)

- [ ] **Step 1: Write failing test**

`triage/tests/test_rubric_constants.py`:
```python
from triage import rubric

def test_constants_are_integers_and_positive():
    assert isinstance(rubric.STUB_REBUILD_THRESHOLD, int) and rubric.STUB_REBUILD_THRESHOLD > 0
    assert isinstance(rubric.MIN_TESTS_FOR_VALIDATED, int) and rubric.MIN_TESTS_FOR_VALIDATED > 0
    assert isinstance(rubric.STALE_DAYS, int) and rubric.STALE_DAYS > 0
    assert isinstance(rubric.MIN_VALIDATED_SIZE_KB, (int, float)) and rubric.MIN_VALIDATED_SIZE_KB > 0

def test_constants_match_spec():
    assert rubric.STUB_REBUILD_THRESHOLD == 6
    assert rubric.MIN_TESTS_FOR_VALIDATED == 3
    assert rubric.STALE_DAYS == 365
    assert rubric.MIN_VALIDATED_SIZE_KB == 10
```

- [ ] **Step 2: Run, expect FAIL**

`cd C:\Projects\allmeta; python -m pytest triage/tests/test_rubric_constants.py -q`
Expected: AttributeError on `rubric.STUB_REBUILD_THRESHOLD`.

- [ ] **Step 3: Implement**

`triage/rubric.py`:
```python
"""Tier-assignment rubric for allmeta triage atlas. See spec §3."""

STUB_REBUILD_THRESHOLD: int = 6
MIN_TESTS_FOR_VALIDATED: int = 3
STALE_DAYS: int = 365
MIN_VALIDATED_SIZE_KB: float = 10.0
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```powershell
git -C C:\Projects\allmeta add triage/rubric.py triage/tests/test_rubric_constants.py
git -C C:\Projects\allmeta commit -m "feat(triage): tunable rubric constants"
```

---

## Task 3: signal — stub_count

**Files:**
- Modify: `triage/signals.py`
- Test: `triage/tests/test_signals_stub.py` (new)
- Test fixtures: `triage/tests/fixtures/stub-app/`, `triage/tests/fixtures/clean-app/`

- [ ] **Step 1: Build fixtures**

Create `triage/tests/fixtures/stub-app/index.html`:
```html
<!doctype html><html><body>
<!-- TODO: wire up the engine -->
<script>function pool(){ throw new Error("unimpl: pooling"); }</script>
<p>REPLACE_ME</p>
</body></html>
```

Create `triage/tests/fixtures/clean-app/index.html`:
```html
<!doctype html><html><body><script>function pool(a,b){return (a+b)/2;}</script></body></html>
```

- [ ] **Step 2: Write failing test**

`triage/tests/test_signals_stub.py`:
```python
from triage.signals import stub_count

def test_stub_count_detects_markers(fixtures_root):
    assert stub_count(fixtures_root / "stub-app") == 3  # TODO + unimpl + REPLACE_ME

def test_stub_count_zero_on_clean(fixtures_root):
    assert stub_count(fixtures_root / "clean-app") == 0

def test_stub_count_zero_on_missing_folder(tmp_path):
    assert stub_count(tmp_path / "does-not-exist") == 0
```

- [ ] **Step 3: Run, expect FAIL** (`ImportError: cannot import name 'stub_count'`)

- [ ] **Step 4: Implement**

Append to `triage/signals.py`:
```python
"""Signal extractors. Each function takes a Path to an app folder and returns a
single signal value. Functions fail soft (return null-equivalent) on missing
data; they fail closed (raise) only on operator error."""

from __future__ import annotations
from pathlib import Path
import re

_STUB_PATTERNS = re.compile(
    r"\bTODO\b|\bstub\b|placeholder|REPLACE_ME|__PLACEHOLDER__|not implemented|"
    r"throw new Error\(.unimpl",
    re.IGNORECASE,
)

_SCAN_SUFFIXES = (".html", ".js", ".css", ".py", ".md")


def stub_count(app_dir: Path) -> int:
    """Count distinct stub markers across top-level source files."""
    if not app_dir.exists() or not app_dir.is_dir():
        return 0
    n = 0
    for p in app_dir.iterdir():
        if not p.is_file() or p.suffix.lower() not in _SCAN_SUFFIXES:
            continue
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        n += len(_STUB_PATTERNS.findall(text))
    return n
```

- [ ] **Step 5: Run, expect PASS**

- [ ] **Step 6: Commit**

```powershell
git -C C:\Projects\allmeta add triage/signals.py triage/tests/test_signals_stub.py triage/tests/fixtures/
git -C C:\Projects\allmeta commit -m "feat(triage): stub_count signal"
```

---

## Task 4: signal — has_index, has_readme, total_size_kb

**Files:**
- Modify: `triage/signals.py`
- Test: `triage/tests/test_signals_filesys.py` (new)
- Fixtures: extend stub-app and clean-app

- [ ] **Step 1: Write failing test**

`triage/tests/test_signals_filesys.py`:
```python
from triage.signals import has_index, has_readme, total_size_kb

def test_has_index_true(fixtures_root):
    assert has_index(fixtures_root / "stub-app") is True

def test_has_index_false(tmp_path):
    (tmp_path / "no-index").mkdir()
    assert has_index(tmp_path / "no-index") is False

def test_has_readme_false_when_absent(fixtures_root):
    assert has_readme(fixtures_root / "stub-app") is False

def test_total_size_kb_sums_html_js_css(fixtures_root):
    kb = total_size_kb(fixtures_root / "clean-app")
    assert kb > 0.0 and kb < 5.0  # tiny file
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement** — append to `triage/signals.py`:

```python
def has_index(app_dir: Path) -> bool:
    return (app_dir / "index.html").is_file()


def has_readme(app_dir: Path) -> bool:
    return (app_dir / "README.md").is_file()


def total_size_kb(app_dir: Path) -> float:
    """Sum of top-level index.html + *.js + *.css. Top level only (not recursive)."""
    if not app_dir.exists() or not app_dir.is_dir():
        return 0.0
    total = 0
    for p in app_dir.iterdir():
        if not p.is_file():
            continue
        if p.name == "index.html" or p.suffix.lower() in (".js", ".css"):
            try:
                total += p.stat().st_size
            except OSError:
                continue
    return round(total / 1024.0, 2)
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```powershell
git -C C:\Projects\allmeta add triage/signals.py triage/tests/test_signals_filesys.py
git -C C:\Projects\allmeta commit -m "feat(triage): has_index, has_readme, total_size_kb signals"
```

---

## Task 5: signal — last_touched (git)

**Files:**
- Modify: `triage/signals.py`
- Test: `triage/tests/test_signals_git.py` (new)

- [ ] **Step 1: Write failing test (with mocked subprocess)**

`triage/tests/test_signals_git.py`:
```python
import subprocess
from pathlib import Path
from triage.signals import last_touched_unix

def test_last_touched_returns_int_from_git(monkeypatch, tmp_path):
    def fake_run(args, **kw):
        assert args[0] == "git"
        return subprocess.CompletedProcess(args, 0, stdout="1714512000\n", stderr="")
    monkeypatch.setattr(subprocess, "run", fake_run)
    assert last_touched_unix(tmp_path / "any-app", repo_root=tmp_path) == 1714512000

def test_last_touched_none_when_git_missing(monkeypatch, tmp_path):
    def fake_run(*a, **kw):
        raise FileNotFoundError("git not found")
    monkeypatch.setattr(subprocess, "run", fake_run)
    assert last_touched_unix(tmp_path / "any-app", repo_root=tmp_path) is None

def test_last_touched_none_when_empty_stdout(monkeypatch, tmp_path):
    def fake_run(args, **kw):
        return subprocess.CompletedProcess(args, 0, stdout="\n", stderr="")
    monkeypatch.setattr(subprocess, "run", fake_run)
    assert last_touched_unix(tmp_path / "any-app", repo_root=tmp_path) is None
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement** — append to `triage/signals.py`:

```python
import subprocess

def last_touched_unix(app_dir: Path, repo_root: Path) -> int | None:
    """Most recent commit timestamp touching this folder. None on failure."""
    try:
        res = subprocess.run(
            ["git", "log", "-1", "--format=%ct", "--", str(app_dir.relative_to(repo_root))],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=10,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired, ValueError):
        return None
    out = (res.stdout or "").strip()
    if not out:
        return None
    try:
        return int(out)
    except ValueError:
        return None
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```powershell
git -C C:\Projects\allmeta add triage/signals.py triage/tests/test_signals_git.py
git -C C:\Projects\allmeta commit -m "feat(triage): last_touched_unix signal"
```

---

## Task 6: signal — test_count + has_r_parity

**Files:**
- Modify: `triage/signals.py`
- Test: `triage/tests/test_signals_tests.py` (new)
- Fixtures: `triage/tests/fixtures/tested-app/tests/` with seeded test files

- [ ] **Step 1: Build fixtures**

```powershell
New-Item -ItemType Directory -Path "C:\Projects\allmeta\triage\tests\fixtures\tested-app\tests\playwright" -Force | Out-Null
"" | Out-File -Encoding utf8 "C:\Projects\allmeta\triage\tests\fixtures\tested-app\tests\test_pooling.py"
"" | Out-File -Encoding utf8 "C:\Projects\allmeta\triage\tests\fixtures\tested-app\tests\test_against_metafor.py"
"" | Out-File -Encoding utf8 "C:\Projects\allmeta\triage\tests\fixtures\tested-app\tests\playwright\app.spec.mjs"
```

- [ ] **Step 2: Write failing test**

`triage/tests/test_signals_tests.py`:
```python
from triage.signals import test_count, has_r_parity

def test_test_count_includes_pytest_mjs_playwright(fixtures_root):
    assert test_count(fixtures_root / "tested-app") == 3

def test_test_count_zero_no_tests_dir(fixtures_root):
    assert test_count(fixtures_root / "clean-app") == 0

def test_has_r_parity_detected(fixtures_root):
    assert has_r_parity(fixtures_root / "tested-app") is True

def test_has_r_parity_false(fixtures_root):
    assert has_r_parity(fixtures_root / "clean-app") is False
```

- [ ] **Step 3: Run, expect FAIL**

- [ ] **Step 4: Implement** — append to `triage/signals.py`:

```python
_PARITY_TOKENS = ("metafor", "_parity", "_against_r", "_compare_r", "mada", "netmeta_compare")


def _iter_test_files(app_dir: Path):
    tests = app_dir / "tests"
    if not tests.is_dir():
        return
    for p in tests.glob("test_*.py"):
        yield p
    for p in tests.glob("test_*.mjs"):
        yield p
    pw = tests / "playwright"
    if pw.is_dir():
        for p in pw.glob("*.spec.*"):
            yield p


def test_count(app_dir: Path) -> int:
    return sum(1 for _ in _iter_test_files(app_dir))


def has_r_parity(app_dir: Path) -> bool:
    for p in _iter_test_files(app_dir):
        name = p.name.lower()
        if any(tok in name for tok in _PARITY_TOKENS):
            return True
    return False
```

- [ ] **Step 5: Run, expect PASS**

- [ ] **Step 6: Commit**

```powershell
git -C C:\Projects\allmeta add triage/signals.py triage/tests/test_signals_tests.py triage/tests/fixtures/tested-app
git -C C:\Projects\allmeta commit -m "feat(triage): test_count + has_r_parity signals"
```

---

## Task 7: signal — parse hub/projects.js (is_hub_linked, featured_rank, category, path→key)

**Files:**
- Create: `triage/projects_js.py`
- Test: `triage/tests/test_projects_js.py` (new)
- Fixture: `triage/tests/fixtures/mini-projects.js`

- [ ] **Step 1: Create fixture**

`triage/tests/fixtures/mini-projects.js`:
```javascript
window.HTML_APPS_PROJECTS = [
  { name: "Forest Plot", path: "./forest-plot/index.html", category: "Pairwise MA",
    subcategory: "Reporting", featured: true, featuredRank: 1, collection: "existing", mode: "file" },
  { name: "DTA SROC", path: "./dta-sroc/index.html", category: "Diagnostic Test Accuracy",
    collection: "existing", mode: "file" },
  { name: "Al-Mizan", path: "https://example.com/almizan/", category: "Pairwise MA",
    collection: "existing", mode: "url" }
];
```

- [ ] **Step 2: Write failing test**

`triage/tests/test_projects_js.py`:
```python
from triage.projects_js import load_projects, path_to_key

def test_load_projects_parses_3_entries(fixtures_root):
    rows = load_projects(fixtures_root / "mini-projects.js")
    assert len(rows) == 3
    by_key = {r["key"]: r for r in rows}
    assert "forest-plot" in by_key
    assert by_key["forest-plot"]["featuredRank"] == 1
    assert by_key["forest-plot"]["category"] == "Pairwise MA"
    assert by_key["dta-sroc"]["featuredRank"] is None
    # external URL -> last URL segment used as key
    assert "almizan" in by_key

def test_path_to_key_strip_dot_slash_and_index():
    assert path_to_key("./forest-plot/index.html") == "forest-plot"
    assert path_to_key("./Truthcert1/index.html") == "Truthcert1"
    assert path_to_key("https://example.com/almizan/") == "almizan"
    assert path_to_key("") == ""
```

- [ ] **Step 3: Run, expect FAIL**

- [ ] **Step 4: Implement**

`triage/projects_js.py`:
```python
"""Parse hub/projects.js without executing JS. Tolerates the trailing comma /
single-quote / no-quotes-on-keys idioms that show up in this file."""

from __future__ import annotations
from pathlib import Path
import json
import re
from urllib.parse import urlparse


def path_to_key(path: str) -> str:
    """Canonical app key = folder name. Strips ./ prefix and /index.html suffix.
    For http(s) URLs, uses the last non-empty path segment."""
    if not path:
        return ""
    if path.startswith(("http://", "https://")):
        parts = [p for p in urlparse(path).path.split("/") if p]
        return parts[-1] if parts else ""
    p = path
    if p.startswith("./"):
        p = p[2:]
    if p.endswith("/index.html"):
        p = p[: -len("/index.html")]
    return p.strip("/").split("/")[0]


_ARRAY_RE = re.compile(r"window\.HTML_APPS_PROJECTS\s*=\s*(\[.*?\]);?\s*$", re.DOTALL)


def _js_to_json(blob: str) -> str:
    """Best-effort JS-object-literal → JSON. Quotes bare keys, swaps single quotes,
    strips trailing commas before } or ]. Does not handle template literals or comments."""
    # Strip /* */ and // comments (line-wise; conservative)
    blob = re.sub(r"/\*.*?\*/", "", blob, flags=re.DOTALL)
    blob = re.sub(r"(^|\s)//[^\n]*", "", blob)
    # Quote bare keys: { foo: → { "foo":
    blob = re.sub(r"([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:", r'\1"\2":', blob)
    # Replace ' with " when delimiting strings (naive but works for projects.js style)
    blob = blob.replace("'", '"')
    # Strip trailing commas
    blob = re.sub(r",(\s*[}\]])", r"\1", blob)
    return blob


def load_projects(projects_js: Path) -> list[dict]:
    text = projects_js.read_text(encoding="utf-8", errors="replace")
    m = _ARRAY_RE.search(text)
    if not m:
        raise ValueError(f"Could not locate window.HTML_APPS_PROJECTS = [...] in {projects_js}")
    arr = json.loads(_js_to_json(m.group(1)))
    rows = []
    for entry in arr:
        key = path_to_key(entry.get("path", ""))
        rows.append({
            "key": key,
            "name": entry.get("name", ""),
            "path": entry.get("path", ""),
            "category": entry.get("category"),
            "subcategory": entry.get("subcategory"),
            "featured": bool(entry.get("featured")),
            "featuredRank": entry.get("featuredRank"),
            "mode": entry.get("mode"),
            "collection": entry.get("collection"),
        })
    return rows
```

- [ ] **Step 5: Run, expect PASS**

- [ ] **Step 6: Commit**

```powershell
git -C C:\Projects\allmeta add triage/projects_js.py triage/tests/test_projects_js.py triage/tests/fixtures/mini-projects.js
git -C C:\Projects\allmeta commit -m "feat(triage): projects_js parser + path_to_key"
```

---

## Task 8: signal — playwright_pass + kind heuristic

**Files:**
- Modify: `triage/signals.py`
- Test: `triage/tests/test_signals_meta.py` (new)
- Fixture: `triage/tests/fixtures/playwright-report.json`

- [ ] **Step 1: Build fixture**

`triage/tests/fixtures/playwright-report.json`:
```json
{
  "suites": [
    { "title": "forest-plot", "specs": [{"ok": true}] },
    { "title": "Truthcert1", "specs": [{"ok": false}] }
  ]
}
```

- [ ] **Step 2: Write failing test**

`triage/tests/test_signals_meta.py`:
```python
from triage.signals import playwright_pass, kind_from_category, load_playwright_report

def test_playwright_pass_true(fixtures_root):
    report = load_playwright_report(fixtures_root / "playwright-report.json")
    assert playwright_pass("forest-plot", report) is True

def test_playwright_pass_false(fixtures_root):
    report = load_playwright_report(fixtures_root / "playwright-report.json")
    assert playwright_pass("Truthcert1", report) is False

def test_playwright_pass_none_when_app_missing(fixtures_root):
    report = load_playwright_report(fixtures_root / "playwright-report.json")
    assert playwright_pass("unknown-app", report) is None

def test_playwright_pass_none_when_report_missing(tmp_path):
    assert load_playwright_report(tmp_path / "nope.json") is None

def test_kind_from_category_non_numerical():
    assert kind_from_category("Reporting") == "non-numerical"
    assert kind_from_category("Productivity") == "non-numerical"
    assert kind_from_category("Qualitative Synthesis") == "non-numerical"

def test_kind_from_category_numerical():
    assert kind_from_category("Pairwise MA") == "numerical"
    assert kind_from_category("Diagnostic Test Accuracy") == "numerical"
    assert kind_from_category(None) == "numerical"  # default
```

- [ ] **Step 3: Run, expect FAIL**

- [ ] **Step 4: Implement** — append to `triage/signals.py`:

```python
import json as _json

_NON_NUMERICAL_CATEGORIES = {
    "Reporting", "Screening & Extraction", "Search", "Planning",
    "Productivity", "Research Notes", "Qualitative Synthesis",
}


def load_playwright_report(report_path: Path) -> dict | None:
    if not report_path.is_file():
        return None
    try:
        return _json.loads(report_path.read_text(encoding="utf-8", errors="replace"))
    except (OSError, ValueError):
        return None


def playwright_pass(app_key: str, report: dict | None) -> bool | None:
    if not report:
        return None
    for suite in report.get("suites", []):
        if suite.get("title", "").lower() == app_key.lower():
            specs = suite.get("specs") or []
            if not specs:
                return None
            return all(bool(s.get("ok")) for s in specs)
    return None


def kind_from_category(category: str | None) -> str:
    if category and category in _NON_NUMERICAL_CATEGORIES:
        return "non-numerical"
    return "numerical"
```

- [ ] **Step 5: Run, expect PASS**

- [ ] **Step 6: Commit**

```powershell
git -C C:\Projects\allmeta add triage/signals.py triage/tests/test_signals_meta.py triage/tests/fixtures/playwright-report.json
git -C C:\Projects\allmeta commit -m "feat(triage): playwright_pass + kind heuristic"
```

---

## Task 9: signal orchestrator — extract_signals()

**Files:**
- Modify: `triage/signals.py`
- Test: `triage/tests/test_signals_extract.py` (new)

- [ ] **Step 1: Write failing test**

`triage/tests/test_signals_extract.py`:
```python
from triage.signals import extract_signals

def test_extract_signals_for_clean_app(fixtures_root, monkeypatch):
    import subprocess
    def fake_run(args, **kw):
        return subprocess.CompletedProcess(args, 0, stdout="1714512000\n", stderr="")
    monkeypatch.setattr(subprocess, "run", fake_run)
    sig = extract_signals(
        app_dir=fixtures_root / "clean-app",
        repo_root=fixtures_root,
        project_meta={"key": "clean-app", "category": "Pairwise MA", "featuredRank": None},
        playwright_report=None,
    )
    assert sig["stub_count"] == 0
    assert sig["has_index"] is True
    assert sig["total_size_kb"] > 0
    assert sig["last_touched_unix"] == 1714512000
    assert sig["category"] == "Pairwise MA"
    assert sig["kind"] == "numerical"
    assert sig["is_hub_linked"] is True
    assert sig["test_count"] == 0
    assert sig["has_r_parity"] is False
    assert sig["playwright_pass"] is None

def test_extract_signals_unlinked_app(fixtures_root, monkeypatch):
    import subprocess
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: subprocess.CompletedProcess(a, 1, "", ""))
    sig = extract_signals(
        app_dir=fixtures_root / "clean-app",
        repo_root=fixtures_root,
        project_meta=None,  # not in hub
        playwright_report=None,
    )
    assert sig["is_hub_linked"] is False
    assert sig["category"] is None
    assert sig["kind"] == "numerical"
    assert sig["last_touched_unix"] is None
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement** — append to `triage/signals.py`:

```python
def extract_signals(
    *,
    app_dir: Path,
    repo_root: Path,
    project_meta: dict | None,
    playwright_report: dict | None,
) -> dict:
    """Compose all signals for a single app. Never raises; returns dict with
    nullable fields if a signal couldn't be computed."""
    key = (project_meta or {}).get("key") or app_dir.name
    cat = (project_meta or {}).get("category")
    return {
        "key": key,
        "stub_count": stub_count(app_dir),
        "has_index": has_index(app_dir),
        "has_readme": has_readme(app_dir),
        "total_size_kb": total_size_kb(app_dir),
        "last_touched_unix": last_touched_unix(app_dir, repo_root),
        "is_hub_linked": project_meta is not None,
        "featured_rank": (project_meta or {}).get("featuredRank"),
        "category": cat,
        "kind": kind_from_category(cat),
        "test_count": test_count(app_dir),
        "has_r_parity": has_r_parity(app_dir),
        "playwright_pass": playwright_pass(key, playwright_report),
    }
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```powershell
git -C C:\Projects\allmeta add triage/signals.py triage/tests/test_signals_extract.py
git -C C:\Projects\allmeta commit -m "feat(triage): extract_signals orchestrator"
```

---

## Task 10: rubric — assign_tier()

**Files:**
- Modify: `triage/rubric.py`
- Test: `triage/tests/test_rubric_tiers.py` (new)

- [ ] **Step 1: Write failing test**

`triage/tests/test_rubric_tiers.py`:
```python
import time
from triage.rubric import assign_tier

NOW = 1715000000  # 2026-05-06 UTC for math

def _sig(**over):
    base = {
        "stub_count": 0, "has_index": True, "total_size_kb": 80.0,
        "last_touched_unix": NOW - 30*86400, "is_hub_linked": True,
        "featured_rank": None, "category": "Pairwise MA", "kind": "numerical",
        "test_count": 5, "has_r_parity": True, "playwright_pass": True,
        "has_readme": True,
    }
    base.update(over)
    return base

def test_tier5_missing_index():
    assert assign_tier(_sig(has_index=False), now_unix=NOW)[0] == 5

def test_tier5_high_stub_count():
    assert assign_tier(_sig(stub_count=6), now_unix=NOW)[0] == 5

def test_tier4_any_stub():
    assert assign_tier(_sig(stub_count=1), now_unix=NOW)[0] == 4

def test_tier4_playwright_fail():
    assert assign_tier(_sig(playwright_pass=False), now_unix=NOW)[0] == 4

def test_tier4_too_small():
    assert assign_tier(_sig(total_size_kb=5.0), now_unix=NOW)[0] == 4

def test_tier3_no_tests():
    assert assign_tier(_sig(test_count=0), now_unix=NOW)[0] == 3

def test_tier3_missing_r_parity_when_numerical():
    assert assign_tier(_sig(has_r_parity=False), now_unix=NOW)[0] == 3

def test_tier3_no_readme():
    assert assign_tier(_sig(has_readme=False), now_unix=NOW)[0] == 3

def test_tier3_stale():
    assert assign_tier(_sig(last_touched_unix=NOW - 400*86400), now_unix=NOW)[0] == 3

def test_tier1_validated():
    assert assign_tier(_sig(), now_unix=NOW)[0] == 1

def test_tier1_non_numerical_no_r_parity_ok():
    sig = _sig(kind="non-numerical", has_r_parity=False, category="Reporting")
    assert assign_tier(sig, now_unix=NOW)[0] == 1

def test_tier2_working_when_not_hub_linked():
    sig = _sig(is_hub_linked=False)
    assert assign_tier(sig, now_unix=NOW)[0] == 2

def test_tier2_working_low_test_count():
    sig = _sig(test_count=2)
    assert assign_tier(sig, now_unix=NOW)[0] == 2

def test_reasons_included():
    tier, reasons = assign_tier(_sig(stub_count=2), now_unix=NOW)
    assert any("stub_count" in r for r in reasons)
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement** — append to `triage/rubric.py`:

```python
from __future__ import annotations


def assign_tier(sig: dict, *, now_unix: int) -> tuple[int, list[str]]:
    """Returns (tier, reasons). First-match-wins, top-down."""
    reasons: list[str] = []

    if not sig["has_index"]:
        reasons.append("missing index.html")
        return 5, reasons
    if (sig["stub_count"] or 0) >= STUB_REBUILD_THRESHOLD:
        reasons.append(f"stub_count={sig['stub_count']} (>= {STUB_REBUILD_THRESHOLD})")
        return 5, reasons

    if (sig["stub_count"] or 0) >= 1:
        reasons.append(f"stub_count={sig['stub_count']}")
        return 4, reasons
    if sig["playwright_pass"] is False:
        reasons.append("playwright failing")
        return 4, reasons
    if (sig["total_size_kb"] or 0.0) < MIN_VALIDATED_SIZE_KB:
        reasons.append(f"total_size_kb={sig['total_size_kb']} (< {MIN_VALIDATED_SIZE_KB})")
        return 4, reasons

    needs_parity = sig["kind"] == "numerical"
    parity_ok = (not needs_parity) or bool(sig["has_r_parity"])
    fresh = sig["last_touched_unix"] is None or (now_unix - sig["last_touched_unix"]) <= STALE_DAYS * 86400

    polish = []
    if (sig["test_count"] or 0) == 0:
        polish.append("no tests")
    if not parity_ok:
        polish.append("no R-parity test")
    if sig["last_touched_unix"] is not None and not fresh:
        age_days = (now_unix - sig["last_touched_unix"]) // 86400
        polish.append(f"last_touched {age_days}d ago")
    if not sig["has_readme"]:
        polish.append("no README")
    if polish:
        reasons.extend(polish)
        return 3, reasons

    if (
        (sig["test_count"] or 0) >= MIN_TESTS_FOR_VALIDATED
        and parity_ok
        and fresh
        and bool(sig["is_hub_linked"])
    ):
        reasons.append(f"test_count={sig['test_count']}")
        if sig["has_r_parity"]:
            reasons.append("has R-parity test")
        if sig["last_touched_unix"]:
            reasons.append(f"last_touched {(now_unix - sig['last_touched_unix']) // 86400}d ago")
        return 1, reasons

    reasons.append("working — no flags")
    return 2, reasons
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```powershell
git -C C:\Projects\allmeta add triage/rubric.py triage/tests/test_rubric_tiers.py
git -C C:\Projects\allmeta commit -m "feat(triage): assign_tier rubric"
```

---

## Task 11: rubric — confidence calculation

**Files:**
- Modify: `triage/rubric.py`
- Test: `triage/tests/test_rubric_confidence.py` (new)

- [ ] **Step 1: Write failing test**

`triage/tests/test_rubric_confidence.py`:
```python
from triage.rubric import confidence

def test_confidence_high_when_all_signals_present():
    sig = {"stub_count": 0, "has_index": True, "total_size_kb": 50.0,
           "last_touched_unix": 1714512000, "is_hub_linked": True,
           "featured_rank": 1, "category": "X", "kind": "numerical",
           "test_count": 5, "has_r_parity": True, "playwright_pass": True,
           "has_readme": True}
    assert confidence(sig) == "high"

def test_confidence_medium_with_some_nulls():
    sig = {"stub_count": 0, "has_index": True, "total_size_kb": 50.0,
           "last_touched_unix": None, "is_hub_linked": True,
           "featured_rank": None, "category": None, "kind": "numerical",
           "test_count": 0, "has_r_parity": False, "playwright_pass": None,
           "has_readme": False}
    assert confidence(sig) == "medium"

def test_confidence_low_when_most_null():
    sig = {"stub_count": 0, "has_index": False, "total_size_kb": 0.0,
           "last_touched_unix": None, "is_hub_linked": False,
           "featured_rank": None, "category": None, "kind": "numerical",
           "test_count": 0, "has_r_parity": False, "playwright_pass": None,
           "has_readme": False}
    assert confidence(sig) == "low"
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement** — append to `triage/rubric.py`:

```python
def confidence(sig: dict) -> str:
    """Heuristic confidence in the tier assignment. 12 signals total."""
    informative = 0
    if sig.get("has_index"):
        informative += 1
    if (sig.get("total_size_kb") or 0.0) > 0:
        informative += 1
    if sig.get("last_touched_unix") is not None:
        informative += 1
    if sig.get("is_hub_linked"):
        informative += 1
    if sig.get("category"):
        informative += 1
    if (sig.get("test_count") or 0) > 0:
        informative += 1
    if sig.get("has_r_parity"):
        informative += 1
    if sig.get("playwright_pass") is not None:
        informative += 1
    if sig.get("has_readme"):
        informative += 1
    if sig.get("kind"):
        informative += 1
    # stub_count is always informative (even at 0)
    informative += 1
    # featured_rank: count only if present
    if sig.get("featured_rank") is not None:
        informative += 1
    if informative >= 8:
        return "high"
    if informative >= 4:
        return "medium"
    return "low"
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```powershell
git -C C:\Projects\allmeta add triage/rubric.py triage/tests/test_rubric_confidence.py
git -C C:\Projects\allmeta commit -m "feat(triage): confidence calculation"
```

---

## Task 12: overrides — YAML loader with validation

**Files:**
- Modify: `triage/overrides.py`
- Test: `triage/tests/test_overrides.py` (new)
- Fixtures: `triage/tests/fixtures/overrides-good.yaml`, `overrides-bad-tier.yaml`

- [ ] **Step 1: Build fixtures**

`triage/tests/fixtures/overrides-good.yaml`:
```yaml
apps:
  Truthcert1:
    tier: 4
    reason: "Known stubs in app.min.js"
  prisma-flow:
    kind: non-numerical
    reason: "UI tool"
```

`triage/tests/fixtures/overrides-bad-tier.yaml`:
```yaml
apps:
  foo:
    tier: 9
    reason: "out of range"
```

- [ ] **Step 2: Write failing test**

`triage/tests/test_overrides.py`:
```python
import pytest
from triage.overrides import load_overrides

def test_load_overrides_good(fixtures_root):
    ov = load_overrides(fixtures_root / "overrides-good.yaml")
    assert ov["Truthcert1"]["tier"] == 4
    assert ov["Truthcert1"]["reason"] == "Known stubs in app.min.js"
    assert ov["prisma-flow"]["kind"] == "non-numerical"

def test_load_overrides_empty(fixtures_root):
    # fixtures_root = .../triage/tests/fixtures → .parent.parent = .../triage
    ov = load_overrides(fixtures_root.parent.parent / "triage-overrides.yaml")
    # Default file ships with apps: {}
    assert ov == {}

def test_load_overrides_bad_tier_fails_closed(fixtures_root):
    with pytest.raises(ValueError, match=r"tier"):
        load_overrides(fixtures_root / "overrides-bad-tier.yaml")

def test_load_overrides_missing_file_returns_empty(tmp_path):
    assert load_overrides(tmp_path / "nope.yaml") == {}
```

- [ ] **Step 3: Run, expect FAIL**

- [ ] **Step 4: Implement**

`triage/overrides.py`:
```python
"""YAML overrides for triage. Human always wins. Fail-closed on operator error."""

from __future__ import annotations
from pathlib import Path
import yaml


_ALLOWED_KINDS = {"numerical", "non-numerical"}


def load_overrides(yaml_path: Path) -> dict[str, dict]:
    if not yaml_path.is_file():
        return {}
    try:
        data = yaml.safe_load(yaml_path.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError as e:
        raise ValueError(f"Bad YAML in {yaml_path}: {e}") from e
    if not isinstance(data, dict):
        raise ValueError(f"{yaml_path}: top-level must be a mapping")
    apps = data.get("apps") or {}
    if not isinstance(apps, dict):
        raise ValueError(f"{yaml_path}: 'apps' must be a mapping")
    out: dict[str, dict] = {}
    for key, entry in apps.items():
        if not isinstance(entry, dict):
            raise ValueError(f"{yaml_path}: apps.{key} must be a mapping")
        if "tier" in entry:
            t = entry["tier"]
            if not isinstance(t, int) or t < 1 or t > 5:
                raise ValueError(f"{yaml_path}: apps.{key}.tier must be int 1-5, got {t!r}")
        if "kind" in entry and entry["kind"] not in _ALLOWED_KINDS:
            raise ValueError(f"{yaml_path}: apps.{key}.kind must be one of {_ALLOWED_KINDS}")
        if any(k in entry for k in ("tier", "kind")) and "reason" not in entry:
            raise ValueError(f"{yaml_path}: apps.{key}: 'reason' required when setting tier or kind")
        out[key] = entry
    return out
```

- [ ] **Step 5: Run, expect PASS**

- [ ] **Step 6: Commit**

```powershell
git -C C:\Projects\allmeta add triage/overrides.py triage/tests/test_overrides.py triage/tests/fixtures/overrides-good.yaml triage/tests/fixtures/overrides-bad-tier.yaml
git -C C:\Projects\allmeta commit -m "feat(triage): YAML override loader with fail-closed validation"
```

---

## Task 13: rubric — apply_override()

**Files:**
- Modify: `triage/rubric.py`
- Test: `triage/tests/test_rubric_overrides.py` (new)

- [ ] **Step 1: Write failing test**

`triage/tests/test_rubric_overrides.py`:
```python
from triage.rubric import apply_override

def test_override_replaces_tier_preserves_auto():
    record = {"key": "foo", "auto_tier": 2, "tier": 2, "override": None,
              "reasons": ["working"], "kind": "numerical"}
    out = apply_override(record, override={"tier": 4, "reason": "stubs"})
    assert out["tier"] == 4
    assert out["auto_tier"] == 2
    assert out["override"] == {"tier": 4, "reason": "stubs"}
    assert "override applied: stubs" in out["reasons"]

def test_override_kind_only_does_not_change_tier():
    record = {"key": "x", "auto_tier": 1, "tier": 1, "override": None,
              "reasons": [], "kind": "numerical"}
    out = apply_override(record, override={"kind": "non-numerical", "reason": "UI tool"})
    assert out["tier"] == 1
    assert out["kind"] == "non-numerical"

def test_no_override_passthrough():
    record = {"key": "x", "auto_tier": 1, "tier": 1, "override": None,
              "reasons": [], "kind": "numerical"}
    out = apply_override(record, override=None)
    assert out is record
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement** — append to `triage/rubric.py`:

```python
def apply_override(record: dict, *, override: dict | None) -> dict:
    """Mutates record in place to apply override, preserving auto_tier."""
    if not override:
        return record
    if "tier" in override:
        record["tier"] = override["tier"]
    if "kind" in override:
        record["kind"] = override["kind"]
    record["override"] = dict(override)
    record["reasons"].append(f"override applied: {override.get('reason', '')}".strip(": "))
    return record
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```powershell
git -C C:\Projects\allmeta add triage/rubric.py triage/tests/test_rubric_overrides.py
git -C C:\Projects\allmeta commit -m "feat(triage): apply_override"
```

---

## Task 14: render — triage.json + JSON Schema

**Files:**
- Modify: `triage/schema/triage.schema.json` (replace stub with full schema)
- Modify: `triage/render.py`
- Test: `triage/tests/test_render_json.py` (new)

- [ ] **Step 1: Replace `triage/schema/triage.schema.json` with full schema**

```json
{
  "$schema": "https://json-schema.org/draft-07/schema#",
  "title": "allmeta triage atlas",
  "type": "object",
  "required": ["scanner_version", "generated_at", "totals", "apps"],
  "properties": {
    "scanner_version": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
    "generated_at": { "type": "string", "format": "date-time" },
    "totals": {
      "type": "object",
      "required": ["tier_1", "tier_2", "tier_3", "tier_4", "tier_5", "total"],
      "properties": {
        "tier_1": { "type": "integer", "minimum": 0 },
        "tier_2": { "type": "integer", "minimum": 0 },
        "tier_3": { "type": "integer", "minimum": 0 },
        "tier_4": { "type": "integer", "minimum": 0 },
        "tier_5": { "type": "integer", "minimum": 0 },
        "total":  { "type": "integer", "minimum": 0 }
      }
    },
    "apps": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "required": ["tier", "auto_tier", "kind", "confidence", "reasons", "signals"],
        "properties": {
          "tier":       { "type": "integer", "minimum": 1, "maximum": 5 },
          "auto_tier":  { "type": "integer", "minimum": 1, "maximum": 5 },
          "override":   { "type": ["object", "null"] },
          "kind":       { "type": "string", "enum": ["numerical", "non-numerical"] },
          "confidence": { "type": "string", "enum": ["low", "medium", "high"] },
          "reasons":    { "type": "array", "items": { "type": "string" } },
          "signals":    { "type": "object" }
        }
      }
    }
  }
}
```

- [ ] **Step 2: Write failing test**

`triage/tests/test_render_json.py`:
```python
import json
from pathlib import Path
import jsonschema
from triage.render import render_json

def _record(key, tier=1):
    return {
        "key": key, "tier": tier, "auto_tier": tier, "override": None,
        "kind": "numerical", "confidence": "high",
        "reasons": ["test_count=5"],
        "signals": {"stub_count": 0, "test_count": 5},
    }

def test_render_json_writes_valid_artifact(tmp_path):
    records = [_record("forest-plot", 1), _record("Truthcert1", 4)]
    out = tmp_path / "triage.json"
    render_json(records, out, scanner_version="0.1.0", now_iso="2026-05-13T10:30:00Z")
    payload = json.loads(out.read_text(encoding="utf-8"))
    assert payload["scanner_version"] == "0.1.0"
    assert payload["totals"]["tier_1"] == 1
    assert payload["totals"]["tier_4"] == 1
    assert payload["totals"]["total"] == 2
    schema_path = Path(__file__).parent.parent / "schema" / "triage.schema.json"
    jsonschema.validate(payload, json.loads(schema_path.read_text(encoding="utf-8")))
```

- [ ] **Step 3: Run, expect FAIL**

`pip install pyyaml jsonschema` first if not present.

- [ ] **Step 4: Implement**

`triage/render.py`:
```python
"""Emit triage.{json,csv,md,html} from per-app records."""

from __future__ import annotations
from pathlib import Path
from typing import Iterable
import json


def _totals(records: list[dict]) -> dict[str, int]:
    out = {f"tier_{i}": 0 for i in range(1, 6)}
    for r in records:
        out[f"tier_{r['tier']}"] += 1
    out["total"] = len(records)
    return out


def render_json(records: list[dict], out_path: Path, *, scanner_version: str, now_iso: str) -> None:
    payload = {
        "scanner_version": scanner_version,
        "generated_at": now_iso,
        "totals": _totals(records),
        "apps": {r["key"]: {k: v for k, v in r.items() if k != "key"} for r in records},
    }
    out_path.write_text(json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False), encoding="utf-8")
```

- [ ] **Step 5: Run, expect PASS**

- [ ] **Step 6: Commit**

```powershell
git -C C:\Projects\allmeta add triage/render.py triage/schema/triage.schema.json triage/tests/test_render_json.py
git -C C:\Projects\allmeta commit -m "feat(triage): render triage.json + JSON schema"
```

---

## Task 15: render — triage.csv

**Files:**
- Modify: `triage/render.py`
- Test: `triage/tests/test_render_csv.py` (new)

- [ ] **Step 1: Write failing test**

`triage/tests/test_render_csv.py`:
```python
import csv
from triage.render import render_csv

def _record(key, tier):
    return {"key": key, "tier": tier, "auto_tier": tier, "override": None,
            "kind": "numerical", "confidence": "high",
            "reasons": ["test_count=5", "has R-parity"],
            "signals": {"stub_count": 0, "test_count": 5, "has_r_parity": True,
                        "last_touched_unix": 1715000000, "total_size_kb": 50.0,
                        "is_hub_linked": True, "featured_rank": 3}}

def test_render_csv_header_and_rows(tmp_path):
    records = [_record("a", 1), _record("b", 3)]
    out = tmp_path / "triage.csv"
    render_csv(records, out)
    rows = list(csv.DictReader(out.read_text(encoding="utf-8").splitlines()))
    assert len(rows) == 2
    assert rows[0]["app"] == "a"
    assert rows[0]["tier"] == "1"
    assert "test_count=5" in rows[0]["reasons"]
    assert "|" in rows[0]["reasons"]  # joined with ' | '
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement** — append to `triage/render.py`:

```python
import csv

_CSV_COLS = (
    "app", "tier", "auto_tier", "kind", "confidence",
    "stub_count", "test_count", "has_r_parity", "last_touched_days",
    "total_size_kb", "is_hub_linked", "featured_rank", "reasons",
)


def _record_to_csv_row(r: dict) -> dict:
    s = r.get("signals", {})
    return {
        "app": r["key"],
        "tier": r["tier"],
        "auto_tier": r["auto_tier"],
        "kind": r["kind"],
        "confidence": r["confidence"],
        "stub_count": s.get("stub_count"),
        "test_count": s.get("test_count"),
        "has_r_parity": s.get("has_r_parity"),
        "last_touched_days": s.get("last_touched_days"),
        "total_size_kb": s.get("total_size_kb"),
        "is_hub_linked": s.get("is_hub_linked"),
        "featured_rank": s.get("featured_rank"),
        "reasons": " | ".join(r.get("reasons", [])),
    }


def render_csv(records: list[dict], out_path: Path) -> None:
    with out_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(_CSV_COLS))
        w.writeheader()
        for r in records:
            w.writerow(_record_to_csv_row(r))
```

Note: `last_touched_days` needs to be added to `signals` dict before render. Task 18 scan.py populates this from `last_touched_unix`.

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```powershell
git -C C:\Projects\allmeta add triage/render.py triage/tests/test_render_csv.py
git -C C:\Projects\allmeta commit -m "feat(triage): render triage.csv"
```

---

## Task 16: render — triage.md

**Files:**
- Modify: `triage/render.py`
- Test: `triage/tests/test_render_md.py` (new)

- [ ] **Step 1: Write failing test**

`triage/tests/test_render_md.py`:
```python
from triage.render import render_md

def _r(key, tier, conf="high"):
    return {"key": key, "tier": tier, "auto_tier": tier, "override": None,
            "kind": "numerical", "confidence": conf,
            "reasons": ["x"], "signals": {}}

def test_render_md_sections_in_order(tmp_path):
    records = [_r("a", 1), _r("b", 3), _r("c", 5), _r("d", 2, "low")]
    out = tmp_path / "triage.md"
    render_md(records, out, scanner_version="0.1.0", now_iso="2026-05-13T10:30:00Z")
    text = out.read_text(encoding="utf-8")
    i5 = text.index("Tier 5")
    i4 = text.index("Tier 1")
    i_low = text.index("Low-confidence")
    assert i5 < i4 < i_low
    assert "a" in text and "b" in text and "c" in text
    assert "d" in text  # low-confidence section listing
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement** — append to `triage/render.py`:

```python
_TIER_TITLES = {
    5: "Tier 5 — Active rebuild",
    4: "Tier 4 — Hardening priority",
    3: "Tier 3 — Polish needed",
    2: "Tier 2 — Working",
    1: "Tier 1 — Validated",
}


def render_md(records: list[dict], out_path: Path, *, scanner_version: str, now_iso: str) -> None:
    totals = _totals(records)
    lines = [
        f"<!-- sentinel:skip-file — generated by triage/scan.py -->",
        "",
        f"# allmeta triage atlas",
        f"",
        f"Generated: {now_iso} · scanner v{scanner_version} · {totals['total']} apps",
        "",
        "## Summary",
        "",
    ]
    for t in (1, 2, 3, 4, 5):
        lines.append(f"- {_TIER_TITLES[t]}: {totals[f'tier_{t}']}")
    lines.append("")
    for t in (5, 4, 3, 2, 1):
        bucket = sorted([r for r in records if r["tier"] == t], key=lambda x: x["key"].lower())
        if not bucket:
            continue
        lines.append(f"## {_TIER_TITLES[t]} ({len(bucket)})")
        lines.append("")
        for r in bucket:
            override_flag = " · **override**" if r.get("override") else ""
            reasons = " · ".join(r.get("reasons", []))
            lines.append(f"- **{r['key']}** — {reasons}{override_flag}")
        lines.append("")
    low = [r for r in records if r["confidence"] == "low"]
    if low:
        lines.append(f"## Low-confidence flags ({len(low)})")
        lines.append("")
        for r in sorted(low, key=lambda x: x["key"].lower()):
            lines.append(f"- {r['key']} (tier {r['tier']}) — manual review")
        lines.append("")
    out_path.write_text("\n".join(lines), encoding="utf-8")
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```powershell
git -C C:\Projects\allmeta add triage/render.py triage/tests/test_render_md.py
git -C C:\Projects\allmeta commit -m "feat(triage): render triage.md"
```

---

## Task 17: render — triage.html (filterable dashboard)

**Files:**
- Modify: `triage/render.py`
- Test: `triage/tests/test_render_html.py` (new)

- [ ] **Step 1: Write failing test**

`triage/tests/test_render_html.py`:
```python
import re
from triage.render import render_html

def _r(key, tier):
    return {"key": key, "tier": tier, "auto_tier": tier, "override": None,
            "kind": "numerical", "confidence": "high",
            "reasons": ["x"], "signals": {"stub_count": 0, "test_count": 5}}

def test_render_html_contains_table_and_data(tmp_path):
    records = [_r("forest-plot", 1), _r("Truthcert1", 4)]
    out = tmp_path / "triage.html"
    render_html(records, out, scanner_version="0.1.0", now_iso="2026-05-13T10:30:00Z")
    html = out.read_text(encoding="utf-8")
    assert "<!doctype html>" in html.lower()
    assert "forest-plot" in html
    assert "Truthcert1" in html
    # No external resources
    assert "http://" not in html and "https://" not in html
    # Embedded data is JSON-safe (no </script> in template literals)
    assert "</script>" not in html.split("<script", 1)[1].rsplit("</script>", 1)[0]
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement** — append to `triage/render.py`:

```python
_HTML_TEMPLATE = """<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>allmeta triage atlas</title>
<style>
  body{font:14px/1.45 system-ui,sans-serif;margin:1.5rem;color:#0f172a;background:#f8fafc}
  h1{margin:0 0 .25rem}
  .meta{color:#475569;margin-bottom:1rem}
  .filters{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem}
  .chip{padding:.25rem .6rem;border:1px solid #cbd5e1;border-radius:9999px;background:#fff;cursor:pointer;font-size:13px}
  .chip.is-active{background:#0f172a;color:#fff;border-color:#0f172a}
  table{border-collapse:collapse;width:100%;background:#fff;border:1px solid #e2e8f0}
  th,td{padding:.4rem .55rem;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top;font-size:13px}
  th{cursor:pointer;background:#f1f5f9}
  td.tier-1{background:#dcfce7}
  td.tier-2{background:#f1f5f9}
  td.tier-3{background:#fef9c3}
  td.tier-4{background:#fed7aa}
  td.tier-5{background:#fecaca}
  input[type=search]{padding:.4rem .6rem;border:1px solid #cbd5e1;border-radius:6px;width:280px}
</style></head><body>
<h1>allmeta triage atlas</h1>
<div class="meta" id="meta-line"></div>
<div class="filters">
  <input type="search" id="q" placeholder="Search app name…">
  <button class="chip is-active" data-tier="all">All</button>
  <button class="chip" data-tier="1">Tier 1</button>
  <button class="chip" data-tier="2">Tier 2</button>
  <button class="chip" data-tier="3">Tier 3</button>
  <button class="chip" data-tier="4">Tier 4</button>
  <button class="chip" data-tier="5">Tier 5</button>
</div>
<table id="t">
  <thead><tr>
    <th data-k="key">App</th><th data-k="tier">Tier</th><th data-k="kind">Kind</th>
    <th data-k="confidence">Conf</th><th>Reasons</th>
  </tr></thead>
  <tbody></tbody>
</table>
<script>
const DATA = __DATA__;
const tbody = document.querySelector("#t tbody");
let tier = "all", q = "", sortKey = "tier", sortDir = 1;
function render(){
  tbody.innerHTML = "";
  let rows = DATA.slice().filter(r => (tier==="all" || String(r.tier)===tier)
    && (q==="" || r.key.toLowerCase().includes(q)));
  rows.sort((a,b) => {
    const av = a[sortKey] ?? "", bv = b[sortKey] ?? "";
    if (av < bv) return -1*sortDir;
    if (av > bv) return 1*sortDir;
    return 0;
  });
  for (const r of rows){
    const tr = document.createElement("tr");
    const tdK = document.createElement("td"); tdK.textContent = r.key;
    const tdT = document.createElement("td"); tdT.textContent = r.tier; tdT.className = "tier-" + r.tier;
    const tdKind = document.createElement("td"); tdKind.textContent = r.kind;
    const tdC = document.createElement("td"); tdC.textContent = r.confidence;
    const tdR = document.createElement("td"); tdR.textContent = (r.reasons||[]).join(" · ");
    tr.append(tdK, tdT, tdKind, tdC, tdR);
    tbody.appendChild(tr);
  }
  document.getElementById("meta-line").textContent = rows.length + " of " + DATA.length + " apps";
}
document.querySelectorAll(".chip").forEach(c => c.addEventListener("click", () => {
  document.querySelectorAll(".chip").forEach(x => x.classList.remove("is-active"));
  c.classList.add("is-active");
  tier = c.dataset.tier;
  render();
}));
document.getElementById("q").addEventListener("input", e => { q = e.target.value.toLowerCase(); render(); });
document.querySelectorAll("th[data-k]").forEach(h => h.addEventListener("click", () => {
  const k = h.dataset.k;
  if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = 1; }
  render();
}));
render();
</script>
</body></html>"""


def render_html(records: list[dict], out_path: Path, *, scanner_version: str, now_iso: str) -> None:
    data = [
        {
            "key": r["key"],
            "tier": r["tier"],
            "kind": r["kind"],
            "confidence": r["confidence"],
            "reasons": r.get("reasons", []),
        }
        for r in records
    ]
    blob = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    html = _HTML_TEMPLATE.replace("__DATA__", blob)
    # Inject meta line above the data line at runtime — keep header minimal here
    header = f"<!-- generated {now_iso} · scanner v{scanner_version} -->\n"
    out_path.write_text(header + html, encoding="utf-8")
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```powershell
git -C C:\Projects\allmeta add triage/render.py triage/tests/test_render_html.py
git -C C:\Projects\allmeta commit -m "feat(triage): render triage.html dashboard"
```

---

## Task 18: scan.py orchestrator

**Files:**
- Modify: `triage/scan.py`
- Test: `triage/tests/test_scan_e2e.py` (new)

- [ ] **Step 1: Write failing test** (end-to-end against fixtures)

`triage/tests/test_scan_e2e.py`:
```python
import json
import subprocess
from pathlib import Path
import pytest

@pytest.fixture
def mock_git(monkeypatch):
    def fake_run(args, **kw):
        return subprocess.CompletedProcess(args, 0, stdout="1715000000\n", stderr="")
    monkeypatch.setattr(subprocess, "run", fake_run)

def test_scan_emits_four_artifacts(tmp_path, fixtures_root, mock_git):
    # Build a mini repo
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "hub").mkdir()
    (repo / "hub" / "projects.js").write_text(
        (fixtures_root / "mini-projects.js").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    (repo / "forest-plot").mkdir()
    (repo / "forest-plot" / "index.html").write_text("<html><body>ok</body></html>", encoding="utf-8")
    (repo / "dta-sroc").mkdir()
    (repo / "dta-sroc" / "index.html").write_text("<html><body>ok TODO</body></html>", encoding="utf-8")

    from triage.scan import main
    main(repo_root=repo, overrides_path=None, playwright_report_path=None, now_unix=1715000000)

    for name in ("triage.json", "triage.csv", "triage.md", "triage.html"):
        assert (repo / name).is_file(), name + " missing"
    payload = json.loads((repo / "triage.json").read_text(encoding="utf-8"))
    assert payload["totals"]["total"] == 2  # external Al-Mizan skipped (folder missing on disk)
    assert "forest-plot" in payload["apps"]
    assert payload["apps"]["dta-sroc"]["tier"] == 4  # has TODO
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

`triage/scan.py`:
```python
"""Top-level CLI. python triage/scan.py [--repo-root .] [--now <unix>]"""

from __future__ import annotations
from datetime import datetime, timezone
from pathlib import Path
import argparse
import time

from triage import signals as S
from triage import rubric as R
from triage import render
from triage.overrides import load_overrides
from triage.projects_js import load_projects

SCANNER_VERSION = "0.1.0"


def main(
    *,
    repo_root: Path,
    overrides_path: Path | None,
    playwright_report_path: Path | None,
    now_unix: int | None = None,
) -> None:
    now_unix = now_unix or int(time.time())
    now_iso = datetime.fromtimestamp(now_unix, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    overrides = load_overrides(overrides_path) if overrides_path else {}
    projects = load_projects(repo_root / "hub" / "projects.js")
    pw_report = S.load_playwright_report(playwright_report_path) if playwright_report_path else None
    by_key = {p["key"]: p for p in projects}

    records: list[dict] = []
    for proj in projects:
        app_dir = repo_root / proj["key"]
        if not app_dir.is_dir():
            # External URL apps or moved folders — skip but log via tier 5 only if has_index could be true
            continue
        sig = S.extract_signals(
            app_dir=app_dir, repo_root=repo_root,
            project_meta=proj, playwright_report=pw_report,
        )
        # Derive last_touched_days for CSV / dashboard
        if sig["last_touched_unix"] is not None:
            sig["last_touched_days"] = (now_unix - sig["last_touched_unix"]) // 86400
        else:
            sig["last_touched_days"] = None

        tier, reasons = R.assign_tier(sig, now_unix=now_unix)
        record = {
            "key": proj["key"],
            "tier": tier,
            "auto_tier": tier,
            "override": None,
            "kind": sig["kind"],
            "confidence": R.confidence(sig),
            "reasons": reasons,
            "signals": sig,
        }
        R.apply_override(record, override=overrides.get(proj["key"]))
        records.append(record)

    render.render_json(records, repo_root / "triage.json",
                      scanner_version=SCANNER_VERSION, now_iso=now_iso)
    render.render_csv(records, repo_root / "triage.csv")
    render.render_md(records, repo_root / "triage.md",
                     scanner_version=SCANNER_VERSION, now_iso=now_iso)
    render.render_html(records, repo_root / "triage.html",
                       scanner_version=SCANNER_VERSION, now_iso=now_iso)


def _cli() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--repo-root", default=".", help="allmeta repo root")
    p.add_argument("--overrides", default="triage/triage-overrides.yaml")
    p.add_argument("--playwright-report", default=None)
    args = p.parse_args()
    main(
        repo_root=Path(args.repo_root).resolve(),
        overrides_path=Path(args.overrides) if args.overrides else None,
        playwright_report_path=Path(args.playwright_report) if args.playwright_report else None,
    )
    print(f"OK · scanner v{SCANNER_VERSION}")
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```powershell
git -C C:\Projects\allmeta add triage/scan.py triage/tests/test_scan_e2e.py
git -C C:\Projects\allmeta commit -m "feat(triage): scan.py orchestrator + e2e test"
```

---

## Task 19: full suite green + Sentinel scan

- [ ] **Step 1: Run full triage suite**

```powershell
cd C:\Projects\allmeta; python -m pytest triage/tests -q
```
Expected: all green, no FAIL, no errors. Target ≥50 tests total.

- [ ] **Step 2: Sentinel scan**

```powershell
cd C:\Projects\allmeta; python -m sentinel scan --repo .
```
Expected: BLOCK=0 on the new `triage/` folder. If Sentinel is not installed, skip with a note in the commit message.

- [ ] **Step 3: Commit any fixes from steps 1–2** if needed

```powershell
git -C C:\Projects\allmeta add -u
git -C C:\Projects\allmeta commit -m "chore(triage): green test suite + Sentinel clean"
```

---

## Task 20: hub/styles.css — Tier-1 badge styling

**Files:**
- Modify: `hub/styles.css` (append to end of file)

- [ ] **Step 1: Read end of file to know exact append point**

`cd C:\Projects\allmeta; python -c "p=open('hub/styles.css','rb').read(); print(len(p), p[-200:])"`

- [ ] **Step 2: Append the badge CSS at EOF**

Append this block to `hub/styles.css`:

```css
/* Triage atlas — Tier-1 badge. Rendered by hub/app.js after fetching triage.json.
   Fails open: if triage.json is missing, this CSS is dormant (no .tier-badge nodes). */
.tier-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.15rem 0.55rem;
  margin-left: 0.5rem;
  border-radius: 9999px;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1.4;
  position: relative;
}
.tier-badge--validated {
  background: #dcfce7;
  color: #14532d;
  border: 1px solid #86efac;
}
.tier-badge[data-reasons]:hover::after,
.tier-badge[data-reasons]:focus-visible::after {
  content: attr(data-reasons);
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  background: #0f172a;
  color: #f8fafc;
  font-size: 0.7rem;
  padding: 0.35rem 0.55rem;
  border-radius: 4px;
  white-space: pre-line;
  max-width: 280px;
  z-index: 10;
}
.tier-badge:focus-visible { outline: 2px solid #0f172a; outline-offset: 2px; }
```

- [ ] **Step 3: Commit**

```powershell
git -C C:\Projects\allmeta add hub/styles.css
git -C C:\Projects\allmeta commit -m "feat(hub): tier-badge CSS for triage atlas"
```

---

## Task 21: hub/app.js — fetch triage.json, fail-open

**Files:**
- Modify: `hub/app.js` (line 2 area: after `projects` declaration)

- [ ] **Step 1: Read current state around line 2**

We saw earlier:
```javascript
(function () {
  const projects = Array.isArray(window.HTML_APPS_PROJECTS) ? window.HTML_APPS_PROJECTS.slice() : [];
```

- [ ] **Step 2: Edit `hub/app.js` — insert triage state + loader directly after the `projects` declaration**

Find the line:
```javascript
  const projects = Array.isArray(window.HTML_APPS_PROJECTS) ? window.HTML_APPS_PROJECTS.slice() : [];
```

Insert immediately after it:
```javascript

  // Triage atlas — fail-open. If ./triage.json is missing, malformed, or
  // returns an unknown major version, the hub renders exactly as it did before.
  // Map from canonical app key (folder name) -> {tier, reasons}.
  let triageByKey = Object.create(null);
  const SUPPORTED_TRIAGE_MAJOR = 0;

  function projectKey(project) {
    const path = (project && project.path) || "";
    if (!path) return "";
    if (/^https?:/i.test(path)) {
      try { const parts = new URL(path).pathname.split("/").filter(Boolean); return parts[parts.length - 1] || ""; }
      catch (_) { return ""; }
    }
    let p = path;
    if (p.startsWith("./")) p = p.slice(2);
    if (p.endsWith("/index.html")) p = p.slice(0, -"/index.html".length);
    return p.replace(/^\/+|\/+$/g, "").split("/")[0];
  }

  function loadTriage() {
    return fetch("./triage.json", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("triage.json HTTP " + r.status); return r.json(); })
      .then(function (payload) {
        const ver = String(payload && payload.scanner_version || "0.0.0");
        const major = parseInt(ver.split(".")[0], 10);
        if (!Number.isFinite(major) || major > SUPPORTED_TRIAGE_MAJOR) {
          console.warn("[triage] unknown major version " + ver + "; ignoring");
          return;
        }
        const apps = (payload && payload.apps) || {};
        const map = Object.create(null);
        for (const k of Object.keys(apps)) {
          const a = apps[k] || {};
          map[k] = { tier: a.tier, reasons: a.reasons || [], confidence: a.confidence };
        }
        triageByKey = map;
      })
      .catch(function (err) { console.warn("[triage] fail-open:", err && err.message || err); });
  }
```

- [ ] **Step 3: Find the bottom-of-IIFE invocation block and wrap initial render in `loadTriage().then(...)`**

Replace:
```javascript
  readUrlState();
  updateMetrics();
  createFilterButtons();
  renderFeaturedStrip();
  render();
```

with:
```javascript
  readUrlState();
  updateMetrics();
  // Initial render runs synchronously; triage is layered on top once loaded.
  // This keeps the hub usable even on networks where ./triage.json is slow.
  createFilterButtons();
  renderFeaturedStrip();
  render();
  loadTriage().then(function () {
    // Re-render the parts that depend on tier data.
    updateMetrics();
    renderFeaturedStrip();
    render();
  });
```

- [ ] **Step 4: Sanity — load the page locally**

```powershell
cd C:\Projects\allmeta; python -m http.server 8081
```
Open http://localhost:8081 in a browser. Should render exactly as before (no triage.json exists yet → fail-open path). Console may show "[triage] fail-open: triage.json HTTP 404" — that's expected.

Press Ctrl-C to stop server. Document the manual check in the commit message body.

- [ ] **Step 5: Commit**

```powershell
git -C C:\Projects\allmeta add hub/app.js
git -C C:\Projects\allmeta commit -m "feat(hub): fetch triage.json fail-open"
```

---

## Task 22: hub/app.js — Tier-1 badge on cards

**Files:**
- Modify: `hub/app.js` (`renderCard` function, lines ~290-322)

- [ ] **Step 1: Modify `renderCard` to append a Tier-1 badge**

In `renderCard(project)`, find the existing block that creates the `pill`:
```javascript
    const isNew = project.collection === "new";
    const isServer = project.mode === "server";
    const pill = document.createElement("span");
    pill.className = "pill " + (isNew ? "pill-new" : isServer ? "pill-server" : "pill-ready");
    pill.textContent = isNew ? "New App" : isServer ? "Needs HTTP" : "Launchable";
    head.appendChild(pill);
    article.appendChild(head);
```

Insert directly after `head.appendChild(pill);` (before `article.appendChild(head);`):

```javascript
    // Triage atlas — only Tier 1 is positively badged on the main grid.
    // Tiers 2–5 stay unbadged; the improvement queue is in triage.html.
    const triageRec = triageByKey[projectKey(project)];
    if (triageRec && triageRec.tier === 1) {
      const badge = document.createElement("span");
      badge.className = "tier-badge tier-badge--validated";
      badge.textContent = "Validated";
      badge.tabIndex = 0;
      const reasons = (triageRec.reasons || []).join("\n");
      if (reasons) badge.setAttribute("data-reasons", reasons);
      badge.setAttribute("aria-label", "Validated — " + (reasons || "tier 1"));
      head.appendChild(badge);
    }
```

- [ ] **Step 2: Sanity — verify the badge does NOT appear without triage.json**

Start the local server again (`python -m http.server 8081`). Confirm no badge appears anywhere. Console: still showing fail-open warning.

- [ ] **Step 3: Commit**

```powershell
git -C C:\Projects\allmeta add hub/app.js
git -C C:\Projects\allmeta commit -m "feat(hub): tier-1 badge on cards (fail-open)"
```

---

## Task 23: hub/app.js — featured strip from Tier 1

**Files:**
- Modify: `hub/app.js` (`renderFeaturedStrip` function, lines ~367-423)

- [ ] **Step 1: Modify `renderFeaturedStrip` to combine `featured` flag with `tier === 1`**

Find this block at the start of `renderFeaturedStrip`:
```javascript
    const featured = projects
      .filter((p) => p.featured && p.mode !== "server")
      .map((p, i) => ({ p, i }))
```

Replace with:
```javascript
    // Triage atlas teeth: a project is featured if it's Tier 1 OR has an explicit
    // featured=true flag in projects.js (backward compat for when triage.json is
    // missing or hasn't been generated yet).
    function isFeatured(p) {
      const t = (triageByKey[projectKey(p)] || {}).tier;
      if (t === 1) return true;
      // No triage data for this app? Fall back to legacy featured flag.
      if (t == null && p.featured) return true;
      return false;
    }
    const featured = projects
      .filter((p) => isFeatured(p) && p.mode !== "server")
      .map((p, i) => ({ p, i }))
```

- [ ] **Step 2: Sanity — without triage.json, existing featured strip behaviour preserved**

Open the local server. The hand-picked featured strip (driven by `featured: true` in projects.js) should appear exactly as before. Confirm.

- [ ] **Step 3: Commit**

```powershell
git -C C:\Projects\allmeta add hub/app.js
git -C C:\Projects\allmeta commit -m "feat(hub): featured strip from tier-1 with legacy fallback"
```

---

## Task 24: hub/app.js — "Needs polish" filter chip

**Files:**
- Modify: `hub/app.js` (`getFilters`, `matchesFilter`, `countForFilter`)

- [ ] **Step 1: Add "Needs polish" to the filter list**

Find:
```javascript
  function getFilters() {
    const categoryFilters = Array.from(new Set(projects.map((project) => project.category))).sort();
    return ["All", "Existing", "New"].concat(categoryFilters);
  }
```

Replace with:
```javascript
  function getFilters() {
    const categoryFilters = Array.from(new Set(projects.map((project) => project.category))).sort();
    // "Needs polish" only appears once triage.json has loaded with at least one
    // tier 3-5 app. Until then, it's hidden — the hub doesn't surface a filter
    // that filters to zero results.
    const polishCount = projects.reduce((n, p) => {
      const t = (triageByKey[projectKey(p)] || {}).tier;
      return n + ((t === 3 || t === 4 || t === 5) ? 1 : 0);
    }, 0);
    const polish = polishCount > 0 ? ["Needs polish"] : [];
    return ["All", "Existing", "New"].concat(polish).concat(categoryFilters);
  }
```

- [ ] **Step 2: Teach `matchesFilter` about the new filter**

Find:
```javascript
  function matchesFilter(project) {
    if (activeFilter === "All") return true;
    if (activeFilter === "Existing" || activeFilter === "New") {
      return project.collection === activeFilter.toLowerCase();
    }
    if (project.category !== activeFilter) return false;
```

Insert between the "Existing/New" branch and the `project.category !== activeFilter` line:
```javascript
    if (activeFilter === "Needs polish") {
      const t = (triageByKey[projectKey(project)] || {}).tier;
      return t === 3 || t === 4 || t === 5;
    }
```

- [ ] **Step 3: Teach `countForFilter`**

Find:
```javascript
  function countForFilter(label) {
    if (label === "All") return projects.length;
    if (label === "Existing" || label === "New") {
      return projects.filter((p) => p.collection === label.toLowerCase()).length;
    }
    return projects.filter((p) => p.category === label).length;
  }
```

Replace with:
```javascript
  function countForFilter(label) {
    if (label === "All") return projects.length;
    if (label === "Existing" || label === "New") {
      return projects.filter((p) => p.collection === label.toLowerCase()).length;
    }
    if (label === "Needs polish") {
      return projects.filter((p) => {
        const t = (triageByKey[projectKey(p)] || {}).tier;
        return t === 3 || t === 4 || t === 5;
      }).length;
    }
    return projects.filter((p) => p.category === label).length;
  }
```

- [ ] **Step 4: Sanity — chip should not appear without triage.json**

Restart the local server. Confirm "Needs polish" is absent from the filter row. Confirm clicking "All" still shows 71 cards.

- [ ] **Step 5: Commit**

```powershell
git -C C:\Projects\allmeta add hub/app.js
git -C C:\Projects\allmeta commit -m "feat(hub): Needs polish filter chip (tier 3-5)"
```

---

## Task 25: index.html — swap "Recently added" metric for "Validated apps"

**Files:**
- Modify: `index.html` (lines 44-47)
- Modify: `hub/app.js` (`updateMetrics`)

- [ ] **Step 1: Edit index.html metric label and id**

Find:
```html
          <article class="metric-card">
            <span class="metric-label">Recently added</span>
            <strong id="new-count" class="metric-value">0</strong>
          </article>
```

Replace with:
```html
          <article class="metric-card">
            <span class="metric-label">Validated apps</span>
            <strong id="validated-count" class="metric-value">0</strong>
          </article>
```

- [ ] **Step 2: Update `updateMetrics` in hub/app.js**

Find:
```javascript
  const counts = {
    launchable: document.getElementById("launchable-count"),
    server: document.getElementById("server-count"),
    added: document.getElementById("new-count"),
    categories: document.getElementById("category-count")
  };
```

Replace with:
```javascript
  const counts = {
    launchable: document.getElementById("launchable-count"),
    server: document.getElementById("server-count"),
    validated: document.getElementById("validated-count"),
    categories: document.getElementById("category-count")
  };
```

Find:
```javascript
    counts.added.textContent = String(projects.filter((project) => project.collection === "new").length);
```

Replace with:
```javascript
    // Validated apps = tier 1. Falls back to 0 when triage.json hasn't loaded yet.
    counts.validated.textContent = String(
      projects.filter((p) => (triageByKey[projectKey(p)] || {}).tier === 1).length
    );
```

- [ ] **Step 3: Sanity — without triage.json, metric reads 0**

Restart server. "Validated apps" metric should show `0` (no triage.json yet). The other 3 metrics still populate normally.

- [ ] **Step 4: Commit**

```powershell
git -C C:\Projects\allmeta add index.html hub/app.js
git -C C:\Projects\allmeta commit -m "feat(hub): replace 'Recently added' metric with 'Validated apps'"
```

---

## Task 26: Playwright sanity — hub renders with/without/malformed triage.json

**Files:**
- Create: `tests/playwright/triage-failopen.spec.mjs`

- [ ] **Step 1: Write the spec**

`tests/playwright/triage-failopen.spec.mjs`:
```javascript
import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REPO = process.cwd();
const TRIAGE = join(REPO, 'triage.json');

function backupTriage() {
  if (!existsSync(TRIAGE)) return null;
  const buf = readFileSync(TRIAGE);
  unlinkSync(TRIAGE);
  return buf;
}
function restore(buf) {
  if (buf) writeFileSync(TRIAGE, buf);
}

test.describe('Triage fail-open contract', () => {
  test('hub renders when triage.json is missing', async ({ page }) => {
    const buf = backupTriage();
    try {
      await page.goto('http://localhost:8081/');
      const cards = page.locator('.project-card');
      await expect(cards.first()).toBeVisible({ timeout: 5000 });
      // No Tier-1 badge anywhere.
      await expect(page.locator('.tier-badge')).toHaveCount(0);
    } finally {
      restore(buf);
    }
  });

  test('hub renders when triage.json is malformed', async ({ page }) => {
    const buf = backupTriage();
    writeFileSync(TRIAGE, 'not valid json {{{');
    try {
      await page.goto('http://localhost:8081/');
      const cards = page.locator('.project-card');
      await expect(cards.first()).toBeVisible({ timeout: 5000 });
      await expect(page.locator('.tier-badge')).toHaveCount(0);
    } finally {
      unlinkSync(TRIAGE);
      restore(buf);
    }
  });

  test('hub renders Tier-1 badges when triage.json is valid', async ({ page }) => {
    const buf = backupTriage();
    const sample = {
      scanner_version: '0.1.0',
      generated_at: '2026-05-13T10:30:00Z',
      totals: { tier_1: 1, tier_2: 0, tier_3: 0, tier_4: 0, tier_5: 0, total: 1 },
      apps: { 'forest-plot': { tier: 1, auto_tier: 1, override: null, kind: 'numerical',
        confidence: 'high', reasons: ['test_count=12'], signals: {} } },
    };
    writeFileSync(TRIAGE, JSON.stringify(sample));
    try {
      await page.goto('http://localhost:8081/');
      await expect(page.locator('.tier-badge--validated').first()).toBeVisible({ timeout: 5000 });
    } finally {
      unlinkSync(TRIAGE);
      restore(buf);
    }
  });
});
```

- [ ] **Step 2: Run the spec against a running local server**

```powershell
cd C:\Projects\allmeta; Start-Job -ScriptBlock { python -m http.server 8081 } | Out-Null
npx playwright test tests/playwright/triage-failopen.spec.mjs
Get-Job | Stop-Job; Get-Job | Remove-Job
```
Expected: all 3 specs PASS.

- [ ] **Step 3: Commit**

```powershell
git -C C:\Projects\allmeta add tests/playwright/triage-failopen.spec.mjs
git -C C:\Projects\allmeta commit -m "test(hub): triage fail-open Playwright contract"
```

---

## Task 27: First real scan + commit generated artifacts

- [ ] **Step 1: Ensure pyyaml + jsonschema are installed**

```powershell
python -m pip install --user pyyaml jsonschema
```

- [ ] **Step 2: Run the scanner**

```powershell
cd C:\Projects\allmeta; python triage/scan.py --repo-root .
```
Expected output: `OK · scanner v0.1.0`. Four files appear at the repo root: `triage.json`, `triage.csv`, `triage.md`, `triage.html`.

- [ ] **Step 3: Sanity-check the generated files**

```powershell
cd C:\Projects\allmeta; python -c "import json; p=json.load(open('triage.json',encoding='utf-8')); print(p['totals']); print(len(p['apps']), 'apps')"
```
Expected: totals dict prints; app count is roughly 60–70 (folders matching projects.js entries).

- [ ] **Step 4: Open triage.html in the browser, confirm the table renders and the chip filters work**

```powershell
start C:\Projects\allmeta\triage.html
```

- [ ] **Step 5: Open the hub and confirm Tier-1 badges + featured strip + "Needs polish" filter**

```powershell
cd C:\Projects\allmeta; python -m http.server 8081
```
Browse http://localhost:8081. Verify:
- Tier-1 cards show "Validated" pill with a hover tooltip
- "Needs polish" chip appears in the filter row
- Featured strip surfaces Tier-1 apps
- "Validated apps" metric card shows the Tier-1 count

- [ ] **Step 6: Review `triage.md`. If any auto-tier assignment looks wrong, add an entry to `triage/triage-overrides.yaml`, re-run `python triage/scan.py`, and re-verify.**

- [ ] **Step 7: Commit generated artifacts + any override edits**

```powershell
git -C C:\Projects\allmeta add triage.json triage.csv triage.md triage.html triage/triage-overrides.yaml
git -C C:\Projects\allmeta commit -m "chore(triage): first scan + generated artifacts"
```

---

## Task 28: Final verification + bundle release

- [ ] **Step 1: Full pytest pass**

```powershell
cd C:\Projects\allmeta; python -m pytest triage/tests -q
```
Expected: all green.

- [ ] **Step 2: Sentinel scan over the whole repo**

```powershell
cd C:\Projects\allmeta; python -m sentinel scan --repo .
```
Expected: BLOCK=0 (WARN allowed). If anything BLOCKs, fix at source — do NOT bypass.

- [ ] **Step 3: Playwright full suite (including new fail-open contract)**

```powershell
cd C:\Projects\allmeta; Start-Job -ScriptBlock { python -m http.server 8081 } | Out-Null
npx playwright test
Get-Job | Stop-Job; Get-Job | Remove-Job
```

- [ ] **Step 4: Commit any final fixes; verify clean `git status`**

```powershell
git -C C:\Projects\allmeta status
```

- [ ] **Step 5: Tag v0.1.0**

```powershell
git -C C:\Projects\allmeta tag -a triage-v0.1.0 -m "Triage atlas v0.1.0 — scanner + 4 artifacts + hub teeth (fail-open)"
```

(Push only on explicit user instruction.)

---

## Spec coverage map (self-review checklist)

| Spec section | Implemented by |
|---|---|
| §1 Goal & non-goals | Whole plan; no app removal anywhere |
| §2 Architecture: scanner/signals/rubric/render/overrides/hub | Tasks 1, 3–9, 10–13, 14–17, 12, 20–25 |
| §3 Signals (12) | Tasks 3, 4, 5, 6, 7, 8, 9 |
| §3 Tunable constants | Task 2 |
| §3 Tier rules (first-match-wins) | Task 10 |
| §3 Reasons array | Task 10, 13 |
| §3 Confidence | Task 11 |
| §3 Override schema + fail-closed | Task 12 |
| §4 triage.json contract + schema | Task 14 |
| §4 CSV / MD / HTML | Tasks 15, 16, 17 |
| §4 Hub teeth (fetch, fail-open, badge, featured strip, filter chip, metric swap) | Tasks 20–25 |
| §4 "Hide tier 2–5 from main grid" | Task 22 (only Tier 1 badged) |
| §5 Scanner error handling | Tasks 5 (git), 8 (Playwright), 12 (YAML), 18 (orchestrator skips missing folders) |
| §5 Hub fail-open | Tasks 21, 26 |
| §5 Testing (≥30 unit + schema + Playwright sanity + Sentinel) | Tasks 2–19 (~60 tests) + 26 + 19 + 28 |
| §5 v0.2 hooks signposted | (Spec only — no v0.2 work in this plan) |
| §6 What ships next (flagship hardening) | (Spec only — covered by subproject #2 future plan) |



