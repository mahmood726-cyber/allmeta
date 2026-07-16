"""Polite, bounded-retry HTTP + durable checkpoint helpers.

Shared by ingest/harvest. Honours 429, backs off, real User-Agent with a contact
mailto. Checkpoint writes are fsync'd + atomic-renamed so a kill mid-write cannot
corrupt the resume state (rules.md: resumable/background over tight polling).
"""
from __future__ import annotations

import json
import os
import threading
import time

import requests

import config as C
from config import USER_AGENT

_EUTILS = "eutils.ncbi.nlm.nih.gov"


class RateLimiter:
    """Thread-safe minimum-interval gate shared by all workers on this node.

    Why this exists: measured, a single efetch round-trip costs ~0.4 s, so a
    sequential loop tops out at ~2.5 req/s no matter how small the sleep — the
    bottleneck is LATENCY, not the rate limit. Throughput therefore needs
    concurrent workers, and concurrent workers need one shared gate so the node
    still respects the per-API-key budget instead of N independent timers each
    thinking it is alone.
    """

    def __init__(self, per_sec: float):
        self.min_interval = 1.0 / max(per_sec, 0.01)
        self._lock = threading.Lock()
        self._next = 0.0

    def acquire(self) -> None:
        with self._lock:
            now = time.monotonic()
            wait = self._next - now
            if wait > 0:
                time.sleep(wait)
                now = time.monotonic()
            self._next = max(now, self._next) + self.min_interval


class PoliteSession:
    def __init__(self, min_interval: float | None = None, timeout: float = 40.0,
                 limiter: "RateLimiter | None" = None):
        self.s = requests.Session()
        self.s.headers.update({"User-Agent": USER_AGENT})
        # Rate comes from the shared NCBI budget (see config.reqs_per_sec).
        self.min_interval = (min_interval if min_interval is not None
                             else 1.0 / C.reqs_per_sec())
        # min_interval=0 means "no gate" (tests/benchmarks) — not a divide-by-zero.
        self.limiter = limiter or RateLimiter(
            1e9 if self.min_interval <= 0 else 1.0 / self.min_interval)
        self.timeout = timeout
        self._last = 0.0

    def get(self, url: str, params: dict | None = None, max_retries: int = 4):
        # Inject the API key into E-utilities calls only — never send a secret to
        # a host that did not issue it (EPMC/NCBI-BioC must not receive it).
        if C.NCBI_API_KEY and _EUTILS in url:
            params = dict(params or {})
            params.setdefault("api_key", C.NCBI_API_KEY)
        for attempt in range(max_retries):
            self.limiter.acquire()
            try:
                r = self.s.get(url, params=params, timeout=self.timeout)
                self._last = time.monotonic()
            except requests.RequestException as e:
                if attempt == max_retries - 1:
                    raise
                time.sleep(1.5 * (2 ** attempt))
                continue
            if r.status_code == 429 or 500 <= r.status_code < 600:
                # honour Retry-After if present, else exponential backoff
                ra = r.headers.get("Retry-After")
                delay = float(ra) if (ra and ra.isdigit()) else 1.5 * (2 ** attempt)
                time.sleep(min(delay, 30.0))
                continue
            return r
        return r  # last response (caller inspects status)


def atomic_write_json(path: str, obj) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def append_jsonl(path: str, obj) -> None:
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(obj, ensure_ascii=False) + "\n")


def load_done_keys(path: str, key: str) -> set:
    """Set of already-processed keys from a jsonl ledger (for resume)."""
    done = set()
    if not os.path.exists(path):
        return done
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                done.add(json.loads(line)[key])
            except Exception:
                continue
    return done
