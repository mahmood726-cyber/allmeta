"""Record an LF digest without replacing the reference's historical CRLF hash.

This one-time provenance migration verifies the exact original byte digest
before recording its canonical equivalent. It never regenerates R values or
overwrites a retained fixture. Output is in the platform temporary directory.
"""
import hashlib
import json
from pathlib import Path
import tempfile

root = Path(__file__).resolve().parents[4]
unit = root / "hub/shared/tests/unit"
reference = json.loads((unit / "p11-r4-reference.json").read_text(encoding="utf-8"))
oracle = root / reference["provenance"]["oracle"]
canonical = oracle.read_bytes().replace(b"\r\n", b"\n")
historical = reference["provenance"]["oracle_md5"]
assert hashlib.md5(canonical.replace(b"\n", b"\r\n")).hexdigest() == historical, "Historical oracle content changed"
record = {
    "oracle": reference["provenance"]["oracle"],
    "historical_oracle_md5": historical,
    "historical_eol": "CRLF",
    "normalization": "CRLF->LF",
    "oracle_lf_md5": hashlib.md5(canonical).hexdigest(),
    "script": "p11-r4-provenance.py",
}
retained = unit / "p11-r4-provenance.json"
if retained.exists():
    assert json.loads(retained.read_text(encoding="utf-8")) == record, "Refusing to rebaseline provenance"
target = Path(tempfile.gettempdir()) / "p11-r4-provenance.json"
target.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8", newline="\n")
print(json.dumps(record, indent=2))
print(f"Verified provenance record: {target}")
