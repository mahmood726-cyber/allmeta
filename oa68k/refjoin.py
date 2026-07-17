"""THE IDENTITY LAYER — forest-plot label -> the meta's OWN ref-list -> DOI/PMID -> NCT.

MAHMOOD (2026-07-17): "look at the references in the paper — they should allow
you to connect."

WHY THIS EXISTS. A forest plot says "Chiu 2019". CT.gov says "NCT0123". Nothing
connects them, so a vision-read row cannot be scored against registry ground
truth, and more vision calls only manufacture more unjoinable names. The missing
link was never vision: it is IDENTITY. And the resolver was already on disk --
every OA meta ships its own <ref-list> in JATS, structured, with DOIs and PMIDs.
The meta tells you who "Chiu 2019" is. We just never asked it.

WHAT THIS MODULE IS *NOT*. It is not a new matcher. `refmatch.py` already
implements label -> ref -> PMID with the two decisions that matter (ambiguity
dropped rather than guessed; DERIVED/RESULT-only on the AACT hop) and was never
wired to a runner -- it is referenced only by its own test. This module COMPOSES
that work and measures it. Where it extends refmatch it does so for one stated
reason each:

  * `ref_entries_full` keeps refs that carry a DOI but NO PMID. refmatch drops
    them (`if not pmid ... continue`) because its output is a PMID. But the
    FUNNEL must see them: a label that matched a DOI-only ref is a *resolvable*
    row (Crossref -> PMID), not an unmatched one. Dropping them would understate
    the ceiling and hide the fix.
  * acronym matching. Cardiology labels its rows by TRIAL ACRONYM (TOPCAT,
    PARADIGM-HF), which `parse_label` cannot parse -- it anchors on a year and
    an acronym label has none. Those rows are not unmatchable; they are matchable
    by a DIFFERENT and far stronger key. See `match_acronym`.

`test_refjoin.py` asserts this module's surname candidate logic agrees with
refmatch.match_label on every pmid-bearing case, so the two cannot silently drift.

=============================================================================
THE PRECISION GATE — the standing rule, restated because it binds this module.
=============================================================================
A wrong join silently attaches the wrong trial's data to the wrong row, and every
downstream number inherits it. A join is therefore only shippable behind a
MEASURED precision, and coverage is only meaningful when reported AT a stated
precision. This module never guesses:

    matched    exactly one ref satisfies the key
    ambiguous  >1 ref satisfies it  -> REJECTED, excluded from the numerator
    unmatched  none does

The reject option is the point. `--adjudicate` emits a random sample of matched
pairs for independent adjudication; precision is measured there and reported.
Coverage without that number is not a finding.

Run:  python refjoin.py                 # the funnel, with Wilson CIs
      python refjoin.py --cardio        # cardio subset only
      python refjoin.py --excluded      # Job 2: excluded-studies-table prevalence
      python refjoin.py --discovery     # Job 3: distinct trials the ref-lists name
      python refjoin.py --adjudicate N  # emit a precision sample for adjudication

READ-ONLY over the vision store. The store is another lane's non-reproducible
asset; this module opens it 'r' and never writes to it.
"""
from __future__ import annotations

import argparse
import glob
import json
import math
import os
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict

import config as C
import refmatch as RM

VISION_DIR = os.path.join(C.DATA, "visionstore")

# The vision store's ledgers. `.bak` files are DELIBERATELY excluded: they are
# pre-repair snapshots of shard-B and counting them would double-count the same
# figure under a superseded parse. calls.shard-C is FDA-review vision (no forest
# rows) and contributes nothing to a label funnel -- included in the glob and
# filtered by row_type rather than by filename, so a future shard cannot be
# silently missed by a hardcoded list.
def vision_ledgers() -> list[str]:
    return sorted(p for p in glob.glob(os.path.join(VISION_DIR, "calls*.jsonl"))
                  if not p.endswith(".bak"))


# Reused verbatim from build_reread_list.py rather than re-typed: two divergent
# cardio regexes in one repo is a defect generator. Imported lazily so refjoin
# stays importable if that module moves.
def _cardio_re():
    try:
        from build_reread_list import CARDIO
        return CARDIO
    except Exception:
        return re.compile(r"\bcardiac\b|\bcardio|\bheart\b|\bmyocardial\b|\bcoronary\b", re.I)


# ---------------------------------------------------------------- CIs

def wilson(k: int, n: int) -> tuple[float, float, float]:
    """(point, lo, hi) 95% Wilson interval. Never a bare proportion in a report.

    Wilson rather than normal-approximation because these funnel stages routinely
    hit 0/n and n/n, where the Wald interval is degenerate (width 0) and would
    print a fake certainty at exactly the points that matter most.
    """
    if n == 0:
        return (0.0, 0.0, 0.0)
    z = 1.959963984540054
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (p, max(0.0, c - h), min(1.0, c + h))


def fmt(k: int, n: int) -> str:
    p, lo, hi = wilson(k, n)
    return f"{k:>6,}/{n:<6,} {p:6.1%}  [{lo:5.1%},{hi:5.1%}]"


# ---------------------------------------------------------------- vision labels

def pmcid_of(source_id: str) -> str:
    """'PMC12587632#...Fig2_HTML.jpg' -> 'PMC12587632'.

    shard-B writes figure-qualified source_ids while shard-A writes bare PMCIDs.
    Joining on the raw string silently loses every shard-B row -- it would look
    like shard-B has no cached JATS, when in fact it was never asked for.
    """
    if not source_id:
        return ""
    head = str(source_id).split("#", 1)[0].strip()
    m = re.search(r"PMC\d+", head)
    return m.group(0) if m else ""


