"""THE DATA-FINDER LADDER -- five rungs, four states, yield measured per rung.

MAHMOOD'S PREMISE, which this module operationalises:

    "the data is not just in primary papers, it is open access papers, metas, FDA,
     EMA, CT.gov. that is the point. all data is obtainable... it sometimes needs a
     hard search but always there somewhere."
    "best source is previous metas -- and that data is peer reviewed so easy to use."

THE RUNGS, tried in this order, each recording WHAT IT FOUND AND WHAT IT COST:

  R1 PRIOR_META   previous meta-analyses on the same question. Peer-reviewed
                  extracted data, cheapest and most reliable. Tried FIRST.
  R2 REGISTRY     ClinicalTrials.gov posted results, plus the version history
                  (/api/int/studies/<NCT>/history, which carries originalData;
                  the v2 path 404s).
  R3 LITERATURE   Europe PMC -> NCBI efetch -> PMC direct -> DOI.
  R4 REGULATORY   FDA approval letters and reviews, EMA EPARs, other agencies.
                  Our genuine edge: three times in one week an FDA review gave us
                  what no journal search would.
  R5 PROTOCOL     posted protocols and statistical analysis plans.

FOUR STATES PER DATUM, and the DEFAULT IS "NOT YET":

  OBTAINED                the VALUE is in hand, with its provenance tier.
  NOT_YET_FOUND           the default after a ladder run that did not find it.
                          It is a statement about OUR SEARCH, never about the world.
  GENUINELY_UNOBTAINABLE  granted ONLY by obtainability.earn_unobtainable(), which
                          demands a named enumeration, its date and hash, and a
                          positive control run first. A 404 cannot earn it.
  NOT_YET_ATTEMPTED       no rung has run.

THREE CAUTIONS BUILT INTO THE TYPES, each earned the hard way:

  * RETRIEVED is not OBTAINED. A rung that fetches a document but yields no value
    returns RETRIEVED_NO_VALUE, which does NOT advance the datum. We once said
    "317 of 317 retrieved" when the primary reports numbered 31. A retrieval count
    may never stand in for an evidence claim.
  * FAILED is not MISS. A transport error (403/504/timeout) is a fact about our
    reach; an empty result is a fact about the source's index. They are counted
    separately, per rung, always.
  * Every value carries a PROVENANCE TIER. A number read from the trial's own
    report is not the same evidence as one lifted from someone else's extraction
    table. Prior-meta tables are an UNVERIFIED tier -- usable, not equivalent.

Run:  python ladder.py --selftest
      python ladder.py --bench          # the HFrEF validation set
      python ladder.py --trial "DAPA-HF" --nct NCT03036124 --outcome all_cause_mortality
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.environ.get("LADDER_OUT", os.path.join(os.path.dirname(HERE), "out"))
UA = {"User-Agent": "oa68k-ladder/0.1 (mailto:" +
      os.environ.get("OA68K_MAILTO", "mahmood726@gmail.com") + ")"}


# ------------------------------------------------------------------ the states
class State(str, Enum):
    NOT_YET_ATTEMPTED = "NOT_YET_ATTEMPTED"
    NOT_YET_FOUND = "NOT_YET_FOUND"            # the default -- about OUR SEARCH
    OBTAINED = "OBTAINED"
    GENUINELY_UNOBTAINABLE = "GENUINELY_UNOBTAINABLE"   # earned, never assumed


class Rung(int, Enum):
    R1_PRIOR_META = 1
    R2_REGISTRY = 2
    R3_LITERATURE = 3
    R4_REGULATORY = 4
    R5_PROTOCOL = 5


class Outcome(str, Enum):
    HIT = "HIT"                              # a VALUE was extracted
    RETRIEVED_NO_VALUE = "RETRIEVED_NO_VALUE"  # a document came back, no value in it
    MISS = "MISS"                            # source answered, nothing there
    FAILED = "FAILED"                        # transport error -- OUR reach, not the world
    SKIPPED = "SKIPPED"                      # preconditions absent (e.g. no NCT)


# Provenance tiers, strongest first. A prior-meta table is usable and UNVERIFIED.
TIERS = ["trial_report", "trial_supplement", "regulatory_review", "protocol_sap",
         "registry_results", "prior_meta_table", "registry_reference_row"]
TIER_RANK = {t: i for i, t in enumerate(TIERS)}


@dataclass
class Attempt:
    """One rung's try at one datum. Cost is recorded whether or not it worked."""
    rung: int
    rung_name: str
    source: str
    url: str
    http_status: int | None
    seconds: float
    bytes_in: int
    payload_sha256: str
    outcome: str
    note: str
    value: dict | None = None
    provenance_tier: str = ""
    retrieved_utc: str = ""


@dataclass
class Request:
    """One DATUM being sought. field_path names exactly what is wanted."""
    trial: str
    field_path: str                 # e.g. "effect.all_cause_mortality"
    nct: str = ""
    pmid: str = ""
    doi: str = ""
    drug: str = ""
    aliases: list = field(default_factory=list)
    measure_hint: str = ""          # "HR" / "RR" -- a hint, never a filter


@dataclass
class Record:
    request: dict
    state: str = State.NOT_YET_ATTEMPTED.value
    supplying_rung: int | None = None
    supplying_rung_name: str = ""
    value: dict | None = None
    provenance_tier: str = ""
    attempts: list = field(default_factory=list)
    unobtainable_verdict: dict | None = None
    total_seconds: float = 0.0
    total_bytes: int = 0


# ------------------------------------------------------------------ http ----
# DELEGATED, not reimplemented. net.PoliteSession already carries the shared rate
# gate, the real User-Agent with a contact mailto, Retry-After honouring and
# exponential backoff. The first version of this module hand-rolled a retry loop
# with a 1.5s sleep and NO rate gate; it earned 503 on 8 of 8 rung-1 calls and 4 of
# 5 rung-3 searches. That is the whole reason net.PoliteSession exists.
#
# ONE SESSION PER HOST, each with its own limiter, because a single gate at the
# NCBI budget would throttle EBI for no reason and vice versa.
_HOST_RATE = {
    "eutils.ncbi.nlm.nih.gov": None,          # None -> config.reqs_per_sec()
    "www.ncbi.nlm.nih.gov": 2.0,
    "www.ebi.ac.uk": 1.0,                     # EPMC search is slow; do not hammer it
    "clinicaltrials.gov": 2.0,
    "api.fda.gov": 1.0,                       # 240/min keyless -> stay well under
}
_SESSIONS: dict = {}


def _host(url: str) -> str:
    m = re.match(r"https?://([^/]+)", url)
    return m.group(1).lower() if m else ""


def polite_for(url: str, extra_headers: dict | None = None):
    """A net.PoliteSession pinned to this URL's host."""
    import net as N
    import config as C
    h = _host(url)
    key = h + "|" + json.dumps(sorted((extra_headers or {}).items()))
    if key not in _SESSIONS:
        rate = _HOST_RATE.get(h, 1.0)
        mi = (1.0 / C.reqs_per_sec()) if rate is None else (1.0 / rate)
        s = N.PoliteSession(min_interval=mi, timeout=90.0)
        if extra_headers:
            s.s.headers.update(extra_headers)
        _SESSIONS[key] = s
    return _SESSIONS[key]


def _get(session, url, params=None, timeout=60, headers=None, retries=3):
    """One rate-gated, backed-off GET. Returns (response|None, seconds, error_str).

    `session` is accepted and IGNORED for the transport -- kept so callers read
    naturally -- because the host pool owns the rate gate and a caller-supplied
    bare requests.Session would defeat it.
    """
    t0 = time.time()
    try:
        r = polite_for(url, headers).get(url, params=params, max_retries=retries + 1)
        return r, time.time() - t0, ""
    except Exception as e:                           # noqa: BLE001 -- transport
        return None, time.time() - t0, type(e).__name__ + ": " + str(e)[:120]


def _sha(b) -> str:
    if b is None:
        return ""
    if isinstance(b, str):
        b = b.encode("utf-8", "replace")
    return hashlib.sha256(b).hexdigest()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ------------------------------------------------------- the effect extractor
_EXTRACTOR = None
_EXTRACTOR_INFO = {"available": False, "why": "not probed"}


def extractor():
    """The V2 extractor (rct-extractor-v2), loose-coupled exactly as
    extractor_bridge.py already does it: found by env var or candidate path,
    imported, never vendored. Fails CLOSED with a stated reason.

    180+ patterns, computation engine, per-effect consistency check. Rebuilding
    an effect-size regex set here would be a straight duplication of it.
    """
    global _EXTRACTOR, _EXTRACTOR_INFO
    if _EXTRACTOR is not None or _EXTRACTOR_INFO["available"] is False and \
            _EXTRACTOR_INFO["why"] != "not probed":
        return _EXTRACTOR
    cands = [os.environ.get("RCT_EXTRACTOR_PATH", ""),
             os.path.join("F:", os.sep, "tr-build", "rct-extractor-v2"),
             os.path.join(os.path.dirname(os.path.dirname(HERE)), "rct-extractor-v2")]
    for c in cands:
        if c and os.path.isdir(os.path.join(c, "rct_extractor")):
            sys.path.insert(0, c)
            try:
                import rct_extractor as rx
                _EXTRACTOR = rx
                _EXTRACTOR_INFO = {"available": True, "path": c, "version": rx.__version__,
                                   "why": ""}
                return rx
            except Exception as e:                   # noqa: BLE001
                _EXTRACTOR_INFO = {"available": False,
                                   "why": "import failed at " + c + ": " + str(e)[:120]}
                return None
    _EXTRACTOR_INFO = {"available": False,
                       "why": "rct-extractor-v2 not found; set RCT_EXTRACTOR_PATH"}
    return None


