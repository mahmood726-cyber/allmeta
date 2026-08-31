# -*- coding: utf-8 -*-
"""PLANT THE DEFECT for the surface-agreement checks.

Plants go into the REAL surface index and the REAL result file -- artefacts this harness
owns and derives from the corpus. ⛔ The corpus worktree itself is NOT mutated: writing a
defect into a corpus we do not own, to prove our own check, is not a trade worth making.
The index is what the checks actually consume, so planting there exercises the same code
path end to end.

Each plant: write the violation on disk, require the check to FAIL, restore the file
byte-for-byte, require it to PASS, verify the restored bytes are identical.
"""
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import surfaceagree as A  # noqa: E402

TOPIC = "sglt2-hf"          # a topic that PASSES at baseline
SIB = "empagliflozin-hf-auto-full-review"


def _load(p):
    with io.open(p, "rb") as f:
        return f.read()


def _idx():
    return json.load(io.open(A.INDEX, encoding="utf-8"))


def _save_idx(d):
    A.S.write_verified(A.INDEX, json.dumps(d, ensure_ascii=False))


# ------------------------------------------------------------------ checks
def chk_topic_ok():
    r = A.check_topic(_idx(), TOPIC)
    return None if r["surface_agreement"] == "OK" else [
        "%s %s" % (f["check"], f["state"]) for f in r["findings"]]


def chk_no_silent_exclusion():
    """Every pair must appear in the result with a named state. A skip that never
    reaches the denominator is how clean numbers get manufactured."""
    res = json.load(io.open(A.RESULT, encoding="utf-8"))
    pairs = [json.loads(l) for l in io.open(A.S.PAIRS, encoding="utf-8") if l.strip()]
    bad = []
    if len(res["pairs"]) != len(pairs):
        bad.append("result holds %d pair rows for %d pairs"
                   % (len(res["pairs"]), len(pairs)))
    for r in res["pairs"]:
        if not r.get("surface_agreement"):
            bad.append("%s has no named state" % r.get("pair_id"))
    for tier, d in res["by_join"].items():
        if d["scoreable"] + d["not_scoreable_surface_disagreement"] != d["pairs"]:
            bad.append("join %s: %d + %d != %d" % (tier, d["scoreable"],
                                                   d["not_scoreable_surface_disagreement"],
                                                   d["pairs"]))
    return bad or None


# ------------------------------------------------------------------ plants
def p_orphan_trial():
    d = _idx()
    nct = d["objects"][TOPIC]["ncts"][-1]
    for f in list(d["pages"]):
        if nct in d["pages"][f]:
            d["pages"][f] = [x for x in d["pages"][f] if x != nct]
    _save_idx(d)
    return ("%s removed from the reader-visible text of every page -- the object still "
            "pools it, so it is pooled and shown nowhere (the peer lane's sidecar class)"
            % nct)


def p_no_page_surface():
    d = _idx()
    mine = set(d["objects"][TOPIC]["ncts"])
    for f in list(d["pages"]):
        d["pages"][f] = [x for x in d["pages"][f] if x not in mine]
    _save_idx(d)
    return "every trace of this object's trials removed from every page -> NO_PAGE_SURFACE"


def p_denominator_disagreement():
    d = _idx()
    shared = set(d["objects"][TOPIC]["ncts"]) & set(d["objects"][SIB]["ncts"])
    n = sorted(shared)[0]
    for t in d["objects"][SIB]["trials"]:
        if t["nct"] == n and t.get("participants"):
            t["participants"] = [x + 7 for x in t["participants"]]
    _save_idx(d)
    return ("%s given different randomised denominators in `%s` than in `%s` -- two of "
            "our own surfaces disagreeing on a number a reader can check" % (n, SIB, TOPIC))


def p_silent_exclusion():
    res = json.load(io.open(A.RESULT, encoding="utf-8"))
    dropped = res["pairs"].pop()
    A.S.write_verified(A.RESULT, json.dumps(res, ensure_ascii=False, indent=1))
    return "pair %s dropped from the result file without reaching any denominator" % \
        dropped["pair_id"]


PLANTS = [
    (A.INDEX, "C1 ORPHAN_TRIAL", chk_topic_ok, p_orphan_trial),
    (A.INDEX, "C1 NO_PAGE_SURFACE", chk_topic_ok, p_no_page_surface),
    (A.INDEX, "C2 DENOMINATOR_DISAGREEMENT", chk_topic_ok, p_denominator_disagreement),
    (A.RESULT, "no silent exclusion", chk_no_silent_exclusion, p_silent_exclusion),
]


def main():
    if not (os.path.exists(A.INDEX) and os.path.exists(A.RESULT)):
        raise SystemExit("build the index and run --check first")
    pristine = {A.INDEX: _load(A.INDEX), A.RESULT: _load(A.RESULT)}
    print("index : %s (%d bytes)" % (A.INDEX, len(pristine[A.INDEX])))
    print("result: %s (%d bytes)" % (A.RESULT, len(pristine[A.RESULT])))
    base = [(n, c()) for _, n, c, _ in PLANTS]
    dirty = [(n, f) for n, f in base if f]
    if dirty:
        print("!! BASELINE DOES NOT PASS -- planting proves nothing here.")
        for n, f in dirty:
            print("   %s: %s" % (n, f))
        return 1
    print("baseline: all %d checks PASS untouched (topic under test: %s)"
          % (len(PLANTS), TOPIC))
    print("")
    failures = 0
    for target, name, chk, plant in PLANTS:
        what = plant()
        got = chk()
        watched = bool(got)
        with io.open(target, "wb") as f:
            f.write(pristine[target])
        restored = _load(target) == pristine[target]
        after = chk()
        ok = watched and restored and not after
        failures += (0 if ok else 1)
        print("%-34s %s" % (name, "OK" if ok else "**CHECK IS DEAD**"))
        print("   planted : %s" % what)
        print("   failed  : %s%s" % ("YES" if watched else "NO -- CANNOT FAIL",
                                     (" (%s)" % got[0][:110]) if got else ""))
        print("   restored: bytes identical=%s   passes again=%s" % (restored, not after))
        print("")
    for t, b in pristine.items():
        if _load(t) != b:
            raise SystemExit("NOT RESTORED: %s" % t)
    print("=== %d/%d checks watched to fail and restored ===" % (len(PLANTS) - failures,
                                                                len(PLANTS)))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8",
                                  errors="replace", line_buffering=True)
    sys.exit(main())
