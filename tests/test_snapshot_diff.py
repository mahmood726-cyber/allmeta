"""Tests for shared/snapshot-diff.js — semantic diff of analysis exports."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "snapshot-diff.js"

NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")


def _run_node(script: str):
    result = subprocess.run(
        [NODE, "-e", script],
        capture_output=True, encoding="utf-8", errors="replace",
        timeout=20, check=False, cwd=str(ROOT),
    )
    if result.returncode != 0:
        raise AssertionError(
            f"node exited {result.returncode}\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )
    lines = [ln for ln in result.stdout.strip().splitlines() if ln.strip()]
    assert lines, f"node printed nothing.\nSTDERR:\n{result.stderr}"
    return json.loads(lines[-1])


def test_identical_objects_have_empty_diff():
    out = _run_node(f"""
        const D = require({json.dumps(str(MODULE))});
        const a = {{ x: 1, y: [2, 3], z: "hello", studies: [{{label: "A", est: 0.1, se: 0.05}}] }};
        const d = D.diffJson(a, a);
        console.log(JSON.stringify({{
          provenance: d.provenance.length,
          fields: d.fields.length,
          studies: d.studies.length,
        }}));
    """)
    assert out == {"provenance": 0, "fields": 0, "studies": 0}


def test_numeric_field_change_reports_abs_and_relPct():
    out = _run_node(f"""
        const D = require({json.dumps(str(MODULE))});
        const a = {{ effect: -0.34, tau2: 0.05 }};
        const b = {{ effect: -0.30, tau2: 0.05 }};
        const d = D.diffJson(a, b);
        const e = d.fields.find(c => c.path === 'effect');
        console.log(JSON.stringify({{
          kind: e.kind, before: e.before, after: e.after,
          abs: e.abs, relPct: Math.round(e.relPct * 100) / 100,
        }}));
    """)
    assert out["kind"] == "numeric"
    assert out["before"] == -0.34
    assert out["after"] == -0.30
    assert abs(out["abs"] - 0.04) < 1e-10
    # relPct = (0.04 / 0.34) * 100 ≈ 11.76%
    assert abs(out["relPct"] - 11.76) < 0.5


def test_timestamp_fields_reported_separately():
    """Timestamps change on every run — they should be flagged as 'timestamp'
    not 'numeric' or 'changed', so reviewers can ignore them."""
    out = _run_node(f"""
        const D = require({json.dumps(str(MODULE))});
        const a = {{ _signedAt: "2026-05-25T00:00:00Z", effect: 0.5 }};
        const b = {{ _signedAt: "2026-05-25T01:00:00Z", effect: 0.5 }};
        const d = D.diffJson(a, b);
        const tsField = d.fields.find(c => c.kind === 'timestamp');
        console.log(JSON.stringify({{
          tsKind: tsField ? tsField.kind : null,
          totalFields: d.fields.length,
        }}));
    """)
    assert out["tsKind"] == "timestamp"
    assert out["totalFields"] == 1   # only the timestamp; effect unchanged


def test_provenance_fields_surfaced_separately_from_results():
    out = _run_node(f"""
        const D = require({json.dumps(str(MODULE))});
        const a = {{ producedBy: {{ sha: "aaa111", version: "v1" }}, effect: 0.5 }};
        const b = {{ producedBy: {{ sha: "bbb222", version: "v2" }}, effect: 0.6 }};
        const d = D.diffJson(a, b);
        console.log(JSON.stringify({{
          provenanceCount: d.provenance.length,
          fieldsCount: d.fields.length,
          provPaths: d.provenance.map(p => p.path).sort(),
        }}));
    """)
    assert out["provenanceCount"] == 2  # sha and version both changed
    assert out["fieldsCount"] == 1  # effect
    assert out["provPaths"] == ["producedBy.sha", "producedBy.version"]


def test_study_added_detected_by_label():
    """Adding a new study should appear as 'added', not as the whole array
    being different. Study identity is by label, not index."""
    out = _run_node(f"""
        const D = require({json.dumps(str(MODULE))});
        const a = {{ studies: [{{label: "A", est: 0.1, se: 0.05}}] }};
        const b = {{ studies: [
          {{label: "A", est: 0.1, se: 0.05}},
          {{label: "B", est: 0.2, se: 0.08}}
        ] }};
        const d = D.diffJson(a, b);
        console.log(JSON.stringify({{
          studiesEntries: d.studies.length,
          added: d.studies[0].studies.added.map(s => s.label),
          removed: d.studies[0].studies.removed.length,
          changed: d.studies[0].studies.changed.length,
        }}));
    """)
    assert out["studiesEntries"] == 1
    assert out["added"] == ["B"]
    assert out["removed"] == 0
    assert out["changed"] == 0


def test_study_reorder_is_not_a_change():
    """If the user re-orders the same studies, the diff should be empty
    (study identity is by label, not array index)."""
    out = _run_node(f"""
        const D = require({json.dumps(str(MODULE))});
        const a = {{ studies: [
          {{label: "A", est: 0.1, se: 0.05}},
          {{label: "B", est: 0.2, se: 0.08}},
        ] }};
        const b = {{ studies: [
          {{label: "B", est: 0.2, se: 0.08}},
          {{label: "A", est: 0.1, se: 0.05}},
        ] }};
        const d = D.diffJson(a, b);
        console.log(JSON.stringify({{
          studies: d.studies.length,
          fields: d.fields.length,
          provenance: d.provenance.length,
        }}));
    """)
    assert out["studies"] == 0
    assert out["fields"] == 0
    assert out["provenance"] == 0


def test_study_field_change_detected():
    """Changing one study's est should be flagged as a per-study change."""
    out = _run_node(f"""
        const D = require({json.dumps(str(MODULE))});
        const a = {{ studies: [{{label: "A", est: 0.1, se: 0.05}}] }};
        const b = {{ studies: [{{label: "A", est: 0.2, se: 0.05}}] }};
        const d = D.diffJson(a, b);
        const c = d.studies[0].studies.changed[0];
        console.log(JSON.stringify({{
          key: c.key,
          changedPaths: c.changes.map(x => x.path),
        }}));
    """)
    assert out["key"] == "A"
    # At least one change with a path ending in .est
    assert any(p.endswith(".est") for p in out["changedPaths"]), \
        f"expected an .est change, got {out['changedPaths']}"


