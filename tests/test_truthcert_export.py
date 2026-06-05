"""Pytest harness for `shared/truthcert-export.js`.

Runs the JS module under Node and asserts that an export receipt:
  - signs the analysis (studies + method + results) reusing the audited
    MaStudies.toTruthCert signer, and verifies with MaStudies.verifyTruthCert;
  - is tamper-evident: mutating a result in the receipt breaks verification;
  - falls back to an honest UNSIGNED manifest (never a fake signature) when no
    HMAC key is configured;
  - stamps an SVG with a machine-readable <metadata> block + a visible footer,
    idempotently (re-stamping does not duplicate).

Skipped if Node is not installed.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="node not installed")

# Load both modules from the repo root so relative requires resolve.
PRELUDE = (
    "const MS = require('./shared/ma-studies-v1.js');\n"
    "const TX = require('./shared/truthcert-export.js');\n"
)


def _run_node(script: str) -> dict:
    result = subprocess.run(
        [NODE, "-e", PRELUDE + script],
        capture_output=True, text=True, timeout=30, check=False, cwd=str(ROOT),
    )
    if result.returncode != 0:
        raise AssertionError(
            f"node exited {result.returncode}\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )
    return json.loads(result.stdout.strip().splitlines()[-1])


STUDIES = "[{label:'A',est:0.1,se:0.2},{label:'B',est:0.3,se:0.25},{label:'C',est:0.5,se:0.18}]"
RESULTS = "{mu:0.28,se:0.12,ciLo:0.04,ciHi:0.52,tau2:0.0,I2:0.0,k:3}"


def test_signed_receipt_verifies():
    out = _run_node(f"""
      (async () => {{
        const res = await TX.buildReceipt({{
          studies: {STUDIES}, method: 'PM-RE', results: {RESULTS},
          label: 'forest', key: 'unit-test-key'
        }});
        const v = await MS.verifyTruthCert(res.receipt, {{ key: 'unit-test-key' }});
        console.log(JSON.stringify({{
          signed: res.signed, alg: res.receipt.alg,
          hasSig: typeof res.receipt.signature === 'string' && res.receipt.signature.length > 0,
          kind: res.receipt.extra.kind, method: res.receipt.extra.method,
          verifyOk: v.ok, valid: v.valid
        }}));
      }})();
    """)
    assert out["signed"] is True
    assert out["alg"] == "HMAC-SHA-256"
    assert out["hasSig"] is True
    assert out["kind"] == "export"
    assert out["method"] == "PM-RE"
    assert out["verifyOk"] is True and out["valid"] is True


def test_tampered_result_fails_verification():
    """Mutating a signed result must break the MAC."""
    out = _run_node(f"""
      (async () => {{
        const res = await TX.buildReceipt({{
          studies: {STUDIES}, method: 'PM-RE', results: {RESULTS},
          label: 'forest', key: 'unit-test-key'
        }});
        // Tamper: bend the pooled estimate after signing.
        res.receipt.extra.results.mu = 9.99;
        const v = await MS.verifyTruthCert(res.receipt, {{ key: 'unit-test-key' }});
        console.log(JSON.stringify({{ verifyOk: v.ok, valid: v.valid }}));
      }})();
    """)
    assert out["verifyOk"] is True
    assert out["valid"] is False


def test_wrong_key_fails_verification():
    out = _run_node(f"""
      (async () => {{
        const res = await TX.buildReceipt({{ studies: {STUDIES}, method:'PM-RE',
          results: {RESULTS}, key: 'key-one' }});
        const v = await MS.verifyTruthCert(res.receipt, {{ key: 'key-two' }});
        console.log(JSON.stringify({{ valid: v.valid }}));
      }})();
    """)
    assert out["valid"] is False


def test_no_key_yields_unsigned_manifest_not_fake_signature():
    """Fail-closed honesty: no key → unsigned manifest, never a placeholder sig."""
    out = _run_node(f"""
      (async () => {{
        const res = await TX.buildReceipt({{ studies: {STUDIES}, method:'PM-RE',
          results: {RESULTS}, label:'forest' }});
        console.log(JSON.stringify({{
          signed: res.signed,
          hasReceipt: !!res.receipt,
          schema: res.manifest && res.manifest._schema,
          manifestStudies: res.manifest && res.manifest.studies.length,
          hasSignatureField: res.manifest && ('signature' in res.manifest)
        }}));
      }})();
    """)
    assert out["signed"] is False
    assert out["hasReceipt"] is False
    assert out["schema"] == "truthcert-export-unsigned-v1"
    assert out["manifestStudies"] == 3
    assert out["hasSignatureField"] is False


def test_stamp_svg_embeds_metadata_and_footer_idempotently():
    out = _run_node(f"""
      (async () => {{
        const res = await TX.buildReceipt({{ studies: {STUDIES}, method:'PM-RE',
          results: {RESULTS}, key: 'unit-test-key' }});
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect/></svg>';
        const once = TX.stampSVG(svg, res);
        const twice = TX.stampSVG(once, res);  // must not double-stamp
        const countMeta = (s) => (s.match(/<metadata id="truthcert">/g) || []).length;
        const countFoot = (s) => (s.match(/data-truthcert="1"/g) || []).length;
        console.log(JSON.stringify({{
          metaOnce: countMeta(once), footOnce: countFoot(once),
          metaTwice: countMeta(twice), footTwice: countFoot(twice),
          hasKeyHint: once.indexOf(res.receipt.keyHint) !== -1
        }}));
      }})();
    """)
    assert out["metaOnce"] == 1 and out["footOnce"] == 1
    assert out["metaTwice"] == 1 and out["footTwice"] == 1  # idempotent
    assert out["hasKeyHint"] is True


def test_sha256hex_known_vector():
    out = _run_node("""
      (async () => {
        const h = await TX.sha256Hex('abc');
        console.log(JSON.stringify({ h }));
      })();
    """)
    # SHA-256("abc") canonical test vector.
    assert out["h"] == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
