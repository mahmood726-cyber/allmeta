"""Generate per-app README.md files enriched with structured data from
shared/app-flow.js, shared/citation.js, and shared/hero-examples.js.

Behavior:
  - For each app in CATALOG, preserves everything ABOVE the auto-generated
    marker and replaces everything below it with freshly-rendered sections.
  - If no README exists, creates one with the catalog blurb as the summary.
  - Idempotent: re-run safely; only the auto section changes.
  - Hand-edited auto sections are PRESERVED. scripts/app_readmes.generated.json records the sha256 of the
    auto section this script last wrote for each app. An existing auto section is rewritten only when its
    hash matches that record (it is still exactly what the generator wrote); a section that differs from
    the record -- or has no record and differs from the fresh render -- was edited by hand and is left
    alone (reported as PRESERVED). Pass --force APP to regenerate a preserved README deliberately.
    Root cause this guards (lane crlfreadme, 2026-11-15): the script replaced everything between the
    markers unconditionally, so a run reverted hand corrections in component-nma, cross-design,
    multi-outcome-ma, nma-inconsistency and rve-meta (data-shape and reproducibility wording, two DOIs,
    rve-meta's Outputs section) back to the catalog defaults.

Why structured-only: we deliberately don't fabricate "when to use" advice
beyond what the catalog blurb + category + method papers already encode.
That keeps the READMEs trustworthy when an expert reads them.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NODE = shutil.which("node")
LOCK = ROOT / "scripts" / "app_readmes.generated.json"

# Dump all three catalogs as JSON via node.
DUMP_SCRIPT = """
const fp = require(__FP__);
const ct = require(__CT__);
const hr = require(__HR__);
const out = {
  catalog: fp.CATALOG || {},
  citations: ct.CITATIONS || {},
  allmetaCite: ct.ALLMETA_CITE || {},
  hero: hr.MANIFESTS || {},
};
console.log(JSON.stringify(out));
"""

def _load_data() -> dict:
    if NODE is None:
        raise SystemExit("node not installed")
    script = (
        DUMP_SCRIPT
        .replace("__FP__", json.dumps(str(ROOT / "shared" / "app-flow.js")))
        .replace("__CT__", json.dumps(str(ROOT / "shared" / "citation.js")))
        .replace("__HR__", json.dumps(str(ROOT / "shared" / "hero-examples.js")))
    )
    # encoding is explicit: node writes UTF-8, and text=True alone decodes with the locale encoding
    # (cp1252 on Windows), which wrote "Ã—" for "×" into the READMEs this script created.
    r = subprocess.run([NODE, "-e", script], capture_output=True, text=True, encoding="utf-8", check=True)
    return json.loads(r.stdout.strip())


MARK_BEGIN = "<!-- ALM-AUTO-README-BEGIN (regenerate with scripts/gen_app_readmes.py) -->"
MARK_END = "<!-- ALM-AUTO-README-END -->"


def _render_auto_section(app_key: str, entry: dict, citations: list, hero: dict | None) -> str:
    """Build the auto-generated section for one app."""
    parts: list[str] = [MARK_BEGIN, ""]

    # 1. When to use — derived from catalog kind + category.
    kind = entry.get("kind", "")
    category = entry.get("category", "")
    blurb = entry.get("blurb", "")
    parts.append("## When to use")
    parts.append("")
    parts.append(f"- **Category:** {category}")
    if kind == "pairwise":
        parts.append("- **Data shape:** pairwise effect sizes — one row per study with `{label, est, se}` (or CI).")
    elif kind == "comparisons":
        parts.append("- **Data shape:** multi-arm trials in NMA shape — multiple rows per study, one per arm.")
    elif kind == "either":
        parts.append("- **Data shape:** accepts pairwise OR multi-arm input.")
    elif kind == "no-bus":
        parts.append("- **Data shape:** standalone (no `ma-studies` bus integration).")
    if blurb:
        parts.append(f"- **Purpose:** {blurb}.")
    parts.append("")

    # 2. Worked example — from hero manifest if present.
    if hero and isinstance(hero, dict) and hero.get("datasets"):
        ds = hero["datasets"]
        parts.append("## Worked example")
        parts.append("")
        parts.append("Click **Try with: ▾** in the app to load a canonical benchmark dataset:")
        parts.append("")
        for d in ds:
            label = d.get("label") or d.get("key", "")
            note = d.get("note") or ""
            line = f"- **{label}**"
            if note:
                line += f" — {note}"
            parts.append(line)
        parts.append("")
        parts.append("All canonical datasets are defined in `shared/canonical-datasets.js` "
                     "with their original published source.")
        parts.append("")

    # 3. Method papers — from citation registry.
    if citations:
        parts.append("## Method papers")
        parts.append("")
        for c in citations:
            cite = c.get("vancouver") or c.get("text") or ""
            if cite:
                parts.append(f"- {cite}")
        parts.append("")

    # 4. Cross-app navigation — from app-flow SUGGESTIONS (rendered as plain list).
    # We deliberately don't auto-link to the live URLs here; the in-app
    # "Continue with…" bar handles deep-linking. README is meant for GitHub.

    # 5. Cite as
    parts.append("## Cite as")
    parts.append("")
    parts.append("Click **\U0001F4D1 Cite as** inside the app for ready-to-paste Vancouver + BibTeX "
                 "citations covering both the allmeta release and the relevant method paper(s).")
    parts.append("")

    # 6. Reproducibility
    parts.append("## Reproducibility")
    parts.append("")
    parts.append("- Receipts and JSON exports include `producedBy` "
                 "(app version, git SHA, build timestamp) — see `shared/build-info.js`.")
    parts.append("- For apps with a parity-checked engine, `shared/specs/` contains "
                 "the R-reference test vectors. Run `python -m pytest tests/` for the full suite.")
    parts.append("- Click **\U0001F4DD Verify in R** to open a Shinylive R session with the "
                 "current data pre-loaded for independent re-computation (where supported).")
    parts.append("")

    parts.append(MARK_END)
    return "\n".join(parts)


def _patch_readme(path: Path, app_key: str, entry: dict, citations: list, hero: dict | None) -> str:
    """Returns the new README content. If the existing README has the auto
    marker, replaces only the auto section; otherwise appends one after the
    existing content."""
    new_section = _render_auto_section(app_key, entry, citations, hero)
    if path.exists():
        original = path.read_text(encoding="utf-8")
        if MARK_BEGIN in original and MARK_END in original:
            before = original.split(MARK_BEGIN)[0].rstrip() + "\n\n"
            after = original.split(MARK_END, 1)[1].lstrip()
            return before + new_section + ("\n\n" + after if after else "\n")
        # No marker yet — append after existing content.
        return original.rstrip() + "\n\n" + new_section + "\n"
    # No README at all — create a minimal one with the catalog blurb.
    label = entry.get("label", app_key)
    blurb = entry.get("blurb", "")
    summary = f"# {label}\n\n{blurb}.\n\nPart of the [allmeta](https://github.com/mahmood726-cyber/allmeta) collection.\n\nLive: https://mahmood726-cyber.github.io/allmeta/{app_key}/\n"
    return summary + "\n" + new_section + "\n"


def _section_hash(section: str) -> str:
    return hashlib.sha256(section.replace("\r\n", "\n").encode("utf-8")).hexdigest()


def _existing_section(text: str) -> str | None:
    """The auto section currently in a README, markers included, or None if it has no markers."""
    if MARK_BEGIN in text and MARK_END in text:
        return MARK_BEGIN + text.split(MARK_BEGIN, 1)[1].split(MARK_END, 1)[0] + MARK_END
    return None


def process_readme(readme: Path, app_key: str, entry: dict, citations: list, hero: dict | None,
                   lock: dict, force: bool = False) -> str:
    """Write (or leave) one README. Returns 'WROTE', 'SKIP (no change)' or 'PRESERVED (hand-edited)'.
    Sets lock[app_key] to the hash of the auto section on disk whenever that section is generator output;
    a preserved README keeps whatever record it had."""
    fresh = _render_auto_section(app_key, entry, citations, hero)
    if readme.exists() and not force:
        cur = _existing_section(readme.read_text(encoding="utf-8"))
        if cur is not None and cur != fresh and lock.get(app_key) != _section_hash(cur):
            return "PRESERVED (hand-edited)"
    new_content = _patch_readme(readme, app_key, entry, citations, hero)
    lock[app_key] = _section_hash(fresh)
    if readme.exists() and readme.read_text(encoding="utf-8") == new_content:
        return "SKIP (no change)"
    readme.write_text(new_content, encoding="utf-8")
    return "WROTE"


def _read_lock(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def _write_lock(path: Path, lock: dict) -> None:
    path.write_text(json.dumps(dict(sorted(lock.items())), indent=2) + "\n", encoding="utf-8", newline="\n")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Regenerate the auto section of per-app README.md files.")
    ap.add_argument("--force", action="append", default=[], metavar="APP",
                    help="regenerate this app's auto section even if it was edited by hand (repeatable)")
    args = ap.parse_args(argv)
    data = _load_data()
    catalog = data.get("catalog", {})
    citations = data.get("citations", {})
    hero = data.get("hero", {})
    if not catalog:
        raise SystemExit("CATALOG empty — is shared/app-flow.js loadable?")

    lock = _read_lock(LOCK)
    wrote = 0
    skipped = 0
    preserved: list[str] = []
    for app_key, entry in catalog.items():
        app_dir = ROOT / app_key
        if not app_dir.is_dir():
            print(f"SKIP (no app dir): {app_key}")
            skipped += 1
            continue
        readme = app_dir / "README.md"
        cites = citations.get(app_key) or []
        h = hero.get(app_key)
        status = process_readme(readme, app_key, entry, cites, h, lock, force=app_key in args.force)
        print(f"{status}: {app_key}")
        if status == "WROTE":
            wrote += 1
        elif status.startswith("PRESERVED"):
            preserved.append(app_key)
        else:
            skipped += 1
    _write_lock(LOCK, lock)

    print(f"\nSummary: wrote={wrote} skipped={skipped} preserved={len(preserved)} total={len(catalog)}")
    if preserved:
        print("Preserved (hand-edited; regenerate with --force APP): " + ", ".join(preserved))
    return 0


if __name__ == "__main__":
    sys.exit(main())