def load_labels() -> list[dict]:
    """[{pmcid, label, role, figure, ledger}] for every study row in the store.

    Deduped on (pmcid, normalised label): shard-A and shard-B both read
    PMC12587632, and the same study appearing in two figures of one review is
    ONE identity question, not two. Counting it twice would inflate every
    denominator with free duplicates.
    """
    seen: set[tuple[str, str]] = set()
    out: list[dict] = []
    for path in vision_ledgers():
        base = os.path.basename(path)
        with open(path, "r", encoding="utf-8") as fh:      # READ-ONLY. Never 'a'/'w'.
            for ln in fh:
                ln = ln.strip()
                if not ln:
                    continue
                try:
                    r = json.loads(ln)
                except Exception:
                    continue                # a corrupt line must not hide the rest
                parsed = r.get("parsed")
                if not isinstance(parsed, dict):
                    continue
                rows = parsed.get("rows")
                if not isinstance(rows, list):
                    continue
                pmcid = pmcid_of(r.get("source_id") or "")
                if not pmcid:
                    continue
                for row in rows:
                    if not isinstance(row, dict) or row.get("row_type") != "study":
                        continue
                    lab = (row.get("label") or "").strip()
                    if not lab:
                        continue
                    key = (pmcid, RM.norm_name(lab) + "|" + (_year_of(lab) or ""))
                    if key in seen:
                        continue
                    seen.add(key)
                    out.append({"pmcid": pmcid, "label": lab,
                                "role": r.get("role"),
                                "figure": str(r.get("source_id") or ""),
                                "ledger": base})
    return out


def _year_of(label: str) -> str:
    p = RM.parse_label(label)
    return p[1] if p else ""


# ---------------------------------------------------------------- JATS ref-list

def _strip(s) -> str:
    """Element -> citation string, joining child texts with a SPACE.

    The space is load-bearing and its absence was a real bug. JATS puts no
    whitespace between sibling elements, so `"".join(itertext())` -- the obvious
    spelling, and the one jats.py uses for single table cells -- welds them:

        <surname>A</surname><given-names>A</given-names>
        <article-title>PARADIGM-HF primary results</article-title><year>2014</year>
            ""-join  ->  'AAPARADIGM-HF primary results2014111'
            " "-join ->  'A A PARADIGM-HF primary results 2014 111'

    Both downstream keys break on the welded form, SILENTLY:
      * the acronym lookbehind (?<![A-Za-z0-9]) sees the given-name's 'A' glued to
        'PARADIGM' and refuses -- the trial is right there and we report
        "acronym in no ref";
      * the DOI charclass [^\\s...]+ has no space to stop at and swallows the
        year: '10.9999/in-text-only.2020'.

    Neither raises. Both understate the funnel and would be reported as facts
    about the corpus when they are facts about the join -- the exact failure
    build_reread_list records ("cardio candidates: 0" was a missing field, not an
    empty corpus). This hits EVERY ref: every ref has adjacent siblings.

    Tradeoff accepted: inline markup mid-word (<italic>P</italic>ARADIGM) now
    splits to 'P ARADIGM'. Rare in reference titles; the sibling boundary is
    universal. Losing a rare word to save every ref is the right side of it.
    """
    if s is None:
        return ""
    return re.sub(r"\s+", " ", " ".join(s.itertext())).strip()


# "Seid G , Ayele M ." / "Hussien B" -- a surname followed by initials. Bounded
# quantifiers throughout: an unbounded [\w\s]+? over 60 refs x 68 metas is a
# ReDoS waiting to happen (lessons.md).
_TXT_AUTHOR = re.compile(r"\b([A-Z][a-zA-Z'’\-]{1,24})\s*,?\s+"
                         r"([A-Z]\.?\s*){1,3}(?=[,.;]|\s|$)")
_TXT_STOP = {"the", "a", "an", "in", "of", "and", "for", "with", "on", "at",
             "doi", "http", "https", "pubmed", "epub", "vol", "no", "pp"}


def _text_surnames(text: str, window: int = 200) -> list[str]:
    """Best-effort surnames from an UNSTRUCTURED citation string.

    Used only when a ref carries no <surname> elements. Scoped to the leading
    `window` chars because that is where the author block lives -- running it over
    the whole citation would harvest capitalised words out of the article title
    ("Undernutrition and Mortality among adult Tuberculosis Patients") and
    manufacture surnames that match nothing, or worse, match something.

    Deliberately RECALL-oriented, not precision-oriented: its output feeds the
    AMBIGUITY gate. A false surname here makes the gate reject a row (costing
    coverage, which is measurable and safe). A missed surname makes the gate
    pass a row it should have rejected (a silent wrong join, which is neither).
    When those two errors are not symmetric, aim at the recoverable one.
    """
    head = (text or "")[:window]
    head = re.sub(r"^\s*\d{1,3}\s*[.)]?\s*", "", head)     # leading ref number
    out = []
    for m in _TXT_AUTHOR.finditer(head):
        s = m.group(1)
        if s.lower() in _TXT_STOP or len(s) < 2:
            continue
        out.append(s)
    return out