def extract_effect(text: str, req: Request) -> dict | None:
    """Pull the effect estimate for this request's outcome out of free text.

    The V2 extractor supplies the patterns and the plausibility/consistency checks.
    We do the OUTCOME SCOPING, which the extractor does not do: an abstract prints
    several effects and only one of them answers this field_path. Where the scope
    cannot be established we return None rather than the first effect on the page --
    an unscoped value is worse than a missing one, because it looks like data.
    """
    rx = extractor()
    if rx is None or not text:
        return None
    try:
        res = rx.extract(text)
    except Exception:                                # noqa: BLE001
        return None
    effects = res.get("effects") or []
    if not effects:
        return _derive_from_risk_reduction(text, req)

    want = OUTCOME_CUES.get(req.field_path.split(".")[-1], [])
    single_field = req.field_path.split(".")[-1] in SINGLE_OUTCOME_FIELDS
    scoped, strength = [], ""
    for n_sent in (1, 2):
        single = req.field_path.split(".")[-1] in SINGLE_OUTCOME_FIELDS
        scoped = [e for e in effects
                  if want and _cue_precedes(text, e, want, n_sent, single)]
        if scoped:
            strength = "same_sentence" if n_sent == 1 else "one_sentence_back"
            break
    pool = scoped or ([] if want else effects)
    if not pool:
        return _derive_from_risk_reduction(text, req)
    if req.measure_hint:
        m = [e for e in pool if e.get("type") == req.measure_hint]
        pool = m or pool
    # Prefer an effect that carries an INTERVAL. A ratio with no CI is not poolable,
    # and MERIT-HF returned "or =0.40" -- a bare odds ratio from a subgroup paper --
    # in preference to nothing. Preference, not a filter: an interval-less value is
    # still returned if it is all there is, and it is flagged as such.
    withci = [e for e in pool
              if e.get("ci_lower") is not None and e.get("ci_upper") is not None]
    pool = withci or pool
    e = pool[0]
    if e.get("effect_size") is None:
        return None
    return {"measure": canon_measure(e.get("type")) or e.get("type"),
            "estimate": e.get("effect_size"),
            "ci_low": e.get("ci_lower"), "ci_high": e.get("ci_upper"),
            "source_text": e.get("source_text"),
            "extractor_confidence": e.get("calibrated_confidence"),
            "consistency_ok": (e.get("consistency") or {}).get("consistent"),
            "n_effects_in_document": len(effects), "n_scoped_to_outcome": len(scoped),
            "scope_strength": strength or "unscoped_no_cue_defined",
            "has_interval": e.get("ci_lower") is not None and e.get("ci_upper") is not None}


# THE 1991 LITERATURE DOES NOT PRINT A RATIO. SOLVD's primary report says
# "reduction in risk, 16 percent; 95 percent confidence interval, 5 to 26 percent"
# and never prints 0.84 anywhere. Mahmood obtained 0.84 (0.74-0.95) by hand, by
# applying RR = 1 - RRR. That is a DERIVATION, not an extraction, and without it the
# ladder simply cannot read a whole era of trial reports.
#
# ⚠ THE INTERVAL BOUNDS INVERT: a 26% reduction is the LOWER risk ratio. Getting
# this backwards yields a plausible interval pointing the wrong way, which is the
# kind of error nothing downstream would catch.
_RRR = re.compile(
    r"(?:reduction in risk|risk reduction|reduction in mortality|relative risk "
    r"reduction|rrr)\b[^.;]{0,40}?(\d+(?:\.\d+)?)\s*(?:percent|%)"
    r"[^.]{0,90}?(?:95\s*(?:percent|%)\s*(?:confidence interval|ci))[^0-9]{0,12}"
    r"(\d+(?:\.\d+)?)\s*(?:percent|%)?\s*(?:to|-|–|,)\s*(\d+(?:\.\d+)?)\s*(?:percent|%)",
    re.I)


def _derive_from_risk_reduction(text: str, req: Request):
    """RR = 1 - RRR, with the interval bounds INVERTED. Scoped like any other value."""
    field = req.field_path.split(".")[-1]
    cues = OUTCOME_CUES.get(field, [])
    single = field in SINGLE_OUTCOME_FIELDS
    for m in _RRR.finditer(text or ""):
        head = text[max(0, m.start() - 400): m.start()]
        bounds = [b.end() for b in _SENT_END.finditer(head)]
        clause = head[bounds[-1]:] if bounds else head
        if cues and not any(c in (clause + m.group(0)).lower() for c in cues):
            continue
        pre = clause[:clause.find("(")] if "(" in clause else clause
        if single and (_is_composite(pre) or _is_cause_specific(pre)):
            continue
        p, lo, hi = (float(x) for x in m.groups())
        if not (0 <= lo <= p <= hi <= 100):
            continue                 # the reduction must sit inside its own interval
        return {"measure": "RR", "estimate": round(1 - p / 100.0, 4),
                "ci_low": round(1 - hi / 100.0, 4), "ci_high": round(1 - lo / 100.0, 4),
                "source_text": m.group(0)[:160],
                "derived": "RR = 1 - RRR; interval bounds inverted",
                "derived_from_text": True,
                "scope_strength": "same_sentence_risk_reduction",
                "has_interval": True}
    return None


_SENT_END = re.compile(r"(?<=[.;])\s+(?=[A-Z(])")


def _cue_precedes(text: str, effect: dict, cues: list, n_sentences: int,
                  single_outcome: bool = False) -> bool:
    """Does an outcome cue appear in the `n_sentences` ENDING AT this effect?

    Backward only, never forward. In clinical prose the outcome is named before its
    estimate -- "Death from any cause occurred in ... (hazard ratio 0.83)" -- so a
    window that reaches PAST the effect will swallow the NEXT outcome's label and
    scope the wrong number. That is not hypothetical: it is what plant 5 caught.
    """
    cs = effect.get("char_start")
    if cs is None:
        return False
    head = text[max(0, cs - 900):cs]
    bounds = [m.end() for m in _SENT_END.finditer(head)]
    start = bounds[-n_sentences] if len(bounds) >= n_sentences else 0
    clause = head[start:]
    window = (clause + (effect.get("source_text") or "")).lower()
    if not any(c in window for c in cues):
        return False
    # Same disqualifier as the registry path: "death from any cause OR
    # hospitalization" contains the all-cause-mortality cue and is a composite.
    if single_outcome:
        head = clause[:clause.find("(")] if "(" in clause else clause
        if _is_composite(head) or _is_cause_specific(head):
            return False
    return True


# Outcome cue words. Deliberately conservative: a cue that fires on everything is
# the same defect as no cue at all.
OUTCOME_CUES = {
    "all_cause_mortality": ["death from any cause", "all-cause mortality", "all cause mortality",
                            "death from any", "total mortality", "died from any cause",
                            "all-cause death", "mortality from any cause", "deaths",
                            # 1990s phrasing. RALES reports "relative risk of death,
                            # 0.70" and would be missed by the modern cue list
                            # alone; a cue set built only on recent trials is a
                            # sample, and everything outside it is silently lost.
                            "risk of death", "reduction in mortality", "overall mortality",
                            "total mortality", "deaths from any cause", "survival"],
    "cv_death_or_hf_hosp": ["cardiovascular death or", "cardiovascular causes or hospitalization",
                            "primary composite", "primary end point", "primary endpoint",
                            "worsening heart failure"],
}

# ⚠ A COMPOSITE TITLE CONTAINS THE SINGLE-OUTCOME CUE. "All-Cause Mortality or Heart
# Failure Hospitalization" matches the all-cause-mortality cue and is NOT all-cause
# mortality. That defect returned EMPHASIS-HF as HR 0.647 when the registry holds the
# real answer, 0.761, four rows further down the SAME module. So single-outcome
# fields carry DISQUALIFIERS, and the answer is three-state -- matched / matched-but-
# composite / no match -- never two.
#
# ⚠ AND A MARKER MUST NOT MATCH A DRUG NAME. A bare "/" was in this tuple, so
# "metoprolol CR/XL" read as a composite and MERIT-HF's OWN primary sentence --
# "All-cause mortality was lower in the metoprolol CR/XL group ... relative risk
# 0.66 [95% CI 0.53-0.81]" -- was thrown away, after which the ladder took an odds
# ratio of 0.40 out of a 2002 subgroup paper. The slash now has to be spaced.
# "sacubitril/valsartan" and "CR/XL" are the class this protects.
COMPOSITE_MARKS = (" or ", " composite", "composite of", " plus ", " and/or ", " / ", " & ")
SINGLE_OUTCOME_FIELDS = {"all_cause_mortality"}

# A CAUSE-SPECIFIC death is not all-cause death, and SOLVD's abstract prints three
# risk reductions in a row: all deaths (16%), deaths "attributed to progressive heart
# failure" (22%), and a death-or-hospitalisation composite (26%). Only the first is
# the datum. Composite disqualifiers do not catch the middle one -- it needs its own.
CAUSE_SPECIFIC_MARKS = (
    "attributed to", "due to", "cardiovascular death", "cardiac death", "cv death",
    "sudden death", "sudden cardiac", "arrhythmi", "non-cardiovascular", "cancer",
    "pump failure", "worsening heart failure", "from heart failure",
)


def _is_composite(title: str) -> bool:
    return any(m in " " + title.lower() + " " for m in COMPOSITE_MARKS)


def _is_cause_specific(clause: str) -> bool:
    return any(m in clause.lower() for m in CAUSE_SPECIFIC_MARKS)


# CT.gov paramType is free text: 'Hazard Ratio (HR)', 'Rate Ratio (RR)', 'Win Ratio
# (WR)'. Comparing it raw to "HR" scored DAPA-HF 0.83 against a hand value of 0.83 as
# a MISMATCH -- a scorer defect that would have understated the ladder by two.
_MEASURE_CANON = [
    ("HR", ("hazard ratio", "hazard-ratio", "hr")),
    ("RR", ("risk ratio", "relative risk", "rate ratio", "risk-ratio", "rr")),
    ("OR", ("odds ratio", "odds-ratio", "or")),
    ("IRR", ("incidence rate ratio", "irr")),
    ("WR", ("win ratio", "wr")),
    ("MD", ("mean difference", "md")),
    ("SMD", ("standardized mean difference", "standardised mean difference", "smd")),
    ("RD", ("risk difference", "rate difference", "rd")),
]


