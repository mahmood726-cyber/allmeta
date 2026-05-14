"""EvidenceOS report builder.

The engine intentionally separates source retrieval from interpretation. It
accepts ClinicalTrials.gov and OpenAlex JSON payloads, extracts typed fields,
and emits a deterministic browser report. Missing source fields remain explicit
instead of being guessed.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
import hashlib
import json
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen


CTGOV_STUDIES_URL = "https://clinicaltrials.gov/api/v2/studies"
OPENALEX_WORKS_URL = "https://api.openalex.org/works"
CURRENT_REPORT_SCHEMA = "evidenceos.report.v0.1"


TOPIC_CONFIG: dict[str, Any] = {
    "slug": "finerenone-cardiorenal-watch",
    "title": "Finerenone Cardiorenal Evidence Watch",
    "clinical_question": (
        "Does new open trial or publication evidence require a living meta-analysis "
        "update for finerenone in cardiorenal or heart-failure populations?"
    ),
    "ctgov_query": "finerenone",
    "openalex_query": "finerenone heart failure OR chronic kidney disease",
    "surveillance_anchor": "2024-01-01",
    "minimum_meta_ready_trials": 2,
    "source_policy": "OA-first metadata; no effect estimates are inferred from abstracts or registry text.",
    "included_condition_terms": [
        "heart failure",
        "cardiorenal",
        "kidney",
        "renal",
        "nephropathy",
        "chronic kidney disease",
        "diabetes",
    ],
}


def fetch_json(url: str, params: dict[str, Any], timeout: int = 40) -> dict[str, Any]:
    target = f"{url}?{urlencode(params)}"
    request = Request(target, headers={"User-Agent": "EvidenceOS/0.1 (open evidence dashboard)"})
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_sources(page_size: int = 100, works_per_page: int = 12) -> dict[str, Any]:
    ctgov = fetch_json(
        CTGOV_STUDIES_URL,
        {
            "query.term": TOPIC_CONFIG["ctgov_query"],
            "pageSize": page_size,
            "format": "json",
        },
    )
    openalex = fetch_json(
        OPENALEX_WORKS_URL,
        {
            "search": TOPIC_CONFIG["openalex_query"],
            "per-page": works_per_page,
            "select": ",".join(
                [
                    "id",
                    "doi",
                    "title",
                    "publication_year",
                    "publication_date",
                    "open_access",
                    "primary_location",
                    "cited_by_count",
                ]
            ),
        },
    )
    return {"ctgov": ctgov, "openalex": openalex}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def iso_today() -> str:
    return date.today().isoformat()


def parse_date(value: str | None) -> date | None:
    if not value:
        return None
    for fmt in ("%Y-%m-%d", "%Y-%m", "%Y"):
        try:
            parsed = datetime.strptime(value, fmt)
            return parsed.date()
        except ValueError:
            continue
    return None


def nested_get(data: dict[str, Any], path: tuple[str, ...], default: Any = None) -> Any:
    cursor: Any = data
    for key in path:
        if not isinstance(cursor, dict) or key not in cursor:
            return default
        cursor = cursor[key]
    return cursor


def canonical_hash(payload: Any) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def normalize_text_list(values: list[Any] | None) -> list[str]:
    if not values:
        return []
    return [str(item).strip() for item in values if str(item).strip()]


def is_relevant_condition(conditions: list[str]) -> bool:
    joined = " ".join(conditions).lower()
    return any(term in joined for term in TOPIC_CONFIG["included_condition_terms"])


@dataclass(frozen=True)
class Trial:
    nct_id: str
    title: str
    status: str
    phase: str
    enrollment: int | None
    enrollment_type: str
    sponsor: str
    sponsor_class: str
    start_date: str | None
    completion_date: str | None
    last_update_posted: str | None
    has_results: bool
    is_randomized: bool
    study_type: str
    conditions: list[str]
    primary_outcomes: list[str]
    registry_references: list[dict[str, str]]
    relevance: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "nct_id": self.nct_id,
            "title": self.title,
            "status": self.status,
            "phase": self.phase,
            "enrollment": self.enrollment,
            "enrollment_type": self.enrollment_type,
            "sponsor": self.sponsor,
            "sponsor_class": self.sponsor_class,
            "start_date": self.start_date,
            "completion_date": self.completion_date,
            "last_update_posted": self.last_update_posted,
            "has_results": self.has_results,
            "is_randomized": self.is_randomized,
            "study_type": self.study_type,
            "conditions": self.conditions,
            "primary_outcomes": self.primary_outcomes,
            "registry_references": self.registry_references,
            "relevance": self.relevance,
            "ctgov_url": f"https://clinicaltrials.gov/study/{self.nct_id}",
        }


def extract_trial(study: dict[str, Any]) -> Trial:
    protocol = study.get("protocolSection", {})
    identification = protocol.get("identificationModule", {})
    status_module = protocol.get("statusModule", {})
    sponsor_module = protocol.get("sponsorCollaboratorsModule", {})
    design_module = protocol.get("designModule", {})
    conditions_module = protocol.get("conditionsModule", {})
    outcomes_module = protocol.get("outcomesModule", {})
    references_module = protocol.get("referencesModule", {})

    nct_id = str(identification.get("nctId") or "")
    title = str(identification.get("briefTitle") or identification.get("officialTitle") or nct_id)
    design_info = design_module.get("designInfo", {})
    enrollment_info = design_module.get("enrollmentInfo", {})
    sponsor = sponsor_module.get("leadSponsor", {})
    conditions = normalize_text_list(conditions_module.get("conditions"))
    phases = normalize_text_list(design_module.get("phases"))
    primary_outcomes = [
        str(item.get("measure", "")).strip()
        for item in outcomes_module.get("primaryOutcomes", [])
        if str(item.get("measure", "")).strip()
    ]
    references = []
    for ref in references_module.get("references", []):
        citation = str(ref.get("citation") or "").strip()
        pmid = str(ref.get("pmid") or "").strip()
        if citation or pmid:
            references.append({"pmid": pmid, "citation": citation, "type": str(ref.get("type") or "")})

    allocation = str(design_info.get("allocation") or "").upper()
    relevance = "core" if is_relevant_condition(conditions) else "adjacent"

    return Trial(
        nct_id=nct_id,
        title=title,
        status=str(status_module.get("overallStatus") or "UNKNOWN"),
        phase=", ".join(phases) if phases else "Not reported",
        enrollment=enrollment_info.get("count"),
        enrollment_type=str(enrollment_info.get("type") or "Not reported"),
        sponsor=str(sponsor.get("name") or "Not reported"),
        sponsor_class=str(sponsor.get("class") or "Not reported"),
        start_date=nested_get(status_module, ("startDateStruct", "date")),
        completion_date=nested_get(status_module, ("completionDateStruct", "date")),
        last_update_posted=nested_get(status_module, ("lastUpdatePostDateStruct", "date")),
        has_results=bool(study.get("hasResults")),
        is_randomized=allocation == "RANDOMIZED",
        study_type=str(design_module.get("studyType") or "Not reported"),
        conditions=conditions,
        primary_outcomes=primary_outcomes,
        registry_references=references,
        relevance=relevance,
    )


def extract_trials(ctgov_payload: dict[str, Any]) -> list[dict[str, Any]]:
    trials = [extract_trial(study).as_dict() for study in ctgov_payload.get("studies", [])]
    return sorted(trials, key=lambda row: (row["relevance"] != "core", row["nct_id"]))


def extract_publications(openalex_payload: dict[str, Any]) -> list[dict[str, Any]]:
    publications = []
    for work in openalex_payload.get("results", []):
        oa = work.get("open_access") or {}
        primary = work.get("primary_location") or {}
        source = primary.get("source") or {}
        publications.append(
            {
                "id": work.get("id"),
                "title": work.get("title"),
                "doi": work.get("doi"),
                "publication_year": work.get("publication_year"),
                "publication_date": work.get("publication_date"),
                "is_oa": bool(oa.get("is_oa")),
                "oa_status": oa.get("oa_status"),
                "oa_url": oa.get("oa_url"),
                "source": source.get("display_name"),
                "cited_by_count": work.get("cited_by_count"),
            }
        )
    return publications


def count_recent(items: list[dict[str, Any]], field: str, anchor: str) -> int:
    anchor_date = parse_date(anchor)
    if anchor_date is None:
        return 0
    count = 0
    for item in items:
        value = parse_date(item.get(field))
        if value and value >= anchor_date:
            count += 1
    return count


def summarize(trials: list[dict[str, Any]], publications: list[dict[str, Any]]) -> dict[str, Any]:
    anchor = TOPIC_CONFIG["surveillance_anchor"]
    core_trials = [trial for trial in trials if trial["relevance"] == "core"]
    randomized_trials = [trial for trial in core_trials if trial["is_randomized"]]
    completed = [trial for trial in randomized_trials if trial["status"] == "COMPLETED"]
    completed_with_results = [trial for trial in completed if trial["has_results"]]
    completed_without_results = [trial for trial in completed if not trial["has_results"]]
    active = [
        trial
        for trial in randomized_trials
        if trial["status"] in {"RECRUITING", "ACTIVE_NOT_RECRUITING", "NOT_YET_RECRUITING", "ENROLLING_BY_INVITATION"}
    ]
    registry_references = sum(len(trial["registry_references"]) for trial in core_trials)
    oa_publications = [pub for pub in publications if pub["is_oa"]]
    new_trial_updates = count_recent(core_trials, "last_update_posted", anchor)
    new_publications = count_recent(publications, "publication_date", anchor)
    meta_ready = len(completed_with_results) >= int(TOPIC_CONFIG["minimum_meta_ready_trials"])

    if new_trial_updates or new_publications:
        verdict = "Update watch triggered"
        verdict_detail = (
            "New registry updates or publication candidates exist after the surveillance anchor. "
            "Effect extraction must be reviewed before any pooled estimate is changed."
        )
    elif meta_ready:
        verdict = "Review stable, meta-ready evidence present"
        verdict_detail = "No new source signal after the surveillance anchor, and result-bearing trials are present."
    else:
        verdict = "Surveillance only"
        verdict_detail = "The open source signal is not sufficient for automatic meta-analysis updating."

    return {
        "core_trials": len(core_trials),
        "randomized_trials": len(randomized_trials),
        "completed_trials": len(completed),
        "completed_with_results": len(completed_with_results),
        "completed_without_results": len(completed_without_results),
        "active_trials": len(active),
        "registry_references": registry_references,
        "publication_candidates": len(publications),
        "oa_publication_candidates": len(oa_publications),
        "new_trial_updates_since_anchor": new_trial_updates,
        "new_publications_since_anchor": new_publications,
        "meta_ready": meta_ready,
        "verdict": verdict,
        "verdict_detail": verdict_detail,
    }


def build_report(sources: dict[str, Any]) -> dict[str, Any]:
    trials = extract_trials(sources["ctgov"])
    publications = extract_publications(sources["openalex"])
    summary = summarize(trials, publications)
    source_hashes = {
        "ctgov": canonical_hash(sources["ctgov"]),
        "openalex": canonical_hash(sources["openalex"]),
    }
    report = {
        "schema": CURRENT_REPORT_SCHEMA,
        "generated_at": iso_today(),
        "topic": TOPIC_CONFIG,
        "summary": summary,
        "trials": trials,
        "publications": publications,
        "source_hashes": source_hashes,
        "source_urls": {
            "ctgov": f"{CTGOV_STUDIES_URL}?{urlencode({'query.term': TOPIC_CONFIG['ctgov_query'], 'format': 'json'})}",
            "openalex": f"{OPENALEX_WORKS_URL}?{urlencode({'search': TOPIC_CONFIG['openalex_query']})}",
        },
        "hardcode_disclosure": [
            {
                "item": "Topic query",
                "status": "static",
                "reason": "MVP locks a single demo topic so changes in evidence state are auditable.",
            },
            {
                "item": "Trial and publication records",
                "status": "dynamic source-derived",
                "reason": "Generated from ClinicalTrials.gov and OpenAlex JSON payloads.",
            },
            {
                "item": "Clinical effect estimates",
                "status": "not inferred",
                "reason": "No pooled effect is generated until source-backed effect extraction is connected.",
            },
        ],
    }
    report["truthcert"] = {
        "algorithm": "sha256",
        "payload_hash": canonical_hash(
            {
                "schema": report["schema"],
                "topic": report["topic"],
                "summary": report["summary"],
                "trials": report["trials"],
                "publications": report["publications"],
                "source_hashes": report["source_hashes"],
            }
        ),
        "hmac": None,
        "note": "Unsigned MVP receipt; set a signing key in a future release for HMAC receipts.",
    }
    return report
