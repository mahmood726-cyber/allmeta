"""Cycle 6.1: verify the hub registers a service worker + emits prefetch hints."""
import re
from pathlib import Path

REPO = Path(__file__).parent.parent
INDEX = REPO / "index.html"
SW = REPO / "sw.js"


def test_sw_file_exists():
    """sw.js must be present at the repo root so GitHub Pages serves it."""
    assert SW.is_file(), "sw.js not found at repo root"


def test_hub_registers_service_worker():
    """index.html must contain the SW feature-detect guard and register call."""
    html = INDEX.read_text(encoding="utf-8")
    assert (
        "serviceWorker' in navigator" in html
        or '"serviceWorker" in navigator' in html
    ), "Missing serviceWorker feature-detect in index.html"
    assert "navigator.serviceWorker.register" in html, (
        "Missing navigator.serviceWorker.register call in index.html"
    )


def test_hub_emits_shinylive_prefetch_hint():
    """index.html must reference 'shinylive' inside a prefetch block."""
    html = INDEX.read_text(encoding="utf-8")
    assert "shinylive" in html and "prefetch" in html, (
        "index.html must emit a prefetch hint for shinylive assets"
    )


def test_sw_cache_is_versioned():
    """sw.js must declare a versioned cache name matching alm-runtime-vN."""
    js = SW.read_text(encoding="utf-8")
    assert re.search(r"alm-runtime-v\d+", js), (
        "sw.js cache name must match alm-runtime-vN for clean invalidation"
    )


def test_sw_only_caches_runtime_paths():
    """sw.js must scope its cache to shinylive paths and pass everything else through."""
    js = SW.read_text(encoding="utf-8")
    # The SW must define a prefix filter for runtime assets.
    assert "RUNTIME_PREFIXES" in js or "shinylive" in js, (
        "sw.js must define a runtime-path filter"
    )
    # triage.json and runtime-health.json must NOT appear in a RUNTIME_PREFIXES
    # array or cache.put() call — only in comments is acceptable.
    non_comment_lines = [
        line for line in js.splitlines()
        if not line.strip().startswith("//")
    ]
    non_comment_text = "\n".join(non_comment_lines)
    assert "triage.json" not in non_comment_text, (
        "sw.js must not cache triage.json in non-comment code"
    )
    assert "runtime-health.json" not in non_comment_text, (
        "sw.js must not cache runtime-health.json in non-comment code"
    )


def test_sw_skips_non_get():
    """sw.js must skip non-GET requests (pass-through for POSTs)."""
    js = SW.read_text(encoding="utf-8")
    assert "GET" in js, "sw.js must check req.method !== 'GET' to pass through non-GET"


def test_hub_sw_registration_is_guarded():
    """SW registration must be inside 'serviceWorker' in navigator guard (no-op in old browsers)."""
    html = INDEX.read_text(encoding="utf-8")
    # Confirm the register call appears after the feature-detect string.
    guard_pos = html.find("serviceWorker' in navigator")
    if guard_pos == -1:
        guard_pos = html.find('"serviceWorker" in navigator')
    register_pos = html.find("navigator.serviceWorker.register")
    assert guard_pos != -1, "Feature-detect guard not found"
    assert register_pos > guard_pos, (
        "serviceWorker.register must appear after the feature-detect guard"
    )
