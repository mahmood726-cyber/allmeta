"""oa68k configuration — root discovery, fail-closed.

No hardcoded local paths in behaviour: every external root is discovered from an
env var first, then a short candidate list, and we FAIL LOUD if a required root is
absent (per the standing-job discipline: read paths directly, assume no user,
never silently default). Import this from every stage.

Env overrides:
  OA68K_DATA      -> where ledgers + cache live (default: <this dir>/data)
  OA68K_AACT      -> AACT parquet mirror root (for registry pre-extraction)
  OA68K_MAILTO    -> contact email for polite User-Agent (EPMC/NCBI etiquette)
"""
from __future__ import annotations

import os
import sys

# Make console UTF-8 safe on Windows cp1252 (lessons.md).
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))

# ---- The EPMC provenance query. Reproduces hitCount = 67,759 (probed 2026-07-14).
OA_META_QUERY = '(SRC:MED) AND (PUB_TYPE:"Meta-Analysis") AND (OPEN_ACCESS:y) AND (HAS_FT:y)'
EPMC_SEARCH = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
EPMC_FULLTEXT = "https://www.ebi.ac.uk/europepmc/webservices/rest/{src}/{pid}/fullTextXML"
NCBI_BIOC = ("https://www.ncbi.nlm.nih.gov/research/bionlp/RESTful/"
             "pmcoa.cgi/BioC_xml/{pmcid}/unicode")
# efetch serves TRUE JATS (<table-wrap>/<th>) for the PMC OA subset and works from
# this host where EPMC sub-resources are proxy-404'd. Preferred harvest tier.
EFETCH_PMC = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"

MAILTO = os.environ.get("OA68K_MAILTO", "mahmood726@gmail.com")
USER_AGENT = f"oa68k-pipeline/0.1 (mailto:{MAILTO})"

# ---- NCBI E-utilities rate budget.
# SECRET: read from the environment ONLY. Never hardcode it, never log it, never
# write it to a file. `net.PoliteSession` injects it into eutils calls; nothing
# else should ever touch the value. Set with:  setx NCBI_API_KEY "..."
NCBI_API_KEY = os.environ.get("NCBI_API_KEY", "")

# ⚠️ NCBI's limit is PER API KEY, not per IP: 3 req/s keyless, 10 req/s with a key.
# Two nodes sharing ONE key therefore share ONE 10/s budget — running each at 9/s
# would burn 18/s and simply earn 429s. So the per-node rate is the budget divided
# by the number of nodes sharing the key, minus headroom for the concurrent
# registry lane (crosswalk.py) which also calls NCBI from this host.
_NODES_SHARING_KEY = int(os.environ.get("OA68K_NODES_SHARING_KEY", "2"))
_HEADROOM = 0.8                                    # leave 20% for the other lane


def reqs_per_sec() -> float:
    """Per-node request rate. Explicit override wins: OA68K_RPS."""
    override = os.environ.get("OA68K_RPS")
    if override:
        return float(override)
    budget = 10.0 if NCBI_API_KEY else 3.0
    return max(0.5, budget * _HEADROOM / max(1, _NODES_SHARING_KEY))

# ---- Data root (ledgers + XML cache). Created on demand; ours to own.
DATA = os.environ.get("OA68K_DATA", os.path.join(HERE, "data"))
CACHE = os.path.join(DATA, "cache")          # cached full-text XML, content by pmcid
SEED = os.path.join(DATA, "seed.jsonl")      # one row per OA meta (shared, read-only)
INGEST_STATE = os.path.join(DATA, "ingest_state.json")

# ---- Node identity: ledgers are node-tagged so two machines never contend on one
# file. `merge.py`/`ledger.py` glob all nodes. Set OA68K_NODE=laptop on the laptop.
NODE = os.environ.get("OA68K_NODE", "pc1")

HARVEST_LEDGER = os.path.join(DATA, f"harvest.{NODE}.jsonl")
DETECT_LEDGER = os.path.join(DATA, f"detect.{NODE}.jsonl")
PREEXTRACT_LEDGER = os.path.join(DATA, f"preextract.{NODE}.jsonl")
TIER2_LEDGER = os.path.join(DATA, f"tier2.{NODE}.jsonl")


