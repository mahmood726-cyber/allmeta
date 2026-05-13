import json
import subprocess
from pathlib import Path
import pytest


@pytest.fixture
def mock_git(monkeypatch):
    """Mock subprocess.run to return a fixed timestamp for last_touched_unix."""
    def fake_run(args, **kw):
        return subprocess.CompletedProcess(args, 0, stdout="1715000000\n", stderr="")
    monkeypatch.setattr(subprocess, "run", fake_run)


def test_scan_emits_four_artifacts(tmp_path, fixtures_root, mock_git):
    """End-to-end: scan.py loads projects, extracts signals, assigns tiers, renders 4 artifacts."""
    # Build a mini repo with 2 local apps (forest-plot, dta-sroc) and 1 URL app (almizan)
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

    # Verify all 4 artifacts exist
    for name in ("triage.json", "triage.csv", "triage.md", "triage.html"):
        assert (repo / name).is_file(), name + " missing"

    # Verify JSON payload structure
    payload = json.loads((repo / "triage.json").read_text(encoding="utf-8"))
    assert payload["totals"]["total"] == 2, "external URL apps should be skipped"
    assert "forest-plot" in payload["apps"]
    assert "dta-sroc" in payload["apps"]
    assert "almizan" not in payload["apps"], "URL app should be skipped (folder missing on disk)"

    # Verify tier assignment: dta-sroc has stub_count=1 (contains "TODO") -> Tier 4
    assert payload["apps"]["dta-sroc"]["tier"] == 4, "dta-sroc should be Tier 4 (has stub)"
    assert payload["apps"]["forest-plot"]["tier"] in (1, 2, 3, 4, 5), "forest-plot should have a tier"