def ref_entries_full(xml_bytes: bytes) -> list[dict]:
    """EVERY <ref>, with pmid AND doi AND its verbatim citation text.

    Differs from refmatch.ref_entries in exactly one way, for one reason: it does
    NOT require a PMID. A ref carrying only a DOI is a resolvable identity (DOI ->
    Crossref -> PMID -> NCT), so the funnel must count it as MATCHED-with-a-DOI,
    not as unmatched. refmatch drops it because refmatch's contract is to return a
    PMID; the funnel's contract is to report where the loss actually is.

    `text` is kept because the acronym key and the adjudication sample both need
    the human-readable citation, and re-parsing the XML to get it later would
    couple this to a second pass.
    """
    out: list[dict] = []
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return out
    for ref in root.iter():
        if ref.tag.split("}")[-1] != "ref":
            continue
        pmid = doi = ""
        surnames: list[str] = []
        years: list[str] = []
        for el in ref.iter():
            t = el.tag.split("}")[-1]
            if t == "pub-id":
                kind = (el.get("pub-id-type") or "").lower()
                v = (el.text or "").strip()
                if kind == "pmid" and v.isdigit():
                    pmid = v
                elif kind == "doi" and v:
                    doi = v.lower()
            elif t == "surname":
                v = (el.text or "").strip()
                if v:
                    surnames.append(v)
            elif t == "year":
                v = re.sub(r"\D", "", (el.text or ""))
                if len(v) == 4:
                    years.append(v)
            elif t == "string-name" and not surnames:
                v = (el.text or "").strip()
                if v:
                    surnames.append(v.split()[0])
        text = _strip(ref)
        structured = bool(surnames)
        if not structured:
            # UNSTRUCTURED <mixed-citation>: the whole citation is free text with
            # no <surname> elements. Without this fallback such a ref is INVISIBLE
            # to every surname key -- and an invisible ref cannot be rejected as a
            # duplicate, so the ambiguity gate silently passes and the matcher
            # returns the WRONG ref with full confidence.
            #
            # This is not hypothetical. Adjudication case 25 (PMC11201327,
            # 'Seid et al'): ref [23] "Seid G, Ayele M." is unstructured and was
            # invisible; ref [26] "Hussien B Hussen MM Seid A" is structured and
            # carries Seid as THIRD author. The matcher saw one candidate, called
            # it unambiguous, and picked the mid-author paper. The blind
            # adjudicator picked [23]. That was the only error in 40 -- and it was
            # a gate hole, not a close call.
            surnames = _text_surnames(text)
        entry_structured = structured
        # A DOI is sometimes only present in the raw citation string, not as a
        # <pub-id>. Recovering it there is free and moves rows out of "no id".
        if not doi:
            m = re.search(r"\b(10\.\d{4,9}/[^\s\"<>,;]+)", text)
            if m:
                # Trailing sentence punctuation is not part of the DOI. A DOI may
                # legitimately contain ')' so it stays in the charclass, but a
                # citation-final ')' or '.' must come off or the DOI will not
                # resolve -- and an unresolvable DOI is a silent loss, not an error.
                doi = m.group(1).lower().rstrip(".,;)")
        if not years:
            m = re.search(r"\b(19|20)\d{2}\b", text)
            if m:
                years = [m.group(0)]
        out.append({"pmid": pmid, "doi": doi,
                    "surname_keys": sorted({RM.norm_name(s) for s in surnames if s}),
                    "year": years[0] if years else "",
                    "structured": entry_structured,
                    "text": text})
    return out


def jats_path(pmcid: str) -> str:
    return os.path.join(C.CACHE, f"{pmcid}.xml")


def load_refs(pmcid: str):
    p = jats_path(pmcid)
    if not os.path.isfile(p):
        return None                          # distinct from "has zero refs"
    with open(p, "rb") as fh:
        return ref_entries_full(fh.read())


# ---------------------------------------------------------------- the match

def surname_candidates(label: str, refs: list[dict], year_slack: int = 1) -> list[int]:
    """Indices of refs matching label on surname+year. Mirrors refmatch.match_label.

    Kept byte-for-byte equivalent in behaviour to refmatch's `_cands` (prefix-safe
    surname comparison, exact year first then +/-1 slack) and pinned there by
    test_refjoin.py. The only difference is it returns INDICES, so the caller can
    read off doi/pmid/text -- refmatch returns a PMID and cannot.
    """
    p = RM.parse_label(label)
    if not p:
        return []
    key, year, _suf = p

    def _c(slack: int) -> list[int]:
        hits = []
        for i, r in enumerate(refs):
            if not r["year"]:
                continue
            try:
                if abs(int(r["year"]) - int(year)) > slack:
                    continue
            except ValueError:
                continue
            for sk in r["surname_keys"]:
                # Prefix-safe in both directions ("Ahmad Othman" vs "Ahmad-Othman")
                # but never bare-substring: that would let "Wang" match "Wangchuk".
                if sk == key or key.startswith(sk + " ") or sk.startswith(key + " "):
                    hits.append(i)
                    break
        return hits

    return _c(0) or _c(year_slack)


# An acronym label: 3+ chars, uppercase-dominant, optionally hyphenated/numbered.
# "PARADIGM-HF", "TOPCAT", "DAPA-HF", "EMPEROR-Reduced", "SPRINT", "4S".
_ACRO = re.compile(r"^[A-Z][A-Z0-9]{2,}(?:[- ][A-Za-z0-9]+){0,3}$")
# Words that LOOK like acronyms but are English. Matching these against a ref
# text would fire on prose and manufacture joins.
_ACRO_STOP = {"AND", "THE", "FOR", "NOT", "ALL", "ANY", "TOTAL", "MEAN", "RISK",
              "ODDS", "RATIO", "STUDY", "TRIAL", "GROUP", "POOLED", "OVERALL",
              "SUBTOTAL", "HETEROGENEITY", "RCT", "NA", "SD", "SE", "CI", "OR",
              "RR", "HR", "MD", "SMD", "USA", "UK", "WHO", "ITT", "PP"}


