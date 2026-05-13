import subprocess
from pathlib import Path
from triage.signals import extract_signals


def test_extract_signals_for_clean_app(fixtures_root, monkeypatch):
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
    def fake_run(*a, **k):
        return subprocess.CompletedProcess(a, 1, "", "")
    monkeypatch.setattr(subprocess, "run", fake_run)
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
