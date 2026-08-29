"""THE WRITE PATH. A trial value enters the synthesis THROUGH HERE OR NOT AT ALL.

This is what makes the ladder a HARNESS COMPONENT rather than a script somebody may
remember to run. The standing rule:

    every layer is invoked BY THE HARNESS ON THE WRITE PATH, and a record that
    skips one is not emitted. A check in a caller does not run when a different
    caller writes the file.

So `emit()` is a GATE, not a logger. It refuses, by name and with a reason:

  * a value with NO ladder record                  -- a number with no provenance
  * a value whose state is NOT_YET_FOUND           -- state and payload contradict
  * GENUINELY_UNOBTAINABLE without a GRANTED verdict from obtainability.py
  * a prior_meta_table value with no RECONCILIATION field
        Per the standing rule: where a prior-meta value is used, the primary read is
        ATTEMPTED ANYWAY and whether it reconciles is recorded. "attempted and did
        not reconcile" is a finding; "never attempted" is a gap; both are allowed
        through -- SILENCE is not.
  * a value with no retrieved_utc or no payload hash on its supplying attempt
        -- a claim about a source is a claim about a VERSION.

⚠ AND THE ONE THIS PROJECT KEEPS RE-LEARNING: `emit()` counts OBTAINED data, never
documents. A rung that fetched a document and extracted nothing is
RETRIEVED_NO_VALUE and never reaches this file. We once reported "317 of 317
retrieved" when the primary reports numbered 31.

Run:  python ladder_store.py --selftest
      python ladder_store.py --report out/trial_values.jsonl
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import asdict

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import ladder as L


class Refused(Exception):
    """A write the gate would not make. The message names the rule broken."""


REQUIRED_ON_OBTAINED = ("state", "supplying_rung", "provenance_tier", "value")


def check(rec: dict) -> list:
    """Return the list of reasons this record may NOT be written. Empty == allowed."""
    bad = []
    st = rec.get("state")
    if st not in {s.value for s in L.State}:
        bad.append("state " + repr(st) + " is not one of the four ladder states")

    has_value = bool(rec.get("value")) and rec["value"].get("estimate") is not None

    if st == L.State.OBTAINED.value:
        for k in REQUIRED_ON_OBTAINED:
            if not rec.get(k):
                bad.append("OBTAINED but " + k + " is missing")
        if not has_value:
            bad.append("OBTAINED but no estimate in value -- RETRIEVED is not OBTAINED")
        tier = rec.get("provenance_tier") or ""
        if tier and tier not in L.TIER_RANK:
            bad.append("provenance_tier " + repr(tier) + " is not a declared tier")
        if tier == "prior_meta_table" and "reconciliation" not in rec:
            bad.append("prior_meta_table value with no 'reconciliation' field: the "
                       "primary read must be ATTEMPTED and the outcome recorded "
                       "(reconciles / does not reconcile / not attempted)")
        sup = _supplying_attempt(rec)
        if sup is None:
            bad.append("OBTAINED but no attempt is marked HIT")
        else:
            if not sup.get("retrieved_utc"):
                bad.append("supplying attempt has no retrieved_utc -- a claim about a "
                           "source is a claim about a VERSION")
            if not sup.get("payload_sha256"):
                bad.append("supplying attempt has no payload_sha256")

    elif st == L.State.NOT_YET_FOUND.value:
        if has_value:
            bad.append("NOT_YET_FOUND but a value is attached -- state and payload "
                       "contradict")

    elif st == L.State.GENUINELY_UNOBTAINABLE.value:
        v = rec.get("unobtainable_verdict") or {}
        if not v.get("granted"):
            bad.append("GENUINELY_UNOBTAINABLE without a GRANTED verdict from "
                       "obtainability.earn_unobtainable")
        if v.get("evidence_kind") and v["evidence_kind"] != "enumeration_rows":
            bad.append("verdict rests on evidence_kind=" + repr(v["evidence_kind"])
                       + " -- only a register's own rows can earn this state")
        for k in ("enumeration", "enumeration_sha256", "enumeration_retrieved_utc"):
            if not v.get(k):
                bad.append("verdict missing " + k)
        if has_value:
            bad.append("GENUINELY_UNOBTAINABLE but a value is attached")

    elif st == L.State.NOT_YET_ATTEMPTED.value:
        if rec.get("attempts"):
            bad.append("NOT_YET_ATTEMPTED but attempts are recorded")
    return bad


def _supplying_attempt(rec: dict):
    for a in rec.get("attempts") or []:
        if a.get("outcome") == L.Outcome.HIT.value:
            return a
    return None


def emit(rec, path: str, strict: bool = True) -> dict:
    """The ONLY sanctioned write. Returns the record actually written.

    strict=True raises Refused. strict=False writes a REFUSAL row instead of the
    value, so a refusal is VISIBLE IN THE LEDGER rather than shrinking the
    denominator silently.
    """
    rec = asdict(rec) if not isinstance(rec, dict) else dict(rec)
    reasons = check(rec)
    if reasons:
        if strict:
            raise Refused("; ".join(reasons))
        rec = {"state": "REFUSED_BY_WRITE_PATH", "refusal_reasons": reasons,
               "request": rec.get("request"), "attempted_state": rec.get("state")}
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        f.flush()
        os.fsync(f.fileno())
    return rec


def report(path: str) -> dict:
    """Counts by state, WITH the kinds enumerated before the number.

    Kinds in this population: the four ladder states, plus REFUSED_BY_WRITE_PATH.
    A refusal is its own kind -- it is neither data nor a defect in the datum, and
    letting it vanish from the denominator is exactly the error that has changed
    four counts on this project by more than half.
    """
    kinds = {}
    n = 0
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for ln in f:
                if not ln.strip():
                    continue
                n += 1
                r = json.loads(ln)
                kinds[r.get("state", "?")] = kinds.get(r.get("state", "?"), 0) + 1
    return {"path": path, "rows": n, "kinds_enumerated_first": sorted(kinds),
            "counts": kinds}


# ------------------------------------------------------------------ selftest
def _selftest() -> int:
    import tempfile
    fails = []

    def check_(label, cond):
        print(("  ok    " if cond else "  FAIL  ") + label)
        if not cond:
            fails.append(label)

    def refused(rec):
        return check(rec)

    good_attempt = {"outcome": "HIT", "retrieved_utc": "2026-08-29T00:00:00+00:00",
                    "payload_sha256": "a" * 64}
    clean = {"state": "OBTAINED", "supplying_rung": 3, "provenance_tier": "trial_report",
             "value": {"estimate": 0.83, "measure": "HR"}, "attempts": [good_attempt],
             "request": {"trial": "DAPA-HF"}}

    print("PLANT 1 -- clean OBTAINED record passes")
    check_("a fully-provenanced value is allowed", not refused(clean))

    print("PLANT 2 -- defect: OBTAINED with no estimate (RETRIEVED, not OBTAINED)")
    r = dict(clean, value={"measure": "HR"})
    check_("REFUSED", any("RETRIEVED is not OBTAINED" in x for x in refused(r)))

    print("PLANT 3 -- defect: NOT_YET_FOUND carrying a number")
    r = dict(clean, state="NOT_YET_FOUND")
    check_("REFUSED", any("contradict" in x for x in refused(r)))

    print("PLANT 4 -- defect: GENUINELY_UNOBTAINABLE with no granted verdict")
    r = {"state": "GENUINELY_UNOBTAINABLE", "attempts": [], "request": {}}
    check_("REFUSED", any("without a GRANTED verdict" in x for x in refused(r)))

    print("PLANT 5 -- defect: unobtainable earned from a 404")
    r = {"state": "GENUINELY_UNOBTAINABLE", "attempts": [],
         "unobtainable_verdict": {"granted": True, "evidence_kind": "http_status",
                                  "enumeration": "x", "enumeration_sha256": "y",
                                  "enumeration_retrieved_utc": "z"}}
    check_("REFUSED", any("only a register's own rows" in x for x in refused(r)))

    print("PLANT 6 -- defect: prior-meta value with no reconciliation field")
    r = dict(clean, provenance_tier="prior_meta_table")
    check_("REFUSED", any("reconciliation" in x for x in refused(r)))
    r2 = dict(r, reconciliation={"attempted": False, "why": "no OA primary report"})
    check_("ALLOWED once the reconciliation attempt is recorded, even as 'not attempted'",
           not refused(r2))

    print("PLANT 7 -- defect: supplying attempt with no version stamp")
    r = dict(clean, attempts=[{"outcome": "HIT", "retrieved_utc": "", "payload_sha256": ""}])
    check_("REFUSED for missing retrieved_utc", any("VERSION" in x for x in refused(r)))

    print("PLANT 8 -- a refusal must be VISIBLE in the ledger, not silently dropped")
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "t.jsonl")
        emit(dict(clean, value={"measure": "HR"}), p, strict=False)
        emit(clean, p, strict=True)
        rep = report(p)
        check_("both rows are in the ledger", rep["rows"] == 2)
        check_("the refusal appears as its own kind",
               "REFUSED_BY_WRITE_PATH" in rep["counts"])
        check_("kinds are enumerated before the number", len(rep["kinds_enumerated_first"]) == 2)

    print("PLANT 9 -- strict mode raises rather than writing a bad row")
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "t.jsonl")
        try:
            emit(dict(clean, value={"measure": "HR"}), p, strict=True)
            check_("raised Refused", False)
        except Refused:
            check_("raised Refused", True)
        check_("nothing was written", not os.path.exists(p) or report(p)["rows"] == 0)

    print("RESTORE -- the clean record still passes after every plant")
    check_("restoration asserted", not refused(clean))

    n = 14
    print("\nselftest: " + str(n - len(fails)) + "/" + str(n) + " -- "
          + ("PASS" if not fails else "FAIL " + str(fails)))
    return 1 if fails else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--report", default="")
    a = ap.parse_args()
    if a.selftest:
        return _selftest()
    if a.report:
        print(json.dumps(report(a.report), indent=1))
        return 0
    ap.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
