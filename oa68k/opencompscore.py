# -*- coding: utf-8 -*-
"""Scored head-to-head harness. RULE: oa68k/SCORING-PROTOCOL.md, frozen before any pair
was judged.

THIS FILE DOES NOT JUDGE ANYTHING WITHOUT AN EXPLICIT FLAG. `--build-pairs` prepares the
work; `--judge` refuses to start unless --join-decided is passed, because the join is
Mahmood's and judging early would spend it.

THE PROPERTY THIS HARNESS EXISTS TO PRESERVE
  The join (22 / 12 / 8) stays a FILTER APPLIED AT THE END. Pairs are built for the
  UNION and every pair carries join_tiers, so choosing a join never needs a rebuild and
  never needs a re-run.

THE THREE GATES
  1. the label must be DERIVED from the judge's own sub-findings, not asserted beside them
  2. a quote must appear in the WHOLE payload the judge was shown, never in a window
  3. a judge call must be non-empty, rc==0, and must NAME ITS OWN MODEL FAMILY
Usage:
  python opencompscore.py --build-pairs
  python opencompscore.py --judge --join-decided <frozen|nct_pmid|cited_pmid>
"""
import hashlib
import io
import json
import os
import re
import sys

FRAME = r"F:\claude-temp\pend\opencomp_frame_cardiology.jsonl"
SSOT = r"F:\claude-temp\wt\rob-lane\ssot"
PAIRS = r"F:\claude-temp\pend\opencomp_pairs.jsonl"
PROTOCOL = "oa68k/SCORING-PROTOCOL.md"

COUNTED = ["S2", "S3", "S4", "S5", "S6", "S7"]
REPORTED_NOT_COUNTED = ["S1", "S8"]
CRITERIA = REPORTED_NOT_COUNTED[:1] + COUNTED + REPORTED_NOT_COUNTED[1:]

LABELS = ("A_BETTER", "B_BETTER", "TIE_BOTH_SATISFY", "TIE_NEITHER_SATISFIES",
          "NOT_SCOREABLE")
NOT_SCOREABLE_REASONS = (
    "NOT_SCOREABLE_NO_STUDY_LIST", "NOT_SCOREABLE_INPUTS_ABSENT",
    "NOT_SCOREABLE_SINGLE_STUDY", "NOT_SCOREABLE_MATERIAL_NOT_RETRIEVED",
    "NOT_SCOREABLE_SOURCE_NOT_PUBLISHED", "NOT_SCOREABLE_NO_PROTOCOL_EXISTS")

# family -> (cli, the string its reply must contain to prove the pin held)
FAMILIES = {
    "anthropic": ("claude", ("claude",)),
    "openai": ("codex", ("gpt", "codex", "o3", "o4")),
    "google": ("agy", ("gemini",)),
}
# agy's persisted default is "GPT-OSS 120B (Medium)" -- OPENAI family. Verified from
# C:\Users\mahmo\.gemini\antigravity-cli\settings.json on 2026-08-31. An unpinned agy
# call is NOT a third family, and its reply will fail the google readback below.
AGY_SETTINGS = r"C:\Users\mahmo\.gemini\antigravity-cli\settings.json"


# --------------------------------------------------------------------- utilities
def sha256(s):
    return hashlib.sha256(s.encode("utf-8") if isinstance(s, str) else s).hexdigest()


def write_verified(path, text):
    """Write, then MEASURE. A full disk wrote 0-byte files silently at exit 0."""
    with io.open(path, "w", encoding="utf-8") as f:
        f.write(text)
    n = os.path.getsize(path)
    if n == 0:
        raise SystemExit("REFUSING: %s is 0 bytes after write" % path)
    if not text.strip():
        raise SystemExit("REFUSING: nothing to write to %s" % path)
    return n


def normalise(s):
    s = re.sub(r"<[^>]+>", " ", s or "")
    return re.sub(r"\s+", " ", s).strip().casefold()


def section_payload(text, max_chars=24000):
    """Split, NEVER cut. Truncation is what turns true quotes into fabrications."""
    secs, i = [], 0
    while i < len(text):
        secs.append(text[i:i + max_chars])
        i += max_chars
    if not secs:
        secs = [""]
    if sum(len(s) for s in secs) != len(text):
        raise SystemExit("REFUSING: sectioning lost %d chars"
                         % (len(text) - sum(len(s) for s in secs)))
    return secs


# --------------------------------------------------------------------- gate 1
def derive_label(a_sat, b_sat):
    """PROTOCOL 4, gate 1. The label is a FUNCTION of the sub-findings."""
    if isinstance(a_sat, str) or isinstance(b_sat, str):
        return "NOT_SCOREABLE"
    if a_sat and not b_sat:
        return "A_BETTER"
    if b_sat and not a_sat:
        return "B_BETTER"
    return "TIE_BOTH_SATISFY" if a_sat else "TIE_NEITHER_SATISFIES"


