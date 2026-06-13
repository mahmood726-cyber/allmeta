"""
summarize_realdata.py — Reduce realdata_results.json to a descriptive comparison
table (Markdown). No correctness claims — REML is used only as a common anchor.

For each method, over reviews where it produced a finite interval:
  n_ok        reviews with a finite estimate+interval
  d_REML      median |mu - mu_REML|  (point divergence from the standard anchor)
  width       median 95% interval width
  excl0       fraction of CIs excluding 0 (a "significant" call)
  agree_sig   fraction whose excl0 decision AND sign match REML's
  cont_REML   fraction of CIs that contain the REML point (coherence)
"""
import argparse
import io
import json
import os
import sys

import numpy as np

# Windows consoles default to cp1252 and choke on the Δ in the table header.
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))


def summarize(results, subset=None):
    rows = results if subset is None else [r for r in results if subset(r)]
    methods = []
    for r in rows:
        methods = list(r["methods"].keys())
        break
    table = {}
    for name in methods:
        d_reml, widths, excl0, agree, cont = [], [], [], [], []
        n_ok = 0
        for r in rows:
            m = r["methods"][name]
            re = r["methods"]["REML"]
            mu, lo, hi = m["mu"], m["ci_lo"], m["ci_hi"]
            if not (np.isfinite(mu) and np.isfinite(lo) and np.isfinite(hi)):
                continue
            n_ok += 1
            widths.append(hi - lo)
            e0 = (lo > 0) or (hi < 0)
            excl0.append(e0)
            if np.isfinite(re["mu"]):
                d_reml.append(abs(mu - re["mu"]))
                re0 = (re["ci_lo"] > 0) or (re["ci_hi"] < 0)
                # significance agreement: same exclude-0 call AND same sign
                same = (e0 == re0) and (np.sign(mu) == np.sign(re["mu"]) or not e0)
                agree.append(bool(same))
                cont.append(bool(lo <= re["mu"] <= hi))
        table[name] = {
            "n_ok": n_ok,
            "d_REML": float(np.median(d_reml)) if d_reml else float("nan"),
            "width": float(np.median(widths)) if widths else float("nan"),
            "excl0": float(np.mean(excl0)) if excl0 else float("nan"),
            "agree_sig": float(np.mean(agree)) if agree else float("nan"),
            "cont_REML": float(np.mean(cont)) if cont else float("nan"),
        }
    return table, len(rows)


def fmt_table(table, n, title):
    order = ["REML", "HKSJ", "PET-PEESE", "TrimFill", "VeveaHedges", "Copas",
             "NPE", "PartialID", "PVS", "Unified-frozen", "Unified-union",
             "Unified-lower"]
    order = [m for m in order if m in table]
    lines = [f"### {title}  (n={n} reviews)", "",
             "| method | n_ok | median dev vs REML | median width | "
             "frac excl 0 | sig-agree REML | contains REML |",
             "|---|---|---|---|---|---|---|"]
    for m in order:
        t = table[m]
        lines.append(
            f"| {m} | {t['n_ok']} | {t['d_REML']:.3f} | {t['width']:.3f} | "
            f"{t['excl0']:.2f} | {t['agree_sig']:.2f} | {t['cont_REML']:.2f} |")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp",
                    default=os.path.join(HERE, "realdata_results.json"))
    ap.add_argument("--out-md", default=None)
    args = ap.parse_args()
    d = json.load(open(args.inp))
    res = d["results"]
    full, nfull = summarize(res)
    insup, nin = summarize(res, subset=lambda r: r["median_se"] <= 0.7)
    blocks = [f"## Real-data comparison — Pairwise70 ({d['meta']['tag']}, "
              f"model={d['meta']['model_path']})", "",
              fmt_table(full, nfull, "All reviews"), "",
              fmt_table(insup, nin, "In-support subset (median study SE ≤ 0.7)")]
    md = "\n".join(blocks)
    print(md)
    if args.out_md:
        with open(args.out_md, "w", encoding="utf-8") as f:
            f.write(md + "\n")
        print(f"\n[wrote] {args.out_md}")


if __name__ == "__main__":
    main()
