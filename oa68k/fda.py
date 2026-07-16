"""Stage R1 — Drugs@FDA regulatory review documents. THE LESS-SELECTED SAMPLE.

Why this matters more than another paper source: Turner 2008's entire result came
from FDA review data being the *less-selected* sample — the regulator sees every
trial submitted, including the ones that never reached a journal. Until now the
reversal answer key has been built from N=3 reconstructions. If the reviews are
pullable at scale, the key can be built from REAL regulatory data, which upgrades
the whole validation backbone.

REACHABILITY — probed 2026-07-16, and the answer is yes, cleanly:

  Route: FDA's OFFICIAL bulk data files (one download, no scraping)
         https://www.fda.gov/media/89850/download  ->  drugsatfda.zip (6 MB)
         ApplicationDocs.txt = 80,500 rows carrying the exact ApplicationDocsURL.
  Counts (batch-actual, from FDA's own file):
         Review 7,833 | Summary Review 768 | Pediatric Medical Review 559
         Pediatric Statistical Review 367 | Letter 37,014 | Label 29,601
  Licence: US federal government work — public domain, no licence gate.

ROBOTS / TERMS — checked before any fetch, and the distinction is load-bearing:
  * www.fda.gov robots.txt: `Disallow: /` applies ONLY to `vspider` (a 2005 bot),
    NOT to us. For `User-agent: *` it sets Crawl-Delay: 30 and disallows /file/
    and /node/ — so www.fda.gov is NOT a place to crawl documents. We touch it
    exactly once, for /media/89850/download, which is not disallowed.
  * accessdata.fda.gov robots.txt: for `*` it disallows only some CDER BMIS and
    CDRH device script paths. `/drugsatfda_docs/` — where every review PDF lives
    — is ALLOWED, with no crawl-delay. That is the host we fetch PDFs from.
  * The review TOC pages carry <meta name="ROBOTS" content="noindex, nofollow">.
    We therefore do NOT spider them: URLs come from FDA's official
    ApplicationDocs.txt, and per-document PDFs from the published naming
    convention. We never follow links off that page.

CONTENT — verified on a real review (BLA125516, Unituxin/dinutuximab):
  StatR.pdf 1.1 MB, 34 pages, TEXT-extractable (not scans), 20 extractable
  tables, carrying per-trial efficacy: p=0.0115, p=0.0330, hazard ratios, 95% CIs,
  and a study table with "# of Subjects per Arm". So the reviews really do carry
  per-trial results, not just prose.

LINKAGE — the one real gap, and it has a solution:
  The reviews carry NO NCT ids (zero in all 34 pages). They identify trials by
  PROTOCOL CODE (ANBL0032, DIV-NB-301). AACT's id_information maps those back:
      ANBL0032 -> NCT00026312     ANBL0532 -> NCT00567567
  (752,993 ids over 579,768 trials: org_study_id 579,765 / secondary_id 169,894).
  So: FDA review -> protocol code -> NCT -> our registry store -> PMID -> paper.
  That closes the Turner loop on real regulatory data.

Run:  python fda.py --ingest              # official bulk -> store (one download)
      python fda.py --harvest --limit 50  # review PDFs (polite, resumable)
      python fda.py --link                # protocol codes -> NCT
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import zipfile
from datetime import date

import config as C
from net import PoliteSession, append_jsonl, load_done_keys

# FDA's own published bulk file. One request to www.fda.gov, never a crawl.
DRUGSATFDA_ZIP = "https://www.fda.gov/media/89850/download"

FDA_DIR = os.path.join(C.STORE, "fda")
PDF_CACHE = os.path.join(C.DATA, "fda_pdf")
FDA_LEDGER = os.path.join(C.DATA, f"fda_docs.{C.NODE}.jsonl")

# The document types that carry trial results. Letters/labels do not.
REVIEW_TYPES = {"Review", "Summary Review", "Pediatric Statistical Review",
                "Pediatric Medical Review", "Pediatric CDTL Review",
                "Pediatric Medical Secondary Review", "Pediatric DD Summary Review"}

# Individual review PDFs sit beside the TOC under the published naming
# convention <ApplNo>Orig<n>s<sss><Suffix>.pdf. StatR/MedR are the Turner-relevant
# ones. We construct these rather than spidering the nofollow TOC page.
PDF_SUFFIXES = ["StatR", "MedR", "SumR", "ClinPharmR", "CrossR", "MedRevPart1"]

# A protocol code as reviews write them: ANBL0032, DIV-NB-301, CA209-067, etc.
PROTOCOL_RE = re.compile(r"\b(?:[A-Z]{2,8}[-\s]?\d{2,6}(?:[-\s]?\d{2,4})?|"
                         r"[A-Z]{1,4}\d{3,6}[A-Z]?\d{0,4})\b")


def _rows(z: zipfile.ZipFile, name: str) -> list[dict]:
    txt = z.read(name).decode("utf-8", "replace").splitlines()
    return list(csv.DictReader(txt, delimiter="\t"))


def ingest() -> dict:
    """One download of FDA's official bulk file -> parquet in the shared store."""
    import pyarrow as pa
    import pyarrow.parquet as pq

    os.makedirs(FDA_DIR, exist_ok=True)
    sess = PoliteSession(min_interval=1.0)
    r = sess.get(DRUGSATFDA_ZIP, params={"attachment": ""})
    if r.status_code != 200 or len(r.content) < 100_000:
        raise RuntimeError(f"Drugs@FDA bulk fetch failed: {r.status_code}, "
                           f"{len(r.content)}B — refusing to ingest a partial file")
    z = zipfile.ZipFile(io.BytesIO(r.content))
    today = date.today().isoformat()

    lookup = {x["ApplicationDocsType_Lookup_ID"]:
              x["ApplicationDocsType_Lookup_Description"]
              for x in _rows(z, "ApplicationsDocsType_Lookup.txt")}
    apps = {a["ApplNo"]: a for a in _rows(z, "Applications.txt")}

    docs = []
    for d in _rows(z, "ApplicationDocs.txt"):
        appno = d["ApplNo"]
        a = apps.get(appno, {})
        dtype = lookup.get(d["ApplicationDocsTypeID"], "?")
        docs.append({
            "appl_no": appno,
            "appl_type": (a.get("ApplType") or "").strip(),   # NDA / BLA / ANDA
            "sponsor": (a.get("SponsorName") or "").strip(),
            "doc_type": dtype,
            "is_review": dtype in REVIEW_TYPES,
            "submission_type": (d.get("SubmissionType") or "").strip(),
            "submission_no": (d.get("SubmissionNo") or "").strip(),
            "url": d.get("ApplicationDocsURL"),
            "doc_date": (d.get("ApplicationDocsDate") or "")[:10],
            "source_tier": "regulatory",
            "locator": d.get("ApplicationDocsURL"),
            "licence": "US federal government work — public domain",
            "provenance": "FDA official bulk data file (Drugs@FDA data files)",
            "extracted_at": today,
        })
    app_rows = [{
        "appl_no": a["ApplNo"], "appl_type": (a.get("ApplType") or "").strip(),
        "sponsor": (a.get("SponsorName") or "").strip(),
        "source_tier": "regulatory",
        "locator": f"https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm"
                   f"?event=overview.process&ApplNo={a['ApplNo']}",
        "licence": "US federal government work — public domain",
        "extracted_at": today,
    } for a in apps.values()]

    for name, rows in (("fda_applications", app_rows), ("fda_docs", docs)):
        dst = os.path.join(FDA_DIR, f"{name}.parquet")
        tmp = dst + ".tmp"
        pq.write_table(pa.Table.from_pylist(rows), tmp, compression="zstd")
        os.replace(tmp, dst)

    n_rev = sum(1 for d in docs if d["is_review"])
    out = {"applications": len(app_rows), "docs": len(docs),
           "review_docs": n_rev,
           "review_docs_nda_bla": sum(1 for d in docs if d["is_review"]
                                      and d["appl_type"] in ("NDA", "BLA")),
           "by_type": {t: sum(1 for d in docs if d["doc_type"] == t)
                       for t in sorted(REVIEW_TYPES)},
           "path": FDA_DIR, "licence": "public domain (US federal work)"}
    print(f"[fda:ingest] {json.dumps(out, indent=2)}")
    return out


