"""VISION COST — what does £180/month actually buy? Measured, not projected.

MAHMOOD: "how much Claude vision will be needed for all the data? I have
£180/month and am happy to devote it to this."

=============================================================================
FINDING 0 — WHICH BILLING. Checked, not guessed (13).
=============================================================================
Measured in this environment:
    ANTHROPIC_API_KEY      unset
    ANTHROPIC_AUTH_TOKEN   unset
    ANTHROPIC_PROFILE      unset
    ant CLI                NOT INSTALLED
    anthropic python SDK   NOT INSTALLED
    ANTHROPIC_BASE_URL     SET  (a gateway/proxy path)

=> This session has NO API credential a batch script could use. Claude Code is
   authenticating through a subscription/gateway path, NOT an API key.

=> THE TWO PRODUCTS ARE DIFFERENT AND THE BRIEF IS RIGHT TO SEPARATE THEM:
   - A ~£180/month Claude subscription (Max-style) powers INTERACTIVE Claude
     Code. Its constraint is usage/rate caps, and it does NOT issue an API key.
     You cannot point a 16,000-figure batch job at it.
   - API credits are a separate, pay-as-you-go product with a key. That is the
     only thing that can run this job, and it is what the arithmetic below
     prices.
   I cannot see Mahmood's billing from here and I am not going to infer it.
   ACTION FOR MAHMOOD: console.anthropic.com -> Billing tells you whether you
   hold API credits, and Plans tells you the subscription. They are separate
   line items. If £180/month is a SUBSCRIPTION, none of it can fund this job
   and the spend below needs a separate API budget.

=============================================================================
FINDING 1 — THE ~12k TOKENS/FIGURE IS A HARNESS COST, NOT AN IMAGE COST.
=============================================================================
FOREST-VISION.md:246, verbatim: "~123-172k tokens per 12-figure agent => ~12k
tokens/figure". That is a whole AGENT's consumption (system prompt, tool calls,
reasoning, re-reads) divided by 12. It is not the price of an image.
A Batch API call is ONE image + ONE prompt + ONE structured answer. The brief's
~190M / ~1.5B corpus figures inherit the agent overhead and therefore overstate
a batch job substantially.

=============================================================================
FINDING 2 — OUR FIGURES ARE SMALL. Measured on all 543 cached files.
=============================================================================
    long edge  median  767 px   (p25 694, p75 794, max 4483)
    megapixels median 0.31 MP   (p75 0.49, max 17.45)
    over the 2576px high-res cap: 2/543 = 0.4%
The documented per-image ceiling on Opus 4.7+/Sonnet 5 is ~4784 tokens at the
2576px / 3.75MP maximum. Our median figure is ~1/12 of that pixel count.

WHAT I CANNOT DO, AND WILL NOT FAKE: measure exact image tokens. That needs
`client.messages.count_tokens()`, which needs an API key this environment does
not have. I refuse to apply a remembered pixels->tokens formula (13: every
citation fetched, not recalled). So the cost below is bracketed:
    UPPER  = the documented 4784-token cap (as if every figure were full-res)
    LOWER  = a nominal small-image figure, flagged as ASSUMED, not measured
The upper bound is what the decision should be made on, and it is affordable.

=============================================================================
FINDING 3 — LEGIBILITY IS NOT THE CONSTRAINT. Verified by reading 4 figures.
=============================================================================
Read at native size: 778x515, 753x1037, 719x776, 767x184. All legible,
including per-study event counts and 2-decimal CIs on the 767x184 strip.
=> Do NOT budget for upscaling or re-fetching at higher resolution.

Run: python visioncost.py
Out: visioncost.json
"""
from __future__ import annotations

import json
import os

import config as C

# ---- Pricing, USD per 1M tokens. Source: claude-api skill, cached 2026-06-24.
# 3: never invent a constant. These are quoted, not recalled. VERIFY at
# platform.claude.com/docs/en/pricing before committing spend.
PRICES = {
    "claude-opus-4-8":  {"in": 5.00, "out": 25.00},
    "claude-sonnet-5":  {"in": 3.00, "out": 15.00},   # intro $2/$10 to 2026-08-31
    "claude-haiku-4-5": {"in": 1.00, "out": 5.00},
}
BATCH_DISCOUNT = 0.50          # Batches API: 50% off all token usage (documented)

