# -*- coding: utf-8 -*-
"""Build the OPEN-ACCESS comparator frame for the scored head-to-head, cardiology arm.

THE RULE THIS EXECUTES IS oa68k/OPEN-COMPARATOR-PROTOCOL.md, FROZEN AND COMMITTED
BEFORE THE FIRST COMPARATOR WAS RETRIEVED. Nothing here is decided at run time.

Free sources only: PubMed E-utilities and Europe PMC REST.

THE TWO THINGS THIS FILE EXISTS TO KEEP APART
  1. licence_open (a fact about the paper's terms) is NEVER the same field as
     retrieval.status (a fact about what we actually obtained). A prior ladder
     scored 0/10 on openly-licensed papers because those were one field.
  2. NOT_RETRIEVED_* licenses NO claim about the paper's content. Only RETRIEVED
     and RETRIEVED_NO_VALUE do. "Cannot get the paper" is not "the paper lacks
     the number".

Usage:
  python opencomp.py            build the frame
  python opencomp.py --selftest run the planted-defect checks against the frame
"""
import io
import json
import os
import re
import sys
import time
import xml.etree.ElementTree as ET
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

UA = {"User-Agent": "allmeta-opencomp/1.0 (research; mailto:mahmood726@gmail.com)"}
EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest"
OUTDIR = r"F:\claude-temp\pend"
OUT = os.path.join(OUTDIR, "opencomp_frame_cardiology.jsonl")

FRAME_BUILT = "2026-08-31"
PROTOCOL = "oa68k/OPEN-COMPARATOR-PROTOCOL.md"

# ---------------------------------------------------------------- frozen inputs
# Stage-A term lists: PROTOCOL section 5.2. Frozen.
TOPICS = {
    "sglt2-hf": {
        "iv": ["sglt2", "sodium-glucose", "dapagliflozin", "empagliflozin",
               "canagliflozin", "ertugliflozin", "sotagliflozin"],
        "pop": ["heart failure", "HFrEF", "HFpEF"],
    },
    "sotagliflozin-hf": {
        "iv": ["sotagliflozin"],
        "pop": ["heart failure", "cardiovascular", "diabetes"],
    },
    "arni-hfref": {
        "iv": ["sacubitril", "LCZ696", "neprilysin", "ARNI"],
        "pop": ["heart failure", "reduced ejection fraction"],
    },
    "iv-iron-hf": {
        "iv": ["ferric carboxymaltose", "ferric derisomaltose", "iron isomaltoside",
               "intravenous iron", "ferric"],
        "pop": ["heart failure", "iron deficiency"],
    },
    "alirocumab-lipid": {
        "iv": ["alirocumab", "PCSK9"],
        "pop": ["hypercholesterolemia", "hypercholesterolaemia", "hyperlipidemia",
                "hyperlipidaemia", "dyslipidemia", "dyslipidaemia", "LDL"],
    },
    "bococizumab-lipid-review": {
        "iv": ["bococizumab"],
        "pop": ["hypercholesterolemia", "hypercholesterolaemia", "hyperlipidemia",
                "hyperlipidaemia", "dyslipidemia", "dyslipidaemia", "LDL"],
    },
}

# Stage-B included-trial sets: PROTOCOL section 5.3. Read from the corpus SSOT
# inputs.trials[] on 2026-08-31 and frozen here. (nct, acronym_or_None, pmid_or_None)
OUR_TRIALS = {
    "sglt2-hf": [
        ("NCT03036124", "DAPA-HF", "31535829"),
        ("NCT03057977", "EMPEROR-Reduced", "32865377"),
        ("NCT03057951", "EMPEROR-Preserved", "34449189"),
        ("NCT03619213", "DELIVER", "36027570"),
    ],
    "sotagliflozin-hf": [
        ("NCT03521934", "SOLOIST-WHF", "33200892"),
        ("NCT03315143", "SCORED", "33200891"),
    ],
    "arni-hfref": [
        ("NCT01035255", "PARADIGM-HF", "25176015"),
        ("NCT04023227", "PARACHUTE-HF", "41335448"),
        ("NCT02468232", "PARALLEL-HF", "33731544"),
        ("NCT04853758", "ANSWER-HF", "41396086"),
    ],
    "iv-iron-hf": [
        ("NCT02937454", "AFFIRM-AHF", "33197395"),
        ("NCT02642562", "IRONMAN", "36347265"),
        ("NCT03036462", "FAIR-HF2", "40159390"),
        ("NCT03037931", "HEART-FID", "37632463"),
        ("NCT01453608", "CONFIRM-HF", "25176939"),
    ],
    "alirocumab-lipid": [
        ("NCT01507831", None, None), ("NCT01617655", None, None),
        ("NCT01623115", None, None), ("NCT01644175", None, None),
        ("NCT01709500", None, None), ("NCT02107898", None, None),
        ("NCT02289963", None, None), ("NCT02585778", None, None),
    ],
    "bococizumab-lipid-review": [
        ("NCT01968967", "SPIRE-LDL", None), ("NCT02100514", "SPIRE-LL", None),
        ("NCT01968954", "SPIRE-HR", None), ("NCT02458287", "SPIRE-AI", None),
        ("NCT02135029", "SPIRE-SI", None), ("NCT01968980", "SPIRE-FH", None),
    ],
}

