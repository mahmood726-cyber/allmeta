"""Stage F2 — fetch forest-plot image bytes for figures located by figscan.

THE LOCATOR PROBLEM (measured, not assumed). The JATS gives a graphic href that is
a bare filename (`ofad467f5.jpg`). Three routes to turn that into bytes were tried
from this host:

  1. `ncbi.nlm.nih.gov/pmc/articles/<PMCID>/bin/<fname>`  -> 301 then **404**.
     (It returns an HTML error page with HTTP 200-shaped plumbing on some paths —
     saving that as `.jpg` yields a "successful" download of a web page. Any
     fetcher here MUST validate magic bytes, per the fail-closed-on-error-payload
     rule.)
  2. PMC OA service (`oa.fcgi`) advertises `ftp://…/oa_package/<a>/<b>/<PMCID>.tar.gz`.
     Over https that path **404s**; over ftp it returns **550 (no such file)**.
     `https://ftp.ncbi.nlm.nih.gov/pub/pmc/` now lists only `deprecated/` and
     `PMC-ids.csv.gz` — the OA package tree is gone from this route, while the OA
     service still advertises it. The advertised locator is stale.
  3. The article page carries the real asset URL on a CDN:
     `cdn.ncbi.nlm.nih.gov/pmc/blobs/<h1>/<id>/<h2>/<fname>` — **200, image/jpeg**.

Route 3 is the only one that works, and the decisive detail is that `<h1>` and
`<h2>` are **opaque hashes not derivable from the JATS**. So a figure's bytes
cannot be addressed from the cached XML alone: every article costs ONE page
request to resolve filename -> CDN URL. That is why `figscan.retrievable` (a
locator was recorded) and this stage's `fetched` (bytes landed, magic-byte
checked) are separate fields. Conflating them would over-report coverage.

Rate: shares this host's NCBI budget with the harvest + crosswalk lanes, so it
goes through the same `config.reqs_per_sec()` governor and caches every resolution.

Run:  python figfetch.py --limit 20
"""
from __future__ import annotations

import argparse
import json
import os
import re
import time
import urllib.request
from datetime import date

import config as C

FIGCACHE = os.path.join(C.DATA, "figcache")          # image bytes, PMCID-keyed dir
RESOLVE_CACHE = os.path.join(C.DATA, "figresolve.jsonl")   # pmcid -> {fname: url}
FETCH_LEDGER = os.path.join(C.DATA, f"figfetch.{C.NODE}.jsonl")

ARTICLE = "https://pmc.ncbi.nlm.nih.gov/articles/{pmcid}/"
_CDN_IMG = re.compile(
    r'src="(https://cdn\.ncbi\.nlm\.nih\.gov/pmc/blobs/[^"]+/([^"/]+\.(?:jpg|png|gif)))"',
    re.I)

# Magic bytes. An HTML error page must never be accepted as an image.
_MAGIC = {b"\xff\xd8\xff": "jpg", b"\x89PNG\r\n\x1a\n": "png", b"GIF8": "gif"}

_last = [0.0]


def _throttle() -> None:
    gap = 1.0 / max(0.1, C.reqs_per_sec())
    dt = time.time() - _last[0]
    if dt < gap:
        time.sleep(gap - dt)
    _last[0] = time.time()


def _get(url: str, timeout: int = 60) -> tuple[int, bytes, str]:
    req = urllib.request.Request(url, headers={"User-Agent": C.USER_AGENT})
    _throttle()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read(), r.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        return e.code, b"", ""
    except Exception:
        return 0, b"", ""


def _load_resolve() -> dict:
    out = {}
    if os.path.exists(RESOLVE_CACHE):
        with open(RESOLVE_CACHE, encoding="utf-8") as f:
            for ln in f:
                if not ln.strip():
                    continue
                try:
                    r = json.loads(ln)
                    out[r["pmcid"]] = r.get("map") or {}
                except Exception:
                    continue
    return out


def resolve_article(pmcid: str, cache: dict) -> dict:
    """filename -> CDN url for one article. One network request, then cached."""
    if pmcid in cache:
        return cache[pmcid]
    status, body, _ = _get(ARTICLE.format(pmcid=pmcid))
    m: dict[str, str] = {}
    if status == 200 and body:
        for url, fname in _CDN_IMG.findall(body.decode("utf-8", "replace")):
            m[fname] = url
    cache[pmcid] = m
    with open(RESOLVE_CACHE, "a", encoding="utf-8") as f:
        f.write(json.dumps({"pmcid": pmcid, "map": m, "status": status,
                            "at": date.today().isoformat()}) + "\n")
        f.flush()
        os.fsync(f.fileno())
    return m