def canon_measure(raw) -> str:
    """Canonical measure code, or "" when it cannot be established.

    Returns "" rather than guessing: HR and RR answer different clinical questions
    (Cochrane 10.4) and a wrong code is worse than a missing one.
    """
    if not raw:
        return ""
    s = str(raw).strip().lower()
    m = re.search(r"\(([a-z]{2,3})\)\s*$", s)
    if m:
        s2 = m.group(1)
        for code, _ in _MEASURE_CANON:
            if s2 == code.lower():
                return code
    for code, forms in _MEASURE_CANON:
        for f in forms:
            if s == f or s.startswith(f + " ") or (" " + f + " ") in (" " + s + " "):
                return code
    return ""


# ------------------------------------------------------------------ RUNG 1 ---
EPMC_SEARCH = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
C_EFETCH_PMC = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
EPMC_FULLTEXT = "https://www.ebi.ac.uk/europepmc/webservices/rest/{src}/{pid}/fullTextXML"


def rung1_prior_meta(session, req: Request) -> Attempt:
    """PREVIOUS META-ANALYSES on the same question -- peer-reviewed extracted data.

    Search Europe PMC for OA meta-analyses that NAME this trial, fetch the full
    text, and read the value out of it. The value is tagged prior_meta_table:
    usable, UNVERIFIED, and never equivalent to a primary read.
    """
    names = [req.trial] + list(req.aliases)
    q = ('(PUB_TYPE:"Meta-Analysis" OR PUB_TYPE:"Systematic Review") AND OPEN_ACCESS:y '
         'AND HAS_FT:y AND (' + " OR ".join('"' + n + '"' for n in names if n) + ')')
    # resultType=lite, not core: rung 1 needs only the PMCID to fetch the full text,
    # and `core` ships every abstract in the page. Measured on this benchmark, the
    # core form of this query cost minutes; lite costs seconds. Cost is one of the
    # things this ladder exists to report, so it may as well not be self-inflicted.
    r, secs, err = _get(session, EPMC_SEARCH,
                        {"query": q, "format": "json", "pageSize": "8",
                         "resultType": "lite"})
    if r is None:
        return Attempt(1, "R1_PRIOR_META", "europepmc.search", EPMC_SEARCH, None, secs, 0,
                       "", Outcome.FAILED.value, "transport: " + err, retrieved_utc=_now())
    if r.status_code != 200:
        return Attempt(1, "R1_PRIOR_META", "europepmc.search", EPMC_SEARCH, r.status_code,
                       secs, len(r.content), _sha(r.content), Outcome.FAILED.value,
                       "http " + str(r.status_code), retrieved_utc=_now())
    try:
        hits = (r.json().get("resultList") or {}).get("result") or []
    except Exception:                                # noqa: BLE001
        hits = []
    if not hits:
        return Attempt(1, "R1_PRIOR_META", "europepmc.search", EPMC_SEARCH, 200, secs,
                       len(r.content), _sha(r.content), Outcome.MISS.value,
                       "0 OA meta-analyses naming this trial", retrieved_utc=_now())

    # ⚠ COUNT RETRIEVALS, NOT ATTEMPTS -- AND USE THE ROUTE THAT WORKS FROM HERE.
    #
    # The first version fetched EPMC's fullTextXML directly and reported "8 OA meta
    # full texts retrieved" while EVERY ONE of them 404'd. Two defects in one line:
    # it counted loop iterations as retrievals -- the exact "RETRIEVED is not
    # OBTAINED" error, committed inside the module written to prevent it -- and it
    # used a route config.py already documents as broken from this host ("efetch
    # serves TRUE JATS ... and works from this host where EPMC sub-resources are
    # proxy-404'd"). harvest.fetch_fulltext() implements that cascade
    # (efetch JATS -> EPMC -> BioC) and was there the whole time.
    #
    # So rung 1's "0 hits" was never a fact about prior meta-analyses. It was our own
    # retrieval failing, reported as our own retrieval succeeding.
    import harvest as H
    sess = polite_for(EFETCH)
    total_s, total_b = secs, len(r.content)
    attempted = retrieved = fetch_failed = 0
    for h in hits:
        pmcid = h.get("pmcid") or ""
        if not pmcid:
            continue
        attempted += 1
        t0 = time.time()
        try:
            got = H.fetch_fulltext(sess, {"pmcid": pmcid, "pmid": h.get("pmid"),
                                          "source": h.get("source") or "MED"})
        except Exception:                            # noqa: BLE001
            got = {"status": "UNOBTAINABLE", "reason": "exception"}
        total_s += time.time() - t0
        if got.get("status") != "XML" or not got.get("path"):
            fetch_failed += 1
            continue
        with open(got["path"], "rb") as _fh:
            _body = _fh.read()

        class _R:                    # keep the downstream shape unchanged
            content = _body
            text = _body.decode("utf-8", "replace")
        r2 = _R()
        url = C_EFETCH_PMC + "?db=pmc&id=" + pmcid
        retrieved += 1
        total_b += len(r2.content)
        # TABLE FIRST. A meta-analysis puts its per-trial numbers in a TABLE, and
        # jats.parse_tables already gives real column headers -- which is the whole
        # reason the JATS tier is preferred. The prose window is the fallback, not
        # the method: on the first benchmark run the prose path retrieved 8 full
        # texts per trial and extracted nothing from any of them.
        val = _prior_meta_from_tables(r2.content, names, req)
        how = "table"
        if not val:
            seg = _segment_naming_trial(_xml_text(r2.text), names)
            val = extract_effect(seg, req) if seg else None
            how = "prose"
        if val:
            val["prior_meta_route"] = how
            val["cited_by"] = {"pmcid": pmcid, "title": (h.get("title") or "")[:140],
                               "journal": h.get("journalTitle", ""), "year": h.get("pubYear", "")}
            return Attempt(1, "R1_PRIOR_META", "harvest.fetch_fulltext", url, 200,
                           total_s, total_b, _sha(r2.content), Outcome.HIT.value,
                           "value read from a prior meta-analysis (" + pmcid + ") via "
                           + str(got.get("tier")) + "; UNVERIFIED tier", value=val,
                           provenance_tier="prior_meta_table", retrieved_utc=_now())

    note = (str(retrieved) + " of " + str(attempted) + " OA meta full texts RETRIEVED ("
            + str(fetch_failed) + " unobtainable); none of the " + str(retrieved)
            + " retrieved yielded a scoped value for " + req.field_path)
    # If nothing was retrieved, this rung FAILED. Calling that RETRIEVED_NO_VALUE
    # would assert we read documents we never got.
    outcome = (Outcome.RETRIEVED_NO_VALUE.value if retrieved
               else (Outcome.FAILED.value if attempted else Outcome.MISS.value))
    return Attempt(1, "R1_PRIOR_META", "harvest.fetch_fulltext", EPMC_SEARCH, 200, total_s,
                   total_b, "", outcome, note, retrieved_utc=_now())


# An effect with its interval as one table cell: "0.83 (0.71, 0.97)", "0.83 (0.71-0.97)",
# "0.83 [0.71 to 0.97]". Bounds must bracket the point estimate or it is not one.
_CELL_EFFECT = re.compile(
    r"(\d+(?:[.,]\d+)?)\s*[\(\[]\s*(\d+(?:[.,]\d+)?)\s*(?:,|-|--|to|–|—|;)\s*"
    r"(\d+(?:[.,]\d+)?)\s*[\)\]]")


def _prior_meta_from_tables(xml_bytes: bytes, names: list, req: Request):
    """Read this trial's row out of a prior meta-analysis's TABLES.

    Delegates parsing to jats.parse_tables (real <thead> handling, including the
    PLOS <td>-header case) rather than re-deriving it. Refuses unless the table's
    caption or headers NAME THE OUTCOME -- a meta prints several outcomes and an
    unscoped row is worse than a missing one.
    """
    try:
        import jats
        tables = jats.parse_tables(xml_bytes)
    except Exception:                                # noqa: BLE001
        return None
    field = req.field_path.split(".")[-1]
    cues = OUTCOME_CUES.get(field, [])
    single = field in SINGLE_OUTCOME_FIELDS
    for t in tables:
        head = " ".join(t.get("headers") or [])
        scope_text = (t.get("caption", "") + " " + head)
        if cues and not any(c in scope_text.lower() for c in cues):
            continue
        if single and _is_composite(scope_text):
            continue
        meas = canon_measure(scope_text) or _measure_in(scope_text)
        for row in t.get("rows") or []:
            cells = [str(c) for c in row]
            label = " ".join(cells[:2])
            if not _names_trial(label, req):
                continue
            for c in cells:
                m = _CELL_EFFECT.search(c.replace(" ", " "))
                if not m:
                    continue
                est, lo, hi = (float(x.replace(",", ".")) for x in m.groups())
                if not (lo <= est <= hi):
                    continue                 # bounds must bracket the estimate
                return {"measure": meas, "estimate": est, "ci_low": lo, "ci_high": hi,
                        "source_text": (t.get("label", "") + " | " + label + " | "
                                        + c)[:200],
                        "table_caption": t.get("caption", "")[:200],
                        "scope_strength": "prior_meta_table_caption_or_header",
                        "n_tables_in_document": len(tables)}
    return None


def _measure_in(s: str) -> str:
    low = s.lower()
    for code, forms in _MEASURE_CANON:
        for f in forms:
            if len(f) > 3 and f in low:
                return code
    for code in ("HR", "RR", "OR", "IRR", "SMD", "MD", "RD"):
        if re.search(r"(?<![A-Za-z])" + code + r"(?![A-Za-z])", s):
            return code
    return ""


