"""Multi-registry identifier extraction — widening the JOIN KEY beyond NCT.

## The hypothesis under test (Mahmood): "the issue is the key, not the data"

We join trials on NCT. An African malaria or TB trial registered on PACTR or ISRCTN
has NO NCT at all. It exists in the abstract layer, in OA full text, and in a
registry — and our join scores it UNLINKED because there is no shared identifier.
If that is what is happening, then the join predicate is quietly defining African
trials out of the corpus, and we would be reporting our own engineering limit as a
property of the evidence base.

This module parses registration IDs of ANY registry from paper text, so the claim
becomes measurable: for records with no NCT, is there another registry ID present?

  KEY-ABSENT  - a registration ID exists, just not an NCT  -> our join's fault, fixable
  DATA-ABSENT - no registration ID of any registry at all  -> a real (partial) ceiling

Formats verified against the registries' own published ID patterns:
  NCT      NCT00000000            ClinicalTrials.gov (US)
  ISRCTN   ISRCTN00000000         ISRCTN (UK)
  PACTR    PACTR000000000000000   Pan African CTR  <- the one that matters here
  CTRI     CTRI/2000/00/000000    India
  ChiCTR   ChiCTR-XXX-00000000 / ChiCTR2000000000   China
  EudraCT  2000-000000-00         EU
  JPRN     UMIN000000000, jRCT0000000000, JapicCTI-000000
  IRCT     IRCT00000000000000N0   Iran
  ANZCTR   ACTRN00000000000000    Australia/NZ
  NTR      NTR0000                Netherlands
  DRKS     DRKS00000000           Germany
  TCTR     TCTR00000000           Thailand
  RPCEC    RPCEC00000000          Cuba
  SLCTR    SLCTR/2000/000         Sri Lanka
  KCT      KCT0000000             Korea
"""
from __future__ import annotations

import re

# Ordered; each pattern is anchored on the registry's own prefix so a match is a
# real identifier rather than an incidental number.
PATTERNS: dict[str, re.Pattern] = {
    "NCT":     re.compile(r"\bNCT\d{8}\b"),
    "ISRCTN":  re.compile(r"\bISRCTN\s?\d{8}\b", re.IGNORECASE),
    "PACTR":   re.compile(r"\bPACTR\d{12,18}\b", re.IGNORECASE),
    "CTRI":    re.compile(r"\bCTRI\s?/\s?\d{4}\s?/\s?\d{2,3}\s?/\s?\d{6}\b", re.IGNORECASE),
    "ChiCTR":  re.compile(r"\bChiCTR[-\w]{0,12}?\d{6,10}\b", re.IGNORECASE),
    "EudraCT": re.compile(r"\b20\d{2}-\d{6}-\d{2}\b"),
    "UMIN":    re.compile(r"\bUMIN\s?0{0,3}\d{6,9}\b", re.IGNORECASE),
    "jRCT":    re.compile(r"\bjRCTs?\d{9,10}\b", re.IGNORECASE),
    "JapicCTI": re.compile(r"\bJapicCTI-\d{6}\b", re.IGNORECASE),
    "IRCT":    re.compile(r"\bIRCT\d{11,18}N\d{1,3}\b", re.IGNORECASE),
    "ANZCTR":  re.compile(r"\bACTRN\d{14}\b", re.IGNORECASE),
    "NTR":     re.compile(r"\bNTR\d{3,4}\b"),
    "DRKS":    re.compile(r"\bDRKS\d{8}\b", re.IGNORECASE),
    "TCTR":    re.compile(r"\bTCTR\d{11}\b", re.IGNORECASE),
    "RPCEC":   re.compile(r"\bRPCEC\d{8}\b", re.IGNORECASE),
    "SLCTR":   re.compile(r"\bSLCTR\s?/\s?\d{4}\s?/\s?\d{3}\b", re.IGNORECASE),
    "KCT":     re.compile(r"\bKCT\d{7}\b", re.IGNORECASE),
}

# African / LMIC-first registries — the ones an NCT-only join structurally misses.
AFRICAN_LMIC = {"PACTR", "CTRI", "IRCT", "SLCTR", "TCTR", "RPCEC", "ChiCTR"}


def find_all(text: str) -> dict[str, list[str]]:
    """{registry: [ids]} for every registration identifier present in the text."""
    out: dict[str, list[str]] = {}
    for name, pat in PATTERNS.items():
        hits = {m.group(0).strip() for m in pat.finditer(text)}
        if hits:
            out[name] = sorted(hits)
    return out


def classify(ids: dict[str, list[str]]) -> str:
    """KEY-ABSENT vs DATA-ABSENT vs NCT-LINKABLE — the table that decides priority."""
    if not ids:
        return "DATA-ABSENT"          # no registration of any registry found
    if "NCT" in ids:
        return "NCT-LINKABLE"         # our current join already reaches it
    return "KEY-ABSENT"               # registered, but not on CT.gov -> our join's gap


def non_nct_registries(ids: dict[str, list[str]]) -> list[str]:
    return sorted(k for k in ids if k != "NCT")