def _is_image(b: bytes) -> str | None:
    for magic, kind in _MAGIC.items():
        if b.startswith(magic):
            return kind
    return None


def fetch_fig(pmcid: str, href: str, cache: dict) -> dict:
    """Bytes for one figure. Returns a record; never raises on a bad payload."""
    os.makedirs(os.path.join(FIGCACHE, pmcid), exist_ok=True)
    dst = os.path.join(FIGCACHE, pmcid, os.path.basename(href))
    if os.path.isfile(dst) and os.path.getsize(dst) > 0:
        with open(dst, "rb") as f:
            head = f.read(16)
        if _is_image(head):
            return {"pmcid": pmcid, "href": href, "path": dst,
                    "bytes": os.path.getsize(dst), "fetched": True,
                    "from_cache": True}
    m = resolve_article(pmcid, cache)
    url = m.get(os.path.basename(href))
    if not url:
        # Try a stem match: JATS href may omit/alter the extension.
        stem = os.path.splitext(os.path.basename(href))[0].lower()
        for k, v in m.items():
            if os.path.splitext(k)[0].lower() == stem:
                url = v
                break
    if not url:
        return {"pmcid": pmcid, "href": href, "fetched": False,
                "reason": "no CDN url on the article page for this href",
                "resolved_n": len(m)}
    status, body, ctype = _get(url)
    kind = _is_image(body) if body else None
    if status != 200 or not kind:
        # Fail closed: an HTML error page is NOT an image, whatever the status.
        return {"pmcid": pmcid, "href": href, "fetched": False,
                "reason": f"status={status} ctype={ctype} magic={kind}",
                "url": url}
    tmp = dst + ".tmp"
    with open(tmp, "wb") as f:
        f.write(body)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, dst)
    return {"pmcid": pmcid, "href": href, "path": dst, "url": url,
            "bytes": len(body), "kind": kind, "fetched": True,
            "from_cache": False}


def _done() -> set:
    got = set()
    if os.path.exists(FETCH_LEDGER):
        with open(FETCH_LEDGER, encoding="utf-8") as f:
            for ln in f:
                if not ln.strip():
                    continue
                try:
                    r = json.loads(ln)
                    got.add((r["pmcid"], r["href"]))
                except Exception:
                    continue
    return got


def forest_targets(only_pmcids: set | None = None) -> list[tuple[str, str]]:
    """(pmcid, href) for every figure figscan classified `forest`."""
    led = os.path.join(C.DATA, f"figscan.{C.NODE}.jsonl")
    out = []
    if not os.path.exists(led):
        raise FileNotFoundError("run figscan.py first")
    with open(led, encoding="utf-8") as f:
        for ln in f:
            if not ln.strip():
                continue
            r = json.loads(ln)
            if only_pmcids is not None and r["pmcid"] not in only_pmcids:
                continue
            for fig in r["figs"]:
                if fig["kind"] != "forest":
                    continue
                for h in fig["graphic_hrefs"]:
                    out.append((r["pmcid"], h))
    return out


def run(limit: int | None, pmcids: set | None = None) -> dict:
    cache = _load_resolve()
    done = _done()
    todo = [t for t in forest_targets(pmcids) if t not in done]
    n_ok = n_fail = 0
    with open(FETCH_LEDGER, "a", encoding="utf-8") as out:
        for i, (pmcid, href) in enumerate(todo):
            if limit is not None and i >= limit:
                break
            rec = fetch_fig(pmcid, href, cache)
            rec["at"] = date.today().isoformat()
            out.write(json.dumps(rec) + "\n")
            out.flush()
            if rec.get("fetched"):
                n_ok += 1
            else:
                n_fail += 1
        os.fsync(out.fileno())
    return {"fetched": n_ok, "failed": n_fail, "remaining": max(0, len(todo) - n_ok - n_fail),
            "total_forest_targets": len(todo) + len(done)}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=20)
    a = ap.parse_args()
    print(json.dumps(run(a.limit), indent=2))