def _pdf_urls(toc_url: str) -> list[tuple[str, str]]:
    """(suffix, pdf_url) candidates for a review package.

    Built from the published filename convention, NOT by following links off the
    TOC page (which is marked nofollow). A 404 simply means that review type does
    not exist for this application — recorded, not inferred.
    """
    m = re.match(r"(?i)^(https?://[^?]+/)([0-9A-Za-z]+Orig\d+s\d+)TOC\.html?$",
                 (toc_url or "").strip())
    if not m:
        return []
    base, stem = m.group(1), m.group(2)
    return [(s, f"{base}{stem}{s}.pdf") for s in PDF_SUFFIXES]


def harvest(limit: int = 50) -> dict:
    """Fetch review PDFs whose URL FDA publishes directly. No page-fetching.

    Measured shape of the 8,325 NDA/BLA review rows in ApplicationDocs.txt:
        4,483  direct .pdf URL      <- we take these: officially published,
                                       robots-allowed path, zero ambiguity
        2,800  TOC .html page       <- DEFERRED, see below
           20  TOC .cfm page        <- deferred
    The TOC route would mean fetching a page marked `noindex, nofollow` and
    following/reconstructing its links, and its filenames are not one convention
    (`125516Orig1s000TOC.html` but also `020725_creon_toc.html`), so guessing
    would be both impolite and unreliable. 4,483 direct PDFs is a large enough
    real sample to build on; the TOC tail is recorded as a known gap rather than
    scraped. That is a deliberate coverage/politeness trade, and it is stated,
    not hidden.
    """
    import duckdb

    os.makedirs(PDF_CACHE, exist_ok=True)
    p = os.path.join(FDA_DIR, "fda_docs.parquet")
    if not os.path.isfile(p):
        raise FileNotFoundError("run: python fda.py --ingest")
    con = duckdb.connect()
    T = f"read_parquet('{p.replace(os.sep,'/')}')"
    rows = con.execute(
        f"SELECT appl_no, appl_type, sponsor, doc_type, url FROM {T} "
        f"WHERE is_review AND appl_type IN ('NDA','BLA') AND url ILIKE '%.pdf' "
        f"ORDER BY doc_date DESC").fetchall()
    n_toc = con.execute(
        f"SELECT COUNT(*) FROM {T} WHERE is_review AND appl_type IN ('NDA','BLA') "
        f"AND url NOT ILIKE '%.pdf'").fetchone()[0]
    done = load_done_keys(FDA_LEDGER, "url")
    todo = [r for r in rows if r[4] not in done][:limit]
    print(f"[fda:harvest] {len(rows)} directly-linked NDA/BLA review PDFs "
          f"({n_toc} TOC-only DEFERRED, not scraped); {len(done)} done; "
          f"fetching {len(todo)}", flush=True)

    # accessdata sets no crawl-delay for us and /drugsatfda_docs/ is allowed, but
    # these are 1-20 MB PDFs from a public-service host: 1 req/s, single stream.
    # Politeness beats throughput; nothing here is time-critical.
    sess = PoliteSession(min_interval=1.0, timeout=180)
    today = date.today().isoformat()
    agg = {"pdfs": 0, "bytes": 0, "missing": 0, "cached": 0,
           "toc_only_deferred": n_toc}
    for appl_no, appl_type, sponsor, doc_type, url in todo:
        fn = url.rsplit("/", 1)[-1]
        dst = os.path.join(PDF_CACHE, fn)
        rec = {"url": url, "appl_no": appl_no, "appl_type": appl_type,
               "sponsor": sponsor, "doc_type": doc_type,
               "source_tier": "regulatory", "locator": url,
               "licence": "US federal government work — public domain",
               "provenance": "URL published in FDA Drugs@FDA ApplicationDocs.txt",
               "extracted_at": today}
        if os.path.isfile(dst) and os.path.getsize(dst) > 1000:
            rec.update(pdfs=[{"suffix": doc_type, "url": url, "path": dst,
                              "bytes": os.path.getsize(dst), "tier": "cache"}],
                       n_pdfs=1)
            agg["cached"] += 1
        else:
            try:
                r = sess.get(url)
            except Exception as e:
                rec.update(pdfs=[], n_pdfs=0, error=str(e)[:120])
                agg["missing"] += 1
                append_jsonl(FDA_LEDGER, rec)
                continue
            if r.status_code == 200 and r.content[:5] == b"%PDF-":
                with open(dst, "wb") as f:
                    f.write(r.content)
                rec.update(pdfs=[{"suffix": doc_type, "url": url, "path": dst,
                                  "bytes": len(r.content), "tier": "fetch"}],
                           n_pdfs=1)
                agg["pdfs"] += 1
                agg["bytes"] += len(r.content)
            else:
                rec.update(pdfs=[], n_pdfs=0, http=r.status_code)
                agg["missing"] += 1
        append_jsonl(FDA_LEDGER, rec)
        n = agg["pdfs"] + agg["cached"] + agg["missing"]
        if n % 10 == 0:
            print(f"[fda:harvest] {n}/{len(todo)} — {agg['pdfs']} pdfs, "
                  f"{agg['bytes']/1e6:.0f} MB, {agg['missing']} missing",
                  flush=True)
    print(f"[fda:harvest] {agg}")
    return agg