def _xml_text(x: str) -> str:
    x = re.sub(r"<\s*(script|style)[^>]*>.*?<\s*/\s*\1\s*>", " ", x, flags=re.S | re.I)
    x = re.sub(r"<[^>]+>", " ", x)
    return re.sub(r"\s+", " ", x)


def _segment_naming_trial(text: str, names: list) -> str:
    """Return the windows of `text` that NAME the trial, joined.

    Scoping matters: a meta-analysis of 40 trials prints 40 effects, and handing the
    extractor the whole document guarantees the wrong one.
    """
    out = []
    low = text.lower()
    for n in names:
        if not n:
            continue
        for m in re.finditer(re.escape(n.lower()), low):
            out.append(text[max(0, m.start() - 200): m.start() + 400])
        if out:
            break
    return " ... ".join(out[:12])


# ------------------------------------------------------------------ RUNG 2 ---
CTGOV_V2 = "https://clinicaltrials.gov/api/v2/studies/{nct}"
CTGOV_HISTORY = "https://clinicaltrials.gov/api/int/studies/{nct}/history"


def rung2_registry(session, req: Request) -> Attempt:
    """CT.gov posted results, then the version history (originalData).

    NAME THE FIELD PATH SEARCHED. If the outcome module holds no analysis for this
    outcome we say so as a fact about `resultsSection.outcomeMeasuresModule`, not as
    a fact about the trial.
    """
    if not req.nct:
        return Attempt(2, "R2_REGISTRY", "clinicaltrials.gov", "", None, 0.0, 0, "",
                       Outcome.SKIPPED.value, "no NCT id on the request", retrieved_utc=_now())
    url = CTGOV_V2.format(nct=req.nct)
    r, secs, err = _get(session, url)
    if r is None:
        return Attempt(2, "R2_REGISTRY", "clinicaltrials.gov/api/v2", url, None, secs, 0, "",
                       Outcome.FAILED.value, "transport: " + err, retrieved_utc=_now())
    if r.status_code != 200:
        return Attempt(2, "R2_REGISTRY", "clinicaltrials.gov/api/v2", url, r.status_code,
                       secs, len(r.content), _sha(r.content), Outcome.FAILED.value,
                       "http " + str(r.status_code), retrieved_utc=_now())
    js = r.json()
    res = (js.get("resultsSection") or {})
    om = (res.get("outcomeMeasuresModule") or {}).get("outcomeMeasures") or []
    val = _ctgov_effect(om, req)
    if val:
        return Attempt(2, "R2_REGISTRY", "clinicaltrials.gov/api/v2", url, 200, secs,
                       len(r.content), _sha(r.content), Outcome.HIT.value,
                       "resultsSection.outcomeMeasuresModule.outcomeMeasures[].analyses[]",
                       value=val, provenance_tier="registry_results", retrieved_utc=_now())

    # Posted results exist but carry no analysis for this outcome -- that is a
    # RETRIEVED_NO_VALUE, not a MISS, and certainly not an evidence claim.
    hasres = bool(js.get("hasResults") or res)
    note = ("field path searched: resultsSection.outcomeMeasuresModule"
            ".outcomeMeasures[].analyses[]; " + str(len(om)) + " outcome measures posted; "
            "no analysis matched " + req.field_path)
    hist = _history_probe(session, req.nct)
    note += " | history: " + hist["note"]
    return Attempt(2, "R2_REGISTRY", "clinicaltrials.gov/api/v2", url, 200, secs + hist["secs"],
                   len(r.content), _sha(r.content),
                   (Outcome.RETRIEVED_NO_VALUE.value if hasres else Outcome.MISS.value),
                   note, retrieved_utc=_now())


def _history_probe(session, nct: str) -> dict:
    """The version-history route. /api/int/.../history carries originalData; the v2
    path 404s. Whatever comes back is recorded as a RETRIEVAL fact about this host."""
    url = CTGOV_HISTORY.format(nct=nct)
    r, secs, err = _get(session, url, retries=1, headers={
        "Accept": "application/json",
        "Referer": "https://clinicaltrials.gov/study/" + nct + "?tab=history"})
    if r is None:
        return {"secs": secs, "note": "history FAILED (transport " + err + ") -- our reach"}
    if r.status_code != 200:
        return {"secs": secs, "note": "history FAILED http " + str(r.status_code)
                + " from this host -- a fact about OUR REACH, not about whether the "
                  "revisions exist"}
    return {"secs": secs, "note": "history 200, " + str(len(r.content)) + " bytes"}


def _ctgov_effect(outcome_measures: list, req: Request) -> dict | None:
    field = req.field_path.split(".")[-1]
    cues = OUTCOME_CUES.get(field, [])
    single = field in SINGLE_OUTCOME_FIELDS
    n_cue = n_composite_rejected = 0
    for om in outcome_measures:
        raw_title = (om.get("title") or "")
        title = (raw_title + " " + (om.get("description") or "")).lower()
        if cues and not any(c in title for c in cues):
            continue
        n_cue += 1
        if single and _is_composite(raw_title):
            n_composite_rejected += 1
            continue        # a composite is NOT the single outcome, however it reads
        for an in om.get("analyses") or []:
            pv = an.get("paramValue")
            if pv in (None, ""):
                continue
            try:
                est = float(str(pv).replace(",", ""))
            except ValueError:
                continue
            return {"measure": canon_measure(an.get("paramType")),
                    "measure_raw": an.get("paramType"),
                    "estimate": est,
                    "ci_low": _f(an.get("ciLowerLimit")),
                    "ci_high": _f(an.get("ciUpperLimit")),
                    "source_text": raw_title[:160],
                    "ci_pct": an.get("ciPctValue"),
                    "n_outcome_measures_scanned": len(outcome_measures),
                    "n_matched_cue": n_cue,
                    "n_rejected_as_composite": n_composite_rejected,
                    "scope_strength": "registry_outcome_title"}
    return None


def _f(x):
    try:
        return float(str(x).replace(",", ""))
    except (TypeError, ValueError):
        return None


# ------------------------------------------------------------------ RUNG 3 ---
EFETCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
ESEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"


def rung3_literature(session, req: Request) -> Attempt:
    """Europe PMC -> NCBI efetch -> PMC direct -> DOI, in that order.

    The datum wanted is the TRIAL'S OWN report. Abstract first (it is what a human
    reads first and it is where SOLVD-T's effect actually lives), OA full text next.
    """
    total_s = 0.0
    total_b = 0
    notes = []

    # 3a Europe PMC: SEEDING ONLY. It contributes candidate PMIDs; it no longer
    # extracts. The abstract shortcut here had only the title to gate on, so it
    # returned before the ranking below could run and handed back PARADIGM-HF's
    # mortality HR as 1.17 from a 2026 German-cohort paper. One extraction path,
    # one gate, one ranking.
    q = _primary_report_query(req)
    epmc_pmids = []
    r, s, err = _get(session, EPMC_SEARCH,
                     {"query": q, "format": "json", "pageSize": "50", "resultType": "lite"})
    total_s += s
    if r is None or r.status_code != 200:
        notes.append("epmc search " + (str(r.status_code) if r is not None else "FAILED " + err))
    else:
        total_b += len(r.content)
        hits = (r.json().get("resultList") or {}).get("result") or []
        epmc_pmids = [h["pmid"] for h in hits if h.get("pmid")]
        notes.append("epmc seeded " + str(len(epmc_pmids)) + " pmids")

    # 3b NCBI efetch: the ONLY extraction path, over ranked own-reports.
    pmid = req.pmid or ""
    cands = ([pmid] if pmid else []) + _esearch_pmids(session, req, notes)
    cands += [p for p in epmc_pmids if p not in cands]
    ranked = []
    if cands:
        # ONE efetch for every candidate, then rank offline.
        r2, s2, err2 = _get(session, EFETCH,
                            {"db": "pubmed", "id": ",".join(cands[:180]),
                             "retmode": "xml"})
        total_s += s2
        if r2 is None or r2.status_code != 200:
            notes.append("efetch FAILED " + (err2 or str(getattr(r2, "status_code", "?"))))
        else:
            total_b += len(r2.content)
            ranked = _rank_reports(r2.text, req)
            notes.append(str(len(cands[:180])) + " candidates fetched, "
                         + str(len(ranked)) + " are the trial's own report")
            # TWO PASSES over the ranked own-reports: first accept only a value that
            # carries an INTERVAL, then settle for one without. A ratio with no
            # interval is not poolable, and preferring it merely because its document
            # ranked higher is how "or =0.40" beat "relative risk 0.66 [0.53-0.81]".
            for require_interval in (True, False):
                for rec in ranked:
                    val = extract_effect(rec["abstract"], req)
                    if not val:
                        continue
                    if require_interval and not val.get("has_interval"):
                        continue
                    val["interval_pass"] = "with_interval" if require_interval \
                        else "no_interval_available"
                    val["report"] = {"pmid": rec["pmid"], "year": rec["year"],
                                     "title": rec["title"][:140],
                                     "why_primary": rec["why"],
                                     "rank_among_own_reports": ranked.index(rec) + 1,
                                     "n_own_reports": len(ranked)}
                    notes.append("value from pmid " + rec["pmid"] + " (" + rec["year"]
                                 + ", " + rec["why"] + ")")
                    return Attempt(3, "R3_LITERATURE", "ncbi.efetch.pubmed", EFETCH, 200,
                                   total_s, total_b, _sha(r2.content), Outcome.HIT.value,
                                   "; ".join(notes), value=val,
                                   provenance_tier="trial_report", retrieved_utc=_now())
            if ranked and not pmid:
                pmid = ranked[0]["pmid"]
            if ranked:
                notes.append("no scoped value in any of the " + str(len(ranked))
                             + " own-report abstracts")

    # 3c PMC open-access full text.
    pmcid = _pmcid_for(session, pmid, notes) if pmid else ""
    if pmcid:
        url = EPMC_FULLTEXT.format(src="PMC", pid=pmcid)
        r3, s3, err3 = _get(session, url, timeout=90)
        total_s += s3
        if r3 is not None and r3.status_code == 200:
            total_b += len(r3.content)
            val = extract_effect(_xml_text(r3.text), req)
            notes.append("pmc fulltext " + pmcid)
            if val:
                val["report"] = {"pmid": pmid, "pmcid": pmcid}
                return Attempt(3, "R3_LITERATURE", "pmc.fullTextXML", url, 200, total_s,
                               total_b, _sha(r3.content), Outcome.HIT.value, "; ".join(notes),
                               value=val, provenance_tier="trial_report", retrieved_utc=_now())
        else:
            notes.append("pmc fulltext FAILED " + (err3 or str(getattr(r3, "status_code", "?"))))

    outcome = Outcome.RETRIEVED_NO_VALUE.value if total_b else Outcome.MISS.value
    return Attempt(3, "R3_LITERATURE", "epmc+efetch+pmc", EPMC_SEARCH, None, total_s,
                   total_b, "", outcome, "; ".join(notes) or "nothing retrieved",
                   retrieved_utc=_now())