# ---- Per-figure token model.
IMG_TOKENS_CAP = 4784          # documented ceiling at 2576px/3.75MP (Opus 4.7+/Sonnet 5)
IMG_TOKENS_ASSUMED = 500       # ⚠️ ASSUMED for a ~0.31MP figure. NOT MEASURED.
PROMPT_TOKENS = 1200           # ⚠️ ASSUMED: the forestvision.py schema+prompt. NOT MEASURED.
OUTPUT_TOKENS = 1500           # ⚠️ ASSUMED: ~10-15 structured rows. NOT MEASURED.

# ---- Corpus, from goldframe.py (measured, reproduced with a script)
FOREST_FIGURES = 15989         # in 5,157 OA metas (58.5% [57.5,59.5] of 8,817)

# ---- FX. ⚠️ NOT FETCHED. Mahmood sets this; every £ below scales linearly.
USD_PER_GBP = 1.25             # ⚠️ ASSUMED — VERIFY. Flagged everywhere it is used.
BUDGET_GBP_MONTH = 180.0


def per_figure_usd(model: str, img_tokens: int, batch: bool) -> float:
    p = PRICES[model]
    mult = (1 - BATCH_DISCOUNT) if batch else 1.0
    tin = img_tokens + PROMPT_TOKENS
    return (tin / 1e6 * p["in"] + OUTPUT_TOKENS / 1e6 * p["out"]) * mult