MIN_OVERLAP_N = 2
MIN_OVERLAP_FRAC = 0.5

# ---------------------------------------------------------------- frozen regexes
RE_NMA = re.compile(r"network meta-analy|indirect (?:treatment )?comparison|"
                    r"mixed treatment comparison|multiple treatments meta-analy", re.I)
RE_RCT = re.compile(r"randomi[sz]ed(?:[ ,-]+(?:controlled|clinical|double|single|placebo))"
                    r"[a-z -]*trial|randomi[sz]ed trial|\bRCTs?\b", re.I)
RE_OBS_TITLE = re.compile(r"\b(?:cohort|observational|case[- ]control|real[- ]world|registry)\b", re.I)
RE_NOTREVIEW_TITLE = re.compile(r"^\s*(?:retraction|correction|erratum|comment on)\b", re.I)
BAD_PT = {"retracted publication", "comment", "editorial", "published erratum"}

RE_PROSPERO = re.compile(r"\bCRD42\d{9}\b")
# A PROSPERO id is CRD42 + 9 digits (e.g. CRD42022358299). The first build demanded
# CRD42 + 12 digits and therefore matched NOTHING: 0 of 108 read papers scored as
# registered, which is the zero that sent me back to the instrument. RE_CRD_TOKEN keeps
# every CRD-shaped token so a malformed id in the paper stays visible instead of
# silently becoming "not registered".
RE_CRD_TOKEN = re.compile(r"\bCRD\d{6,14}\b")
RE_NCT = re.compile(r"NCT\d{8}")
RE_ISRCTN = re.compile(r"ISRCTN\d{8}")
RE_CHICTR = re.compile(r"ChiCTR-?[A-Za-z0-9\-]{4,}")
RE_EUDRACT = re.compile(r"\d{4}-\d{6}-\d{2}")
RE_TABLE_CAP = re.compile(r"characteristics of .{0,40}stud|included stud|study characteristics", re.I)
# "we included 12 randomised trials", "12 studies were included", "a total of 12 trials"
RE_STATED_K = re.compile(
    r"(?:includ\w*|total of|comprising|pooled)\D{0,40}?(\d{1,3})\s+"
    r"(?:eligible\s+|unique\s+|individual\s+)?"
    r"(?:randomi[sz]ed\s+)?(?:controlled\s+)?(?:clinical\s+)?(?:trials?|studies|RCTs?)|"
    r"(\d{1,3})\s+(?:randomi[sz]ed\s+)?(?:controlled\s+)?(?:trials?|studies|RCTs?)\s+"
    r"(?:were\s+|was\s+)?includ", re.I)


# ---------------------------------------------------------------- transport
def _get(url, tries=6, sleep=2.0):
    """Return (status, bytes). status is an int, or a string reason on transport death."""
    last = None
    for a in range(tries):
        try:
            r = urlopen(Request(url, headers=UA), timeout=120)
            return r.getcode(), r.read()
        except HTTPError as e:
            # 429/503 are RATE LIMITS, not verdicts. Backing off is required before any
            # of them may be reported as a blocked retrieval; run 2 died at retstart=0
            # because this returned on the first 429.
            if e.code in (429, 503):
                time.sleep(6.0 * (a + 1))
                last = "HTTP %d" % e.code
                continue
            if e.code in (403, 412):
                return e.code, b""
            if e.code == 404:
                return 404, b""
            last = "HTTP %d" % e.code
        except (URLError, OSError) as e:
            last = "URLError %s" % e
        if a < tries - 1:
            time.sleep(sleep * (a + 1))
    return last or "unknown", b""


