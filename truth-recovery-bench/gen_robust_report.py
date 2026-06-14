"""
gen_robust_report.py — assemble ROBUST_RETRAIN.md from validation_robust.json +
sbi_robust_diagnostics.json. All numbers are read from the measured artifacts;
the narrative verdict is templated against explicit pass/fail thresholds so the
report cannot silently over-claim.
"""

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))


def _f(x, d=3):
    try:
        return f"{x:.{d}f}"
    except Exception:
        return "n/a"


def _delta(new, old, lower_is_better=True):
    try:
        dv = new - old
        arrow = "↓" if dv < 0 else ("↑" if dv > 0 else "·")
        good = (dv < 0) == lower_is_better if dv != 0 else True
        tag = "" if dv == 0 else ("  ✅" if good else "  ⚠️")
        return f"{dv:+.3f} {arrow}{tag}"
    except Exception:
        return "n/a"


def table(title, rows):
    out = [f"**{title}**\n", "| metric | NPE_old | NPE_new | Δ NPE | Unified_old | Unified_new | Δ Unified | DL |",
           "|---|---|---|---|---|---|---|---|"]
    for label, key, sec, lower in rows:
        no = sec[key]["NPE_old"]; nn = sec[key]["NPE_new"]
        uo = sec[key]["Unified_old"]; un = sec[key]["Unified_new"]
        dl = sec[key].get("DL", float("nan"))
        out.append(f"| {label} | {_f(no)} | {_f(nn)} | {_delta(nn,no,lower)} | "
                   f"{_f(uo)} | {_f(un)} | {_delta(un,uo,lower)} | {_f(dl)} |")
    return "\n".join(out) + "\n"


