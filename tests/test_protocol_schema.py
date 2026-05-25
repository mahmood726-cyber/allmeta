"""Tests for shared/protocol-schema.js — schema validity, PRISMA-P coverage,
score(), renderHtml()."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "protocol-schema.js"

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


def test_schema_has_nine_sections_in_order():
    out = _run_node(f"""
        const P = require({json.dumps(str(MODULE))});
        console.log(JSON.stringify(P.SCHEMA.map(s => s.id)));
    """)
    assert out == ["admin", "team", "background", "eligibility", "search",
                   "selection", "rob", "analysis", "reporting"]


def test_every_field_has_required_keys():
    """Each schema field must declare key, label, kind. prismaP is optional
    but heavily encouraged."""
    out = _run_node(f"""
        const P = require({json.dumps(str(MODULE))});
        const missing = [];
        P.SCHEMA.forEach(sec => {{
          sec.fields.forEach(f => {{
            if (!f.key)   missing.push(sec.id + '/<no-key>');
            if (!f.label) missing.push(sec.id + '/' + f.key + ' missing label');
            if (!f.kind)  missing.push(sec.id + '/' + f.key + ' missing kind');
          }});
        }});
        console.log(JSON.stringify(missing));
    """)
    assert out == [], f"schema fields missing required keys: {out}"


def test_field_kinds_are_canonical():
    out = _run_node(f"""
        const P = require({json.dumps(str(MODULE))});
        const allowed = new Set(['text','textarea','date','select','number']);
        const bad = [];
        P.SCHEMA.forEach(sec => sec.fields.forEach(f => {{
          if (!allowed.has(f.kind)) bad.push(sec.id + '/' + f.key + ': ' + f.kind);
        }}));
        console.log(JSON.stringify(bad));
    """)
    assert out == []


def test_score_zero_for_empty_protocol():
    out = _run_node(f"""
        const P = require({json.dumps(str(MODULE))});
        console.log(JSON.stringify(P.score({{}})));
    """)
    assert out["filled"] == 0
    assert out["percent"] == 0
    assert out["total"] > 10  # most PRISMA-P items have a backing field


def test_score_full_for_completely_filled_protocol():
    """If every field in every section is filled, score should hit 100%
    of the PRISMA-P items that have backing fields."""
    out = _run_node(f"""
        const P = require({json.dumps(str(MODULE))});
        const protocol = {{}};
        P.SCHEMA.forEach(sec => {{
          protocol[sec.id] = {{}};
          sec.fields.forEach(f => {{ protocol[sec.id][f.key] = 'filled'; }});
        }});
        console.log(JSON.stringify(P.score(protocol)));
    """)
    assert out["percent"] == 100
    assert out["filled"] == out["total"]


def test_score_partial_for_admin_only():
    out = _run_node(f"""
        const P = require({json.dumps(str(MODULE))});
        const protocol = {{ admin: {{ title: "test", version: "1.0", date: "2026-05-25" }} }};
        const s = P.score(protocol);
        console.log(JSON.stringify({{
          percent: s.percent,
          filled: s.filled,
          item1aFilled: s.byItem['1a'] === 'filled',
          item9Filled: s.byItem['9'] === 'filled',
        }}));
    """)
    # 1a (title) is covered; 9 (search sources) is not.
    assert out["item1aFilled"] is True
    assert out["item9Filled"] is False
    assert 0 < out["percent"] < 100


def test_renderHtml_includes_title_in_header():
    out = _run_node(f"""
        const P = require({json.dumps(str(MODULE))});
        const html = P.renderHtml({{ admin: {{ title: "Test review", version: "1.0", date: "2026-05-25" }} }});
        console.log(JSON.stringify({{
          hasH1: html.includes('<h1>Test review</h1>'),
          hasMeta: html.includes('Version 1.0'),
          hasDate: html.includes('2026-05-25'),
        }}));
    """)
    assert out["hasH1"] is True
    assert out["hasMeta"] is True
    assert out["hasDate"] is True


def test_renderHtml_omits_empty_sections():
    """A section with no filled fields should not appear in the rendered
    HTML — otherwise readers see empty stub sections."""
    out = _run_node(f"""
        const P = require({json.dumps(str(MODULE))});
        const html = P.renderHtml({{
          admin: {{ title: "x" }},
          team:  {{ }},
          analysis: {{ effectMeasure: "OR" }}
        }});
        console.log(JSON.stringify({{
          hasTeamHeader: html.includes('Team') && html.includes('Background') === false,
          hasAnalysisHeader: html.includes('Statistical'),
        }}));
    """)
    # Team section has no filled fields → header should not appear.
    assert out["hasTeamHeader"] is False
    # Analysis has one filled field → header should appear.
    assert out["hasAnalysisHeader"] is True


def test_renderHtml_escapes_html_in_user_text():
    """Defense-in-depth: even though authors are trusted, XSS via title/PICO
    must be neutralised."""
    out = _run_node(f"""
        const P = require({json.dumps(str(MODULE))});
        const html = P.renderHtml({{
          admin: {{ title: "<script>alert('xss')</script>" }},
          background: {{ rationale: "<img src=x onerror=alert(1)>" }}
        }});
        console.log(JSON.stringify({{
          noScript: !html.includes('<script>alert'),
          noImg: !html.includes('<img src=x'),
          hasEscaped: html.includes('&lt;script&gt;') || html.includes('&lt;script>'),
        }}));
    """)
    assert out["noScript"] is True
    assert out["noImg"] is True
    assert out["hasEscaped"] is True


def test_renderHtml_preserves_paragraph_breaks():
    out = _run_node(f"""
        const P = require({json.dumps(str(MODULE))});
        const html = P.renderHtml({{
          admin: {{ title: "x" }},
          background: {{ rationale: "First paragraph.\\n\\nSecond paragraph.\\nNew line." }}
        }});
        console.log(JSON.stringify({{
          twoP: (html.match(/<p>/g) || []).length >= 2,
          hasBr: html.includes('<br>'),
        }}));
    """)
    assert out["twoP"] is True
    assert out["hasBr"] is True