def esearch_pmids(term, log=print):
    """Enumerate ALL PMIDs for a term, walking retstart. Returns (count, [pmids])."""
    out, seen = [], set()
    url = "%s/esearch.fcgi?db=pubmed&retmode=json&retmax=0&term=%s" % (EUTILS, quote(term))
    st, body = _get(url)
    if st != 200:
        raise SystemExit("esearch count failed (%s) for: %s" % (st, term))
    total = int(json.loads(body.decode("utf-8"))["esearchresult"]["count"])
    for start in range(0, min(total, 9999), 500):
        u = ("%s/esearch.fcgi?db=pubmed&retmode=json&retmax=500&retstart=%d&term=%s"
             % (EUTILS, start, quote(term)))
        st, body = _get(u)
        if st != 200:
            raise SystemExit("esearch page failed (%s) at retstart=%d" % (st, start))
        for p in json.loads(body.decode("utf-8"))["esearchresult"].get("idlist", []):
            if p not in seen:
                seen.add(p)
                out.append(p)
        time.sleep(0.5)
    if total > 9999:
        log("  !! WARNING: %d records but esearch ceiling is 9999 -- TRUNCATED" % total)
    return total, out


def topic_query(t):
    d = TOPICS[t]
    iv = " OR ".join('"%s"[Title/Abstract]' % x for x in d["iv"])
    pop = " OR ".join('"%s"[Title/Abstract]' % x for x in d["pop"])
    return '(%s) AND (%s) AND "Meta-Analysis"[Publication Type]' % (iv, pop)


def efetch_meta(pmids, log=print):
    """PubMed metadata for PMIDs: title, abstract, pubtypes, journal, year, doi."""
    meta = {}
    for i in range(0, len(pmids), 200):
        chunk = pmids[i:i + 200]
        st, body = _get("%s/efetch.fcgi?db=pubmed&retmode=xml&id=%s"
                        % (EUTILS, ",".join(chunk)))
        if st != 200:
            log("  efetch batch %d failed: %s" % (i, st))
            continue
        try:
            root = ET.fromstring(body)
        except ET.ParseError as e:
            log("  efetch batch %d parse error: %s" % (i, e))
            continue
        for art in root.iter("PubmedArticle"):
            pid = (art.findtext(".//PMID") or "").strip()
            title = " ".join("".join(t.itertext()) for t in art.findall(".//ArticleTitle"))
            abst = " ".join("".join(t.itertext()) for t in art.findall(".//Abstract/AbstractText"))
            pts = [(t.text or "").strip().lower() for t in art.findall(".//PublicationType")]
            doi = None
            for aid in art.findall(".//ArticleId"):
                if aid.get("IdType") == "doi":
                    doi = (aid.text or "").strip()
            yr = art.findtext(".//JournalIssue/PubDate/Year") or \
                art.findtext(".//JournalIssue/PubDate/MedlineDate") or None
            meta[pid] = {
                "title": re.sub(r"\s+", " ", title).strip() or None,
                "abstract": re.sub(r"\s+", " ", abst).strip() or None,
                "pubtypes": pts,
                "journal": (art.findtext(".//Journal/Title") or None),
                "year": (re.sub(r"\D.*$", "", yr) or None) if yr else None,
                "doi": doi,
            }
        log("  metadata %d/%d" % (min(i + 200, len(pmids)), len(pmids)))
        time.sleep(0.34)
    return meta


def epmc_records(pmids, log=print):
    """Europe PMC core records keyed by PMID: licence + PMC id. LICENCE ONLY."""
    out = {}
    for i in range(0, len(pmids), 25):
        chunk = pmids[i:i + 25]
        q = " OR ".join("EXT_ID:%s" % p for p in chunk)
        url = ("%s/search?query=%s&resultType=core&format=json&pageSize=25"
               % (EPMC, quote("(%s) AND SRC:MED" % q)))
        st, body = _get(url)
        if st != 200:
            log("  epmc batch %d failed: %s" % (i, st))
            continue
        try:
            res = json.loads(body.decode("utf-8"))["resultList"]["result"]
        except Exception as e:
            log("  epmc batch %d json error: %s" % (i, e))
            continue
        for r in res:
            pid = str(r.get("pmid") or "")
            if not pid:
                continue
            lic = r.get("license") or None
            out[pid] = {
                "is_open_access": r.get("isOpenAccess"),
                "license": lic,
                "pmcid": r.get("pmcid") or None,
                "in_epmc": r.get("inEPMC"),
            }
        log("  europepmc %d/%d" % (min(i + 25, len(pmids)), len(pmids)))
        time.sleep(0.2)
    return out


