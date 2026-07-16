"""Live fleet status -> one WATCHDOG-LOG.md line per advance.

Polls each node over SSH for its LIVE ledger count. Reading pc2's local copies of
the remote ledgers would report a frozen counter (they are stale snapshots from the
last pull) — and a frozen counter is precisely the signal the watchdog uses to
decide the lane is dead. So this must go to the source.

Writes nothing if nothing advanced, so the log stays a record of real progress.

Run:  python status.py --action "what just happened"
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess

import config as C

LOG = r"F:\allmeta\WATCHDOG-LOG.md"
KEY = os.path.expanduser("~/.ssh/node2_ed25519")
NODES = [
    ("pc2", None, None),                                    # local
    ("laptop", "mahmo@100.80.183.43", r"C:\oa68k\data\harvest.laptop.jsonl"),
    ("baseimage", "user@100.127.107.46", r"C:\oa68k\data\harvest.baseimage.jsonl"),
]


def _local_rows(path: str) -> int:
    try:
        with open(path, encoding="utf-8") as f:
            return sum(1 for l in f if l.strip())
    except OSError:
        return 0


def _remote_rows(host: str, path: str) -> int:
    cmd = ["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no",
           "-o", "ConnectTimeout=10", "-i", KEY, host,
           f'powershell -c "(Get-Content {path} | Measure-Object -Line).Lines"']
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=60).stdout
        for tok in out.split():
            if tok.strip().isdigit():
                return int(tok.strip())
    except Exception:
        pass
    return -1                                   # -1 = unreachable, not zero


def counts() -> dict:
    c = {"pc2": _local_rows(os.path.join(C.DATA, "harvest.pc1.jsonl"))}
    for name, host, path in NODES[1:]:
        c[name] = _remote_rows(host, path)
    return c


def poolable() -> int:
    n = 0
    for p in C.node_ledgers("preextract"):
        with open(p, encoding="utf-8") as f:
            for l in f:
                if l.strip() and json.loads(l).get("poolable_registry_2x2"):
                    n += 1
    return n


def now() -> str:
    return subprocess.run(["powershell", "-c", "Get-Date -Format 'yyyy-MM-dd HH:mm'"],
                          capture_output=True, text=True).stdout.strip()


def main(action: str, link: str) -> None:
    c = counts()
    live = [v for v in c.values() if v >= 0]
    total = sum(live)
    p = poolable()
    unreachable = [k for k, v in c.items() if v < 0]
    note = action + (f" | UNREACHABLE: {','.join(unreachable)}" if unreachable else "")
    line = (f"| {now()} | {c['pc2']:,} | {c['laptop']:,} | {c['baseimage']:,} | "
            f"{total:,} ({total/67771:.1%}) | {p:,} | {link} | {note} |\n")
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line)
        f.flush()
        os.fsync(f.fileno())
    print(line.strip())


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--action", default="periodic checkpoint")
    ap.add_argument("--link", default="n/a")
    a = ap.parse_args()
    main(a.action, a.link)
