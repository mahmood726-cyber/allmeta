"""Polite, bounded-retry HTTP + durable checkpoint helpers.

Shared by ingest/harvest. Honours 429, backs off, real User-Agent with a contact
mailto. Checkpoint writes are fsync'd + atomic-renamed so a kill mid-write cannot
corrupt the resume state (rules.md: resumable/background over tight polling).
"""
from __future__ import annotations

import json
import os
import time

import requests

from config import USER_AGENT


class PoliteSession:
    def __init__(self, min_interval: float = 0.34, timeout: float = 40.0):
        self.s = requests.Session()
        self.s.headers.update({"User-Agent": USER_AGENT})
        self.min_interval = min_interval          # ~3 req/s, NCBI/EPMC-friendly
        self.timeout = timeout
        self._last = 0.0

    def get(self, url: str, params: dict | None = None, max_retries: int = 4):
        for attempt in range(max_retries):
            wait = self.min_interval - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
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
