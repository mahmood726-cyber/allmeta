# -*- coding: utf-8 -*-
"""PLANT THE DEFECT for the scoring gates. A check not watched to fail is not a check.

Two real files are used, never copies:
  F:\\claude-temp\\pend\\opencomp_gate_fixture.json  -- a verdict built from a REAL pair,
      whose payload is the REAL our-side dossier bytes and whose quote is a REAL
      substring taken from the last section of that dossier
  F:\\claude-temp\\pend\\opencomp_pairs.jsonl        -- the real pair file

For each check: plant the violation on disk, require the check to FAIL, restore the file
byte-for-byte, require it to PASS, and verify the restored bytes are identical.

Usage: python opencompscore_plant.py
"""
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import opencompscore as S  # noqa: E402

FIXTURE = r"F:\claude-temp\pend\opencomp_gate_fixture.json"


# ------------------------------------------------------------------ real fixture
def build_fixture():
    pairs = [json.loads(l) for l in io.open(S.PAIRS, encoding="utf-8") if l.strip()]
    if not pairs:
        raise SystemExit("no pairs -- run: python opencompscore.py --build-pairs")
    p = pairs[0]
    ours = S.our_side_dossier(p["topic"])
    secs = S.section_payload(ours)
    if S.sha256(ours) != p["our_payload_sha256"]:
        raise SystemExit("REFUSING: the dossier no longer hashes to what the pair "
                         "recorded -- raise-time and check-time have drifted")
    # a REAL quote, taken from the LAST section so a window-gated check would miss it
    tail = secs[-1]
    i = max(0, len(tail) // 2)
    quote = " ".join(tail[i:i + 220].split())[:160]
    theirs = ["Methods. Only a pooled estimate is reported for the primary outcome."]
    v = {
        "pair_id": p["pair_id"], "criterion": "S3", "judge_family": "openai",
        "payload_sha256_a": p["our_payload_sha256"], "payload_sha256_b": S.sha256(theirs[0]),
        "a": {"satisfied": True, "quote": quote, "absence_checked_in": None},
        "b": {"satisfied": False, "quote": None,
              "absence_checked_in": ["Methods", "Results", "Tables"]},
        "label": "A_BETTER",
        "reason": ("Side A lists every included study with arm-level event counts and "
                   "denominators, so each contribution to the pooled estimate is "
                   "recoverable by a reader; side B reports only the pooled estimate."),
        "_payload_a_sections": secs,
        "_payload_b_sections": theirs,
        "_judge": {"rc": 0, "stdout": 'model: gpt-5-codex. {"label":"A_BETTER"}',
                   "family": "openai"},
    }
    n = S.write_verified(FIXTURE, json.dumps(v, ensure_ascii=False, indent=1))
    return n, len(secs), len(ours)


def _load(path):
    with io.open(path, "rb") as f:
        return f.read()


def _fx():
    return json.load(io.open(FIXTURE, encoding="utf-8"))


def _save(v):
    S.write_verified(FIXTURE, json.dumps(v, ensure_ascii=False, indent=1))


def _pairs():
    return [json.loads(l) for l in io.open(S.PAIRS, encoding="utf-8") if l.strip()]


def _save_pairs(rows):
    S.write_verified(S.PAIRS, "".join(json.dumps(r, ensure_ascii=False) + "\n"
                                      for r in rows))


# ------------------------------------------------------------------ the checks
def chk_label():
    v = _fx()
    return S.gate_label(v)


def chk_quote():
    v = _fx()
    return S.gate_quote(v, v["_payload_a_sections"], v["_payload_b_sections"])


def chk_identity():
    return S.gate_payload_identity(_fx())


def chk_judge():
    j = _fx()["_judge"]
    return S.verify_judge_artefact(j["rc"], j["stdout"], j["family"])


def chk_join_is_a_filter():
    bad = []
    for p in _pairs():
        if not p.get("join_tiers"):
            bad.append("%s admitted by no join" % p.get("pair_id"))
        if not p.get("key_used"):
            bad.append("%s lost which key produced the match" % p.get("pair_id"))
        if "cited_pmid" in (p.get("join_tiers") or []) and \
                "frozen" not in (p.get("join_tiers") or []):
            bad.append("%s admitted by the strict join but not the loose one"
                       % p.get("pair_id"))
    return bad or None


def chk_payload_not_truncated():
    """Guard the WINDOW BUG AT ITS SOURCE. A prior harness showed a reviewer a 26k slice
    and gated the answer against the same slice, recording 82% of TRUE quotes as
    fabrications. Gating on the symptom cannot fix that -- the sections must be proven
    to reassemble to the payload whose hash the verdict carries."""
    v = _fx()
    joined = "".join(v["_payload_a_sections"])
    if S.sha256(joined) != v["payload_sha256_a"]:
        return ("PAYLOAD_TRUNCATED: the sections shown reassemble to %d chars, which do "
                "not hash to payload_sha256_a -- any quote gate run on this is measuring "
                "the harness" % len(joined))
    return None


# ------------------------------------------------------------------ the plants
def p_label_flip():
    v = _fx(); v["label"] = "B_BETTER"; _save(v)
    return "label -> B_BETTER while its own sub-findings say a=True b=False"


def p_label_invented_reason():
    v = _fx(); v["a"]["satisfied"] = "NOT_SCOREABLE_BECAUSE_I_SAY_SO"
    v["label"] = "NOT_SCOREABLE"; _save(v)
    return "an invented NOT_SCOREABLE reason, outside the frozen list"


def p_label_no_reason():
    v = _fx(); v["reason"] = "A is better."; _save(v)
    return "reason cut to 11 chars -- a bare label wearing a sentence"


def p_quote_fabricated():
    v = _fx(); v["a"]["quote"] = "the trial reported a hazard ratio of 0.61 at week 96"
    _save(v)
    return "quote replaced with plausible prose that is NOT in the payload"


def p_quote_absence_unsourced():
    v = _fx(); v["b"]["absence_checked_in"] = []; _save(v)
    return "an absence claim with no record of where it looked (absent vs not-shown)"


def p_identity_stripped():
    v = _fx(); v["payload_sha256_a"] = None; _save(v)
    return "payload hash removed -- raise-time and check-time become unauditable"


def p_judge_empty():
    v = _fx(); v["_judge"] = {"rc": 0, "stdout": "", "family": "openai"}; _save(v)
    return "empty artefact at rc=0 -- what an unauthenticated call actually returns"


def p_judge_agy_default():
    v = _fx()
    v["_judge"] = {"rc": 0, "family": "google",
                   "stdout": 'I am GPT-OSS 120B (Medium). {"label":"A_BETTER"}'}
    _save(v)
    return ("agy answering as GPT-OSS 120B while booked as the google family -- the "
            "OpenAI-family default that would silently collapse a 3-family panel to 2")
def p_join_key_dropped():
    rows = _pairs(); rows[0]["key_used"] = {}; _save_pairs(rows)
    return "key_used emptied on pair 0 -- the join stops being a filter"


def p_join_tier_lost():
    rows = _pairs()
    for r in rows:
        if "cited_pmid" in r["join_tiers"]:
            r["join_tiers"] = ["cited_pmid"]
            _save_pairs(rows)
            return ("%s admitted by the STRICT join but no longer by the loose one -- "
                    "the tiers stop nesting" % r["pair_id"])
    rows[0]["join_tiers"] = []
    _save_pairs(rows)
    return "pair 0 admitted by no join at all"


def p_payload_truncated():
    v = _fx(); v["_payload_a_sections"] = v["_payload_a_sections"][:1]; _save(v)
    return ("payload cut to its FIRST SECTION while the verdict keeps the full-payload "
            "hash -- the exact shape of the 82%-fabrication harness")


PLANTS = [
    (FIXTURE, "gate_label / contradiction", chk_label, p_label_flip),
    (FIXTURE, "gate_label / invented reason", chk_label, p_label_invented_reason),
    (FIXTURE, "gate_label / bare label", chk_label, p_label_no_reason),
    (FIXTURE, "gate_quote / fabricated quote", chk_quote, p_quote_fabricated),
    (FIXTURE, "gate_quote / unsourced absence", chk_quote, p_quote_absence_unsourced),
    (FIXTURE, "payload not truncated (window bug at source)", chk_payload_not_truncated,
     p_payload_truncated),
    (FIXTURE, "gate_payload_identity", chk_identity, p_identity_stripped),
    (FIXTURE, "verify_judge_artefact / empty at rc0", chk_judge, p_judge_empty),
    (FIXTURE, "verify_judge_artefact / agy default family", chk_judge, p_judge_agy_default),
    (S.PAIRS, "join stays a filter / key_used", chk_join_is_a_filter, p_join_key_dropped),
    (S.PAIRS, "join stays a filter / tiers nest", chk_join_is_a_filter, p_join_tier_lost),
]


def main():
    n, nsec, nchars = build_fixture()
    print("fixture : %s  (%d bytes, %d sections, %d chars of real dossier)"
          % (FIXTURE, n, nsec, nchars))
    print("pairs   : %s  (%d bytes)" % (S.PAIRS, os.path.getsize(S.PAIRS)))
    print("")

    pristine = {FIXTURE: _load(FIXTURE), S.PAIRS: _load(S.PAIRS)}
    base = [(name, chk()) for _, name, chk, _ in PLANTS]
    dirty = [(n_, f) for n_, f in base if f]
    if dirty:
        print("!! THE BASELINE DOES NOT PASS -- planting proves nothing here.")
        for n_, f in dirty:
            print("   %s: %s" % (n_, f))
        return 1
    print("baseline: all %d checks PASS untouched" % len(PLANTS))
    print("")

    failures = 0
    for target, name, chk, plant in PLANTS:
        what = plant()
        got = chk()
        watched = bool(got)
        with io.open(target, "wb") as f:
            f.write(pristine[target])
        restored = (_load(target) == pristine[target])
        after = chk()
        ok = watched and restored and not after
        failures += (0 if ok else 1)
        print("%-46s %s" % (name, "OK" if ok else "**CHECK IS DEAD**"))
        print("   planted : %s" % what)
        print("   failed  : %s%s"
              % ("YES" if watched else "NO -- THE CHECK CANNOT FAIL",
                 (" (%s)" % (got if isinstance(got, str) else got[0])[:120]) if got else ""))
        print("   restored: bytes identical=%s   passes again=%s" % (restored, not after))
        print("")

    for t, b in pristine.items():
        if _load(t) != b:
            raise SystemExit("NOT RESTORED: %s -- refusing to exit clean" % t)
    print("=== %d/%d checks watched to fail and restored ===" % (len(PLANTS) - failures,
                                                                len(PLANTS)))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8",
                                  errors="replace", line_buffering=True)
    sys.exit(main())
