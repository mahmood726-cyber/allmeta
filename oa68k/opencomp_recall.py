# -*- coding: utf-8 -*-
"""FIFTH FRAME: a RECALL arm. Same rule, searched harder -- no criterion touched.

⛔ WHY THIS AND NOT "MORE TOPICS". There are no topics left. Verified against origin/main:
ssot/ holds exactly 155 topic objects and ALL 155 are framed (114 at k>=2, 4 excluded on
their own declarations, 37 at k<2 where the rule can never match). "Add more topics" is not
available, so the only honest lever is better RECALL on the topics already framed.

⛔ THIS IS NOT A LOOSENING AND THE DISTINCTION IS THE WHOLE POINT. The match rule
(|overlap|>=2 AND >=50%), the ruled nct_pmid join, the PROSPERO criterion, the enumeration
requirement and every design gate are IMPORTED UNCHANGED from opencomp.py, whose sha256 is
recorded in the frame provenance. What changes is the CANDIDATE POPULATION: a second query
arm that asks PubMed for meta-analyses mentioning our trials' REGISTRATION IDENTIFIERS.

  arm A (unchanged) : (intervention terms) AND (population terms) AND Meta-Analysis[pt]
  arm B (new)       : (NCT... OR NCT... ...) AND Meta-Analysis[pt]

Arm B is mechanical and needs no drug knowledge: every topic contributes exactly its own
frozen registrations. It cannot be tuned per topic, and it is applied to EVERY framed topic
with k>=2 -- all 114 -- in ONE batch, declared in full before the run.

⚠️ WHY IT MAY WELL RETURN NOTHING, said in advance: PubMed indexes a registration in the
SI/secondary-source field of THAT TRIAL'S OWN reports. A meta-analysis usually carries its
included registrations in the FULL TEXT, not in the title, abstract or indexed fields. So
this arm may add almost no candidates. A measured zero would be worth having -- it is the
same shape as the cited-PMID remedy that was declared in advance and moved not one row.

Usage: python opencomp_recall.py
"""
import hashlib
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import opencomp as O          # noqa: E402
import opencomp_id2 as I2     # noqa: E402
import opencomp_k4 as K4      # noqa: E402
import opencomp_all as AL     # noqa: E402

ENUM = r"F:\claude-temp\pend\codexjob2\corpus_topics.json"
MAX_IDS_PER_QUERY = 40


def assemble():
    """Every framed topic with k>=2, with its frozen seed and its frozen registrations."""
    enum = json.load(io.open(ENUM, encoding="utf-8"))
    by = {(t.get("app_id") or t.get("dir")): t for t in enum["topics"]}
    topics, trials = {}, {}
    for src_topics, src_trials in ((O.TOPICS, O.OUR_TRIALS),
                                   (I2.TOPICS24, I2.TRIALS24)):
        for t, d in src_topics.items():
            topics[t] = d
            trials[t] = src_trials[t]
    for t, (iv, pop) in list(K4.SEEDS.items()) + list(AL.S.items()):
        topics[t] = {"iv": iv, "pop": pop}
        seen, rows = set(), []
        for tr in by[t]["trials"]:
            n = tr.get("nct")
            if n and n not in seen:
                seen.add(n)
                pm = tr.get("pmid")
                rows.append((n, None, str(pm) if pm else None))
        trials[t] = rows
    return topics, trials


def main():
    topics, trials = assemble()
    assert len(topics) == len(trials)
    k2 = {t: v for t, v in trials.items() if len(v) >= 2}
    print("FIFTH FRAME -- RECALL ARM on topics already framed")
    print("  framed topics with k>=2 : %d   (declared in full, ONE batch)" % len(k2))
    print("  criteria                : IMPORTED UNCHANGED from opencomp.py")
    print("")

    # arm B: the topic's own registrations, OR-ed. Mechanical; no drug knowledge.
    orig_query = O.topic_query

    def two_arm(t):
        a = orig_query(t)
        ids = [n for (n, _a, _p) in O.OUR_TRIALS.get(t, [])][:MAX_IDS_PER_QUERY]
        if not ids:
            return a
        b = " OR ".join('"%s"[All Fields]' % n for n in ids)
        return "(%s) OR ((%s) AND \"Meta-Analysis\"[Publication Type])" % (a, b)

    O.topic_query = two_arm
    O.TOPICS = {t: topics[t] for t in k2}
    O.OUR_TRIALS = {t: trials[t] for t in k2}
    sha = hashlib.sha256(io.open(O.__file__, "rb").read()).hexdigest()
    O.OUT = os.path.join(O.OUTDIR, "opencomp_frame_recall.jsonl")
    O.PROTOCOL = ("oa68k/OPEN-COMPARATOR-PROTOCOL.md (criteria UNCHANGED, fe1f2fd). "
                  "RECALL ARM: candidate population widened by a second query arm asking "
                  "for meta-analyses that mention the topic's OWN frozen registration "
                  "identifiers. No criterion, threshold, join or quality rule is altered. "
                  "builder opencomp.py sha256 " + sha)
    print("  builder sha256 : %s  (UNEDITED)" % sha)
    print("  example two-arm query, %s:" % sorted(k2)[0])
    print("    %s" % two_arm(sorted(k2)[0])[:300])
    print("")
    O.build()


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8",
                                  errors="replace", line_buffering=True)
    main()