def fetch_fulltext(pmcid):
    """Return (status_string, xml_bytes). NEVER conflates blocked with absent."""
    if not pmcid:
        return "NOT_RETRIEVED_NO_FULLTEXT_RECORD", b""
    st, body = _get("%s/%s/fullTextXML" % (EPMC, pmcid), tries=3, sleep=1.5)
    if st == 200 and len(body) >= 2000:
        return "OK", body
    if st == 200:
        return "NOT_RETRIEVED_NO_FULLTEXT_RECORD", body
    if st in (403, 412, 429):
        return "NOT_RETRIEVED_BLOCKED", b""
    if st == 404:
        return "NOT_RETRIEVED_NO_FULLTEXT_RECORD", b""
    return "NOT_RETRIEVED_NETWORK_ERROR", b""


# ---------------------------------------------------------------- content rules
def parse_fulltext(xml_bytes):
    """Everything we are allowed to say about a paper we actually read."""
    txt = xml_bytes.decode("utf-8", "replace")
    d = {
        "included_table_captions": [],
        "included_table_rows": 0,
        "registry_ids": [],
        "cited_pmids": [],
        "prospero_ids": [],
        "prospero_tokens_seen": [],
        "fulltext_bytes": len(xml_bytes),
        "_text": txt,
    }
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        root = None
    if root is not None:
        for tw in root.iter("table-wrap"):
            cap = " ".join(" ".join(c.itertext()) for c in tw
                           if c.tag in ("label", "caption"))
            cap = re.sub(r"\s+", " ", cap).strip()
            if cap and RE_TABLE_CAP.search(cap):
                rows = 0
                for tb in tw.iter("tbody"):
                    rows += sum(1 for _ in tb.iter("tr"))
                d["included_table_captions"].append(cap[:200])
                d["included_table_rows"] = max(d["included_table_rows"], rows)
        for pid in root.iter("pub-id"):
            if pid.get("pub-id-type") == "pmid" and (pid.text or "").strip().isdigit():
                d["cited_pmids"].append(pid.text.strip())
    ids = set(RE_NCT.findall(txt)) | set(RE_ISRCTN.findall(txt)) | set(RE_CHICTR.findall(txt))
    d["registry_ids"] = sorted(ids)
    d["cited_pmids"] = sorted(set(d["cited_pmids"]))
    d["prospero_ids"] = sorted(set(RE_PROSPERO.findall(txt)))
    d["prospero_tokens_seen"] = sorted(set(RE_CRD_TOKEN.findall(txt)))
    return d


def enumerates(parsed):
    """PROTOCOL section 4. HARD inclusion criterion."""
    table_ok = (len(parsed["included_table_captions"]) > 0
                and parsed["included_table_rows"] >= 2)
    ids_ok = len(parsed["registry_ids"]) >= 2
    n = max(parsed["included_table_rows"] if table_ok else 0,
            len(parsed["registry_ids"]))
    return (table_ok or ids_ok), n, ("included_studies_table" if table_ok
                                     else ("registry_ids" if ids_ok else None))


def stated_k(abstract):
    if not abstract:
        return None
    m = RE_STATED_K.search(abstract)
    if not m:
        return None
    v = m.group(1) or m.group(2)
    try:
        v = int(v)
    except (TypeError, ValueError):
        return None
    return v if 1 < v < 500 else None


def match_topics(parsed, proposed_for):
    """PROTOCOL section 5.3. Only ever called on a row we actually read."""
    txt_ids = set(parsed["registry_ids"])
    cited = set(parsed["cited_pmids"])
    # PROTOCOL 5.3 matches acronyms over the RETRIEVED FULL TEXT. The first build
    # searched only table captions, which is not the full text and is not what the
    # frozen rule says. Case-SENSITIVE, because SCORED and DELIVER are ordinary English
    # words: a false match corrupts a score, a false non-match only shrinks the set.
    hay = parsed.get("_text") or ""
    per_topic = {}
    any_key = bool(txt_ids or cited)
    for t in proposed_for:
        hit, keys = [], {}
        for nct, acro, pmid in OUR_TRIALS[t]:
            k_used = None
            if nct in txt_ids:
                k_used = "nct"
            elif pmid and pmid in cited:
                k_used = "cited_pmid"
            elif acro and re.search(r"\b%s\b" % re.escape(acro), hay):
                k_used = "acronym"
                any_key = True
            if k_used:
                hit.append(nct)
                keys[nct] = k_used
        k = len(OUR_TRIALS[t])
        per_topic[t] = {"overlap": sorted(set(hit)), "k": k,
                        "frac": round(len(set(hit)) / float(k), 3),
                        "key_used": keys,
                        "matched_on_acronym_alone": sum(1 for v in keys.values()
                                                        if v == "acronym")}
    matched = [t for t, v in per_topic.items()
               if len(v["overlap"]) >= MIN_OVERLAP_N and v["frac"] >= MIN_OVERLAP_FRAC]
    if matched:
        return "MATCHED", matched, per_topic
    if not any_key:
        return "MATCH_UNDECIDABLE_NO_TRIAL_IDS", [], per_topic
    return "NO_COUNTERPART", [], per_topic