def _primary_report_query(req: Request) -> str:
    names = [req.trial] + list(req.aliases)
    parts = ['("' + n + '")' for n in names if n]
    q = "(" + " OR ".join(parts) + ")"
    if req.nct:
        q = "(" + q + ' OR "' + req.nct + '")'
    return q + ' AND (PUB_TYPE:"Randomized Controlled Trial" OR PUB_TYPE:"Clinical Trial, Phase III" OR SRC:MED)'


def _esearch_pmids(session, req: Request, notes: list) -> list:
    """Candidate PMIDs. The NCT is tried first because it is an identity, not a
    string match; the trial name is a fallback and its hits must still be gated."""
    # ⚠ FOR A PRE-REGISTRY TRIAL THE ACRONYM IS OFTEN IN THE COLLECTIVE AUTHOR, NOT
    # THE TITLE. RALES's primary report is titled "The effect of spironolactone on
    # morbidity and mortality in patients with severe heart failure"; the trial's
    # name appears only as the author, "Randomized Aldactone Evaluation Study
    # Investigators". SOLVD is the same. A title-only search cannot reach either, so
    # [Author] is a first-class route, not a fallback.
    #
    # And ALL strong terms are collected rather than stopping at the first that
    # returns anything: stopping early is how the primary report stays outside the
    # candidate set, and a ranking cannot rank what it was never given.
    ids: list = []
    names = [n for n in ([req.trial] + list(req.aliases)) if n]
    # ⚠ AND retmax IS A DENOMINATOR. PubMed returns ids newest-first, so a small
    # retmax silently drops the OLD papers -- exactly where a primary report sits.
    # Measured: at retmax 15 the true primary report was inside the candidate set for
    # 1 of 5 trials. Ids are cheap; fetch a wide list and let the ranking choose.
    #
    # The registry accession is searched in its OWN field, [si] (secondary source id).
    # A bare NCT string does not reliably reach the DataBank entry.
    # [cn] is the CORPORATE/COLLECTIVE author field and it is the one that reaches
    # the pre-registry primary reports: SOLVD's 1991 NEJM paper is authored by "SOLVD
    # Investigators" and is found by SOLVD[cn] and by nothing else here -- not
    # [Title], not [Author], not [tiab].
    strong = (['"' + req.nct + '"[si]'] if req.nct else []) \
        + ['"' + n + '"[Title]' for n in names] \
        + [n + '[cn]' for n in names] \
        + ['"' + n + '"[Author]' for n in names]
    weak = ['"' + n + '"[tiab]' for n in names]

    def _run(term, retmax):
        r, s, err = _get(session, ESEARCH, {"db": "pubmed", "term": term,
                                            "retmax": str(retmax), "retmode": "json"})
        if r is None or r.status_code != 200:
            notes.append("esearch FAILED for " + term[:40])
            return []
        return ((r.json().get("esearchresult") or {}).get("idlist") or [])

    for term in strong[:12]:
        ids += [i for i in _run(term, 120) if i not in ids]
    if not ids:
        for term in weak[:3]:
            ids += [i for i in _run(term, 120) if i not in ids]
            if ids:
                break
    notes.append("esearch " + str(len(ids)) + " candidate pmids")
    return ids


def _rank_reports(xml: str, req: Request) -> list:
    """Split a multi-record efetch, keep the trial's OWN reports, rank them.

    ⚠ THE SECOND HALF OF THE CITING-PAPER PROBLEM. Rejecting papers that name the
    trial only in the abstract removes the Chagas-cardiomyopathy class. It does NOT
    remove the trial's own SECONDARY analyses, which name it in their titles too --
    "PARADIGM-HF eligibility in historical German cohorts", a 2012 RALES subgroup
    paper -- and those returned 1.17 and 1.90 where the primary reports say 0.84 and
    0.70. Naming is a filter; it is not a ranking.

    Rank, strongest first:
      1. the record carries the trial's REGISTRATION as its own,
      2. EARLIEST publication year -- the primary report precedes its own
         secondary literature, and that is the one ordering which separates
         them without knowing the answer,
      3. typed a randomised controlled trial.

    YEAR OUTRANKS THE PUBLICATION TYPE, and the order was the other way round
    until it cost a datum: SOLVD's 1991 primary report carries no 'Randomized
    Controlled Trial' tag -- the tag is applied inconsistently to pre-1995
    records -- while a 1998 secondary analysis does, so the type test promoted
    the secondary above the primary. An attribute that is MISSING for the old
    records must not outrank the attribute that identifies them.

    Ties keep esearch's order. Every rank is recorded on the value, so a value taken
    from rank 3 of 7 says so.
    """
    out = []
    for block in re.findall(r"<PubmedArticle>.*?</PubmedArticle>", xml, flags=re.S):
        ok, why = _is_primary_report(block, req)
        if not ok:
            continue
        pm = re.search(r"<PMID[^>]*>(\d+)</PMID>", block)
        yr = re.search(r"<PubDate>.*?<Year>(\d{4})</Year>", block, flags=re.S) or \
            re.search(r"<ArticleDate[^>]*>.*?<Year>(\d{4})</Year>", block, flags=re.S)
        ptypes = " ".join(re.findall(r"<PublicationType[^>]*>(.*?)</PublicationType>",
                                     block, flags=re.S)).lower()
        out.append({
            "pmid": pm.group(1) if pm else "",
            "year": yr.group(1) if yr else "9999",
            "title": _xml_text(" ".join(re.findall(
                r"<ArticleTitle[^>]*>(.*?)</ArticleTitle>", block, flags=re.S))),
            "abstract": _pubmed_abstract(block),
            "why": why,
            "has_registration": why.startswith("record carries"),
            "is_rct": "randomized controlled trial" in ptypes,
            "is_design_paper": bool(_DESIGN_PAPER.search(_xml_text(" ".join(re.findall(
                r"<ArticleTitle[^>]*>(.*?)</ArticleTitle>", block, flags=re.S))))),
        })
    # ⚠ AND A TRIAL'S OWN LITERATURE STARTS BEFORE ITS RESULTS DO. "Earliest year"
    # walks straight into the RATIONALE-AND-DESIGN paper, which is the trial's own,
    # names it in the title, and reports no outcome: MERIT-HF's rank 1 was its 1997
    # design paper, out of which the ladder read "or =0.40". Design papers are
    # DEMOTED, not excluded -- they are still the trial's own documents, and rung 5
    # wants exactly them.
    out.sort(key=lambda r: (r["is_design_paper"], not r["has_registration"],
                            r["year"], not r["is_rct"]))
    return out


_DESIGN_PAPER = re.compile(
    r"\b(rationale|study design|design and (?:rationale|organi[sz]ation|methods)|"
    r"organi[sz]ation of|study protocol|protocol for|baseline characteristics|"
    r"design of the|methods? of the|statistical analysis plan)\b", re.I)


def _is_primary_report(xml: str, req: Request) -> tuple:
    """Is this PubMed record the trial's OWN report, or a paper that merely CITES it?

    ⚠ NAMING THE TRIAL IS NECESSARY AND NOT SUFFICIENT, and the gap is not cosmetic:
    without this gate the benchmark returned PARADIGM-HF's mortality HR as 1.82 --
    read out of a 2026 paper on Chagas cardiomyopathy that cites it -- and
    CIBIS-II's as 1.06 from another citing paper. Both were internally consistent,
    confidently extracted, and wrong. A confident wrong value is worse than a
    missing one.

    Two independent discriminators, either of which suffices:

      1. THE RECORD CARRIES THE TRIAL'S REGISTRATION AS ITS OWN. PubMed records the
         registry accession of the trial a paper REPORTS in <DataBank>, not of the
         trials it cites. This catches PARADIGM-HF, whose title -- "Angiotensin-
         neprilysin inhibition versus enalapril in heart failure" -- does not name
         the trial at all.
      2. THE INVESTIGATOR GROUP AUTHORED IT. A paper whose CollectiveName is the
         trial's own investigator group IS the trial's report, by authorship.
      3. THE TITLE NAMES THE TRIAL. This catches the rest of the pre-registry era:
         CIBIS-II and MERIT-HF put the trial's name in their titles.

    ⚠ ARM 2 IS NOT OPTIONAL, AND ITS ABSENCE COST A DATUM. SOLVD's 1991 primary
    report is titled "Effect of enalapril on survival in patients with reduced left
    ventricular ejection fractions and congestive heart failure" -- the trial is not
    named in it at all -- and is authored by "SOLVD Investigators". A title-only test
    REJECTED the primary report as a citing paper, and the ladder then read its value
    out of a 1998 secondary analysis. This is the same fact that made [cn] the only
    search field able to reach it: if the collective author is how you FIND a paper,
    the collective author is also how you RECOGNISE it.

    Returns (is_primary, why) so the reason is recorded either way.
    """
    banks = re.findall(r"<AccessionNumber[^>]*>(.*?)</AccessionNumber>", xml, flags=re.S)
    if req.nct and any(req.nct.upper() in b.upper() for b in banks):
        return True, "record carries " + req.nct + " as its own registration"
    collective = " ".join(re.findall(r"<CollectiveName>(.*?)</CollectiveName>",
                                     xml, flags=re.S))
    if collective and _names_trial(_xml_text(collective), req):
        return True, "authored by the trial's own investigator group"
    title = _xml_text(" ".join(re.findall(r"<ArticleTitle[^>]*>(.*?)</ArticleTitle>",
                                          xml, flags=re.S)))
    if _names_trial(title, req):
        return True, "title names the trial"
    return False, ("names the trial only in the abstract -- this is a CITING paper, "
                   "not the trial's own report")


