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
