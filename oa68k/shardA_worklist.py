"""SHARD-A WORKLIST — decide which figures this lane reads next, and batch them.

WHY THIS IS A SCRIPT AND NOT A ONE-OFF. It was a one-off, and that caused a real
defect: the list was snapshotted once, the owner lane read four of the same
figures minutes later, and this lane paid for four vision calls it did not need.
A vision call is non-reproducible, so "already read" is a moving target that must
be re-read from disk IMMEDIATELY BEFORE EVERY DISPATCH — never inherited from a
list built earlier in the session.

WHAT KEEPS THE LANES APART. Shard B works the sorted-by-PMCID list TOP-DOWN
(Z->A). This lane works it BOTTOM-UP (ascending PMCID). Both lanes still check the
ledgers, because the split alone is not a guarantee — it only makes collisions
rare, and the ledger check is what makes them harmless.

PRIORITY. malaria -> TB -> NCD -> other, then ascending PMCID within a topic.
Topic is matched over the article title + the figure caption. `other` is not junk:
it is the rest of the corpus, and it is read once the named priorities drain.

Run:  python shardA_worklist.py --batch-size 4 --out <DIR>
      python shardA_worklist.py --stats        # what is left, by topic
"""
from __future__ import annotations

import argparse
import glob
import hashlib
import json
import os
import re
from collections import Counter

import config as C
import visionshard as SH
import visionstore as VS

FIGCACHE = os.path.join(C.DATA, "figcache")
FIGSCAN = os.path.join(C.DATA, f"figscan.{C.NODE}.jsonl")
SEEDS = ("seed.jsonl", "seed_dta.jsonl", "seed_oa_rct.jsonl")

# ---- THE RESERVATION LOG. Measured cost of not having one: 26 of 96 dispatched
# reads (27%) were duplicates — real vision calls spent to get a SECOND answer to
# a question already asked.
#
# Re-reading the ledger before every dispatch is NECESSARY BUT NOT SUFFICIENT: a
# figure handed to a worker 5 minutes ago is not in the ledger yet (the worker is
# still looking at it), so the next wave's worklist happily hands it out again.
# The ledger records what is FINISHED; it cannot see what is IN FLIGHT.
#
# Because the sort is deterministic, this failure is not random — the next wave
# re-lists the SAME top-of-list figures. Generating 240 manifests and dispatching
# 32 made it certain: the 208 undispatched stayed unread, so the next regeneration
# reproduced them, and the overlap was structural rather than unlucky.
#
# So dispatch must CLAIM a figure at manifest time, not at ingest time. This log
# is that claim. It is append-only and never pruned: a claim that expires is a
# claim that lets the duplicate back in, and a re-read is not free — it returns a
# DIFFERENT answer for the same pixels.
RESERVED = os.path.join(C.DATA, "_shardA_reserved.txt")

# Topic patterns. British `ae` spellings need `a?e`, not `[ae]`: the char class
# matches exactly ONE of a/e, so `an[ae]mia` SILENTLY MISSES "anaemia" (which has
# both). Any regex over UK-spelled medical text has this trap.
MALARIA = re.compile(r"malaria|plasmodium|falciparum|artemisin|antimalarial|"
                     r"vivax|insecticide.treated net|mosquito net", re.I)
TB = re.compile(r"tubercul|mycobacterium|rifampic|isoniazid|MDR-TB|"
                r"bedaquiline|\bBCG\b", re.I)
NCD = re.compile(r"diabet|hypertens|cardiovascular|stroke|obesity|cancer|COPD|"
                 r"asthma|chronic kidney|heart failure|dyslipid|myocardial|"
                 r"blood pressure|statin|ana?emia|isch[ae]mic", re.I)
PRIORITY = {"malaria": 0, "TB": 1, "NCD": 2, "other": 3}


def _titles() -> dict:
    out = {}
    for name in SEEDS:
        p = os.path.join(C.DATA, name)
        if not os.path.exists(p):
            continue
        with open(p, encoding="utf-8") as fh:
            for ln in fh:
                ln = ln.strip()
                if not ln:
                    continue
                try:
                    r = json.loads(ln)
                except Exception:
                    continue
                if r.get("pmcid"):
                    out[r["pmcid"]] = r.get("title") or ""
    return out


def _captions() -> dict:
    """(pmcid, lowercased basename) -> figscan's caption + fig_id."""
    out = {}
    if not os.path.exists(FIGSCAN):
        return out
    with open(FIGSCAN, encoding="utf-8") as fh:
        for ln in fh:
            ln = ln.strip()
            if not ln:
                continue
            try:
                r = json.loads(ln)
            except Exception:
                continue
            for f in r.get("figs") or []:
                for g in f.get("graphic_hrefs") or []:
                    out[(r["pmcid"], os.path.basename(g).lower())] = {
                        "cap": f.get("caption") or "",
                        "fig_id": f.get("fig_id"),
                        "kind": f.get("kind"),
                    }
    return out