def _names_trial(text: str, req: Request) -> bool:
    """Does this document actually name the trial? Acronyms are matched on a word
    boundary so that 'SOLVD' does not match inside another token, and the NCT id
    counts as a name."""
    low = (text or "").lower()
    if req.nct and req.nct.lower() in low:
        return True
    for n in [req.trial] + list(req.aliases):
        if not n:
            continue
        pat = re.escape(n.lower()).replace(r"\-", r"[\-\s]?")
        if re.search(r"(?<![a-z0-9])" + pat + r"(?![a-z0-9])", low):
            return True
    return False


def _pubmed_title_abstract(xml: str) -> str:
    t = re.findall(r"<ArticleTitle[^>]*>(.*?)</ArticleTitle>", xml, flags=re.S)
    return _xml_text(" ".join(t)) + " " + _pubmed_abstract(xml)


def _pubmed_abstract(xml: str) -> str:
    m = re.findall(r"<AbstractText[^>]*>(.*?)</AbstractText>", xml, flags=re.S)
    if not m:
        return ""
    return _xml_text(" ".join(m))


def _pmcid_for(session, pmid: str, notes: list) -> str:
    r, s, err = _get(session, "https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/",
                     {"ids": pmid, "format": "json"})
    if r is None or r.status_code != 200:
        return ""
    try:
        recs = r.json().get("records") or []
        return (recs[0].get("pmcid") or "") if recs else ""
    except Exception:                                # noqa: BLE001
        return ""


# ------------------------------------------------------------------ RUNG 4 ---
OPENFDA_LABEL = "https://api.fda.gov/drug/label.json"
OPENFDA_DRUGSFDA = "https://api.fda.gov/drug/drugsfda.json"
EMA_SEARCH = "https://www.ema.europa.eu/en/medicines/download-medicine-data"


def rung4_regulatory(session, req: Request) -> Attempt:
    """FDA + EMA. Our genuine edge: the regulator sees every trial submitted.

    Two things happen here and they are DIFFERENT:
      (a) we look for the document, and
      (b) when we cannot find one, we ask an ENUMERATION whether one should exist.
    Only (b) can ever produce GENUINELY_UNOBTAINABLE, and only through
    obtainability.earn_unobtainable().
    """
    if not req.drug:
        return Attempt(4, "R4_REGULATORY", "fda+ema", "", None, 0.0, 0, "",
                       Outcome.SKIPPED.value, "no drug name on the request",
                       retrieved_utc=_now())
    total_s = 0.0
    total_b = 0
    notes = []

    r, s, err = _get(session, OPENFDA_DRUGSFDA,
                     {"search": 'openfda.generic_name:"' + req.drug + '"', "limit": "5"})
    total_s += s
    if r is None:
        notes.append("drugsfda FAILED " + err)
    elif r.status_code == 404:
        notes.append("drugsfda: 0 applications for generic_name=" + req.drug)
    elif r.status_code != 200:
        notes.append("drugsfda FAILED http " + str(r.status_code))
    else:
        total_b += len(r.content)
        results = (r.json().get("results") or [])
        appls = [x.get("application_number", "") for x in results]
        notes.append("drugsfda: " + str(len(results)) + " applications " + ",".join(appls[:5]))
        # The review PDFs live at accessdata under the published naming convention.
        # We record their addresses; text extraction from scanned reviews is an OCR
        # problem and is out of this module's scope -- stated, not hidden.
        if appls:
            notes.append("review PDFs addressable at accessdata.fda.gov/drugsatfda_docs/nda/"
                         "<year>/<applno>Orig1s000StatR.pdf -- NOT parsed here (scanned "
                         "reviews need OCR; see regulatory/REGULATORY-SOURCE.md sec 5)")

    r2, s2, err2 = _get(session, OPENFDA_LABEL,
                        {"search": 'openfda.generic_name:"' + req.drug + '"', "limit": "1"})
    total_s += s2
    if r2 is not None and r2.status_code == 200:
        total_b += len(r2.content)
        res = (r2.json().get("results") or [])
        if res:
            blob = " ".join(str(v) for k, v in res[0].items()
                            if k in ("clinical_studies", "clinical_pharmacology"))
            val = extract_effect(_xml_text(blob), req)
            notes.append("label clinical_studies " + str(len(blob)) + " chars")
            if val:
                return Attempt(4, "R4_REGULATORY", "openfda.label.clinical_studies",
                               OPENFDA_LABEL, 200, total_s, total_b, _sha(blob),
                               Outcome.HIT.value, "; ".join(notes), value=val,
                               provenance_tier="regulatory_review", retrieved_utc=_now())
    else:
        notes.append("label " + (str(getattr(r2, "status_code", "?")) if r2 is not None
                                 else "FAILED " + err2))

    outcome = Outcome.RETRIEVED_NO_VALUE.value if total_b else Outcome.MISS.value
    return Attempt(4, "R4_REGULATORY", "fda(openfda)+ema", OPENFDA_DRUGSFDA, None, total_s,
                   total_b, "", outcome, "; ".join(notes), retrieved_utc=_now())


# ------------------------------------------------------------------ RUNG 5 ---
def rung5_protocol(session, req: Request) -> Attempt:
    """Posted protocols and SAPs. CT.gov carries them in
    documentSection.largeDocumentModule.largeDocs when the sponsor posted them."""
    if not req.nct:
        return Attempt(5, "R5_PROTOCOL", "clinicaltrials.gov.largeDocs", "", None, 0.0, 0, "",
                       Outcome.SKIPPED.value, "no NCT id", retrieved_utc=_now())
    url = CTGOV_V2.format(nct=req.nct)
    r, secs, err = _get(session, url, {"fields": "documentSection,protocolSection.identificationModule"})
    if r is None or r.status_code != 200:
        return Attempt(5, "R5_PROTOCOL", "clinicaltrials.gov.largeDocs", url,
                       getattr(r, "status_code", None), secs, 0, "", Outcome.FAILED.value,
                       "transport/http " + (err or str(getattr(r, "status_code", "?"))),
                       retrieved_utc=_now())
    js = r.json()
    docs = (((js.get("documentSection") or {}).get("largeDocumentModule") or {})
            .get("largeDocs") or [])
    note = ("field path searched: documentSection.largeDocumentModule.largeDocs; "
            + str(len(docs)) + " posted documents "
            + ",".join(sorted({d.get("typeAbbrev", "?") for d in docs})))
    # A protocol/SAP states what WILL be measured. It is not a results source, and
    # treating it as one is the "data-extraction table is not a synthesis
    # commitment" error. We record availability; we do not mine a value from it.
    return Attempt(5, "R5_PROTOCOL", "clinicaltrials.gov.largeDocs", url, 200, secs,
                   len(r.content), _sha(r.content),
                   (Outcome.RETRIEVED_NO_VALUE.value if docs else Outcome.MISS.value),
                   note + " | a protocol/SAP states what will be MEASURED, not the result; "
                          "availability recorded, no value mined",
                   retrieved_utc=_now())


RUNGS = [(Rung.R1_PRIOR_META, rung1_prior_meta),
         (Rung.R2_REGISTRY, rung2_registry),
         (Rung.R3_LITERATURE, rung3_literature),
         (Rung.R4_REGULATORY, rung4_regulatory),
         (Rung.R5_PROTOCOL, rung5_protocol)]


# ------------------------------------------------------------------ the climb
def climb(req: Request, session=None, stop_at_first_hit: bool = True,
          only: list | None = None) -> Record:
    """Run the ladder for ONE datum. Returns a Record whose default state is
    NOT_YET_FOUND -- never 'unavailable'."""
    import requests
    session = session or requests.Session()
    rec = Record(request=asdict(req), state=State.NOT_YET_FOUND.value)
    for rung, fn in RUNGS:
        if only and rung.value not in only:
            continue
        try:
            a = fn(session, req)
        except Exception as e:                       # noqa: BLE001
            a = Attempt(rung.value, rung.name, "?", "", None, 0.0, 0, "",
                        Outcome.FAILED.value, "exception: " + type(e).__name__ + " "
                        + str(e)[:140], retrieved_utc=_now())
        rec.attempts.append(asdict(a))
        rec.total_seconds += a.seconds
        rec.total_bytes += a.bytes_in
        # ⚠ THE FIRST HIT WINS, ALWAYS. `stop_at_first_hit=False` means "keep running
        # the lower rungs so their standalone yield can be MEASURED"; it does not mean
        # "let a lower rung overwrite a higher one". Rung order IS priority order, and
        # without this guard the measurement pass silently changed the answer it was
        # measuring -- EMPEROR-Reduced flipped from MATCHED to MISMATCHED because
        # rung 3 overwrote rung 2's exact registry value.
        if a.outcome == Outcome.HIT.value and a.value and rec.supplying_rung is None:
            rec.state = State.OBTAINED.value
            rec.supplying_rung = rung.value
            rec.supplying_rung_name = rung.name
            rec.value = a.value
            rec.provenance_tier = a.provenance_tier
            if stop_at_first_hit:
                break
    return rec


