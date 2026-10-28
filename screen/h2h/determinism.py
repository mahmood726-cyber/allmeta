"""S12 determinism check (PROTOCOL 7.4): compare full screening orders from the primary run (baseimage) with a re-run
of the registered sample (sets/determinism_sample.json) on a second machine. Prints and writes one row per
(tool, review, seed); never fails silently on a missing file.

  python h2h/determinism.py --a R --b R_iljmsi3 --out R/determinism.json
  (each of R and R_iljmsi3 holds screen/, asreview/elas_u4/ and asreview/elas_u3/)
"""
import argparse
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--a", required=True); ap.add_argument("--b", required=True); ap.add_argument("--out", required=True)
    a = ap.parse_args()
    samp = json.loads((HERE / "sets" / "determinism_sample.json").read_text())
    rows = []
    for tool in ("screen", "asreview/elas_u4", "asreview/elas_u3"):
        for rv in samp["reviews"]:
            fa, fb = Path(a.a, tool, f"{rv}.json"), Path(a.b, tool, f"{rv}.json")
            for s in map(str, samp["seeds"]):
                if not (fa.exists() and fb.exists()):
                    rows.append({"tool": tool, "review": rv, "seed": s, "status": "missing", "a": fa.exists(), "b": fb.exists()}); continue
                x = json.loads(fa.read_text())["runs"].get(s, {}).get("order")
                y = json.loads(fb.read_text())["runs"].get(s, {}).get("order")
                first = None if x == y else next((i for i in range(min(len(x or []), len(y or []))) if x[i] != y[i]), min(len(x or []), len(y or [])))
                rows.append({"tool": tool, "review": rv, "seed": s, "status": "identical" if x == y else "differs", "first_diff": first})
    Path(a.out).write_text(json.dumps(rows, indent=1))
    for r in rows:
        print(json.dumps(r))
    print({k: sum(r["status"] == k for r in rows) for k in ("identical", "differs", "missing")})


if __name__ == "__main__":
    main()
