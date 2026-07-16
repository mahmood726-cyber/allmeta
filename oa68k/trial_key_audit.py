"""TRIAL-LAYER key audit — the honest DATA-ABSENT vs KEY-ABSENT test.

Pre-registered in PREREG-trial-key-audit.md (frozen BEFORE running; refutation
criterion: <10% KEY-ABSENT refutes the key-widening hypothesis as a major lever,
>=30% confirms).

Unit = the CITED TRIAL PAPER, reached via the meta's reference list — not the meta's
prose (that earlier test measured the wrong layer and is void).

Instrument = PubMed `<DataBankList>`: a CURATED registration field naming the registry
and accession, batched <=200 ids/request. Strictly better than a regex over prose, and
it names non-CT.gov registries explicitly (ISRCTN / PACTR / CTRI / ChiCTR / ...).

Open access only: PubMed E-utilities, AACT. Nothing paywalled, no scraping.
Rate: this shares KEY A's 10 req/s with three harvest shards, so it runs at a small
fixed slice and batches 200 ids per call (400 papers = 2 calls).
"""
from __future__ import annotations

import argparse
import json
import os
import re
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict

import config as C
import jats
import registry_ids as R
from net import PoliteSession, RateLimiter
from linkmap import LinkMap
from keyaudit import disease_of

EFETCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
TRIAL_PT = re.compile(r"randomized controlled trial|clinical trial|controlled clinical trial",
                      re.IGNORECASE)


def fetch_pubmed(sess: PoliteSession, pmids: list[str]) -> dict:
    """{pmid: {pub_types, databanks{name:[acc]}, abstract, year}} — batched."""
    out: dict[str, dict] = {}
    for i in range(0, len(pmids), 200):
        chunk = pmids[i:i + 200]
        r = sess.get(EFETCH, params={"db": "pubmed", "id": ",".join(chunk),
                                     "retmode": "xml"})
        if r.status_code != 200:
            continue
        try:
            root = ET.fromstring(r.content)
        except ET.ParseError:
            continue
        for art in root.iter("PubmedArticle"):
            pid_el = art.find(".//PMID")
            if pid_el is None:
                continue
            pid = (pid_el.text or "").strip()
            pts = [(e.text or "") for e in art.iter("PublicationType")]
            banks: dict[str, list[str]] = defaultdict(list)
            for db in art.iter("DataBank"):
                nm = db.find("DataBankName")
                if nm is None:
                    continue
                for acc in db.iter("AccessionNumber"):
                    banks[(nm.text or "").strip()].append((acc.text or "").strip())
            abst = " ".join((e.text or "") for e in art.iter("AbstractText"))
            yr = art.find(".//PubDate/Year")
            out[pid] = {"pub_types": pts, "databanks": dict(banks),
                        "abstract": abst, "year": (yr.text if yr is not None else None)}
    return out


def ref_pmids_of_metas(limit_metas: int) -> list[tuple[str, list[str]]]:
    """[(pmcid, [ref_pmids])] streamed from the harvest ledger."""
    out = []
    for hpath in C.node_ledgers("harvest"):
        with open(hpath, encoding="utf-8") as f:
            for line in f:
                if len(out) >= limit_metas:
                    return out
                rec = json.loads(line)
                if rec.get("status") != "XML" or rec.get("tier") != "efetch_pmc_jats":
                    continue
                p = rec.get("path")
                if not p or not os.path.exists(p):
                    continue
                with open(p, "rb") as xf:
                    raw = xf.read()
                pm = jats.ref_pmids(raw)
                if pm:
                    out.append((rec.get("pmcid"), sorted(pm), jats.all_text(raw)[:4000]))
    return out


