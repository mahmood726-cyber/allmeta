# -*- coding: utf-8 -*-
"""PLANT THE DEFECT: prove every check in test_opencomp.py can actually fail.

A check not watched to fail is not a check. For each check this script:
  1. plants its violation IN THE REAL FRAME FILE on disk,
  2. runs the check and requires it to FAIL,
  3. restores the file byte-for-byte from the pristine copy held in memory,
  4. runs the check again and requires it to PASS,
  5. verifies the restored bytes are identical to the original.

Nothing is planted in a copy. The point is that the file a consumer would read is
the file the check was proven against.

Usage:  python opencomp_plant.py [frame.jsonl]
"""
import io
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "tests"))
import test_opencomp as T  # noqa: E402

FRAME = sys.argv[1] if len(sys.argv) > 1 else T.FRAME


def _load_lines(path):
    with io.open(path, "rb") as f:
        return f.read()


def _write_rows(path, rows):
    with io.open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def _rows(path):
    with io.open(path, encoding="utf-8") as f:
        return [json.loads(l) for l in f if l.strip()]


# ------------------------------------------------------------------ the plants
def plant_partition(rows):
    rows[0]["disposition"] = "SKIPPED_QUIETLY"
    return "row 0 disposition -> 'SKIPPED_QUIETLY' (a cell outside the partition)"


def plant_provenance(rows):
    rows[-1].pop("provenance", None)
    return "provenance stripped from the LAST row (survives any head-only inspection)"


def plant_empty_string(rows):
    rows[0]["enumeration_via"] = ""
    return "row 0 enumeration_via -> '' (empty string masquerading as a value)"


def plant_absence_without_retrieval(rows):
    for r in rows:
        if (r.get("retrieval") or {}).get("status", "").startswith("NOT_RETRIEVED"):
            r["match_status"] = "NO_COUNTERPART"
            return ("pmid %s (%s) given match_status NO_COUNTERPART -- an absence claim "
                    "about a paper we never opened" % (r["pmid"], r["retrieval"]["status"]))
    rows[0]["retrieval"] = {"status": "NOT_RETRIEVED_BLOCKED", "fulltext_bytes": None,
                            "may_speak_about_content": False}
    return "row 0 forced to NOT_RETRIEVED_BLOCKED while keeping its content fields"


def plant_licence_collapse(rows):
    for r in rows:
        if (r.get("retrieval") or {}).get("status", "").startswith("NOT_RETRIEVED") \
                and r.get("licence_open"):
            r["disposition"] = "EXAMINED"
            return ("pmid %s is licence-open and UNRETRIEVABLE; promoted to EXAMINED -- "
                    "the exact collapse that scored a prior ladder 0 of 10" % r["pmid"])
    for r in rows:
        if (r.get("retrieval") or {}).get("status", "").startswith("RETRIEVED"):
            r["pmcid"] = None
            return "pmid %s retrieved with no pmcid to have fetched from" % r["pmid"]
    rows[0]["licence_open"] = True
    rows[0]["disposition"] = "EXAMINED"
    rows[0]["retrieval"] = {"status": "NOT_RETRIEVED_BLOCKED", "fulltext_bytes": None,
                            "may_speak_about_content": False}
    return "row 0 licence-open + blocked, promoted to EXAMINED"


def plant_denominator(rows):
    for r in rows:
        r["provenance"] = dict(r["provenance"], denominator_composition="cardiology")
    return "denominator_composition -> the label 'cardiology' (a name, not a composition)"


def plant_eligible(rows):
    for r in rows:
        if not r.get("eligible_comparator"):
            r["eligible_comparator"] = True
            return ("pmid %s marked eligible while match_status=%r, prospero=%r -- "
                    "a conjunction asserted from none of its parts"
                    % (r["pmid"], r.get("match_status"), r.get("prospero_registered")))
    rows[0]["prospero_registered"] = False
    return "row 0 kept eligible with prospero_registered=False"


def plant_duplicate_pmid(rows):
    rows.append(dict(rows[0]))
    return "row 0 duplicated -- the same comparator counted twice"


PLANTS = [
    (T.check_partition, plant_partition),
    (T.check_provenance_in_every_row, plant_provenance),
    (T.check_no_empty_strings, plant_empty_string),
    (T.check_absence_requires_retrieval, plant_absence_without_retrieval),
    (T.check_licence_is_not_retrieval, plant_licence_collapse),
    (T.check_denominator_composition_recorded, plant_denominator),
    (T.check_eligible_implies_every_criterion, plant_eligible),
    (T.check_pmid_unique, plant_duplicate_pmid),
]


def main():
    if not os.path.exists(FRAME):
        raise SystemExit("no frame at %s -- build it first" % FRAME)
    pristine = _load_lines(FRAME)
    print("frame   : %s" % FRAME)
    print("bytes   : %d" % len(pristine))
    print("")

    baseline = _rows(FRAME)
    pre = [(c.__name__, c(baseline)) for c, _ in PLANTS]
    dirty = [(n, f) for n, f in pre if f]
    if dirty:
        print("!! THE FRAME DOES NOT PASS BEFORE PLANTING -- planting proves nothing here.")
        for n, f in dirty:
            print("   %s: %s" % (n, f[:3]))
        return 1
    print("baseline: all %d checks PASS on the untouched frame" % len(PLANTS))
    print("")

    failures = 0
    for check, plant in PLANTS:
        rows = _rows(FRAME)
        what = plant(rows)
        _write_rows(FRAME, rows)
        got = check(_rows(FRAME))
        watched = bool(got)
        # restore, byte for byte, from the pristine copy
        with io.open(FRAME, "wb") as f:
            f.write(pristine)
        restored_ok = (_load_lines(FRAME) == pristine)
        after = check(_rows(FRAME))
        ok = watched and restored_ok and not after
        failures += (0 if ok else 1)
        print("%-42s %s" % (check.__name__, "OK" if ok else "**CHECK IS DEAD**"))
        print("   planted : %s" % what)
        print("   failed  : %s%s" % ("YES" if watched else "NO -- THE CHECK CANNOT FAIL",
                                     (" (%s)" % got[0][:110]) if got else ""))
        print("   restored: bytes identical=%s   check passes again=%s"
              % (restored_ok, not after))
        print("")

    print("=== %d/%d checks watched to fail and restored ===" % (len(PLANTS) - failures, len(PLANTS)))
    if _load_lines(FRAME) != pristine:
        raise SystemExit("FRAME NOT RESTORED -- refusing to exit clean")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8",
                                  errors="replace", line_buffering=True)
    sys.exit(main())