def is_acronym_label(label: str) -> bool:
    lab = (label or "").strip()
    if not _ACRO.match(lab):
        return False
    head = re.split(r"[- ]", lab)[0].upper()
    if head in _ACRO_STOP or len(head) < 3:
        return False
    return True


def match_acronym(label: str, refs: list[dict]) -> dict:
    """Resolve a TRIAL-ACRONYM label against the ref texts. Cardio's gift.

    "PARADIGM-HF" is a near-unique string in a way "Chiu 2019" never is: it is
    not fuzzy, it does not collide with a second first-author, and it survives
    transliteration. So the cardio funnel should be measured on this key, not on
    the surname key that `parse_label` cannot even build (an acronym has no year).

    Whole-word, case-insensitive, punctuation-tolerant ("DAPA-HF" ~ "DAPA HF").
    Ambiguity is still rejected: a trial named in >1 ref (main paper + substudy)
    cannot be resolved to ONE identity from the label alone.
    """
    lab = (label or "").strip()
    pat = re.compile(r"(?<![A-Za-z0-9])" +
                     r"[-\s]?".join(re.escape(c) for c in re.split(r"[-\s]+", lab)) +
                     r"(?![A-Za-z0-9])", re.I)
    hits = [i for i, r in enumerate(refs) if pat.search(r["text"] or "")]
    if not hits:
        return {"status": "unmatched", "why": "acronym in no ref", "key": "acronym"}
    if len(hits) > 1:
        return {"status": "ambiguous", "n_candidates": len(hits), "key": "acronym",
                "idx": hits}
    return {"status": "matched", "idx": hits[0], "n_candidates": 1, "key": "acronym"}


def label_surname(label: str) -> str:
    """Surname key from a label carrying NO year: 'Dreyfus et al' -> 'dreyfus'.

    28.6% of the store's labels (680/2,375, measured) have no parseable year --
    shard-B's prompt captured the author but not the year. `parse_label` anchors
    on the year, so it returns None for every one of them and they all fall out
    as "unmatched". They are not unmatchable; they are matchable on a WEAKER key,
    which is a different thing and must be measured separately rather than
    pooled into the headline rate.

    'Zhong et al34' -> 'zhong': the trailing 34 is a superscript CITATION NUMBER
    that vision flattened into the label. Stripping it is needed to get a surname
    at all -- though the number itself is a stronger key than the surname (see
    the report; not exploited here because vision did not reliably capture it).
    """
    lab = re.sub(r"\d+\s*$", " ", (label or "").strip())
    lab = re.sub(r"\bet\s+al\.?\b", " ", lab, flags=re.I)
    lab = re.split(r"[&,;]| and ", lab, flags=re.I)[0]
    return RM.norm_name(lab)


def match_surname_only(label: str, refs: list[dict]) -> dict:
    """Year-less label -> ref, on surname ALONE. Ambiguity-gated, and it bites.

    This key is WEAK by construction: a review citing two different Wang papers
    resolves to neither. That is the correct outcome -- the reject option is what
    stops a weak key from becoming a wrong join -- but it means the ambiguous rate
    here is high BY DESIGN and must be read as "the key cannot decide", not as
    "the data is missing". Reported under its own key for exactly that reason.
    """
    key = label_surname(label)
    if not key or len(key) < 3:
        return {"status": "unmatched", "why": "no usable surname",
                "key": "surname_only"}
    hits = []
    for i, r in enumerate(refs):
        for sk in r["surname_keys"]:
            if sk == key or key.startswith(sk + " ") or sk.startswith(key + " "):
                hits.append(i)
                break
    if not hits:
        return {"status": "unmatched", "why": "no ref with this surname",
                "key": "surname_only"}
    ids = {refs[i]["pmid"] or f"__idx{i}" for i in hits}
    if len(ids) > 1:
        return {"status": "ambiguous", "n_candidates": len(ids), "key": "surname_only"}
    return {"status": "matched", "idx": hits[0], "n_candidates": 1, "key": "surname_only"}


def resolve(label: str, refs: list[dict]) -> dict:
    """One label -> {status, idx, key}. Three keys, by label SHAPE.

      acronym       trial-name label ("TRACE-III"). An exact whole-word trial name
                    would beat a surname+year coincidence IF the ref-list carried
                    it. MEASURED: it usually does not (2/19 tokens present).
      surname_year  the workhorse. refmatch's key.
      surname_only  fallback for year-less labels. Weak, ambiguity-gated.

    Dispatch is on label SHAPE, not a fallback cascade: a label is only ever one
    shape, so the keys never compete on the same row. That is what makes the
    per-key rate a property of the key rather than an artifact of ordering.
    """
    if is_acronym_label(label):
        return match_acronym(label, refs)
    if not RM.parse_label(label):
        return match_surname_only(label, refs)
    c = surname_candidates(label, refs)
    if not c:
        return {"status": "unmatched", "why": "no ref with surname+year",
                "key": "surname_year"}
    pm = {refs[i]["pmid"] or f"__idx{i}" for i in c}
    if len(pm) > 1:
        return {"status": "ambiguous", "n_candidates": len(pm), "key": "surname_year",
                "idx": c}
    return {"status": "matched", "idx": c[0], "n_candidates": 1, "key": "surname_year"}


# ---------------------------------------------------------------- PMID -> NCT