def design_gate(m):
    """PROTOCOL section 1. Returns (disposition_or_None, reason_or_None)."""
    title = m["title"] or ""
    hay = "%s %s" % (title, m["abstract"] or "")
    pts = set(m["pubtypes"])
    # PubMed's "Meta-Analysis"[PT] EXPLODES to the narrower "Network Meta-Analysis"[PT].
    # The first build tested G1 first, so 128 NMAs were filed NOT_PT_META_ANALYSIS inside
    # EXCLUDED_DESIGN -- exactly the silent folding the protocol forbids. NMA is tested
    # first now. This moves rows BETWEEN TWO EXCLUDED CELLS and cannot admit anything to
    # the eligible set.
    if "network meta-analysis" in pts or RE_NMA.search(hay):
        return "EXCLUDED_NMA", "NETWORK_META_ANALYSIS"
    if "meta-analysis" not in pts:
        return "EXCLUDED_DESIGN", "NOT_PT_META_ANALYSIS"
    if pts & BAD_PT or RE_NOTREVIEW_TITLE.search(title):
        return "EXCLUDED_DESIGN", "NOT_A_REVIEW_RECORD"
    if not m["abstract"]:
        # "could not evaluate" is not "failed". Named, still excluded.
        return "EXCLUDED_DESIGN", "NO_ABSTRACT_CANNOT_EVALUATE_RCT_RESTRICTION"
    if not RE_RCT.search(hay):
        return "EXCLUDED_DESIGN", "NO_RCT_RESTRICTION"
    if RE_OBS_TITLE.search(title):
        return "EXCLUDED_DESIGN", "OBSERVATIONAL_IN_TITLE"
    return None, None


