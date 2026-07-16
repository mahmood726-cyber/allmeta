"""Stage F3 — the link a forest plot does not carry: row label -> PMID -> NCT.

A forest plot names its studies the way humans cite them ("Ahmad Othman 2023",
"Pots 2016"), never by NCT. So a vision-read row cannot be compared to registry
ground truth until the label is resolved to a trial. The chain is:

    forest row label  --(surname+year)-->  meta's JATS <ref-list> entry
                      --(pub-id pmid)  -->  PMID
                      --(AACT study_references, DERIVED/RESULT only)--> NCT
                      --(AACT trials, results_posted)--> registry events/N

Each hop is lossy and each is measured rather than assumed. Two hops deserve
specific care:

1. **DERIVED/RESULT only.** BACKGROUND means the trial cited the paper, not that
   the paper reports the trial; 60-68% of AACT's crosswalk is BACKGROUND, and one
   famous citation fans out to hundreds of NCTs. Accepting BACKGROUND would attach
   other trials' numbers to this row and manufacture a "mismatch" that is really a
   linking error. This is the single largest correctness risk in the whole join.

2. **Ambiguity is dropped, not guessed.** If a label matches two refs (same
   surname and year — common: "Wang 2019" twice), or a PMID maps to >1 NCT, the
   row is returned `ambiguous` and excluded from the accuracy denominator. A
   validation set that silently picks the first match measures the guesser, not
   the reader.

Surname normalisation handles the real shapes seen in RevMan labels: "van der
Berg 2011", "O'Brien 2015", "Ahmad Othman 2023" (two-word surname), accents,
and the "Smith 2016a/2016b" suffix RevMan adds for same-author-same-year studies.
"""
from __future__ import annotations

import re
import unicodedata
import xml.etree.ElementTree as ET

_YEAR = re.compile(r"(19|20)\d{2}")


def _strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s)
                   if not unicodedata.combining(c))


def norm_name(s: str) -> str:
    """Fold a surname to a comparable key: accents, case, punctuation, spacing."""
    s = _strip_accents(s or "").lower()
    s = s.replace("'", "").replace("’", "").replace("-", " ")
    s = re.sub(r"[^a-z ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def parse_label(label: str) -> tuple[str, str, str] | None:
    """'Ahmad Othman 2023a' -> (surname_key, '2023', 'a'). None if no year.

    The year anchors the parse: everything before it is the author part. RevMan
    labels put the year last, optionally with a disambiguating letter suffix.
    Also handles 'Smith et al. 2016' and 'Smith & Jones 2016'.
    """
    if not label:
        return None
    lab = label.strip()
    ms = list(_YEAR.finditer(lab))
    if not ms:
        return None
    m = ms[-1]
    year = m.group(0)
    suffix = ""
    tail = lab[m.end():m.end() + 2].strip()
    if tail[:1].isalpha():
        suffix = tail[0].lower()
    author = lab[:m.start()]
    author = re.sub(r"\bet\s+al\.?\b", " ", author, flags=re.I)
    author = re.split(r"[&,;]| and ", author, flags=re.I)[0]
    key = norm_name(author)
    if not key:
        return None
    return key, year, suffix


def ref_entries(xml_bytes: bytes) -> list[dict]:
    """[{pmid, surnames[], year}] for each <ref> that carries a PMID.

    We keep every surname in the ref (not just the first): a label may name the
    second author when the first is a group, and matching on any listed surname
    with the right year is far more robust than assuming position.
    """
    out: list[dict] = []
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return out
    for ref in root.iter():
        if ref.tag.split("}")[-1] != "ref":
            continue
        pmid = ""
        surnames: list[str] = []
        years: list[str] = []
        for el in ref.iter():
            t = el.tag.split("}")[-1]
            if t == "pub-id" and (el.get("pub-id-type") or "").lower() == "pmid":
                v = (el.text or "").strip()
                if v.isdigit():
                    pmid = v
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
        if not pmid or not surnames:
            continue
        out.append({"pmid": pmid,
                    "surname_keys": sorted({norm_name(s) for s in surnames if s}),
                    "year": years[0] if years else ""})
    return out


def match_label(label: str, refs: list[dict], year_slack: int = 1) -> dict:
    """Resolve one forest row label against a meta's ref entries.

    Returns {'status': matched|ambiguous|unmatched, 'pmid': ...,'n_candidates':n}.

    `year_slack` exists because a review may cite the epub year while the label
    uses the print year (or vice versa) — a 1-year drift is routine and rejecting
    it would throw away good rows. Slack is applied ONLY when the exact year finds
    nothing, and a slack match that is ambiguous stays ambiguous.
    """
    p = parse_label(label)
    if not p:
        return {"status": "unmatched", "why": "no year in label"}
    key, year, _suf = p

    def _cands(slack: int) -> list[dict]:
        out = []
        for r in refs:
            if not r["year"]:
                continue
            try:
                if abs(int(r["year"]) - int(year)) > slack:
                    continue
            except ValueError:
                continue
            # The label's author key must match a listed surname exactly after
            # normalisation, or be a prefix of a multi-word surname ("Ahmad
            # Othman" vs "Ahmad-Othman"). Substring matching in the other
            # direction would let "Wang" match "Wangchuk".
            for sk in r["surname_keys"]:
                if sk == key or key.startswith(sk + " ") or sk.startswith(key + " "):
                    out.append(r)
                    break
        return out

    c = _cands(0) or _cands(year_slack)
    pmids = sorted({r["pmid"] for r in c})
    if not pmids:
        return {"status": "unmatched", "why": "no ref with this surname+year",
                "n_candidates": 0}
    if len(pmids) > 1:
        # Same surname + year on two different papers. Cannot be resolved from
        # the label alone; guessing would corrupt the validation set.
        return {"status": "ambiguous", "n_candidates": len(pmids),
                "pmids": pmids}
    return {"status": "matched", "pmid": pmids[0], "n_candidates": 1}