def pmid_to_nct() -> dict:
    """PMID -> {NCT}, DERIVED/RESULT ONLY.

    BACKGROUND is 68.5% of AACT's crosswalk (744,555 of 1,087,352 rows, measured
    on the 2026-04-12 snapshot) and means "this trial CITED that paper" -- not
    "that paper reports this trial". One famous citation fans out to hundreds of
    NCTs. Accepting BACKGROUND would attach other trials' numbers to this row and
    manufacture a mismatch that is really a linking error. This is the single
    largest correctness risk in the join, which is why the filter is here and not
    a caller's responsibility.
    """
    import pandas as pd
    p = C.ext_table("study_references")
    if not p:
        raise FileNotFoundError(
            "study_references.parquet absent -- run aact_ext.py. The PMID->NCT hop "
            "cannot be faked; refusing to report a funnel that stops at PMID and "
            "calls it a link.")
    df = pd.read_parquet(p, columns=["nct_id", "pmid", "reference_type"])
    df = df[df["reference_type"].isin(("DERIVED", "RESULT"))]
    df = df.dropna(subset=["pmid", "nct_id"])
    out: dict[str, set] = defaultdict(set)
    for pmid, nct in zip(df["pmid"].astype(str), df["nct_id"].astype(str)):
        out[pmid.strip()].add(nct.strip())
    return out


# ---------------------------------------------------------------- Job 1 funnel

def is_cardio(pmcid: str, titles: dict) -> bool:
    return bool(_cardio_re().search(titles.get(pmcid, "") or ""))


def jats_title(pmcid: str) -> str:
    """The meta's title, read from the <front> of its own cached JATS.

    Read from the JATS and not from a ledger ON PURPOSE. The first spelling of
    this joined `harvest`/`detect3` on pmcid to pick up a `title` field -- and
    those ledgers do not HAVE one (harvest carries bytes/doi/path/pmcid/pmid/
    status/tier; the title lives in seed.jsonl). It resolved 0 titles out of 126
    metas, so `is_cardio` was False for every row and `--cardio` would have
    reported an empty cardio corpus. That is a fact about the join, not the
    corpus -- precisely the failure build_reread_list already recorded once
    ("cardio candidates: 0"). It is recorded here a second time because I
    reproduced it.

    The JATS is the right source anyway: S1 measures the cache at 100% of the
    vision-read metas, so this cannot silently return nothing while the ledger
    join can. `load_titles` asserts a non-zero resolve rate rather than trusting
    that claim.
    """
    p = jats_path(pmcid)
    if not os.path.isfile(p):
        return ""
    try:
        with open(p, "rb") as fh:
            root = ET.fromstring(fh.read())
    except (ET.ParseError, OSError):
        return ""
    for el in root.iter():
        if el.tag.split("}")[-1] == "article-title":
            return _strip(el)          # first article-title == the front-matter one
    return ""


def load_titles(pmcids=None) -> dict:
    """pmcid -> meta title, for the cardio/other split. FAILS LOUD on a zero.

    A zero produced by a broken join is indistinguishable from a zero produced by
    an empty corpus unless you look -- so this looks, rather than quietly
    reporting that nothing is cardio.
    """
    if pmcids is None:
        pmcids = sorted({l["pmcid"] for l in load_labels()})
    t = {pm: jats_title(pm) for pm in pmcids}
    got = {k: v for k, v in t.items() if v}
    if pmcids and not got:
        raise RuntimeError(
            f"resolved 0 titles for {len(pmcids)} metas — the cardio split would "
            f"silently report 'no cardio'. Fix the title source before trusting "
            f"any subgroup number.")
    return got


def run_funnel(cardio_only: bool = False, verbose: bool = True,
               subset: str = "", keep_all_matched: bool = False) -> dict:
    """subset: '' | 'cardio' | 'other'.

    'other' exists because comparing cardio against ALL is confounded -- ALL
    CONTAINS cardio, so the two are not independent groups and a difference is
    diluted by construction. The honest contrast is cardio vs non-cardio.
    """
    labels = load_labels()
    titles = load_titles()
    p2n = pmid_to_nct()

    if cardio_only or subset == "cardio":
        labels = [l for l in labels if is_cardio(l["pmcid"], titles)]
    elif subset == "other":
        labels = [l for l in labels if not is_cardio(l["pmcid"], titles)]

    refcache: dict[str, list | None] = {}
    f = Counter()
    keyed = Counter()
    rows_out = []
    matched_rows = []
    for l in labels:
        f["labels"] += 1
        pm = l["pmcid"]
        if pm not in refcache:
            refcache[pm] = load_refs(pm)
        refs = refcache[pm]
        if refs is None:
            f["no_jats"] += 1
            continue
        f["jats"] += 1
        if not refs:
            f["no_reflist"] += 1
            continue
        f["reflist"] += 1
        r = resolve(l["label"], refs)
        keyed[(r.get("key"), r["status"])] += 1
        if r["status"] == "ambiguous":
            f["ambiguous"] += 1
            continue
        if r["status"] != "matched":
            f["unmatched"] += 1
            continue
        f["matched"] += 1
        ref = refs[r["idx"]]
        if keep_all_matched:
            # The precision sample is drawn from HERE, before the registry hops
            # filter the population -- see adjudicate_sample.
            matched_rows.append({**l, "idx": r["idx"], "key": r.get("key"),
                                 "pmid": ref["pmid"], "doi": ref["doi"],
                                 "ref_text": ref["text"][:300]})
        if ref["doi"]:
            f["doi"] += 1
        if ref["pmid"]:
            f["pmid"] += 1
        else:
            f["matched_no_pmid"] += 1
            continue
        ncts = p2n.get(ref["pmid"]) or set()
        if not ncts:
            f["no_nct"] += 1
            continue
        if len(ncts) > 1:
            f["nct_ambiguous"] += 1
            continue
        f["nct"] += 1
        rows_out.append({**l, "pmid": ref["pmid"], "doi": ref["doi"],
                         "nct": sorted(ncts)[0], "key": r.get("key"),
                         "ref_text": ref["text"][:300]})

    if verbose:
        _print_funnel(f, keyed, len(refcache), titles, cardio_only, rows_out)
    return {"funnel": dict(f), "keyed": {f"{k[0]}/{k[1]}": v for k, v in keyed.items()},
            "rows": rows_out, "matched_rows": matched_rows}


