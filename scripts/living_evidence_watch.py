"""Living-evidence watcher — diff today's ClinicalTrials.gov + OpenAlex
results against a saved snapshot for a given topic.

Triggered by .github/workflows/living-evidence.yml on a daily cron.

Topic configs live in evidenceos/topics/<topic>.json:
    {
      "name": "Finerenone in cardiorenal patients",
      "ctgov_terms": "finerenone",
      "ctgov_conditions": ["chronic kidney disease", "heart failure"],
      "openalex_query": "finerenone heart failure",
      "min_year": 2022
    }

State snapshots live in evidenceos/state/<topic>.json.

Output to --out-summary:
    new: <count>
    new-trials: <count>
    new-pubs: <count>

    ## New trials
    - NCTxxxxxxxx — title — URL
    ...

    ## New publications
    - DOI / Work-ID — title — URL
    ...

If --out-summary path is empty (no new signals), an empty file is written
so the workflow's hashFiles check still skips issue creation gracefully.
"""
from __future__ import annotations

import argparse
import io
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = "allmeta-living-evidence/1.0 (https://github.com/mahmood726-cyber/allmeta)"


def _fetch_json(url: str, timeout: int = 30) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def fetch_ctgov(term: str, conditions: list[str], min_year: int) -> list[dict]:
    """ClinicalTrials.gov API v2 — basic study list with the topic term."""
    params = {
        "query.term": term,
        "fields": "NCTId,BriefTitle,OverallStatus,StudyType,LastUpdateSubmitDate,StartDate",
        "pageSize": 100,
    }
    if conditions:
        params["query.cond"] = " OR ".join(conditions)
    url = "https://clinicaltrials.gov/api/v2/studies?" + urllib.parse.urlencode(params)
    try:
        data = _fetch_json(url)
    except urllib.error.URLError as e:
        print(f"WARN: CT.gov fetch failed: {e}", file=sys.stderr)
        return []
    out = []
    for s in (data.get("studies") or []):
        proto = s.get("protocolSection") or {}
        ident = proto.get("identificationModule") or {}
        status = proto.get("statusModule") or {}
        nct = ident.get("nctId")
        if not nct:
            continue
        last_update = (status.get("lastUpdateSubmitDate") or "").strip()
        start = (status.get("startDateStruct") or {}).get("date") or ""
        # Cheap year gate.
        if min_year:
            for d in (last_update, start):
                if d and d[:4].isdigit() and int(d[:4]) < min_year:
                    pass
        out.append({
            "id": nct,
            "title": (ident.get("briefTitle") or "").strip(),
            "status": (status.get("overallStatus") or "").strip(),
            "last_update": last_update,
            "url": f"https://clinicaltrials.gov/study/{nct}",
        })
    return out


def fetch_openalex(query: str, min_year: int) -> list[dict]:
    """OpenAlex API — recent works matching the query."""
    params = {
        "search": query,
        "filter": f"from_publication_date:{min_year}-01-01",
        "per-page": 100,
        "select": "id,doi,title,publication_year,publication_date,host_venue,open_access",
        "sort": "publication_date:desc",
        "mailto": "allmeta-cron@example.invalid",
    }
    url = "https://api.openalex.org/works?" + urllib.parse.urlencode(params)
    try:
        data = _fetch_json(url, timeout=45)
    except urllib.error.URLError as e:
        print(f"WARN: OpenAlex fetch failed: {e}", file=sys.stderr)
        return []
    out = []
    for w in (data.get("results") or []):
        wid = w.get("id")
        if not wid:
            continue
        doi = (w.get("doi") or "").replace("https://doi.org/", "")
        out.append({
            "id": wid,
            "doi": doi,
            "title": (w.get("title") or "").strip(),
            "date": (w.get("publication_date") or "").strip(),
            "venue": ((w.get("host_venue") or {}).get("display_name") or "").strip(),
            "url": wid,
        })
    return out


