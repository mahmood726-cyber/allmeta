"""End-to-end: run the orchestrator against a tiny mini-repo and verify all 4 artifacts land."""
import json
import os
import shutil
import subprocess
from pathlib import Path
import pytest


def test_orchestrator_writes_4_artifacts_for_mini_repo(tmp_path, require_playwright):
    if shutil.which("npx") is None:
        pytest.skip("npx not available")
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "hub").mkdir()
    (repo / "hub" / "projects.js").write_text("""
window.HTML_APPS_PROJECTS = [
  { name: "Tiny One", path: "./tiny-one/index.html", category: "Demo", collection: "existing", mode: "file" },
];
""", encoding="utf-8")
    (repo / "tiny-one").mkdir()
    (repo / "tiny-one" / "index.html").write_text(
        "<!doctype html><html><body>"
        "<svg width='200' height='200' xmlns='http://www.w3.org/2000/svg'>"
        "<rect width='200' height='200' fill='steelblue'/></svg>"
        "<button>Run</button>"
        "</body></html>",
        encoding="utf-8",
    )
    audit_src = Path(__file__).parent.parent
    shutil.copytree(audit_src, repo / "audit",
                    ignore=shutil.ignore_patterns(".probe-output.jsonl", "node_modules", ".pytest_cache", "__pycache__"))
    # Symlink node_modules from the source audit/ to avoid re-installing
    nm_src = audit_src / "node_modules"
    nm_dst = repo / "audit" / "node_modules"
    if nm_src.is_dir() and not nm_dst.exists():
        try:
            os.symlink(str(nm_src), str(nm_dst), target_is_directory=True)
        except (OSError, NotImplementedError):
            shutil.copytree(str(nm_src), str(nm_dst))
    # Also need triage/projects_js.py for the orchestrator's import
    triage_src = audit_src.parent / "triage"
    if triage_src.is_dir():
        shutil.copytree(triage_src, repo / "triage",
                        ignore=shutil.ignore_patterns("__pycache__", ".pytest_cache", "node_modules"))

    proc = subprocess.run(
        f'python "{repo / "audit" / "runtime_health.py"}" --repo-root "{repo}" --workers 1 --timeout 20',
        capture_output=True, text=True, timeout=120, shell=True,
    )
    assert proc.returncode == 0, f"orchestrator failed:\nstdout={proc.stdout}\nstderr={proc.stderr}"

    for name in ("runtime-health.json", "runtime-health.csv",
                 "runtime-health.md", "runtime-health.html"):
        assert (repo / name).is_file(), name + " missing"

    payload = json.loads((repo / "runtime-health.json").read_text(encoding="utf-8"))
    assert payload["totals"]["total"] == 1
    assert "tiny-one" in payload["apps"]
    app_entry = payload["apps"]["tiny-one"]
    # State must be one of the 6 valid classifier states — not a crash sentinel.
    valid_states = {"OK", "MISSING-MOUNT", "CONSOLE-ERRORS", "NEEDS-SERVICE", "TIMEOUT", "UNKNOWN"}
    assert app_entry["state"] in valid_states, f"unexpected state: {app_entry['state']}"
    # The page has a visible SVG + Run button → not a service-dependency or probe crash.
    assert app_entry["state"] not in {"NEEDS-SERVICE", "UNKNOWN"}, (
        f"expected structural state, got {app_entry['state']}: {app_entry.get('reasons')}"
    )