def _print_funnel(f, keyed, n_metas, titles, cardio_only, rows_out):
    n = f["labels"]
    scope = "CARDIO ONLY" if cardio_only else "ALL"
    print(f"=== REFERENCE JOIN FUNNEL ({scope}) ===")
    print(f"forest-plot labels (deduped) : {n:,} across {n_metas:,} metas")
    print(f"titles resolved for split    : {len(titles):,}\n")
    print("  stage                                    k/n           rate    95% CI")
    print(f"  S1 meta's JATS cached          {fmt(f['jats'], n)}")
    print(f"  S2 JATS exposes a <ref-list>   {fmt(f['reflist'], n)}")
    print(f"  S3 label -> ONE ref (matched)  {fmt(f['matched'], n)}")
    print(f"       ambiguous (REJECTED)      {fmt(f['ambiguous'], n)}")
    print(f"       unmatched                 {fmt(f['unmatched'], n)}")
    print(f"  S4 matched ref carries a DOI   {fmt(f['doi'], n)}")
    print(f"  S5 matched ref carries a PMID  {fmt(f['pmid'], n)}")
    print(f"  S6 PMID -> exactly ONE NCT     {fmt(f['nct'], n)}")
    print(f"       PMID -> no NCT (ceiling)  {fmt(f['no_nct'], n)}")
    print(f"       PMID -> >1 NCT (rejected) {fmt(f['nct_ambiguous'], n)}")
    print("\n  by key:")
    for k, v in sorted(keyed.items()):
        print(f"    {k[0]:<14} {k[1]:<10} {v:>6,}")
    print(f"\n  distinct NCTs reached: {len({r['nct'] for r in rows_out}):,}")


# ---------------------------------------------------------------- Job 2

_EXCL = re.compile(r"characteristics of excluded studies|excluded studies|"
                   r"studies excluded|reasons? for exclusion", re.I)


def _parent_map(root):
    return {c: p for p in root.iter() for c in p}


def _enclosing_table(el, parents) -> object | None:
    """The <table-wrap> an element sits inside, or None.

    Walks UP a parent map rather than re-scanning root.iter() per hit: the
    scan-down spelling is O(refs x elements) and, worse, leaks its loop variable
    into the reason check. A heading is prose; the auditable object is a TABLE.
    Confusing the two would report "we have exclusions" when we have a sentence.
    """
    cur = el
    while cur is not None:
        if cur.tag.split("}")[-1] == "table-wrap":
            return cur
        cur = parents.get(cur)
    return None


def excluded_prevalence(limit: int = 0, corpus: int = 0, seed: int = 20260717) -> dict:
    """Job 2 -- do our cached JATS carry an EXCLUDED-STUDIES table WITH REASONS?

    The claim this tests: "you cannot hide an inclusion, but an excluded trial
    vanishes silently, so the exclusion half of reviewer behaviour is
    unauditable." Cochrane reviews publish an excluded-studies table WITH REASONS.
    If our cache carries it, the rule-bending instrument gets BOTH halves.

    Two populations, and they answer different questions:
      default    the 126 metas the vision store actually read -- the population an
                 instrument built on the store would run on today.
      --corpus N a random sample of the whole JATS cache (175,306 files). This is
                 the question as asked ("do our cached JATS carry it?"). It is
                 also the only way to tell RARE from ABSENT: 0/126 has a CI of
                 [0%, 3%], which is consistent with 5,000 of the 175k having one.

    THREE nested measures, because a heading is not a table and a table is not an
    audit trail:
      text_mention  the phrase occurs ANYWHERE in the XML  -> upper bound
      in_table      it captions/titles a <table-wrap>      -> a real object
      with_reason   that table has a reason column         -> auditable
    """
    import random
    if corpus:
        allx = glob.glob(os.path.join(C.CACHE, "*.xml"))
        rng = random.Random(seed)              # pinned: the sample is re-quotable
        pmcids = [os.path.splitext(os.path.basename(p))[0]
                  for p in rng.sample(allx, min(corpus, len(allx)))]
        pop = f"random sample of {len(pmcids):,} of {len(allx):,} cached JATS"
    else:
        pmcids = sorted({l["pmcid"] for l in load_labels()})
        pop = f"{len(pmcids):,} vision-read metas"
    if limit:
        pmcids = pmcids[:limit]
    n = has_txt = has_sec = has_tbl = has_reason = 0
    examples = []
    for pm in pmcids:
        p = jats_path(pm)
        if not os.path.isfile(p):
            continue
        n += 1
        with open(p, "rb") as fh:
            raw = fh.read()
        # Upper bound first: if the phrase is nowhere in the bytes, no amount of
        # tree-walking will find a table, and 175k parses is real time.
        if not _EXCL.search(raw.decode("utf-8", "replace")):
            continue
        has_txt += 1
        try:
            root = ET.fromstring(raw)
        except ET.ParseError:
            continue
        parents = _parent_map(root)
        sec_hit = tbl_hit = reason_hit = False
        for el in root.iter():
            if el.tag.split("}")[-1] not in ("title", "caption", "label"):
                continue
            if not _EXCL.search(_strip(el)):
                continue
            sec_hit = True
            tbl = _enclosing_table(el, parents)
            if tbl is not None:
                tbl_hit = True
                # A reason COLUMN is what makes the table auditable: an excluded
                # trial listed without a reason records that it was dropped, not
                # why -- which is the half of reviewer conduct we came for.
                if re.search(r"\breason", _strip(tbl), re.I):
                    reason_hit = True
        if sec_hit:
            has_sec += 1
            if len(examples) < 5:
                examples.append(pm)
        if tbl_hit:
            has_tbl += 1
        if reason_hit:
            has_reason += 1
    return {"population": pop, "metas_scanned": n,
            "text_mention": has_txt, "excluded_heading": has_sec,
            "excluded_table": has_tbl, "excluded_table_with_reason": has_reason,
            "examples": examples}