# --------------------------------------------------------------- the measure
def yield_report(records: list) -> dict:
    """YIELD PER RUNG, with the numerator AND the denominator, and a sentence
    saying what the denominator is OF.

    The denominator for rung N is NOT the number of data requested. It is the
    number that were STILL UNFOUND WHEN RUNG N RAN -- because the ladder stops at
    the first hit, so a lower rung never sees a datum an upper rung supplied.
    Quoting hits/total instead would understate every lower rung.
    """
    per = {}
    for rung, _ in RUNGS:
        per[rung.name] = {"rung": rung.value, "reached": 0, "hit": 0,
                          "retrieved_no_value": 0, "miss": 0, "failed": 0, "skipped": 0,
                          "seconds": 0.0, "bytes": 0}
    for rec in records:
        for a in rec["attempts"] if isinstance(rec, dict) else rec.attempts:
            a = a if isinstance(a, dict) else asdict(a)
            p = per[a["rung_name"]]
            p["reached"] += 1
            p["seconds"] += a["seconds"]
            p["bytes"] += a["bytes_in"]
            key = {"HIT": "hit", "RETRIEVED_NO_VALUE": "retrieved_no_value", "MISS": "miss",
                   "FAILED": "failed", "SKIPPED": "skipped"}[a["outcome"]]
            p[key] += 1
    n = len(records)
    states = {}
    for rec in records:
        s = rec["state"] if isinstance(rec, dict) else rec.state
        states[s] = states.get(s, 0) + 1
    return {
        "n_data_requested": n,
        "states": states,
        "per_rung": per,
        "denominator_note": (
            "'reached' is the denominator for its own rung: the number of data for "
            "which THIS RUNG ACTUALLY RAN. The ladder stops at the first hit, so a "
            "rung's denominator is the set still unfound when it was reached -- not "
            "n_data_requested. 'hit' counts data where a VALUE was extracted; "
            "'retrieved_no_value' counts documents fetched that yielded none, and is "
            "reported separately because a retrieval count is not an evidence claim. "
            "'failed' is a transport error and measures OUR REACH, not the source."),
    }


def print_yield(rep: dict) -> None:
    print("\nDATA REQUESTED: " + str(rep["n_data_requested"]) + " (one datum = one trial x one field)")
    print("FINAL STATES:")
    for k, v in sorted(rep["states"].items()):
        print("  " + k.ljust(24) + str(v) + "/" + str(rep["n_data_requested"]))
    print("\nYIELD PER RUNG  (hit / reached -- reached is the denominator for THAT rung)")
    print("  rung                  hit  ret-no-val  miss  fail  skip   reached    sec     KB")
    for name, p in sorted(rep["per_rung"].items(), key=lambda kv: kv[1]["rung"]):
        print("  " + name.ljust(18)
              + str(p["hit"]).rjust(5) + str(p["retrieved_no_value"]).rjust(12)
              + str(p["miss"]).rjust(6) + str(p["failed"]).rjust(6) + str(p["skipped"]).rjust(6)
              + str(p["reached"]).rjust(10) + ("%.1f" % p["seconds"]).rjust(8)
              + str(int(p["bytes"] / 1024)).rjust(7))
    print("\n" + rep["denominator_note"])


