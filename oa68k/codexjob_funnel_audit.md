# JOB: independently re-derive the publishable funnel and the 155-object disposition

Offline only. No network in your sandbox; do not attempt any fetch.

## Inputs (read-only)
F1 F:\claude-temp\pend\opencomp_frame_cardiology.jsonl
F2 F:\claude-temp\pend\opencomp_frame_id24pmid.jsonl
F3 F:\claude-temp\pend\opencomp_frame_k4.jsonl
F4 F:\claude-temp\pend\opencomp_frame_all.jsonl
E  F:\claude-temp\pend\codexjob2\corpus_topics.json      (155 topic objects)

## Definitions -- use EXACTLY these, do not invent your own
RULED JOIN: a paper-topic pair counts iff, restricting overlap_detail[topic].key_used to
  the keys {"nct","cited_pmid"}, the number of such trials is >=2 AND >=50% of that
  topic's k. Only rows with eligible_comparator == true are considered.
EXAMINED: rows whose disposition == "EXAMINED".
COMPARATOR: a distinct pmid. TOPIC: a distinct matched topic name. PAIR: a (pmid,topic).

## Compute and report
A. Per frame: candidates(rows), examined, comparators, topics, pairs.
B. UNION across the four frames: distinct comparators, distinct topics, total pairs, and
   the SUM of per-frame comparators. ⛔ Report the SUM and the UNION as separate numbers and
   state plainly which is correct and why.
C. Any pmid eligible in MORE THAN ONE frame, and any pmid matched to >1 topic: list them
   with their frames and topics.
D. The 155-object disposition. Framed sets are the TOPICS KEYS of the four frames (derive
   them from the frames themselves, not from any list I give you). Report:
     framed_in_frames_1_3, framed_in_frame_4, excluded_by_name, k_lt_2, and their SUM.
   excluded_by_name is exactly these four, and say so:
     hiv-prep-injectable-review, olmesartan-htn, malaria-vaccine,
     menacyw-healthy-volunteers-auto-full-review
E. Partition identity per frame: EXCLUDED_DESIGN + EXCLUDED_NMA + EXCLUDED_NO_ENUMERATION
   + UNRETRIEVABLE + EXAMINED == candidates. Report pass/fail per frame.

## Output
Write JSON to C:\Projects\codexjob3\funnel_audit.json. If the write is denied, PRINT the
complete JSON to stdout and say so. Then print the funnel as a plain table.

## ⛔ KNOWN-ANSWER CONTROL -- print EXPECTED BESIDE OBSERVED for each. If you disagree with
## any, report the disagreement LOUDLY and treat your sweep as suspect. DO NOT adjust these.
C1 candidates: F1=802, F2=788, F3=1998, F4=2594, total=6182
C2 union comparators == 20
C3 union topics == 14
C4 union pairs == 24
C5 sum of per-frame comparators == 21   (i.e. exactly ONE pmid spans two frames)
C6 the double-frame pmid is 40998847 and it is matched to THREE ablation topics
C7 disposition sums to 155, with k_lt_2 == 37 and excluded_by_name == 4
C8 total examined across the four frames == 451

## ACCEPTANCE TEST -- iterate until all pass
A1 the JSON parses and contains all of A-E
A2 every control C1..C8 evaluated with expected AND observed printed
A3 union comparators <= sum of per-frame comparators, and the difference is explained by
   the list in C
A4 every frame's partition identity is evaluated

## Constraints
Read only; modify nothing under F:. Report every error you hit, including recovered ones.
State whether any set you report is EMPTY, since all([]) is True and a vacuous set passes
silently.