# ---------------------------------------------------------------- Job 3

def discovery(limit: int = 0) -> dict:
    """Job 3 -- the ref-list as a TRIAL DISCOVERY layer.

    Every meta's ref-list names trials we may not hold. How many DISTINCT trials
    do the cardio corpus's ref-lists name, and how many are new to us?
    "New" is measured against the NCTs our own ledgers already carry -- an
    unqualified "new" would be a claim about the world; this is a claim about our
    holdings, which is what is actually checkable.
    """
    titles = load_titles()
    p2n = pmid_to_nct()
    labels = load_labels()
    cardio_pm = sorted({l["pmcid"] for l in labels if is_cardio(l["pmcid"], titles)})
    allpm = sorted({l["pmcid"] for l in labels})
    if limit:
        cardio_pm, allpm = cardio_pm[:limit], allpm[:limit]

    held = set()
    for stem in ("preextract", "detect3", "crosswalk"):
        for p in C.node_ledgers(stem):
            try:
                with open(p, encoding="utf-8") as fh:
                    for ln in fh:
                        if not ln.strip():
                            continue
                        try:
                            r = json.loads(ln)
                        except Exception:
                            continue
                        if r.get("nct_id"):
                            held.add(r["nct_id"])
                        for x in (r.get("ncts") or []):
                            held.add(x)
            except OSError:
                continue

    def sweep(pms):
        ncts, pmids = set(), set()
        for pm in pms:
            refs = load_refs(pm)
            if not refs:
                continue
            for r in refs:
                if r["pmid"]:
                    pmids.add(r["pmid"])
                    ncts |= (p2n.get(r["pmid"]) or set())
        return ncts, pmids

    c_ncts, c_pmids = sweep(cardio_pm)
    a_ncts, a_pmids = sweep(allpm)
    return {"held_ncts": len(held),
            "cardio_metas": len(cardio_pm), "cardio_ref_pmids": len(c_pmids),
            "cardio_ncts_named": len(c_ncts), "cardio_ncts_new": len(c_ncts - held),
            "all_metas": len(allpm), "all_ref_pmids": len(a_pmids),
            "all_ncts_named": len(a_ncts), "all_ncts_new": len(a_ncts - held)}


# ---------------------------------------------------------------- adjudication