# ------------------------------------------------------------------ selftest
def _selftest() -> int:
    """Plants both ways over the parts that do not need the network."""
    fails = []

    def check(label, cond):
        print(("  ok    " if cond else "  FAIL  ") + label)
        if not cond:
            fails.append(label)

    print("PLANT 1 -- default state is NOT_YET_FOUND, never 'unavailable'")
    rec = Record(request={})
    check("a fresh Record is NOT_YET_ATTEMPTED", rec.state == State.NOT_YET_ATTEMPTED.value)

    print("PLANT 2 -- a retrieval with no value must NOT count as a hit")
    recs = [{"state": "NOT_YET_FOUND", "attempts": [
        {"rung": 1, "rung_name": "R1_PRIOR_META", "outcome": "RETRIEVED_NO_VALUE",
         "seconds": 1.0, "bytes_in": 10}]}]
    rep = yield_report(recs)
    check("hit=0 when a document was retrieved but no value extracted",
          rep["per_rung"]["R1_PRIOR_META"]["hit"] == 0)
    check("retrieved_no_value=1 and is reported separately",
          rep["per_rung"]["R1_PRIOR_META"]["retrieved_no_value"] == 1)

    print("PLANT 3 -- FAILED and MISS are counted separately")
    recs = [{"state": "NOT_YET_FOUND", "attempts": [
        {"rung": 2, "rung_name": "R2_REGISTRY", "outcome": "FAILED", "seconds": 0.1, "bytes_in": 0},
        {"rung": 3, "rung_name": "R3_LITERATURE", "outcome": "MISS", "seconds": 0.1, "bytes_in": 0}]}]
    rep = yield_report(recs)
    check("failed lands in 'failed'", rep["per_rung"]["R2_REGISTRY"]["failed"] == 1)
    check("miss lands in 'miss'", rep["per_rung"]["R3_LITERATURE"]["miss"] == 1)
    check("failed does not leak into miss", rep["per_rung"]["R2_REGISTRY"]["miss"] == 0)

    print("PLANT 4 -- the denominator is per-rung 'reached', not n requested")
    recs = [{"state": "OBTAINED", "attempts": [
                {"rung": 1, "rung_name": "R1_PRIOR_META", "outcome": "HIT", "seconds": 1, "bytes_in": 1}]},
            {"state": "OBTAINED", "attempts": [
                {"rung": 1, "rung_name": "R1_PRIOR_META", "outcome": "MISS", "seconds": 1, "bytes_in": 1},
                {"rung": 3, "rung_name": "R3_LITERATURE", "outcome": "HIT", "seconds": 1, "bytes_in": 1}]}]
    rep = yield_report(recs)
    check("R1 reached 2", rep["per_rung"]["R1_PRIOR_META"]["reached"] == 2)
    check("R3 reached 1, NOT 2", rep["per_rung"]["R3_LITERATURE"]["reached"] == 1)

    print("PLANT 5 -- outcome scoping refuses an unscoped value")
    rx = extractor()
    if rx is None:
        print("  SKIP  extractor absent: " + str(_EXTRACTOR_INFO.get("why")))
    else:
        txt = ("Renal events occurred in 120 vs 150 patients (hazard ratio 0.79; 95% CI, "
               "0.62 to 1.00).")
        req = Request(trial="X", field_path="effect.all_cause_mortality")
        check("no all-cause-mortality cue in the text -> None, not the renal HR",
              extract_effect(txt, req) is None)
        txt2 = txt + (" Death from any cause occurred in 276 of 2373 vs 329 of 2371 "
                      "(hazard ratio, 0.83; 95% CI, 0.71 to 0.97).")
        got = extract_effect(txt2, req)
        check("with the cue present it returns 0.83, not 0.79",
              got is not None and abs(got["estimate"] - 0.83) < 1e-9)

    print("PLANT 6 -- a COMPOSITE title must not satisfy a single-outcome field")
    oms = [
        {"title": "Number of Participants With First Occurrence of All-Cause Mortality "
                  "or Heart Failure (HF) Hospitalization",
         "analyses": [{"paramType": "Hazard Ratio (HR)", "paramValue": "0.647",
                       "ciLowerLimit": "0.552", "ciUpperLimit": "0.757"}]},
        {"title": "Number of Participants With First Occurrence of All-Cause Mortality "
                  "(Adjudicated)",
         "analyses": [{"paramType": "Hazard Ratio (HR)", "paramValue": "0.761",
                       "ciLowerLimit": "0.622", "ciUpperLimit": "0.932"}]},
    ]
    reqE = Request(trial="EMPHASIS-HF", field_path="effect.all_cause_mortality")
    got = _ctgov_effect(oms, reqE)
    check("EMPHASIS-HF returns 0.761, not the composite 0.647",
          got is not None and abs(got["estimate"] - 0.761) < 1e-9)
    check("the composite rejection is COUNTED, not silent",
          got is not None and got["n_rejected_as_composite"] == 1)
    check("with the single-outcome row removed it refuses rather than falling back "
          "to the composite", _ctgov_effect(oms[:1], reqE) is None)

    print("PLANT 7 -- CT.gov paramType must canonicalise, or a true match scores as a miss")
    check("'Hazard Ratio (HR)' -> HR", canon_measure("Hazard Ratio (HR)") == "HR")
    check("'Rate Ratio (RR)' -> RR", canon_measure("Rate Ratio (RR)") == "RR")
    check("'Win Ratio (WR)' -> WR, not HR", canon_measure("Win Ratio (WR)") == "WR")
    check("an unrecognised type returns '' rather than a guess",
          canon_measure("Some New Statistic") == "")

    print("PLANT 8 -- a document that does not NAME the trial must be rejected")
    reqC = Request(trial="CIBIS-II", field_path="effect.all_cause_mortality",
                   aliases=["CIBIS II"], nct="")
    check("an unrelated abstract is rejected",
          not _names_trial("Bisoprolol in a cohort of outpatients with heart failure", reqC))
    check("the trial's own report is accepted",
          _names_trial("The Cardiac Insufficiency Bisoprolol Study II (CIBIS-II): a "
                       "randomised trial", reqC))
    check("a hyphen/space variant is accepted", _names_trial("CIBIS II results", reqC))
    check("a substring inside another token is NOT accepted",
          not _names_trial("XCIBIS-IIY", reqC))

    print("PLANT 9 -- the prior-meta TABLE path reads the right row and refuses the rest")
    xml = (b'<article><body><table-wrap><label>Table 2</label>'
           b'<caption><p>All-cause mortality, hazard ratios by trial</p></caption>'
           b'<table><thead><tr><th>Trial</th><th>HR (95% CI)</th></tr></thead>'
           b'<tbody>'
           b'<tr><td>DAPA-HF 2019</td><td>0.83 (0.71, 0.97)</td></tr>'
           b'<tr><td>EMPEROR-Reduced 2020</td><td>0.92 (0.77, 1.10)</td></tr>'
           b'</tbody></table></table-wrap>'
           b'<table-wrap><label>Table 3</label>'
           b'<caption><p>Cardiovascular death or heart failure hospitalisation</p></caption>'
           b'<table><thead><tr><th>Trial</th><th>HR (95% CI)</th></tr></thead>'
           b'<tbody><tr><td>DAPA-HF 2019</td><td>0.74 (0.65, 0.85)</td></tr>'
           b'</tbody></table></table-wrap></body></article>')
    rq = Request(trial="DAPA-HF", field_path="effect.all_cause_mortality",
                 aliases=["DAPA HF"])
    got = _prior_meta_from_tables(xml, ["DAPA-HF"], rq)
    check("reads DAPA-HF's mortality row (0.83), not the composite table (0.74)",
          got is not None and abs(got["estimate"] - 0.83) < 1e-9)
    check("measure taken from the header", got is not None and got["measure"] == "HR")
    check("does not return the OTHER trial's row",
          got is not None and "EMPEROR" not in got["source_text"])
    rq2 = Request(trial="CIBIS-II", field_path="effect.all_cause_mortality")
    check("a trial absent from the table returns None, not the first row",
          _prior_meta_from_tables(xml, ["CIBIS-II"], rq2) is None)
    xml_noscope = xml.replace(b"All-cause mortality, hazard ratios by trial",
                              b"Baseline characteristics")
    check("an unscoped table is refused even though the row is there",
          _prior_meta_from_tables(xml_noscope, ["DAPA-HF"], rq) is None)
    xml_bad = xml.replace(b"0.83 (0.71, 0.97)", b"0.83 (1.71, 0.97)")
    check("bounds that do not bracket the estimate are rejected",
          _prior_meta_from_tables(xml_bad, ["DAPA-HF"], rq) is None)

    print("PLANT 10 -- a composite marker must not fire on a DRUG NAME")
    check("'metoprolol CR/XL group' is not a composite",
          not _is_composite("All-cause mortality was lower in the metoprolol CR/XL group"))
    check("'sacubitril/valsartan' is not a composite",
          not _is_composite("Death from any cause in the sacubitril/valsartan arm"))
    check("'mortality or HF hospitalisation' still IS a composite",
          _is_composite("All-cause mortality or heart failure hospitalisation"))
    check("a spaced slash still IS a composite", _is_composite("Death / hospitalisation"))

    print("PLANT 11 -- a CAUSE-SPECIFIC death is not all-cause death")
    check("'deaths attributed to progressive heart failure' is cause-specific",
          _is_cause_specific("the largest reduction occurred among the deaths "
                             "attributed to progressive heart failure"))
    check("'There were 510 deaths in the placebo group' is NOT cause-specific",
          not _is_cause_specific("There were 510 deaths in the placebo group"))

    print("PLANT 12 -- RR = 1 - RRR, and the interval bounds INVERT")
    solvd = ("There were 510 deaths in the placebo group (39.7 percent), as compared "
             "with 452 in the enalapril group (35.2 percent) (reduction in risk, 16 "
             "percent; 95 percent confidence interval, 5 to 26 percent; P = 0.0036). "
             "Although reductions in mortality were observed in several categories of "
             "cardiac deaths, the largest reduction occurred among the deaths "
             "attributed to progressive heart failure (251 in the placebo group vs. "
             "209 in the enalapril group; reduction in risk, 22 percent; 95 percent "
             "confidence interval, 6 to 35 percent).")
    rqS = Request(trial="SOLVD", field_path="effect.all_cause_mortality")
    got = _derive_from_risk_reduction(solvd, rqS)
    check("16% reduction -> RR 0.84", got is not None and abs(got["estimate"] - 0.84) < 1e-9)
    check("the 26% bound becomes the LOWER limit 0.74",
          got is not None and abs(got["ci_low"] - 0.74) < 1e-9)
    check("the 5% bound becomes the UPPER limit 0.95",
          got is not None and abs(got["ci_high"] - 0.95) < 1e-9)
    check("bounds are the right way round",
          got is not None and got["ci_low"] < got["ci_high"])
    check("it does NOT take the 22% cause-specific reduction",
          got is not None and abs(got["estimate"] - 0.78) > 1e-6)
    bad = solvd.replace("reduction in risk, 16 percent; 95 percent confidence "
                        "interval, 5 to 26 percent",
                        "reduction in risk, 16 percent; 95 percent confidence "
                        "interval, 20 to 26 percent")
    gotbad = _derive_from_risk_reduction(bad, rqS)
    check("a point estimate outside its own interval is refused",
          gotbad is None or abs(gotbad["estimate"] - 0.84) > 1e-6)

    print("PLANT 15 -- a rung that retrieved NOTHING must not say RETRIEVED_NO_VALUE")
    import harvest as _H
    _real_fetch = _H.fetch_fulltext
    _real_get = globals()["_get"]

    class _FakeResp:
        status_code = 200
        content = (b'{"resultList":{"result":[{"pmcid":"PMC1"},{"pmcid":"PMC2"}]},'
                   b'"hitCount":2}')

        def json(self):
            return json.loads(self.content)

    try:
        globals()["_get"] = lambda *a, **k: (_FakeResp(), 0.1, "")
        _H.fetch_fulltext = lambda s, row: {"status": "UNOBTAINABLE",
                                            "reason": "no_free_fulltext"}
        at = rung1_prior_meta(None, Request(trial="X",
                                            field_path="effect.all_cause_mortality"))
        check("0 retrieved of 2 attempted -> FAILED, not RETRIEVED_NO_VALUE",
              at.outcome == Outcome.FAILED.value)
        check("the note says '0 of 2 ... RETRIEVED', never '2 retrieved'",
              "0 of 2 OA meta full texts RETRIEVED" in at.note)
    finally:
        _H.fetch_fulltext = _real_fetch
        globals()["_get"] = _real_get

    print("PLANT 14 -- a measurement pass must not change the answer it measures")

    class _FakeAttempt:
        pass

    saved = list(RUNGS)
    try:
        def _hit(rungno, val):
            def fn(session, req):
                return Attempt(rungno, "R" + str(rungno) + "_X", "s", "u", 200, 0.1, 1,
                               "a" * 64, Outcome.HIT.value, "", value=val,
                               provenance_tier="registry_results", retrieved_utc="t")
            return fn
        RUNGS[:] = [(Rung.R2_REGISTRY, _hit(2, {"estimate": 0.92, "measure": "HR"})),
                    (Rung.R3_LITERATURE, _hit(3, {"estimate": 1.11, "measure": "HR"}))]
        rec = climb(Request(trial="T", field_path="effect.all_cause_mortality"),
                    session=object(), stop_at_first_hit=False)
        check("running every rung still returns the FIRST rung's value",
              rec.value["estimate"] == 0.92)
        check("and names the FIRST rung as the supplier", rec.supplying_rung == 2)
        check("while still recording BOTH attempts for the yield table",
              len(rec.attempts) == 2)
    finally:
        RUNGS[:] = saved

    print("PLANT 13 -- a RATIONALE/DESIGN paper must not outrank the results paper")
    check("MERIT-HF's design-paper title is recognised",
          bool(_DESIGN_PAPER.search("Rationale, design, and organization of the "
                                    "Metoprolol CR/XL Randomized Intervention Trial "
                                    "in Heart Failure (MERIT-HF)")))
    check("a study-protocol title is recognised",
          bool(_DESIGN_PAPER.search("Study protocol for the XYZ trial")))
    check("the RESULTS paper's title is NOT flagged as a design paper",
          not _DESIGN_PAPER.search("Effect of metoprolol CR/XL in chronic heart "
                                   "failure: MERIT-HF"))
    check("nor is a plain outcome title",
          not _DESIGN_PAPER.search("Angiotensin-neprilysin inhibition versus "
                                   "enalapril in heart failure"))

    print("RESTORE -- yield_report still correct after every plant")
    rep = yield_report([{"state": "OBTAINED", "attempts": [
        {"rung": 1, "rung_name": "R1_PRIOR_META", "outcome": "HIT", "seconds": 1, "bytes_in": 1}]}])
    check("restoration asserted", rep["per_rung"]["R1_PRIOR_META"]["hit"] == 1)

    n = 49 if extractor() is not None else 47
    print("\nselftest: " + str(n - len(fails)) + "/" + str(n) + " -- "
          + ("PASS" if not fails else "FAIL " + str(fails)))
    return 1 if fails else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--bench", action="store_true", help="run the HFrEF validation set")
    ap.add_argument("--trial", default="")
    ap.add_argument("--nct", default="")
    ap.add_argument("--drug", default="")
    ap.add_argument("--outcome", default="all_cause_mortality")
    ap.add_argument("--all-rungs", action="store_true",
                    help="do not stop at the first hit -- measures every rung's yield")
    ap.add_argument("--out", default="")
    a = ap.parse_args()

    if a.selftest:
        return _selftest()
    if a.bench:
        import ladder_bench
        return ladder_bench.main([] if not a.out else ["--out", a.out])
    if a.trial:
        req = Request(trial=a.trial, field_path="effect." + a.outcome, nct=a.nct, drug=a.drug)
        rec = climb(req, stop_at_first_hit=not a.all_rungs)
        print(json.dumps(asdict(rec) if not isinstance(rec, dict) else rec, indent=1)[:6000])
        print_yield(yield_report([asdict(rec)]))
        return 0
    ap.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
