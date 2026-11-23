"""Retain only the fresh R fixture; command output remains in the wrapper log."""
import hashlib
import json
from pathlib import Path
import tempfile

source = Path(tempfile.gettempdir()) / "rpar-P16-reference.json"
raw = source.read_bytes()
reference = json.loads(raw)
provenance = reference["provenance"]
for key in ("input", "script", "prepare"):
    assert hashlib.md5(Path(provenance[key]).read_bytes()).hexdigest() == provenance[key + "_md5"]
assert len(reference["cases"]) == 12
assert all(set(case["fits"]) == {"FE", "DL", "PM"} for case in reference["cases"].values())
target = Path("hub/shared/tests/fixtures/p16-nma-inconsistency-reference.json")
# Reproduction verifies the saved oracle; it never silently re-baselines it.
if target.exists():
    assert json.loads(target.read_bytes()) == reference, "Fresh R evidence differs from retained fixture; review required"
else:
    target.write_bytes(raw)
print("Retained/verified", target, "cases", len(reference["cases"]), "bytes", len(raw))