def run(sample: int, meta_scan: int) -> None:
    lm = LinkMap()
    print(f"[trial_key_audit] {lm.describe()}")
    metas = ref_pmids_of_metas(meta_scan)
    print(f"[trial_key_audit] scanned {len(metas)} metas with reference PMIDs")

    # eligible = cited PMID with NO NCT via study_references
    eligible: list[str] = []
    pmid_disease: dict[str, list[str]] = {}
    seen = set()
    for pmcid, pmids, text in metas:
        d = disease_of(text)
        for pm in pmids:
            if pm in seen:
                continue
            seen.add(pm)
            if not lm.ncts_for([pm]):          # our join misses it
                eligible.append(pm)
                pmid_disease[pm] = d
            if len(eligible) >= sample:
                break
        if len(eligible) >= sample:
            break
    print(f"[trial_key_audit] {len(eligible)} cited PMIDs with NO NCT link (our misses)")

    # small fixed slice of KEY A: harvest shards own the rest
    sess = PoliteSession(limiter=RateLimiter(0.7))
    recs = fetch_pubmed(sess, eligible)
    print(f"[trial_key_audit] fetched {len(recs)} PubMed records\n")

    cls = Counter()
    banks = Counter()
    by_dis = defaultdict(Counter)
    era = Counter()
    examples = []
    trials = 0
    for pm, r in recs.items():
        is_trial = any(TRIAL_PT.search(t) for t in r["pub_types"])
        if not is_trial:
            cls["NOT-A-TRIAL"] += 1
            continue
        trials += 1
        nonnct = {k: v for k, v in r["databanks"].items()
                  if "clinicaltrials" not in k.lower()}
        txt_ids = R.find_all(r["abstract"] or "")
        txt_nonnct = {k: v for k, v in txt_ids.items() if k != "NCT"}
        has_nonnct = bool(nonnct or txt_nonnct)
        c = "KEY-ABSENT" if has_nonnct else "DATA-ABSENT"
        cls[c] += 1
        for k in list(nonnct) + list(txt_nonnct):
            banks[k] += 1
        for d in pmid_disease.get(pm, ["other"]):
            by_dis[d][c] += 1
        y = r.get("year")
        if y and y.isdigit():
            era["pre-2005" if int(y) < 2005 else "2005+"] += 1
        if c == "KEY-ABSENT" and len(examples) < 8:
            examples.append((pm, list(nonnct) or list(txt_nonnct), pmid_disease.get(pm)))

    print(f"=== TRIAL-LAYER audit: {trials} cited TRIAL papers our NCT join misses ===\n")
    for k in ("KEY-ABSENT", "DATA-ABSENT"):
        pct = cls[k] / max(trials, 1)
        print(f"  {cls[k]:>5,}  {pct:6.2%}  {k}")
    print(f"  ({cls['NOT-A-TRIAL']:,} cited papers were not trials — excluded)")

    ka = cls["KEY-ABSENT"] / max(trials, 1)
    print(f"\n=== PRE-SPECIFIED VERDICT (criterion frozen before looking) ===")
    if ka >= 0.30:
        v = "CONFIRMED — key-widening is a major lever"
    elif ka < 0.10:
        v = "REFUTED as a major lever — misses are mostly genuinely unregistered"
    else:
        v = "PARTIAL — worth doing, not the main story"
    print(f"  KEY-ABSENT = {ka:.2%}  ->  {v}")

    if banks:
        print(f"\n=== non-NCT registries found ===")
        for k, v in banks.most_common():
            print(f"  {k:22} {v}")
    if era:
        print(f"\n=== era of the missed trials (pre-2005 = pre-registration-mandate) ===")
        for k, v in era.most_common():
            print(f"  {k:10} {v:>5,}  {v/sum(era.values()):6.2%}")
    print(f"\n=== by disease (small n labelled, not interpreted) ===")
    for d in ("malaria", "TB", "NCD", "other"):
        c = by_dis.get(d)
        if not c:
            continue
        t = sum(c.values())
        flag = "  [n too small to interpret]" if t < 30 else ""
        print(f"  {d:8} n={t:>4}  KEY-ABSENT={c['KEY-ABSENT']/t:6.2%}{flag}")
    if examples:
        print(f"\n=== KEY-ABSENT examples ===")
        for pm, bk, d in examples:
            print(f"  PMID {pm:10} {','.join(bk):28} {d}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=400)
    ap.add_argument("--meta-scan", type=int, default=300)
    a = ap.parse_args()
    run(a.sample, a.meta_scan)
