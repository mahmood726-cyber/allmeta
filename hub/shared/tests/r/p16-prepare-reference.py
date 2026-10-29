"""Translate the checked-in JSON input to base-R literals in the temp directory.

The native runner has netmeta/metafor but no jsonlite. This bridge does no
statistics and preserves JSON arrays as R lists, including singleton arrays.
"""
import hashlib
import json
import math
from pathlib import Path
import tempfile


def r_literal(value):
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        assert math.isfinite(value)
        return repr(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=True)
    if isinstance(value, list):
        return "list(" + ",".join(map(r_literal, value)) + ")"
    if isinstance(value, dict):
        return "setNames(list(" + ",".join(map(r_literal, value.values())) + "),c(" + ",".join(map(r_literal, value.keys())) + "))"
    raise TypeError(type(value))


source = Path("hub/shared/tests/fixtures/p16-nma-inconsistency-input.json")
raw = source.read_bytes()
target = Path(tempfile.gettempdir()) / "rpar-P16-input.R"
target.write_text(
    "inputs <- " + r_literal(json.loads(raw)) + "\n"
    + "prepared_input_md5 <- " + r_literal(hashlib.md5(raw).hexdigest()) + "\n",
    encoding="utf-8",
)
print("Prepared R input from", source)
