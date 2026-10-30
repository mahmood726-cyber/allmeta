"""Observe what the legacy parity caller submits; do not replace its app runner."""
import json
from pathlib import Path
import runpy
import sys
import types

sys.dont_write_bytecode = True
calls = []
helper = types.ModuleType("_r_parity")


def capture(result, **kwargs):
    calls.append({"result": result, **{key: str(value) if isinstance(value, Path) else value
                                    for key, value in kwargs.items()}})


helper.assert_r_parity = capture
sys.modules["_r_parity"] = helper
namespace = runpy.run_path(str(Path(__file__).with_name("test_against_metafor.py")))
test = namespace["test_meta_regression_matches_metafor_rma_with_mods"]
if len(sys.argv) > 1:
    test.__globals__["FIX"] = Path(sys.argv[1])
test()
assert len(calls) == 1, calls
print(json.dumps(calls[0]))