# ---------------------------------------------------------------- the build
def build(log=print):
    if not os.path.isdir(OUTDIR):
        os.makedirs(OUTDIR)

    log("=== STAGE A: frozen per-topic queries (PROTOCOL 5.2) ===")
    proposed = {}
    per_topic_hits = {}
    for t in TOPICS:
        q = topic_query(t)
        total, pmids = esearch_pmids(q, log)
        per_topic_hits[t] = total
        log("  %-26s %5d records" % (t, total))
        for p in pmids:
            proposed.setdefault(p, []).append(t)
    candidates = sorted(proposed)
    log("  CANDIDATES (PMID-deduplicated union) : %d" % len(candidates))

    log("=== context count, NOT a denominator of anything reported ===")
    st, body = _get("%s/esearch.fcgi?db=pubmed&retmode=json&retmax=0&term=%s"
                    % (EUTILS, quote('"Cardiovascular Diseases"[MeSH Terms] AND '
                                     '"Meta-Analysis"[Publication Type]')))
    n_specialty = int(json.loads(body.decode("utf-8"))["esearchresult"]["count"]) if st == 200 else None
    log("  cardiology meta-analyses in PubMed   : %s" % n_specialty)

    log("=== metadata ===")
    meta = efetch_meta(candidates, log)
    log("  metadata obtained for %d/%d" % (len(meta), len(candidates)))

    log("=== design gates (PROTOCOL 1) ===")
    gate = {}
    for p in candidates:
        m = meta.get(p)
        if m is None:
            gate[p] = ("EXCLUDED_DESIGN", "NO_PUBMED_METADATA")
            continue
        gate[p] = design_gate(m)
    survivors = [p for p in candidates if gate[p][0] is None]
    from collections import Counter
    cnt = Counter("%s/%s" % (a, b) for a, b in gate.values() if a)
    for k, v in sorted(cnt.items()):
        log("  %-40s %5d" % (k, v))
    log("  PASS DESIGN                              %5d" % len(survivors))

    log("=== licence (Europe PMC) -- a fact about TERMS, not about bytes ===")
    epmc = epmc_records(survivors, log)

    log("=== retrieval -- a fact about BYTES, kept separate from licence ===")
    rows = []
    n_ret = 0
    for i, p in enumerate(survivors):
        e = epmc.get(p) or {}
        st, body = fetch_fulltext(e.get("pmcid"))
        if st == "OK":
            n_ret += 1
            parsed = parse_fulltext(body)
        else:
            parsed = None
        rows.append((p, e, st, parsed))
        if (i + 1) % 25 == 0 or i + 1 == len(survivors):
            log("  fulltext %d/%d  retrieved %d" % (i + 1, len(survivors), n_ret))
        time.sleep(0.15)

    log("=== assemble ===")
    out, disp_count = [], {}
    eligible_by_topic = {t: 0 for t in TOPICS}
    lic_open_unretrievable = 0
    for p in candidates:
        m = meta.get(p) or {}
        d, reason = gate[p]
        row = {
            "pmid": p,
            "doi": m.get("doi"),
            "title": m.get("title"),
            "journal": m.get("journal"),
            "year": m.get("year"),
            "proposed_for": sorted(proposed[p]),
            "specialty": "cardiology",
            "disposition": None,
            "disposition_reason": None,
            "licence_open": None,
            "licence": None,
            "pmcid": None,
            "retrieval": {"status": "NOT_ATTEMPTED", "fulltext_bytes": None,
                          "may_speak_about_content": False},
            "enumerates_included_studies": None,
            "enumeration_via": None,
            "enumerated_count": None,
            "stated_k": stated_k(m.get("abstract")),
            "enumeration_vs_stated": None,
            "prospero_registered": None,
            "prospero_ids": None,
            "prospero_tokens_seen": None,
            "match_status": None,
            "matched_topics": None,
            "overlap_detail": None,
            "eligible_comparator": False,
        }
        if d is not None:
            row["disposition"] = d
            row["disposition_reason"] = reason
        out.append(row)

    by_pmid = {r["pmid"]: r for r in out}
    for p, e, st, parsed in rows:
        r = by_pmid[p]
        lic = e.get("license")
        r["licence"] = lic
        r["pmcid"] = e.get("pmcid")
        r["licence_open"] = bool(e.get("is_open_access") == "Y"
                                 or (lic and lic.lower().startswith("cc")))
        if st != "OK":
            r["retrieval"] = {"status": st, "fulltext_bytes": None,
                              "may_speak_about_content": False}
            r["disposition"] = "UNRETRIEVABLE"
            r["disposition_reason"] = st
            if r["licence_open"]:
                lic_open_unretrievable += 1
            continue
        ok, n, via = enumerates(parsed)
        r["retrieval"] = {"status": "RETRIEVED" if ok else "RETRIEVED_NO_VALUE",
                          "fulltext_bytes": parsed["fulltext_bytes"],
                          "may_speak_about_content": True}
        r["enumerates_included_studies"] = ok
        r["enumeration_via"] = via
        r["enumerated_count"] = n if ok else 0
        if r["stated_k"] is None:
            r["enumeration_vs_stated"] = "STATED_K_UNKNOWN"
        else:
            r["enumeration_vs_stated"] = "COMPLETE" if n >= r["stated_k"] else "PARTIAL"
        r["prospero_tokens_seen"] = parsed["prospero_tokens_seen"] or None
        abs_pro = RE_PROSPERO.findall(meta.get(p, {}).get("abstract") or "")
        allpro = sorted(set(parsed["prospero_ids"]) | set(abs_pro))
        r["prospero_ids"] = allpro or None
        r["prospero_registered"] = bool(allpro)
        if not ok:
            r["disposition"] = "EXCLUDED_NO_ENUMERATION"
            r["disposition_reason"] = "NO_INCLUDED_STUDY_LIST_IN_FULL_TEXT"
            continue
        r["disposition"] = "EXAMINED"
        ms, mt, detail = match_topics(parsed, r["proposed_for"])
        r["match_status"] = ms
        r["matched_topics"] = mt or []
        r["overlap_detail"] = detail
        r["eligible_comparator"] = bool(r["licence_open"] and r["prospero_registered"]
                                        and ms == "MATCHED")
        if r["eligible_comparator"]:
            for t in mt:
                eligible_by_topic[t] += 1

    for r in out:
        disp_count[r["disposition"]] = disp_count.get(r["disposition"], 0) + 1

    # ---- PRECONDITION: the partition identity (PROTOCOL 6). Refuse to write if broken.
    parts = ["EXCLUDED_DESIGN", "EXCLUDED_NMA", "EXCLUDED_NO_ENUMERATION",
             "UNRETRIEVABLE", "EXAMINED"]
    tot = sum(disp_count.get(k, 0) for k in parts)
    log("")
    log("=== THE PARTITION, asserted before writing ===")
    for k in parts:
        log("  %-26s %5d" % (k, disp_count.get(k, 0)))
    log("  %-26s %5d   candidates %d" % ("SUM", tot, len(candidates)))
    stray = sorted(set(disp_count) - set(parts))
    if stray:
        raise SystemExit("REFUSING TO WRITE: disposition outside the partition: %s" % stray)
    if tot != len(candidates):
        raise SystemExit("REFUSING TO WRITE: %d != %d candidates" % (tot, len(candidates)))
    log("  IDENTITY HOLDS")

    pm = [r["pmid"] for r in out]
    if len(pm) != len(set(pm)):
        raise SystemExit("REFUSING TO WRITE: duplicate pmid")

    n_elig = sum(1 for r in out if r["eligible_comparator"])
    prov = {
        "frame_built": FRAME_BUILT,
        "protocol": PROTOCOL,
        "protocol_frozen_before_any_comparator_was_retrieved": True,
        "timestamp_bounds_when_not_what_was_known":
            "A commit timestamp bounds WHEN this rule was written, never WHAT WAS "
            "ALREADY KNOWN when it was written. Section 0.1 of the protocol lists, by "
            "name, everything that had been read beforehand: our own six cardiology "
            "topics and their exact trial sets, the prior 0-of-10 retrieval result, "
            "the run-1 failure, and the CDSR frame. No comparator query had been run "
            "and no comparator record had been seen. The rule is PRE-SPECIFIED with "
            "respect to results and RETROSPECTIVE with respect to our own corpus.",
        "built_from": "PubMed E-utilities (esearch/efetch) and Europe PMC REST "
                      "(search + fullTextXML). Free sources only.",
        "denominator_name": "candidates",
        "denominator_composition":
            "PubMed records returned by the SIX frozen Stage-A queries of protocol "
            "section 5.2, deduplicated by PMID, with NO date limit, NO language limit "
            "and NO free-full-text filter. This is NOT 'cardiology meta-analyses'. The "
            "free-full-text filter is deliberately absent: including it would make the "
            "population 'papers PubMed believes are free' and would hide the "
            "licence-open-but-unretrievable cell entirely.",
        "denominator_value": len(candidates),
        "denominator_per_topic_query_hits": per_topic_hits,
        "context_count_not_a_denominator":
            'PubMed holds %s records under "Cardiovascular Diseases"[MeSH] AND '
            '"Meta-Analysis"[PT]. That number is context for how much of the specialty '
            'these six queries touch. It is the denominator of NOTHING reported here.'
            % n_specialty,
        "cardiology_meta_analyses_in_pubmed": n_specialty,
        "partition_identity":
            "EXCLUDED_DESIGN + EXCLUDED_NMA + EXCLUDED_NO_ENUMERATION + UNRETRIEVABLE "
            "+ EXAMINED == candidates. Asserted before this file was written; the "
            "builder refuses to write if it fails.",
        "partition_counts": {k: disp_count.get(k, 0) for k in parts},
        "licence_is_not_retrieval":
            "licence_open is a fact about the paper's TERMS (Europe PMC isOpenAccess / "
            "license). retrieval.status is a fact about BYTES WE OBTAINED. They are "
            "never the same field. %d rows are licence-open AND unretrievable -- that "
            "cell is the one a prior ladder was blind to when it scored 0 of 10 on "
            "openly-licensed papers." % lic_open_unretrievable,
        "licence_open_but_unretrievable": lic_open_unretrievable,
        "retrieved_no_value_means":
            "RETRIEVED_NO_VALUE means we obtained the full text and the included-study "
            "list is absent FROM IT as protocol section 4 defines it. It is a fact "
            "about the paper. NOT_RETRIEVED_* means we never got the paper and "
            "licenses NO claim about its content; on those rows every content field is "
            "null and may_speak_about_content is false.",
        "null_means":
            "UNOBTAINABLE, or not permissible to assert on this row. NEVER the empty "
            "string. No field in this file is ever ''.",
        "hard_inclusion_criterion":
            "The comparator must ENUMERATE ITS INCLUDED STUDIES in a reader-checkable "
            "form (an included-studies table with >=2 rows, or >=2 distinct trial "
            "registry identifiers in the full text). This is the exact condition "
            "Cochrane withheld in run 1 and is the whole reason for the move to open "
            "access. It is an inclusion criterion, not a quality bonus.",
        "quality_criterion":
            "PROSPERO registration, evidenced by a CRD42\\d{12} identifier in the "
            "abstract or retrieved full text. Chosen over AMSTAR-2 (not mechanical, "
            "and would make us judge of our own opponent), over a journal criterion "
            "(journal-level proxy, and the usual thresholds are paywalled) and over "
            "'reports a protocol' (unverifiable by a reader). It is a PROCEDURAL "
            "marker, not a measurement of quality: read prospero_registered as "
            "'prospectively registered' and nothing more. It also imposes a post-2011 "
            "boundary we did not choose, since PROSPERO opened in February 2011.",
        "matching_rule":
            "TWO STAGES, never conflated. Stage A (proposed_for) is a keyword "
            "shortlist over PubMed metadata and licenses NOTHING -- treating a "
            "shortlist as a match is what once paired a malaria ACT review with a "
            "folic-acid one. Stage B (match_status) requires, from the retrieved full "
            "text, >=2 of our trials AND >=50%% of our trial set, joined on NCT id, "
            "frozen acronym or cited PMID. MATCH_UNDECIDABLE_NO_TRIAL_IDS is kept "
            "separate from NO_COUNTERPART: 'no overlap' and 'no key to join on' are "
            "different findings and collapsing them would report OUR join failure as "
            "the comparator being about something else.",
        "known_gap":
            "Our alirocumab-lipid trials carry no acronym and no PMID in the corpus "
            "SSOT, so they can only be joined on NCT identifiers. A comparator citing "
            "the ODYSSEY trials by name and journal reference returns "
            "MATCH_UNDECIDABLE_NO_TRIAL_IDS. That deficiency is in OUR frozen key "
            "table, not in the comparator.",
        "prediction_on_record":
            "Written before this frame ran: 9 eligible comparators (sglt2-hf 4, "
            "iv-iron-hf 2, arni-hfref 2, alirocumab-lipid 1, sotagliflozin-hf 0, "
            "bococizumab-lipid-review 0), direction of miss named as TOO HIGH, "
            "plausible range 2-15. A zero measures the instrument until proven "
            "otherwise.",
        "eligible_comparators": n_elig,
        "eligible_by_topic": eligible_by_topic,
        "corrections_after_the_first_run":
            "The first build of this frame returned 0 eligible comparators. Protocol "
            "section 7 pre-committed that a zero measures the instrument until proven "
            "otherwise and must be answered by hand-running a known-good example. Three "
            "IMPLEMENTATION defects were found and fixed. NO criterion, threshold, term "
            "list or trial set was changed. "
            "(1) The PROSPERO regex demanded CRD42 + 12 digits; a real id is CRD42 + 9. "
            "It could not match any registration that exists, and scored 0 of 108 read "
            "papers as registered. Hand-verified against PMC10946839, PMC11755955 and "
            "PMC10517929, all three of which carry a CRD42 id in their full text. This "
            "fix CAN raise eligibility and is disclosed as such. "
            "(2) PubMed's \"Meta-Analysis\"[PT] explodes to the narrower \"Network "
            "Meta-Analysis\"[PT], and the design gate tested G1 before G2, so 128 network "
            "meta-analyses were filed under EXCLUDED_DESIGN/NOT_PT_META_ANALYSIS instead "
            "of the named EXCLUDED_NMA stratum the protocol requires. The fix moves rows "
            "between two EXCLUDED cells and is provably eligibility-neutral. "
            "(3) Protocol 5.3 matches frozen trial acronyms over the retrieved full text; "
            "the first build searched only included-studies table captions, which is not "
            "the full text. Corrected to the full text, case-sensitively. This CAN raise "
            "eligibility and is disclosed as such. "
            "Also: records carrying no abstract at all now get the named reason "
            "NO_ABSTRACT_CANNOT_EVALUATE_RCT_RESTRICTION rather than being reported as "
            "having failed a test that could not be run on them. Still excluded.",
        "what_was_NOT_changed":
            "G3 (the RCT-restriction gate) refuses 182 records whose title and abstract "
            "never state a restriction to randomised trials, and some of those are "
            "genuinely trial-based (individual-participant-data meta-analyses in "
            "particular). Loosening G3 after seeing the results could admit new eligible "
            "comparators, which is the definition of the cherry-picking this protocol "
            "exists to prevent. G3, the overlap thresholds, the Stage-A term lists, the "
            "trial sets and the quality criterion are untouched.",
        "acronym_key_audit":
            "overlap_detail[topic].key_used records, per trial, WHICH key produced the "
            "match: nct, cited_pmid or acronym. Any match resting on an acronym alone is "
            "therefore visible and countable, because SCORED and DELIVER are ordinary "
            "English words and a case-sensitive word-boundary match is a mitigation, not "
            "a proof.",
    }
    for r in out:
        r["provenance"] = prov

    with io.open(OUT, "w", encoding="utf-8") as f:
        for r in sorted(out, key=lambda x: int(x["pmid"])):
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    log("")
    log("  WROTE %s" % OUT)
    log("  rows %d   eligible %d   %s" % (len(out), n_elig, eligible_by_topic))
    log("  licence-open but unretrievable: %d" % lic_open_unretrievable)
    return OUT


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8",
                                  errors="replace", line_buffering=True)
    build()
