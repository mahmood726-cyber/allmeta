"""Tests for scripts/living_evidence_watch.py — diff logic + summary writer.

Doesn't hit live ClinicalTrials.gov / OpenAlex (those calls are CI-time).
Tests the pure-logic functions directly.
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "living_evidence_watch.py"

# Load the script as a module so we can call its functions directly.
spec = importlib.util.spec_from_file_location("living_evidence_watch", SCRIPT)
lew = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lew)


def test_diff_lists_finds_only_new():
    prev = [{"id": "A"}, {"id": "B"}, {"id": "C"}]
    curr = [{"id": "A"}, {"id": "C"}, {"id": "D"}, {"id": "E"}]
    new = lew.diff_lists(prev, curr)
    assert sorted(x["id"] for x in new) == ["D", "E"]


def test_diff_lists_empty_prev_returns_all():
    new = lew.diff_lists([], [{"id": "X"}, {"id": "Y"}])
    assert sorted(x["id"] for x in new) == ["X", "Y"]


def test_diff_lists_empty_curr_returns_nothing():
    new = lew.diff_lists([{"id": "X"}], [])
    assert new == []


def test_write_summary_emits_well_formed_markdown(tmp_path: Path):
    out = tmp_path / "summary.md"
    trials = [
        {"id": "NCT01234567", "title": "Sample trial", "status": "Recruiting",
         "url": "https://clinicaltrials.gov/study/NCT01234567"},
    ]
    pubs = [
        {"id": "https://openalex.org/W1234", "doi": "10.1000/example", "date": "2026-05-20",
         "title": "Sample publication", "url": "https://openalex.org/W1234"},
    ]
    lew.write_summary(out, trials, pubs, "Test topic")
    text = out.read_text(encoding="utf-8")
    assert "new: 2" in text
    assert "new-trials: 1" in text
    assert "new-pubs: 1" in text
    assert "NCT01234567" in text
    assert "Sample trial" in text
    assert "Sample publication" in text
    # The workflow checks `grep -qE '^new\s*:\s*[1-9]'` — make sure the
    # canonical line is present.
    assert any(line.startswith("new:") for line in text.splitlines())


def test_write_summary_with_no_diffs(tmp_path: Path):
    out = tmp_path / "summary.md"
    lew.write_summary(out, [], [], "Empty topic")
    text = out.read_text(encoding="utf-8")
    assert "new: 0" in text


def test_workflow_yaml_present_and_well_formed():
    yml = ROOT / ".github" / "workflows" / "living-evidence.yml"
    assert yml.is_file()
    text = yml.read_text(encoding="utf-8")
    # Critical structural elements.
    assert "name: living-evidence" in text
    assert "schedule" in text and "cron:" in text
    assert "living_evidence_watch.py" in text
    assert "gh issue create" in text
    # Permissions
    assert "issues: write" in text
    assert "contents: write" in text