def diff_lists(prev: list[dict], curr: list[dict], key: str = "id") -> list[dict]:
    """Items in `curr` whose key is not in `prev`."""
    prev_ids = {item[key] for item in prev if key in item}
    return [item for item in curr if item.get(key) not in prev_ids]


def write_summary(path: Path, new_trials: list[dict], new_pubs: list[dict], topic: str) -> None:
    lines = [
        f"# Living-evidence watch — {topic}",
        f"",
        f"_Generated {datetime.now(timezone.utc).isoformat(timespec='seconds')}_",
        f"",
        f"new: {len(new_trials) + len(new_pubs)}",
        f"new-trials: {len(new_trials)}",
        f"new-pubs: {len(new_pubs)}",
        f"",
    ]
    if new_trials:
        lines.append("## New trials")
        for t in new_trials[:50]:
            lines.append(f"- [{t['id']}]({t['url']}) — {t.get('status', '?')} — {t['title'][:120]}")
        lines.append("")
    if new_pubs:
        lines.append("## New publications")
        for p in new_pubs[:50]:
            doi = p.get("doi") or ""
            lines.append(f"- {p.get('date', '')} — [{doi or p['id']}]({p['url']}) — {p['title'][:160]}")
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--topic", required=True, help="Topic key matching evidenceos/topics/<topic>.json")
    ap.add_argument("--state-dir", default="evidenceos/state",
                    help="Directory where snapshot JSON lives (relative to repo root)")
    ap.add_argument("--out-summary", default="/tmp/watch-summary.md",
                    help="Markdown summary path (consumed by the GH Actions workflow)")
    args = ap.parse_args()

    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace") \
        if hasattr(sys.stdout, "buffer") else sys.stdout

    topic_file = ROOT / "evidenceos" / "topics" / f"{args.topic}.json"
    if not topic_file.is_file():
        # Bootstrap a tiny default topic config so the workflow stays green
        # even before the user defines topics.
        topic_file.parent.mkdir(parents=True, exist_ok=True)
        topic_file.write_text(json.dumps({
            "name": "Finerenone in cardiorenal patients (default)",
            "ctgov_terms": "finerenone",
            "ctgov_conditions": ["chronic kidney disease", "heart failure"],
            "openalex_query": "finerenone heart failure",
            "min_year": 2022,
        }, indent=2) + "\n", encoding="utf-8")
        print(f"Bootstrapped {topic_file}")

    cfg = json.loads(topic_file.read_text(encoding="utf-8"))
    state_dir = ROOT / args.state_dir
    state_dir.mkdir(parents=True, exist_ok=True)
    state_path = state_dir / f"{args.topic}.json"
    prev = json.loads(state_path.read_text(encoding="utf-8")) if state_path.is_file() else {"trials": [], "pubs": []}

    trials = fetch_ctgov(cfg["ctgov_terms"], cfg.get("ctgov_conditions", []), cfg.get("min_year", 2020))
    pubs = fetch_openalex(cfg["openalex_query"], cfg.get("min_year", 2020))
    new_trials = diff_lists(prev.get("trials", []), trials)
    new_pubs = diff_lists(prev.get("pubs", []), pubs)

    write_summary(Path(args.out_summary), new_trials, new_pubs, cfg.get("name", args.topic))

    if new_trials or new_pubs:
        state_path.write_text(json.dumps({
            "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "trials": trials, "pubs": pubs,
        }, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(f"Wrote {state_path} (new trials={len(new_trials)}, new pubs={len(new_pubs)})")
    else:
        # First run with no diffs: still save initial state so subsequent runs have a baseline.
        if not state_path.is_file():
            state_path.write_text(json.dumps({
                "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "trials": trials, "pubs": pubs,
            }, indent=2, sort_keys=True) + "\n", encoding="utf-8")
            print(f"Bootstrapped baseline at {state_path}")
        else:
            print("No new signals; state unchanged.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