def main():
    with open(os.path.join(HERE, "validation_robust.json")) as f:
        V = json.load(f)
    diag_path = os.path.join(HERE, "sbi_robust_diagnostics.json")
    diag = json.load(open(diag_path)) if os.path.exists(diag_path) else {}
    S = V["summary"]
    meta = V["meta"]

    md = []
    md.append("# Robust-SBI Retrain (frontier roadmap P1) — measured before/after\n")
    md.append(f"_Reps per cell: **{meta['reps']}**; cells: {meta['n_cells']}; "
              f"old=`{meta['old']}` new=`{meta['new']}`; A/B wall-clock "
              f"{meta['elapsed_sec']:.0f}s. Same harness seeding as the committed "
              f"head-to-head, so numbers are directly comparable._\n")
    md.append("`Δ` columns: change new−old (↓ lower, ↑ higher). ✅ = moved the "
              "intended direction, ⚠️ = regression (reported, not hidden).\n")

    md.append("## 1. Clean-data de-biasing tax  (scenario=none, μ=0.3)\n")
    md.append("_Target: NPE |bias| and width move DOWN toward DL (the honest loss "
              "the retrain set out to shrink)._\n")
    md.append(table("clean-data (none)", [
        ("mean |bias|", "mean_abs_bias", S["clean_data_none"], True),
        ("mean width", "mean_width", S["clean_data_none"], True),
        ("mean coverage", "mean_coverage", S["clean_data_none"], False),
    ]))

    md.append("## 2. Under-selection advantage  (step/copas, μ=0.3) — must HOLD\n")
    md.append(table("under selection", [
        ("mean |bias|", "mean_abs_bias", S["under_selection"], True),
        ("mean coverage", "mean_coverage", S["under_selection"], False),
        ("min coverage", "min_coverage", S["under_selection"], False),
    ]))

    md.append("## 3. Primary grid overall (25 cells)\n")
    md.append(table("primary overall", [
        ("mean |bias|", "mean_abs_bias", S["primary_overall"], True),
        ("mean RMSE", "mean_rmse", S["primary_overall"], True),
        ("mean coverage", "mean_coverage", S["primary_overall"], False),
        ("min coverage", "min_coverage", S["primary_overall"], False),
        ("mean width", "mean_width", S["primary_overall"], True),
    ]))

    md.append("## 4. Type-I error @ μ=0 — must stay controlled\n")
    md.append(table("type-I", [
        ("mean reject0", "mean_reject0", S["typeI"], True),
        ("max reject0", "max_reject0", S["typeI"], True),
    ]))

    md.append("## 5. OOD / stress (mixed_strong, heavy_tail, *_vstrong) — the retrain target\n")
    md.append(table("stress/OOD", [
        ("mean |bias|", "mean_abs_bias", S["stress_ood"], True),
        ("mean coverage", "mean_coverage", S["stress_ood"], False),
        ("min coverage", "min_coverage", S["stress_ood"], False),
        ("mean width", "mean_width", S["stress_ood"], True),
    ]))

    # ---- templated verdict against explicit thresholds ----
    cn = S["clean_data_none"]; us = S["under_selection"]; ti = S["typeI"]; st = S["stress_ood"]
    tax_drop = cn["mean_abs_bias"]["NPE_old"] - cn["mean_abs_bias"]["NPE_new"]
    wid_drop = cn["mean_width"]["NPE_old"] - cn["mean_width"]["NPE_new"]
    sel_cov_held = us["min_coverage"]["NPE_new"] >= us["min_coverage"]["NPE_old"] - 0.03
    typeI_ok = ti["max_reject0"]["NPE_new"] <= 0.10
    stress_cov_gain = st["min_coverage"]["NPE_new"] - st["min_coverage"]["NPE_old"]

    md.append("## 6. Verdict (templated against fixed thresholds)\n")
    md.append(f"- **Clean-data tax (|bias|):** {_f(cn['mean_abs_bias']['NPE_old'])} → "
              f"{_f(cn['mean_abs_bias']['NPE_new'])} "
              f"({'reduced ✅' if tax_drop > 0.002 else 'NOT reduced ⚠️'}).")
    md.append(f"- **Clean-data width:** {_f(cn['mean_width']['NPE_old'])} → "
              f"{_f(cn['mean_width']['NPE_new'])} "
              f"({'narrower ✅' if wid_drop > 0.002 else 'not narrower ⚠️'}).")
    md.append(f"- **Under-selection min-coverage held:** "
              f"{_f(us['min_coverage']['NPE_old'])} → {_f(us['min_coverage']['NPE_new'])} "
              f"({'held ✅' if sel_cov_held else 'regressed ⚠️'}).")
    md.append(f"- **Type-I @ μ=0 controlled:** max reject0 NPE_new "
              f"{_f(ti['max_reject0']['NPE_new'])} ({'≤0.10 ✅' if typeI_ok else '>0.10 ⚠️'}).")
    md.append(f"- **Stress/OOD min-coverage:** {_f(st['min_coverage']['NPE_old'])} → "
              f"{_f(st['min_coverage']['NPE_new'])} "
              f"({'improved ✅' if stress_cov_gain > 0.01 else 'flat/worse ⚠️'}).\n")

    if diag:
        md.append("## 7. In-training diagnostics (new model)\n")
        md.append(f"- PIT KS stat {_f(diag.get('pit_ks_stat'))} "
                  f"(p={_f(diag.get('pit_ks_p'))}) — posterior calibration check.")
        md.append(f"- Post-conformal val coverage {_f(diag.get('postconformal_val_coverage'))} "
                  f"(target {_f(diag.get('target_coverage'),2)}), width "
                  f"{_f(diag.get('postconformal_val_width'))}.")
        md.append(f"- Mixture cfg: `{diag.get('mixture_cfg')}`.")
        md.append(f"- Train wall-clock: {_f(diag.get('elapsed_sec'),0)}s.\n")

    out_path = os.path.join(HERE, "ROBUST_RETRAIN.md")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(md))
    print(f"wrote {out_path}")
    # also echo verdict to stdout (ASCII-safe: Windows console is cp1252)
    echo = "\n".join(md[-8:])
    print(echo.encode("ascii", "replace").decode("ascii"))


if __name__ == "__main__":
    main()