def test_summary_counts_match_diff_contents():
    out = _run_node(f"""
        const D = require({json.dumps(str(MODULE))});
        const a = {{
          producedBy: {{ sha: "aaa" }},
          effect: 0.5, tau2: 0.05,
          studies: [{{label: "A", est: 0.1}}, {{label: "B", est: 0.2}}]
        }};
        const b = {{
          producedBy: {{ sha: "bbb" }},
          effect: 0.4, tau2: 0.05,
          studies: [{{label: "A", est: 0.15}}, {{label: "C", est: 0.3}}]
        }};
        const d = D.diffJson(a, b);
        console.log(JSON.stringify(d.summary));
    """)
    assert out["provenance"] == 1
    assert out["fields"] == 1   # effect changed; tau2 unchanged
    assert out["studiesAdded"] == 1   # C
    assert out["studiesRemoved"] == 1  # B
    assert out["studiesChanged"] == 1  # A.est shifted


def test_renderHtml_produces_string_with_color_classes():
    out = _run_node(f"""
        const D = require({json.dumps(str(MODULE))});
        const a = {{ effect: 0.5 }};
        const b = {{ effect: 0.6 }};
        const html = D.renderHtml(D.diffJson(a, b));
        console.log(JSON.stringify({{
          hasTable: html.includes('<table'),
          hasNumeric: html.includes('d-numeric'),
          hasBefore: html.includes('0.5'),
          hasAfter: html.includes('0.6'),
        }}));
    """)
    assert out["hasTable"] is True
    assert out["hasNumeric"] is True
    assert out["hasBefore"] is True
    assert out["hasAfter"] is True


def test_renderHtml_empty_diff_returns_friendly_message():
    out = _run_node(f"""
        const D = require({json.dumps(str(MODULE))});
        const html = D.renderHtml(D.diffJson({{x:1}}, {{x:1}}));
        console.log(JSON.stringify({{ html }}));
    """)
    assert "No semantic differences" in out["html"]


def test_relDelta_handles_zero_denominator():
    """If both values are near zero, denominator is clamped to 1e-12 so we
    don't get inf% deltas that scream visual noise."""
    out = _run_node(f"""
        const D = require({json.dumps(str(MODULE))});
        const d = D._relDelta(0, 1e-10);
        console.log(JSON.stringify({{
          abs: d.abs, relPct: d.relPct,
          finite: Number.isFinite(d.relPct),
        }}));
    """)
    assert out["finite"] is True
    assert abs(out["abs"] - 1e-10) < 1e-15
