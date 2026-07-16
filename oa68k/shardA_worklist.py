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


def build() -> list:
    titles, caps = _titles(), _captions()
    # Read the ledgers NOW. This is the whole point of the module: an "already
    # read" set computed earlier in the session is stale by dispatch time.
    done = {s for s, _ in (SH.seen_shard() | SH.owner_keys())}
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
    a = ap.parse_args()

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
    print("wrote %d manifests (batch size %d) -> %s" % (n, a.batch_size, a.out))
    print("first:", work[0]["topic"], work[0]["pmcid"], work[0]["fname"])
    print("last :", work[-1]["topic"], work[-1]["pmcid"], work[-1]["fname"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