def gate_label(v):
    """Return None if the verdict's label follows from its own findings, else a reason."""
    for side in ("a", "b"):
        s = (v.get(side) or {}).get("satisfied")
        if isinstance(s, str) and s not in NOT_SCOREABLE_REASONS:
            return "DISCARD_UNKNOWN_NOT_SCOREABLE_REASON:%s" % s
        if not isinstance(s, (bool, str)):
            return "DISCARD_SATISFIED_NOT_A_FINDING:%s=%r" % (side, s)
    if v.get("label") not in LABELS:
        return "DISCARD_UNKNOWN_LABEL:%r" % v.get("label")
    want = derive_label(v["a"]["satisfied"], v["b"]["satisfied"])
    if v["label"] != want:
        return ("DISCARD_LABEL_CONTRADICTS_ITS_OWN_FINDING:"
                "said=%s derived=%s (a=%r b=%r)"
                % (v["label"], want, v["a"]["satisfied"], v["b"]["satisfied"]))
    if len(v.get("reason") or "") < 120:
        return "DISCARD_REASON_TOO_SHORT:%d" % len(v.get("reason") or "")
    return None


# --------------------------------------------------------------------- gate 2
def gate_quote(v, payload_a_sections, payload_b_sections):
    """A quote must be in the WHOLE payload shown, never in a window of it."""
    hay = {"a": normalise(" ".join(payload_a_sections)),
           "b": normalise(" ".join(payload_b_sections))}
    for side in ("a", "b"):
        d = v.get(side) or {}
        s = d.get("satisfied")
        if s is True:
            q = d.get("quote")
            if not q or len(q) < 12:
                return "DISCARD_NO_QUOTE_FOR_A_SATISFIED_FINDING:%s" % side
            if normalise(q) not in hay[side]:
                # store the offending quote: a discard that drops its evidence costs a run
                return "DISCARD_QUOTE_NOT_IN_PAYLOAD:%s:%s" % (side, q[:160])
        elif s is False:
            if not (d.get("absence_checked_in") or []):
                # absent vs not-shown: an absence claim must name where it looked
                return "DISCARD_ABSENCE_WITHOUT_SECTIONS_SEARCHED:%s" % side
    return None


# --------------------------------------------------------------------- gate 3
def gate_payload_identity(v):
    for k in ("payload_sha256_a", "payload_sha256_b", "pair_id", "judge_family",
              "criterion"):
        if not v.get(k):
            return "DISCARD_NO_PAYLOAD_IDENTITY:%s" % k
    if v["criterion"] not in CRITERIA:
        return "DISCARD_UNKNOWN_CRITERION:%s" % v["criterion"]
    return None


def verify_judge_artefact(rc, stdout, family):
    """PROTOCOL 5. An unpinned or unauthenticated call returns EMPTY at rc=0 and looks
    exactly like a judgement. A call that can only say OK is not a check."""
    if family not in FAMILIES:
        return "JUDGE_CALL_VOID:UNKNOWN_FAMILY:%s" % family
    if rc != 0:
        return "JUDGE_CALL_VOID:RC=%s" % rc
    if not (stdout or "").strip():
        return "JUDGE_CALL_VOID:EMPTY_ARTEFACT_AT_RC0"
    low = (stdout or "").casefold()
    if not any(t in low for t in FAMILIES[family][1]):
        return ("JUDGE_CALL_VOID:MODEL_STRING_ABSENT_OR_WRONG_FAMILY:expected one of %s"
                % (FAMILIES[family][1],))
    for fam, (_, toks) in FAMILIES.items():
        if fam == family:
            continue
        if any(t in low for t in toks) and not any(t in low for t in FAMILIES[family][1]):
            return "JUDGE_CALL_VOID:REPLY_NAMES_FAMILY_%s" % fam
    return None


ALL_GATES = (gate_payload_identity, gate_label)


# --------------------------------------------------------------------- pair building
def our_side_dossier(topic):
    """Render our review into the COMMON dossier format. Format must not identify a side."""
    j = json.load(io.open(os.path.join(SSOT, topic, topic + ".json"), encoding="utf-8"))
    trials = (j.get("inputs") or {}).get("trials") or []
    out = ["## QUESTION", str(j.get("question") or ""), "",
           "## INCLUDED STUDIES", ]
    for t in trials:
        out.append("- %s (%s, %s): %s" % (t.get("name"), t.get("nct"), t.get("year"),
                                          json.dumps(t.get("arms"), ensure_ascii=False)))
    out += ["", "## SYNTHESIS", json.dumps(j.get("results"), ensure_ascii=False)[:60000],
            "", "## SEARCH", json.dumps(j.get("search"), ensure_ascii=False)[:30000],
            "", "## RISK OF BIAS", json.dumps(j.get("risk_of_bias"), ensure_ascii=False)[:30000],
            "", "## PROTOCOL AND REGISTRATION",
            json.dumps(j.get("protocol"), ensure_ascii=False)[:12000]]
    return "\n".join(out)