def extract_and_link(limit: int | None = None) -> dict:
    """Pull protocol codes out of harvested reviews and resolve them to NCTs.

    The reviews name trials by protocol code, never by NCT (measured: 0 NCTs in
    a full 34-page statistical review). AACT's id_information carries those codes
    as org_study_id / secondary_id, so it is the bridge back to the registry —
    and therefore to the published paper via study_references.

    Codes are CANDIDATES: a token like "CA209-067" is a protocol code, but so is
    a table label. We emit every (doc, code, nct) hit with its evidence and let
    adjudication decide; we never assert a link we cannot show.
    """
    import duckdb
    import pyarrow as pa
    import pyarrow.parquet as pq
    try:
        import pdfplumber
    except ImportError:
        raise RuntimeError("pdfplumber needed: pip install pdfplumber")

    if not os.path.exists(FDA_LEDGER):
        raise FileNotFoundError("run: python fda.py --harvest")
    recs = [json.loads(l) for l in open(FDA_LEDGER, encoding="utf-8") if l.strip()]
    if limit:
        recs = recs[:limit]

    con = duckdb.connect()
    idp = C.ext_table("id_information")
    if idp is None:
        raise FileNotFoundError("run: python aact_ext.py --only id_information")
    con.execute(f"""CREATE OR REPLACE TEMP TABLE idinfo AS
        SELECT nct_id, upper(trim(id_value)) AS code, id_source
        FROM read_parquet('{idp.replace(os.sep,'/')}')
        WHERE id_value IS NOT NULL AND length(trim(id_value)) BETWEEN 5 AND 30""")

    today = date.today().isoformat()
    out_rows, agg = [], {"docs": 0, "codes": 0, "linked": 0, "unlinked": 0,
                         "ncts": set(), "no_text": 0}
    for rec in recs:
        for pdf in rec.get("pdfs", []):
            path = pdf.get("path")
            if not path or not os.path.isfile(path):
                continue
            agg["docs"] += 1
            # Page cap is a real constraint, not tidiness: these reviews run to
            # hundreds of pages and 22 MB, and pdfplumber costs ~1s/page. The
            # trial identity + efficacy sections sit in the front matter, so 40
            # pages buys the protocol codes at a fraction of the time. Recorded
            # as a cap so nobody reads "no codes" as "no codes in the document".
            try:
                with pdfplumber.open(path) as doc:
                    txt = "\n".join((pg.extract_text() or "")
                                    for pg in doc.pages[:40])
            except Exception as e:
                agg["no_text"] += 1
                continue
            print(f"[fda:link] {rec['appl_no']} {pdf['suffix']} "
                  f"{len(txt):,} chars", flush=True)
            if len(txt) < 500:
                agg["no_text"] += 1          # scanned/image-only review
                continue
            codes = {c.upper().replace(" ", "-") for c in PROTOCOL_RE.findall(txt)}
            codes = {c for c in codes if not c.startswith(("NDA", "BLA", "ANDA"))}
            agg["codes"] += len(codes)
            if not codes:
                continue
            inlist = ",".join("'" + c.replace("'", "''") + "'" for c in codes)
            hits = con.execute(
                f"SELECT DISTINCT code, nct_id, id_source FROM idinfo "
                f"WHERE code IN ({inlist})").fetchall()
            for code, nct, src in hits:
                agg["linked"] += 1
                agg["ncts"].add(nct)
                out_rows.append({
                    "appl_no": rec["appl_no"], "appl_type": rec["appl_type"],
                    "sponsor": rec["sponsor"], "doc_suffix": pdf["suffix"],
                    "pdf_url": pdf["url"], "protocol_code": code, "nct_id": nct,
                    "id_source": src,
                    "method": "protocol code in FDA review text -> AACT "
                              "id_information -> nct_id",
                    "confidence": "candidate — code match, needs adjudication",
                    "source_tier": "regulatory", "locator": pdf["url"],
                    "licence": "US federal government work — public domain",
                    "extracted_at": today})
            if not hits:
                agg["unlinked"] += 1

    if out_rows:
        dst = os.path.join(FDA_DIR, "fda_nct_links.parquet")
        tmp = dst + ".tmp"
        pq.write_table(pa.Table.from_pylist(out_rows), tmp, compression="zstd")
        os.replace(tmp, dst)
    agg["ncts"] = len(agg["ncts"])
    print(f"[fda:link] {json.dumps(agg, indent=2)}")
    return agg


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--ingest", action="store_true")
    ap.add_argument("--harvest", action="store_true")
    ap.add_argument("--link", action="store_true")
    ap.add_argument("--limit", type=int, default=50)
    a = ap.parse_args()
    if a.ingest:
        ingest()
    if a.harvest:
        harvest(a.limit)
    if a.link:
        extract_and_link()
    if not (a.ingest or a.harvest or a.link):
        ap.print_help()