def topic_of(text: str) -> str:
    if MALARIA.search(text):
        return "malaria"
    if TB.search(text):
        return "TB"
    if NCD.search(text):
        return "NCD"
    return "other"


def reserved() -> set:
    if not os.path.exists(RESERVED):
        return set()
    with open(RESERVED, encoding="utf-8") as fh:
        return {l.strip() for l in fh if l.strip()}


def reserve(shas) -> None:
    """Claim these figures BEFORE a worker is dispatched at them."""
    with open(RESERVED, "a", encoding="utf-8") as fh:
        for s in shas:
            fh.write(s + "\n")
        fh.flush()
        os.fsync(fh.fileno())


def build() -> list:
    titles, caps = _titles(), _captions()
    # Read the ledgers NOW — an "already read" set computed earlier in the
    # session is stale by dispatch time. Then UNION the reservation log, which
    # covers the gap the ledger cannot: figures currently in flight.
    done = {s for s, _ in (SH.seen_shard() | SH.owner_keys())} | reserved()
    out = []
    for p in glob.glob(os.path.join(FIGCACHE, "*", "*")):
        if os.path.splitext(p)[1].lower() not in (".jpg", ".jpeg", ".png", ".gif"):
            continue
        pmcid = os.path.basename(os.path.dirname(p))
        fname = os.path.basename(p)
        m = caps.get((pmcid, fname.lower()), {})
        with open(p, "rb") as fh:
            sha = hashlib.sha256(fh.read()).hexdigest()
        if sha in done:
            continue
        title = titles.get(pmcid) or ""
        out.append({
            "path": os.path.abspath(p), "pmcid": pmcid, "fname": fname,
            "sha": sha, "bytes": os.path.getsize(p),
            "fig_id": m.get("fig_id"), "cap": m.get("cap", ""),
            "title": title, "topic": topic_of(title + " " + m.get("cap", "")),
        })
    # Ascending PMCID = the BOTTOM of the Z->A list, away from shard B.
    out.sort(key=lambda i: (PRIORITY[i["topic"]], i["pmcid"], i["fname"]))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--batch-size", type=int, default=4)
    ap.add_argument("--out", help="write batch_NNN.json manifests here")
    ap.add_argument("--start", type=int, default=0, help="first batch number")
    ap.add_argument("--limit", type=int, help="max figures to batch")
    ap.add_argument("--stats", action="store_true")
    ap.add_argument("--no-reserve", action="store_true",
                    help="plan without claiming. For inspection only — a wave "
                         "dispatched from unreserved manifests WILL collide with "
                         "the next wave.")
    ap.add_argument("--release", metavar="DIR",
                    help="un-claim the figures in DIR's manifests. ONLY for "
                         "manifests that were generated and never dispatched — "
                         "releasing an in-flight figure re-creates the duplicate.")
    a = ap.parse_args()

    if a.release:
        keep = reserved()
        drop = set()
        for f in glob.glob(os.path.join(a.release, "batch_*.json")):
            for it in json.load(open(f, encoding="utf-8")):
                drop.add(it["sha"])
        # Never release something already read — that claim is now permanent.
        done = {s for s, _ in (SH.seen_shard() | SH.owner_keys())}
        drop -= done
        with open(RESERVED, "w", encoding="utf-8") as fh:
            for s in sorted(keep - drop):
                fh.write(s + "\n")
        print("released %d claims (%d kept; %d refused as already-read)"
              % (len(drop), len(keep - drop), len(done & drop)))
        return 0

    work = build()
    print("unread figures on disk:", len(work))
    print("by topic:", dict(Counter(i["topic"] for i in work)))
    print("by topic (articles):",
          dict(Counter({i["pmcid"]: i["topic"] for i in work}.values())))
    if a.stats or not a.out:
        return 0

    if a.limit:
        work = work[:a.limit]
    os.makedirs(a.out, exist_ok=True)
    n = 0
    for i in range(0, len(work), a.batch_size):
        b = work[i:i + a.batch_size]
        with open(os.path.join(a.out, "batch_%03d.json" % (a.start + n)),
                  "w", encoding="utf-8") as fh:
            json.dump(b, fh, indent=1)
        n += 1
    # Claim them NOW, at manifest time. Reserving at ingest time is too late —
    # that is precisely the window the duplicates walked through.
    #
    # ONLY GENERATE WHAT YOU WILL DISPATCH. Manifests written and never handed to
    # a worker are the worst case: reserved (so nobody reads them) but unread (so
    # they are silently dropped from the corpus). --limit must match the wave you
    # are actually about to launch.
    if not a.no_reserve:
        reserve([i["sha"] for i in work])
        print("reserved %d figures -> %s" % (len(work), RESERVED))
        print("  ^ these are now CLAIMED. Dispatch every manifest you just made,")
        print("    or they are reserved-but-unread and drop out of the corpus.")
    print("wrote %d manifests (batch size %d) -> %s" % (n, a.batch_size, a.out))
    print("first:", work[0]["topic"], work[0]["pmcid"], work[0]["fname"])
    print("last :", work[-1]["topic"], work[-1]["pmcid"], work[-1]["fname"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