def build_pairs(log=print):
    rows = [json.loads(l) for l in io.open(FRAME, encoding="utf-8") if l.strip()]
    tiers = {"frozen": {"nct", "cited_pmid", "acronym"},
             "nct_pmid": {"nct", "cited_pmid"},
             "cited_pmid": {"cited_pmid"}}
    pairs = []
    for r in rows:
        if not r.get("eligible_comparator"):
            continue
        for t in r.get("matched_topics") or []:
            d = r["overlap_detail"][t]
            admits = []
            for name, allowed in tiers.items():
                hard = [k for k in (d["key_used"][x] for x in d["overlap"]) if k in allowed]
                if len(hard) >= 2 and len(hard) / float(d["k"]) >= 0.5:
                    admits.append(name)
            if not admits:
                continue
            pid = "%s__%s" % (t, r["pmid"])
            ours = our_side_dossier(t)
            # blinding: deterministic order, no RNG (and no Date.now, which breaks resume)
            side_a_is_ours = int(sha256(pid)[:8], 16) % 2 == 0
            pairs.append({
                "pair_id": pid,
                "topic": t,
                "comparator_pmid": r["pmid"],
                "comparator_pmcid": r["pmcid"],
                "comparator_title": r["title"],
                "join_tiers": admits,
                "key_used": d["key_used"],
                "overlap": d["overlap"],
                "k_ours": d["k"],
                "side_a_is_ours": side_a_is_ours,
                "our_payload_sha256": sha256(ours),
                "our_payload_chars": len(ours),
                "our_payload_sections": len(section_payload(ours)),
                "comparator_payload_fetched": False,
                "judged": False,
                "provenance": {
                    "protocol": PROTOCOL,
                    "frozen_before_any_pair_was_judged": True,
                    "join_is_a_filter_not_a_rebuild":
                        "Pairs are built for the UNION of the three joins. join_tiers "
                        "names which of frozen / nct_pmid / cited_pmid admits this pair, "
                        "so choosing a join filters the finished verdict file and needs "
                        "neither a rebuild nor a re-run.",
                    "counted_criteria": COUNTED,
                    "reported_not_counted": REPORTED_NOT_COUNTED,
                    "why_S1_S8_are_not_counted":
                        "Both were fixed by our own selection rules. S1 (enumeration) was "
                        "the frame's HARD INCLUSION criterion, so every comparator "
                        "satisfies it by construction. S8 (registration) was the frame's "
                        "QUALITY criterion, so every comparator satisfies it, while our "
                        "side declares protocol.prespecified=false and refuses a "
                        "retrospective protocol as policy. Counting either would score a "
                        "selection rule and report it as a quality gap.",
                    "conflict_of_interest":
                        "We wrote the reviews and the rubric. Six of eight criteria are "
                        "anchored to PRISMA 2020 item numbers; S4 is declared as ours. "
                        "Our reviews were built by Claude, so the Anthropic judge grades "
                        "its own family: judge_family is recorded, the analysis is "
                        "stratified by family, and the Anthropic stratum is never pooled "
                        "into the headline.",
                    "blinding_control_runs_first":
                        "Step 0 of the scored run asks judges only which side is "
                        "machine-generated. If our side is identified above chance the "
                        "comparison is not blinded and every later result measures format.",
                },
            })
    txt = "".join(json.dumps(p, ensure_ascii=False) + "\n" for p in pairs)
    n = write_verified(PAIRS, txt)
    log("pairs written: %s" % PAIRS)
    log("  pairs %d   bytes %d" % (len(pairs), n))
    for name in ("frozen", "nct_pmid", "cited_pmid"):
        k = [p for p in pairs if name in p["join_tiers"]]
        log("  join %-11s pairs %2d  distinct comparators %2d"
            % (name, len(k), len(set(p["comparator_pmid"] for p in k))))
    return pairs


def main(argv):
    if "--build-pairs" in argv:
        build_pairs()
        return 0
    if "--judge" in argv:
        if "--join-decided" not in argv:
            raise SystemExit(
                "REFUSING TO JUDGE: the join (22 / 12 / 8) is Mahmood's and has not been "
                "given. Pairs are built for the union so that his choice stays a filter; "
                "judging now would spend it. Pass --join-decided <tier> when he rules.")
        raise SystemExit("judging is not wired in this commit -- gates only")
    print(__doc__)
    return 0


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8",
                                  errors="replace", line_buffering=True)
    sys.exit(main(sys.argv[1:]))
