"""DISPATCH PLANNER — emit the next N un-read figures, collision-safe.

WHY THIS EXISTS (the 2026-07-16 shard collision, recorded so it is not relearned):
Shard A and shard B were given TWO ordering rules that contradict each other:

    (1) "A works bottom-up (Z->A), B works top-down (A->Z)"  -- anti-collision
    (2) "PRIORITISE MALARIA, TB, NCD"                        -- value ordering

Both lanes obeyed (2) first, because it was the louder instruction. (2) is a
CONTENT order and (1) is a POSITIONAL order; when they disagree, both lanes
resolve it identically and therefore land on the SAME figures — and not just any
figures, the scarcest, highest-value ones. Two lanes paid twice for TB Fig3/Fig4
and malaria Fig2/Fig3. The (sha, role) guard refused the double WRITE, but a
write-time guard fires AFTER the call is bought. Convention did not prevent it;
only checking the other lane's file can.

    A CONVENTION IS NOT A LOCK. Read the other shard, every wave, before
    spending. It is a file on disk and it costs a millisecond.

THE DUPLICATES ARE NOT WASTE — DO NOT LET A MERGE EAT THEM. Two independent
vision reads of the same 4 images is INTER-READER AGREEMENT DATA, which is the
only direct evidence we have of whether a vision read is reproducible. It is the
one thing a single-read-per-image store can never produce. Keep both; compare
them; report the disagreement rate. `compare_dupes.py` does this.

Usage: python nextbatch.py --n 24 --size 3
"""
from __future__ import annotations

import argparse
import glob
import json
import os

STORE = os.path.join("data", "visionstore")


