# Reconciling the two KEY-ABSENT figures — 10.95% vs 65%
**2026-07-16 · oa68k join-key lane · for `F:\E156\INDEX.md`**

`INDEX.md` carries two incompatible-looking numbers. **They are not in conflict. They
measure different populations, and both are correct.**

| | this lane (`trial_key_audit.py`, pre-registered) | reachability lane (`route2_key.jsonl`) |
|---|---|---|
| KEY-ABSENT | **10.95%** | **65%** (138/211) |
| n | 1,662 cited trial papers | 211 trials |
| **population** | cited trial papers in OA metas that our NCT join misses — **unconditional** | trials **known to be ISRCTN-registered** with no NCT |
| question answered | *"does ANY non-NCT key exist?"* | *"GIVEN an ISRCTN key exists, can we reach the publication?"* |
| instrument | PubMed `<DataBankList>` (curated, incomplete ⇒ **lower bound**) | Europe PMC `ACCESSION_ID` via the ISRCTN key |

## Why they differ: the second is CONDITIONED on the thing being measured

The reachability sample is drawn **from ISRCTN**, so **100% of it has a non-NCT key by
construction**. Its 65% is therefore `P(publication reachable | trial IS ISRCTN-registered)`.
This lane's 10.95% is `P(any non-NCT key exists | our join missed it)` — unconditional.

**They compose, they do not compete:**
`0.1095 × 0.65 ≈ 7%` of this lane's missed trials are recoverable by widening the key.

## The real driver is DISEASE MIX — and it is why both must be reported

| | reachability frame | oa68k OA-meta corpus (n=2,500) |
|---|---|---|
| malaria | census | **0.6%** (16) |
| TB | census | **1.4%** (36) |
| NCD | seeded | **53.6%** (1,340) |

⭐ **The key IS the blocker for malaria/TB. The key is NOT the main blocker for the OA
meta corpus as a whole**, because that corpus is overwhelmingly NCD, where CT.gov
registration dominates. Averaging the two destroys both findings. This is exactly why
Mahmood's malaria/TB/NCD stratification was the right call.

## Both numbers are LOWER BOUNDS, for different reasons

- **This lane:** PubMed `DataBankList` sees only registrations **the paper declared**.
  And AACT `id_information` carries **0–4 ISRCTN/PACTR ids per area** (reachability
  lane's measurement), so the `study_references` route **structurally cannot** see
  non-NCT registration. Pre-registered as a lower bound for exactly this reason.
- **Reachability lane:** cannot see PACTR at all (ICTRP blocked).

## INDEX.md entry (proposed)

> **KEY-ABSENT rate** — depends on the population; report both, never average:
> • **10.95%** (n=1,662) — unconditional, OA-meta corpus (54% NCD). Lower bound.
>   `oa68k/PREREG-trial-key-audit.md`, `trial_key_audit.py`.
> • **65%** (138/211) — conditional on ISRCTN registration, malaria/TB/HIV frame.
>   `C:\Projects\MALARIA-TB-CRACK-ROUTES.md`, `route2_key.jsonl`.
> • Composition: ≈7% of the OA-meta corpus's missed trials are key-recoverable.
> • **Neither can see PACTR** — ISRCTN direct is ToU-blocked (*"copy, download, or store…
>   to make or populate a database"*), ICTRP blocked on the WHO agreement. **Same single
>   unblock for both lanes.**
