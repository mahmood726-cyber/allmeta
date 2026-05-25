"""Tests for shared/citation.js."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "citation.js"

NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")


def _run_node(script: str) -> object:
    result = subprocess.run(
        [NODE, "-e", script],
        capture_output=True, text=True, timeout=30, check=False, cwd=str(ROOT),
    )
    if result.returncode != 0:
        raise AssertionError(
            f"node exited {result.returncode}\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )
    lines = [ln for ln in result.stdout.strip().splitlines() if ln.strip()]
    assert lines, f"node printed nothing.\nSTDERR:\n{result.stderr}"
    return json.loads(lines[-1])


def test_allmeta_self_citation_present():
    out = _run_node(f"""
        const C = require({json.dumps(str(MODULE))});
        const a = C.ALLMETA_CITE;
        console.log(JSON.stringify({{
          hasVan: a.vancouver.includes("allmeta"),
          hasBib: a.bibtex.includes("@software"),
        }}));
    """)
    assert out["hasVan"] is True
    assert out["hasBib"] is True


def test_each_frontier_method_has_at_least_one_paper():
    """The methods I shipped this session must each have a method-paper
    citation — otherwise users can't cite them in submitted papers."""
    out = _run_node(f"""
        const C = require({json.dumps(str(MODULE))});
        const frontier = ["rve-meta", "bma-tau-priors", "cross-design",
                          "cross-network", "multi-outcome-ma", "multi-outcome-nma",
                          "nma-meta-reg", "rare-events-glmm", "sequential-ma",
                          "personalised-te", "everything-model", "living-rob-pool"];
        const missing = frontier.filter(k => !(C.CITATIONS[k] && C.CITATIONS[k].length > 0));
        console.log(JSON.stringify(missing));
    """)
    assert out == [], f"frontier methods lack citation entries: {out}"


def test_formatAll_produces_well_formed_text():
    out = _run_node(f"""
        const C = require({json.dumps(str(MODULE))});
        const text = C.formatAll("rve-meta");
        console.log(JSON.stringify({{
          hasAllmeta: text.includes("ahmad_allmeta_2026"),
          hasMethod: text.includes("hedges_tipton_2010_rve"),
          hasVancouver: text.includes("Vancouver"),
          hasBibtex: text.includes("BibTeX"),
        }}));
    """)
    assert out["hasAllmeta"] is True
    assert out["hasMethod"] is True
    assert out["hasVancouver"] is True
    assert out["hasBibtex"] is True


def test_apps_without_specific_method_still_emit_allmeta_cite():
    out = _run_node(f"""
        const C = require({json.dumps(str(MODULE))});
        const text = C.formatAll("forest-plot");
        console.log(JSON.stringify({{
          hasAllmeta: text.includes("Ahmad M. allmeta"),
          noMethodSection: !text.includes("Method paper"),
        }}));
    """)
    assert out["hasAllmeta"] is True
    assert out["noMethodSection"] is True


def test_unknown_app_still_returns_allmeta_only():
    """Calling formatAll on an unregistered app shouldn't throw — it falls
    back to just the allmeta self-citation."""
    out = _run_node(f"""
        const C = require({json.dumps(str(MODULE))});
        const text = C.formatAll("not-a-real-app");
        console.log(JSON.stringify({{
          hasAllmeta: text.includes("Ahmad M. allmeta"),
        }}));
    """)
    assert out["hasAllmeta"] is True