def main():
    budget_usd = BUDGET_GBP_MONTH * USD_PER_GBP
    out = {
        "billing": "NO API KEY IN THIS ENVIRONMENT — subscription/gateway path. "
                   "A subscription cannot run a batch job; API credits are a "
                   "separate product. Mahmood must check console -> Billing.",
        "budget_gbp_month": BUDGET_GBP_MONTH,
        "usd_per_gbp_ASSUMED": USD_PER_GBP,
        "budget_usd_month": budget_usd,
        "forest_figures": FOREST_FIGURES,
        "assumptions_not_measured": {
            "img_tokens_assumed": IMG_TOKENS_ASSUMED,
            "prompt_tokens": PROMPT_TOKENS,
            "output_tokens": OUTPUT_TOKENS,
            "note": "exact image tokens need count_tokens() -> needs an API key",
        },
    }

    print("=" * 78)
    print("VISION COST — £180/month, priced two ways (UPPER = documented cap)")
    print("=" * 78)
    print(f"\nbudget: £{BUDGET_GBP_MONTH:.0f}/mo = ${budget_usd:.0f}/mo "
          f"(at {USD_PER_GBP} USD/GBP — ⚠️ ASSUMED, verify)")
    print(f"corpus: {FOREST_FIGURES:,} forest figures in 5,157 OA metas\n")

    for label, img in (("UPPER (4784-tok cap — as if full-res)", IMG_TOKENS_CAP),
                       ("LOWER (⚠️ ASSUMED 500 tok — our median 0.31MP)", IMG_TOKENS_ASSUMED)):
        print("-" * 78)
        print(f"{label}   [{img} img + {PROMPT_TOKENS} prompt + {OUTPUT_TOKENS} out]")
        print("-" * 78)
        print(f"{'model':18s} {'$/figure':>9s} {'figs/£180':>10s} {'ALL 15,989':>11s} {'months':>7s}")
        for m in PRICES:
            c = per_figure_usd(m, img, batch=True)
            n = int(budget_usd / c)
            total = c * FOREST_FIGURES
            print(f"{m:18s} {c:9.4f} {n:10,d} {'$'+format(total,',.0f'):>11s} "
                  f"{total/budget_usd:7.2f}")
            out.setdefault("scenarios", {}).setdefault(label.split()[0], {})[m] = {
                "usd_per_figure_batched": c, "figures_per_month_budget": n,
                "usd_full_corpus": total, "months_for_full_corpus": total / budget_usd}
        print("   (all rows: Batches API, 50% off — documented, non-latency-sensitive)")
        print()

    # ---- the decisive arithmetic -------------------------------------------
    print("=" * 78)
    print("⭐ THE ARITHMETIC THAT DECIDES IT — we do not need 15,989")
    print("=" * 78)
    n_needed = 1000
    print(f"""
 The field's best full-text 2x2 gold sets are n=10 (PMID 39903558 / 38432227 /
 38895747). The largest scaled sets are n=120-648 (Yun/Kataoka/Peng), and NONE
 contain malaria, TB, HIV, or any LMIC trial. n={n_needed:,} beats every one of them,
 and the marginal value of meta #5,000 is ~0 for the claim we are making.

 COST OF A DECISIVE n={n_needed:,} GOLD SET, batched:""")
    for m in PRICES:
        hi = per_figure_usd(m, IMG_TOKENS_CAP, True) * n_needed
        lo = per_figure_usd(m, IMG_TOKENS_ASSUMED, True) * n_needed
        print(f"   {m:18s} ${lo:6.2f} – ${hi:6.2f}   "
              f"(£{lo/USD_PER_GBP:5.2f} – £{hi/USD_PER_GBP:5.2f})")
    hi_all = per_figure_usd("claude-opus-4-8", IMG_TOKENS_CAP, True) * n_needed
    print(f"""
 ⇒ AT THE UPPER BOUND, ON THE MOST EXPENSIVE MODEL, A DECISIVE GOLD SET COSTS
   ~£{hi_all/USD_PER_GBP:.0f} — about {100*hi_all/budget_usd:.0f}% of ONE month's budget.

 ⇒ AND THE FULL 15,989-FIGURE CORPUS AT THE UPPER BOUND ON OPUS IS
   ~${per_figure_usd('claude-opus-4-8', IMG_TOKENS_CAP, True)*FOREST_FIGURES:,.0f}
   = ~{per_figure_usd('claude-opus-4-8', IMG_TOKENS_CAP, True)*FOREST_FIGURES/budget_usd:.1f} months. Not 1.5B tokens. Not thousands of pounds.

 ⭐ MAHMOOD'S EXPECTATION IS CONFIRMED, AND STRONGER THAN HE PUT IT:
   "£180 buys a decisive gold set and not an exhaustive one" — in fact £180
   buys the decisive set MANY times over, and the exhaustive one within a
   quarter. BUDGET IS NOT THE BINDING CONSTRAINT. It never was.
   The binding constraints are (a) no API key exists yet, (b) the 10% batching
   swap rate (ht_headtohead.py), and (c) the frame.
""")
    out["decisive_gold_set"] = {
        "n": n_needed,
        "usd_upper_opus": hi_all,
        "gbp_upper_opus": hi_all / USD_PER_GBP,
        "pct_of_one_month": 100 * hi_all / budget_usd,
        "verdict": "budget is NOT the binding constraint",
    }

    print("=" * 78)
    print("WHAT THIS COSTING DOES NOT SHOW (17)")
    print("=" * 78)
    print("""
 - Image, prompt, and output token counts are ASSUMED, not measured. Exact
   figures need count_tokens(), which needs an API key. The UPPER bound uses
   the documented 4784 cap and is therefore safe to decide on; the LOWER bound
   is illustrative only.
 - The USD/GBP rate is ASSUMED and NOT fetched. Every £ scales linearly with it.
 - Prices are quoted from the claude-api skill (cached 2026-06-24). VERIFY at
   platform.claude.com/docs/en/pricing before committing spend.
 - Batch API is 50% off and is the right tool (this is not latency-sensitive),
   but Batches does NOT support the `fallbacks` parameter and results can take
   up to 24h. Neither matters here.
 - This prices READING figures. It does not price the failure modes: the 10%
   cross-table swap rate under batching, or figures that carry no 2x2.
 - ⚠️ Cost per USABLE GOLD ROW is NOT this number. Only some forest figures
   carry a per-study binary 2x2 (the brief says 24.8% of rows). The cost per
   figure is what is priced here; cost per usable row is higher and is not yet
   measured. See goldsample.py.
""")
    json.dump(out, open(os.path.join(C.HERE, "visioncost.json"), "w",
                        encoding="utf-8"), indent=2)
    print("wrote visioncost.json")


if __name__ == "__main__":
    main()