def node_ledgers(stem: str) -> list[str]:
    """All node-tagged ledgers for a stem across the fleet (for merge/coverage)."""
    import glob
    return sorted(glob.glob(os.path.join(DATA, f"{stem}.*.jsonl")))


def in_shard(pmcid: str, shard_id: int, shard_count: int) -> bool:
    """Disjoint hash partition of the corpus by PMCID. shard_count<=1 ⇒ all."""
    if shard_count <= 1:
        return True
    import hashlib
    h = int(hashlib.sha256((pmcid or "").encode()).hexdigest(), 16)
    return (h % shard_count) == shard_id


def ensure_dirs() -> None:
    os.makedirs(CACHE, exist_ok=True)


# ---- AACT parquet mirror (offline registry pre-extraction). Optional but preferred.
_AACT_CANDIDATES = [
    os.environ.get("OA68K_AACT", ""),
    r"C:\Projects\access-layer-prototype\parquet",
    r"F:\allmeta\data\aact\parquet",
]


def find_aact() -> str | None:
    """Return the AACT parquet root if one resolves on disk, else None.

    Returns None (not an exception) so the pipeline can run in harvest-only mode
    when the registry mirror is absent; preextract fails loud only when actually
    invoked without a mirror.
    """
    for c in _AACT_CANDIDATES:
        if c and os.path.isdir(c) and os.path.isdir(os.path.join(c, "studies")):
            return c
    return None


def require_aact() -> str:
    root = find_aact()
    if root is None:
        raise FileNotFoundError(
            "AACT parquet mirror not found. Set OA68K_AACT or place it at "
            + " | ".join(c for c in _AACT_CANDIDATES if c)
        )
    return root


# ---- AACT full flat-file dump (pipe-delimited). The parquet mirror above is a
# 12-table subset; the Tier-2 registry layer needs tables it does not carry
# (facilities/countries -> sites, study_references -> NCT<->PMID crosswalk,
# result_groups -> arm identity, design_outcomes -> registered outcomes).
# `aact_ext.py` converts the missing ones to parquet under AACT_EXT.
_AACT_FLAT_CANDIDATES = [
    os.environ.get("OA68K_AACT_FLAT", ""),
    r"F:\AACT-storage\AACT\2026-04-12",
]

# Snapshot identity travels with every extracted record (provenance contract).
AACT_SNAPSHOT = os.environ.get("OA68K_AACT_SNAPSHOT", "2026-04-12")

AACT_EXT = os.path.join(DATA, "aact_ext")     # parquet for tables absent upstream
STORE = os.path.join(DATA, "store")           # the shared structured trial store

# Tables we convert from the flat dump. Value = columns we keep (None = all).
AACT_EXT_TABLES = [
    "study_references",          # NCT -> PMID crosswalk (DERIVED/RESULT/BACKGROUND)
    "facilities",                # sites: city/state/country -> African-site flag
    "countries",                 # declared countries per trial
    "result_groups",            # ctgov_group_code -> arm title/description (identity)
    "design_outcomes",           # registered outcomes + time_frame (pre-results)
    "design_group_interventions",  # arm <-> intervention link (for dose per arm)
    "id_information",            # secondary IDs (other-registry crosswalk)
    "reported_event_totals",     # AE totals per group
    "participant_flows",         # flow/recruitment prose
    "drop_withdrawals",          # attrition per group
    "calculated_values",         # derived registry fields (e.g. months to report)
    "outcome_counts",            # analysed N per arm per outcome -> ArmRecord.n
    "outcome_analysis_groups",   # which arms a posted analysis contrasts
]


def find_aact_flat() -> str | None:
    """Root of the full AACT pipe-delimited dump, or None if absent."""
    for c in _AACT_FLAT_CANDIDATES:
        if c and os.path.isdir(c) and os.path.isfile(os.path.join(c, "studies.txt")):
            return c
    return None


def require_aact_flat() -> str:
    root = find_aact_flat()
    if root is None:
        raise FileNotFoundError(
            "AACT flat dump not found. Set OA68K_AACT_FLAT or place it at "
            + " | ".join(c for c in _AACT_FLAT_CANDIDATES if c)
        )
    return root


def ext_table(name: str) -> str | None:
    """Path to a converted-ext parquet file, or None if not yet converted."""
    p = os.path.join(AACT_EXT, f"{name}.parquet")
    return p if os.path.isfile(p) else None