def covered() -> tuple:
    """Every image sha already read by ANY lane, plus each lane's footprint.

    Unions owner + shard A + shard B. Never trust the convention that says the
    other lane is elsewhere — look."""
    shas, by_lane = set(), {}
    for f in sorted(glob.glob(os.path.join(STORE, "calls*.jsonl"))):
        lane = os.path.basename(f)
        for line in open(f, encoding="utf-8"):
            line = line.strip()
            if not line:
                continue
            try:
                r = json.loads(line)
            except Exception:
                continue          # a corrupt line must not hide the rest
            shas.add(r["image_sha256"])
            by_lane.setdefault(lane, set()).add(
                (r.get("source_id") or "").split("#")[0])
    return shas, by_lane


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=24, help="figures to plan")
    ap.add_argument("--size", type=int, default=3, help="figures per subagent")
    ap.add_argument("--start", type=int, default=0)
    ap.add_argument("--claim", action="store_true",
                    help="record the planned figures as in-flight")
    # TERRITORY BY OBSERVED BEHAVIOUR, NOT BY STATED RULE.
    # 2026-07-16 22:29: shard A's ledger shows 20 images, ALL of them TB/MALARIA/
    # NCD, timestamped in exactly that order. A is NOT sweeping bottom-up; it is
    # following the same "PRIORITISE MALARIA, TB, NCD" instruction we were given,
    # which deterministically overrides the positional A-bottom/B-top split and
    # marches both lanes onto the same figures. 8 images were already paid for
    # twice before this was noticed.
    #   => The uncontested space is the COMPLEMENT of A's priority order: OTHER.
    #      A has ~179 NCD figures to chew before it reaches OTHER at all.
    # Honour "do not collide" against what the other lane DOES, not what the brief
    # says it does. Re-check `covered()` every wave: this inference is behavioural
    # and A can change course without telling us.
    ap.add_argument("--topic", default=None,
                    help="restrict to one topic (OTHER = the lane A reaches last)")
    ap.add_argument("--emit-prompts", action="store_true",
                    help="print copy-ready subagent prompts (never retype a path)")
    ap.add_argument("--tag", default="batch",
                    help="output file prefix for the emitted prompts")
    a = ap.parse_args()

    shas, by_lane = covered()

    # IN-FLIGHT IS NOT YET ON DISK. A dispatched subagent has bought its call but
    # written nothing, so `covered()` cannot see it and the planner will happily
    # hand the same figure to a second agent — self-collision, the same bug as the
    # cross-shard one, inside a single lane. Claim work at DISPATCH time, not at
    # write time. data/_inflight.json is that claim.
    inflight = set()
    if os.path.exists("data/_inflight.json"):
        inflight = {os.path.normcase(p)
                    for p in json.load(open("data/_inflight.json", encoding="utf-8"))}

    rows = json.load(open("data/_worklist_todo.json", encoding="utf-8"))
    # SHARD B TERRITORY = the TOP of the A->Z sort, ascending. Positional only.
    # The topic priority (TB/malaria) is DELIBERATELY NOT APPLIED here: applying
    # it is what walked us into A's lane. TB+malaria are already covered across
    # both shards, so the value ordering has nothing left to buy — and if it did,
    # it would need to be negotiated with A, not assumed.
    rows.sort(key=lambda r: (r["pmcid"], r["fn"]))
    todo = [r for r in rows
            if r["sha"] not in shas
            and os.path.normcase(r["path"]) not in inflight
            and (a.topic is None or r.get("topic") == a.topic)]

    print("=== LANE FOOTPRINTS (read from disk, not assumed) ===")
    for lane, pms in sorted(by_lane.items()):
        p = sorted(x for x in pms if x)
        print("  %-24s %3d pmcids  %s .. %s" % (lane, len(p),
              p[0] if p else "-", p[-1] if p else "-"))
    print("covered images: %d | in-flight: %d | remaining: %d\n"
          % (len(shas), len(inflight), len(todo)))

    todo = todo[a.start:a.start + a.n]
    for i in range(0, len(todo), a.size):
        b = todo[i:i + a.size]
        n = i // a.size
        # EVERY PATH RE-STAT'ED AT EMIT TIME. The work list was built earlier and
        # the disk is the authority now, not that snapshot.
        for r in b:
            if not os.path.exists(r["path"]):
                raise SystemExit("PLANNED FIGURE MISSING FROM DISK: %s" % r["path"])
        if not a.emit_prompts:
            print("--- BATCH %02d ---" % n)
            for r in b:
                print("%s   (pmcid=%s)" % (r["path"], r["pmcid"]))
            continue
        # EMIT THE PROMPT VERBATIM SO THE ORCHESTRATOR COPIES INSTEAD OF COMPOSING.
        # 2026-07-17: I hand-typed two figure paths into a dispatch prompt from a
        # truncated listing and INVENTED them — wrong journal, wrong article, files
        # that do not exist. The subagent caught it and refused to substitute
        # ("no object was written rather than guessing a substitute file"). That is
        # the same imputation this project bans in readers, committed one layer up
        # by the orchestrator. A human-in-the-loop retyping paths IS a paraphraser
        # between the plan and the work. Machine-generate the prompt; copy it.
        print("=" * 70)
        print("### BATCH %02d -> data/_visionraw/%s_%02d.json" % (n, a.tag, n))
        print("Read F:\\allmeta\\oa68k\\VISION-SPEC.md FIRST and follow it EXACTLY, "
              "including the MANDATORY ZOOM protocol at the top (crop to "
              "panels/row-bands sized to land at ~2000px — the renderer silently "
              "downscales anything larger, so whole-figure upscaling buys ~3x at "
              "most).\n\nFIGURES:")
        for j, r in enumerate(b, 1):
            print("%d. %s   (pmcid=%s)" % (j, r["path"], r["pmcid"]))
        print("\nOUTPUT FILE: F:\\allmeta\\oa68k\\data\\_visionraw\\%s_%02d.json"
              % (a.tag, n))
        print('\nSet "image_file" to the BASENAME only, and "read_method" to the '
              "EFFECTIVE zoom achieved. Reply with ONLY the receipt line plus a "
              "one-line note of what you abstained on. Do not paste the JSON.")

    if a.claim and todo:
        # Claim BEFORE the agents are spawned, so the next planner run — even one
        # racing this one — cannot re-hand these out.
        cur = []
        if os.path.exists("data/_inflight.json"):
            cur = json.load(open("data/_inflight.json", encoding="utf-8"))
        json.dump(sorted(set(cur) | {r["path"] for r in todo}),
                  open("data/_inflight.json", "w", encoding="utf-8"), indent=1)
        print("\nCLAIMED %d figures as in-flight." % len(todo))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