def adjudicate_sample(n: int, seed: int = 20260717, all_matched: bool = True) -> list[dict]:
    """Emit a random sample of MATCHED pairs for INDEPENDENT precision review.

    Precision cannot be measured by the matcher -- that measures the guesser. So
    this emits the evidence an adjudicator needs and NOT the verdict: the label,
    the ref the matcher chose, and the DISTRACTORS (every other ref sharing the
    surname or the year). Without the distractors an adjudicator can only confirm
    that the chosen ref is plausible, which is not the question. The question is
    whether a DIFFERENT ref could have been right -- that is where a silent
    mismatch comes from.

    Sampled from all MATCHED rows by default, not just the 183 that reach an NCT:
    precision of the label->ref step is the thing under test, and conditioning on
    reaching an NCT would sample a biased subset (rows whose PMIDs happen to be
    registered) and report its precision as the whole join's.
    """
    import random
    res = run_funnel(verbose=False, keep_all_matched=all_matched)
    rows = res["matched_rows"] if all_matched else res["rows"]
    rng = random.Random(seed)          # pinned: the sample must be re-quotable
    pick = rng.sample(rows, min(n, len(rows)))
    out = []
    for r in pick:
        refs = load_refs(r["pmcid"]) or []
        key = label_surname(r["label"]) or (RM.parse_label(r["label"]) or ("", "", ""))[0]
        yr = _year_of(r["label"])
        distract = []
        for i, x in enumerate(refs):
            if i == r.get("idx"):
                continue
            same_sn = any(sk == key or sk.startswith(key + " ") or
                          key.startswith(sk + " ") for sk in x["surname_keys"])
            same_yr = yr and x["year"] == yr
            if same_sn or same_yr:
                distract.append(x["text"][:220])
        out.append({"pmcid": r["pmcid"], "label": r["label"], "key": r["key"],
                    "chosen_ref": r["ref_text"], "pmid": r.get("pmid", ""),
                    "nct": r.get("nct", ""),
                    "n_refs_in_meta": len(refs),
                    "distractors": distract[:8],
                    "n_distractors": len(distract)})
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cardio", action="store_true")
    ap.add_argument("--excluded", action="store_true")
    ap.add_argument("--discovery", action="store_true")
    ap.add_argument("--adjudicate", type=int, default=0)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--corpus", type=int, default=0,
                    help="Job 2 over a random sample of the whole JATS cache")
    ap.add_argument("--diag", action="store_true")
    ap.add_argument("--split", action="store_true")
    ap.add_argument("--probe", default="")
    ap.add_argument("--json", default="")
    a = ap.parse_args()

    if a.probe:
        refs = load_refs(a.probe) or []
        labs = [l for l in load_labels() if l["pmcid"] == a.probe]
        print(f"=== PROBE {a.probe} — {len(refs)} refs, {len(labs)} labels ===")
        print("TITLE:", jats_title(a.probe)[:110], "\n")
        for l in labs[:25]:
            r = resolve(l["label"], refs)
            print(f"  {l['label']!r:28} -> {r['status']:10} {r.get('key','')} "
                  f"{r.get('why','')}")
        print("\n-- first 8 ref texts --")
        for r in refs[:8]:
            print(f"  [{r['pmid'] or '-':>9}] {r['text'][:150]}")
        return 0

    if a.diag:
        labels = load_labels()
        titles = load_titles()
        acro = [l for l in labels if is_acronym_label(l["label"])]
        noyear = [l for l in labels if not RM.parse_label(l["label"])]
        card = [l for l in labels if is_cardio(l["pmcid"], titles)]
        print("=== DIAGNOSTIC ===")
        print(f"labels {len(labels):,} | metas {len({l['pmcid'] for l in labels}):,} "
              f"| titles resolved {len(titles):,}")
        print(f"cardio labels {len(card):,} | acronym-shaped {len(acro):,} "
              f"| no parseable year {len(noyear):,}")
        print(f"  no-year by ledger: {dict(Counter(l['ledger'] for l in noyear))}")
        print("\n-- acronym-shaped labels (sample) --")
        for l in acro[:20]:
            print(f"   {l['label']!r:40} {l['pmcid']}")
        print("\n-- year-less labels (sample) --")
        for l in noyear[:15]:
            print(f"   {l['label']!r:40} {l['ledger']}")
        # Ref STRUCTURE: how exposed was the ambiguity gate? An unstructured ref
        # carries no <surname>, so before the text fallback it was invisible to
        # every surname key -- and an invisible ref cannot be rejected as a
        # duplicate. This is the size of that hole.
        nref = nunstr = 0
        metas_mixed = metas_any = 0
        for pm in sorted({l["pmcid"] for l in labels}):
            refs = load_refs(pm) or []
            if not refs:
                continue
            metas_any += 1
            u = sum(1 for r in refs if not r.get("structured"))
            nref += len(refs)
            nunstr += u
            if 0 < u < len(refs):
                metas_mixed += 1
        print("\n-- ref structure (the ambiguity-gate exposure) --")
        print(f"   refs total                    {nref:,}")
        print(f"   unstructured (no <surname>)   {fmt(nunstr, nref)}")
        print(f"   metas MIXING both kinds       {fmt(metas_mixed, metas_any)}")
        print("\n-- cardio meta titles (sample) --")
        for pm in sorted({l["pmcid"] for l in card})[:10]:
            print(f"   {pm}  {titles.get(pm, '')[:90]}")
        return 0

    if a.split:
        c = run_funnel(subset="cardio", verbose=False)["funnel"]
        o = run_funnel(subset="other", verbose=False)["funnel"]
        print("=== CARDIO vs NON-CARDIO (independent groups) ===")
        print(f"{'stage':<30}{'CARDIO':>30}{'NON-CARDIO':>30}")
        for k, lab in (("matched", "S3 label -> ONE ref"),
                       ("ambiguous", "   ambiguous (rejected)"),
                       ("doi", "S4 DOI"), ("pmid", "S5 PMID"),
                       ("nct", "S6 -> exactly ONE NCT")):
            print(f"{lab:<30}{fmt(c[k], c['labels']):>30}{fmt(o[k], o['labels']):>30}")
        out = {"cardio": c, "other": o}
        if a.json:
            with open(a.json, "w", encoding="utf-8") as fh:
                json.dump(out, fh, indent=2, default=str)
        return 0

    if a.excluded:
        r = excluded_prevalence(a.limit, corpus=a.corpus)
        n = r["metas_scanned"]
        print("=== JOB 2 — EXCLUDED-STUDIES TABLE PREVALENCE ===")
        print(f"population: {r['population']}  (scanned {n:,})")
        print(f"  phrase anywhere in XML (upper bnd) {fmt(r['text_mention'], n)}")
        print(f"  heading/caption for it             {fmt(r['excluded_heading'], n)}")
        print(f"  it captions a TABLE                {fmt(r['excluded_table'], n)}")
        print(f"  that table has a REASON column     {fmt(r['excluded_table_with_reason'], n)}")
        print("  examples:", ", ".join(r["examples"]) or "none")
        out = r
    elif a.discovery:
        out = discovery(a.limit)
        print("=== JOB 3 — REF-LIST AS TRIAL DISCOVERY ===")
        for k, v in out.items():
            print(f"  {k:<22} {v:,}")
    elif a.adjudicate:
        out = adjudicate_sample(a.adjudicate)
        print(json.dumps(out, indent=2, ensure_ascii=False))
    else:
        out = run_funnel(cardio_only=a.cardio)
        out.pop("rows", None)

    if a.json:
        with open(a.json, "w", encoding="utf-8") as fh:
            json.dump(out, fh, indent=2, ensure_ascii=False, default=str)
    return 0


if __name__ == "__main__":
    sys.exit(main())
