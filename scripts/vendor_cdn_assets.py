"""Vendor CDN-loaded JS libraries to shared/vendor/ with SRI hashes.

Replaces the false "fully offline" claim (V9-E07) by pulling the canonical
script bundles from their CDNs, computing SHA-384 SRI hashes, and writing
them to shared/vendor/. The per-app HTML patches that swap `<script src=…>`
to point at the vendored file with `integrity="sha384-…"` live in a
companion patch script (apply_vendor_swaps.py) — this script only handles
the download and hash computation step.

Usage:
    python scripts/vendor_cdn_assets.py [--force]

Idempotent: skips files that already exist unless --force is passed. Prints
a manifest (path, size, sha384) to stdout — used by apply_vendor_swaps.py.

Network required. Fails closed on any partial download or HTTP error.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import sys
import urllib.request
from pathlib import Path

LIBS = [
    # (filename in shared/vendor/, source URL)
    ("plotly-2.27.0.min.js",      "https://cdn.plot.ly/plotly-2.27.0.min.js"),
    ("plotly-2.35.0.min.js",      "https://cdn.plot.ly/plotly-2.35.0.min.js"),
    ("jspdf-2.5.1.umd.min.js",    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"),
    ("html2canvas-1.4.1.min.js",  "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"),
    ("xlsx-0.18.5.full.min.js",   "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"),
    ("jszip-3.10.1.min.js",       "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"),
    ("chart-4.4.1.umd.min.js",    "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"),
    ("d3-7.9.0.min.js",           "https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"),
    ("docx-7.1.0.js",             "https://cdn.jsdelivr.net/npm/docx@7.1.0/build/index.js"),
]

USER_AGENT = "allmeta-vendor-script/1.0 (https://github.com/mahmood726-cyber/allmeta)"


def sri_hash(data: bytes) -> str:
    """Compute the W3C SRI string for sha384."""
    digest = hashlib.sha384(data).digest()
    b64 = base64.b64encode(digest).decode("ascii")
    return f"sha384-{b64}"


def download(url: str, timeout: int = 60) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        if resp.status != 200:
            raise RuntimeError(f"HTTP {resp.status} fetching {url}")
        body = resp.read()
    if not body or len(body) < 1024:
        raise RuntimeError(f"Suspiciously small body from {url}: {len(body)} bytes")
    return body


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--force", action="store_true",
                   help="Re-download even if the file already exists.")
    p.add_argument("--manifest-only", action="store_true",
                   help="Don't download; recompute hashes for already-present files.")
    args = p.parse_args()

    root = Path(__file__).resolve().parent.parent
    vendor = root / "shared" / "vendor"
    vendor.mkdir(parents=True, exist_ok=True)

    manifest: dict[str, dict] = {}
    for filename, url in LIBS:
        dest = vendor / filename
        if args.manifest_only:
            if not dest.is_file():
                print(f"MISSING: {filename}")
                continue
            data = dest.read_bytes()
        elif dest.exists() and not args.force:
            data = dest.read_bytes()
            print(f"SKIP (exists): {filename} ({len(data) / 1024:.1f} KB)")
        else:
            print(f"FETCH: {filename}  <-  {url}")
            data = download(url)
            dest.write_bytes(data)
            print(f"  WROTE: {len(data) / 1024:.1f} KB")
        h = sri_hash(data)
        manifest[filename] = {"url": url, "size": len(data), "sri": h}

    manifest_path = vendor / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"\nManifest written to {manifest_path}")
    print(json.dumps(manifest, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
