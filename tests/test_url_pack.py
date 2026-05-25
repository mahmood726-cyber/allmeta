"""Tests for shared/url-pack.js — gzip + base64url pack/unpack roundtrip."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
MODULE = ROOT / "shared" / "url-pack.js"

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


def test_pack_unpack_roundtrip():
    out = _run_node(f"""
        (async () => {{
          const U = require({json.dumps(str(MODULE))});
          const orig = {{ title: "My systematic review", k: 17,
                          studies: ["Smith 2020", "Jones 2021"],
                          nested: {{ a: [1, 2.5, -3.14e-9], b: null }} }};
          const packed = await U.pack(orig);
          const unpacked = await U.unpack(packed);
          console.log(JSON.stringify({{
            packedLen: packed.length,
            equal: JSON.stringify(orig) === JSON.stringify(unpacked),
          }}));
        }})();
    """)
    assert out["equal"] is True
    assert out["packedLen"] > 0


def test_pack_is_url_safe():
    """The packed string must only contain URL-safe chars: A-Z, a-z, 0-9, -, _.
    No padding (=). No + or /."""
    import re
    out = _run_node(f"""
        (async () => {{
          const U = require({json.dumps(str(MODULE))});
          const s = await U.pack({{ x: "hello world".repeat(50) }});
          console.log(JSON.stringify(s));
        }})();
    """)
    assert re.fullmatch(r"[A-Za-z0-9_-]+", out), (
        f"packed string contains non-URL-safe chars: {out!r}"
    )


def test_pack_compresses_repetitive_data():
    """A highly compressible payload should pack significantly smaller than
    its raw JSON length (proves gzip is wired)."""
    out = _run_node(f"""
        (async () => {{
          const U = require({json.dumps(str(MODULE))});
          const obj = {{ data: "abc".repeat(5000) }};
          const raw = JSON.stringify(obj).length;
          const packed = (await U.pack(obj, {{maxLen: 100000}})).length;
          console.log(JSON.stringify({{ raw, packed, ratio: packed / raw }}));
        }})();
    """)
    # gzip on a 15-KB repeating string should compress to << 5% of original.
    assert out["packed"] < out["raw"] * 0.10, (
        f"expected strong compression, got packed={out['packed']} raw={out['raw']}"
    )


def test_pack_throws_when_exceeds_maxLen():
    out = _run_node(f"""
        (async () => {{
          const U = require({json.dumps(str(MODULE))});
          try {{
            // 200 KB of random-ish (incompressible) bytes via varying digits.
            let s = "";
            for (let i = 0; i < 30000; i++) s += Math.random().toString(36).slice(2, 10);
            await U.pack({{ junk: s }}, {{ maxLen: 1000 }});
            console.log(JSON.stringify({{ threw: false }}));
          }} catch (e) {{
            console.log(JSON.stringify({{ threw: true, code: e.code, packedLength: e.packedLength }}));
          }}
        }})();
    """)
    assert out["threw"] is True
    assert out["code"] == "TOO_LARGE"
    assert out["packedLength"] > 1000


def test_unpack_rejects_empty_input():
    out = _run_node(f"""
        (async () => {{
          const U = require({json.dumps(str(MODULE))});
          try {{
            await U.unpack("");
            console.log(JSON.stringify({{ threw: false }}));
          }} catch (e) {{
            console.log(JSON.stringify({{ threw: true, msg: e.message }}));
          }}
        }})();
    """)
    assert out["threw"] is True
    assert "empty" in out["msg"]


def test_unpack_rejects_invalid_base64url():
    out = _run_node(f"""
        (async () => {{
          const U = require({json.dumps(str(MODULE))});
          try {{
            await U.unpack("!!!@@@###");   // invalid base64url chars
            console.log(JSON.stringify({{ threw: false }}));
          }} catch (e) {{
            console.log(JSON.stringify({{ threw: true }}));
          }}
        }})();
    """)
    assert out["threw"] is True


def test_unicode_payload_roundtrips():
    out = _run_node(f"""
        (async () => {{
          const U = require({json.dumps(str(MODULE))});
          const orig = {{ greek: "αβγδε", emoji: "📚✓",
                          chinese: "网络荟萃分析", arabic: "تحليل" }};
          const packed = await U.pack(orig);
          const unpacked = await U.unpack(packed);
          console.log(JSON.stringify(unpacked));
        }})();
    """)
    assert out["greek"] == "αβγδε"
    assert out["emoji"] == "📚✓"
    assert out["chinese"] == "网络荟萃分析"
    assert out["arabic"] == "تحليل"


def test_realistic_protocol_packs_under_3kb():
    """A typical filled protocol should pack to well under 3 KB so it
    comfortably fits in a URL fragment."""
    out = _run_node(f"""
        (async () => {{
          const U = require({json.dumps(str(MODULE))});
          const protocol = {{
            admin: {{ title: "Effectiveness of SGLT2 inhibitors for HFpEF",
                     version: "1.0", date: "2026-05-25" }},
            team: {{ authors: "Smith J — Oxford — 0000-0001-2345-6789\\nJones K — Cambridge", contact: "smith@example.org" }},
            background: {{ rationale: "Heart failure with preserved ejection fraction affects 50% of HF patients...",
                          objectives: "Assess effect of SGLT2i on HF hospitalization in HFpEF",
                          pico: "P: HFpEF adults\\nI: SGLT2 inhibitors\\nC: Placebo\\nO: HF hospitalisation, CV death" }},
            eligibility: {{ inclusion: "RCTs, adults ≥18, HFpEF (EF >40%), SGLT2i any dose",
                           exclusion: "HFrEF, NRSIs, animal studies", language: "English, 2010-2026" }},
            search: {{ sources: "PubMed, EMBASE, CENTRAL, CT.gov",
                      searchString: "(SGLT2 OR empagliflozin OR dapagliflozin) AND (HFpEF OR \\"preserved ejection\\")",
                      searchDates: "2010-01-01 to present" }},
            analysis: {{ effectMeasure: "HR for HF hospitalisation",
                        model: "REML random-effects with HKSJ",
                        heterogeneity: "I², τ², 95% prediction interval",
                        subgroups: "EF threshold, ejection-fraction strata, baseline NYHA class" }}
          }};
          const packed = await U.pack(protocol);
          console.log(JSON.stringify({{ len: packed.length, rawLen: JSON.stringify(protocol).length }}));
        }})();
    """)
    assert out["len"] < 3000, (
        f"realistic protocol should pack under 3 KB; got {out['len']} from raw {out['rawLen']}"
    )
