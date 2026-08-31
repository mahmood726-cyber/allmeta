# Judge panel liveness, and the blinding control — both run before any criterion

**Protocol:** `oa68k/SCORING-PROTOCOL.md` §2A and §5, frozen at `5492c84` **before** either
ran. **Join-independent — 22 / 12 / 8 is untouched and nothing was judged on criteria.**

**Artefacts (all in `F:\claude-temp\pend\`):** `judgeprobe_result.json` ·
`judgeprobe_{anthropic,openai,google}.log` · `blinding_control.json` ·
`blinding_{pair}_{family}.log` × 12 · `blinding_prompt_{pair}.txt` × 6 ·
`agy_settings.backup.json`.

---

## 1. Panel: **`DEGRADED_TWO_FAMILY`**

Three vendor calls. No retries into a pass.

| family | pinned | via | result |
|---|---|---|---|
| **anthropic** | `claude-sonnet-5` | `--model` | ✅ **LIVE** — `MODEL=claude-sonnet-5 FAMILY=anthropic SUM=42`, 60 s |
| **google** | `Gemini 3.1 Pro (High)` | `settings.json` | ✅ **LIVE** — `MODEL=Gemini 3.1 Pro (High) FAMILY=google SUM=42`, 142 s |
| **openai** | `gpt-5.5` | `-m` | ⛔ **`JUDGE_CALL_VOID:MODEL_STRING_ABSENT_OR_WRONG_FAMILY`** |

⭐ **The agy pin works.** Written into `settings.json` (its `--print` ignores `--model`),
the seat answered as **Gemini 3.1 Pro (High)** — a genuine Google-family completion,
not the `GPT-OSS 120B (Medium)` default. The original file was **restored** after the
call; the backup is at `agy_settings.backup.json`. Every prompt went in as **argv**; the
stdin path was never used.

### The openai seat: what actually happened, in two parts

**Part one was ours and cost nothing.** The first attempt died at
`PROBE_HARNESS_ERROR:CLI_NOT_FOUND` in 0 s — Python's `subprocess` does not resolve
`.cmd` shims from `PATH` on Windows, which is why `agy.EXE` worked and `codex.cmd` did
not. **It never reached the vendor**, so the authorised three-call budget was intact and
I corrected the invocation.

**Part two reached the vendor and failed the check.** `rc=0`, 90 s, a real completion —
and the stderr banner reads `model: gpt-5.5 provider: openai`. But **stdout did not name
its model**; it returned *"Acknowledged. Exactly three lines. Nothing else."* The gate
voided it.

⛔ **I did not run a third openai call.** The `.cmd` failure never reached the vendor;
this one did and produced a real completion that failed the readback. Those are
different, and spending again on a fix I expect to pass is *retrying into a pass*.

⚠️ **The seat is not dead — it is UNVERIFIED**, and those are different claims. I also
found the likely cause and fixed the code without re-spending: `subprocess` inherited
stdin, and the log shows codex printing *"Reading additional input from stdin…"* — the
exact path the protocol forbids because it answers as GPT-OSS regardless of the pin.
`stdin=DEVNULL` is now set. **One re-probe would settle it; that call is yours to
authorise, not mine to take.**

⛔ **The banner is not the proof.** `model: gpt-5.5 provider: openai` is printed from
config before inference — a status line, and a status line is not liveness. That is the
whole reason the rule asks the model to name itself.

---

## 2. ⛔ Blinding control: **FAILED. The comparison is NOT blinded.**

| | |
|---|---|
| completed calls | **9 / 9 correct** — one-sided binomial **p = 0.00195** |
| **anthropic** | **6 / 6**, p = 0.0156 — **clears α = 0.05 on its own pre-registered per-family test** (critical value: exactly 6 of 6) |
| google | 3 / 3, p = 0.125 — not significant alone |
| voided | 3 google calls, all `TIMEOUT_420s` |

**Sample A** — `sglt2-hf__39893467`, `__40005319`, `__38273790`, `__39923808`,
`__36241355`, `arni-hfref__36527023` — the first six by `sha256(pair_id)`, fixed in the
protocol before any result existed.

### Three checks on the result before I believe it

- **Not a constant-response artefact.** Sample A carries our side as A in 4 pairs and as
  B in 2. A judge answering "A" every time scores 4/6 per family, 8/12 pooled — below
  every critical value here. Anthropic **flipped to B on both pairs where our side was
  B**, and got both right.
- **The pooled test is FRAGILE to the missing calls; the per-family one is not.**
  Counting all 3 voids as wrong gives 9/12, p = 0.073, which does **not** clear α = 0.05
  (critical value 10). ⭐ **So I am not leaning on the pooled 9/9. The load-bearing
  result is anthropic 6/6, which depends on no voided call — every one of its calls
  completed.**
- **n = 9 was not a pre-registered n.** The frozen table carried n = 18 and n = 12. The
  critical value for the achieved n is **computed**, not looked up — see the bug below.

### ⛔ A reporting bug that erred in our favour, found and fixed before publishing

The first summary printed **`identifies_our_side_above_chance: False`** while p = 0.002.
The critical value was a lookup `{12: 10, 18: 13}`; the achieved n of 9 had no row, so it
returned `None` and the boolean collapsed to `False`.

**A missing table row reported "our side was not identified" when the data said the
opposite** — and it erred in the direction that never gets questioned. The critical value
is now computed for whatever n is achieved, and `blinding.py --rescore` re-derives from
the stored verdicts without calling a judge.

### What gave it away — every judge said the same thing

> *"SIDE_A is raw structured JSON (`estimand_id`, `log_point`/`log_se`, Cochrane Handbook
> section citations, `per_trial` arrays) — the internal representation of a pipeline"*
> — anthropic
>
> *"Side A structures its synthesis as a JSON payload with programmatic metadata … whereas
> Side B is a traditional journal article"* — google

**This is not subtle stylistic leakage. `our_side_dossier()` dumps `json.dumps(results)`
straight into the payload.** A common section skeleton over raw JSON is not a common
format, and the control found that in one call each.

### The consequence, declared in the protocol before this ran

⛔ **Every criterion result produced on this renderer would measure FORMAT, not quality.**
The scored comparison therefore **cannot proceed on the current dossier renderer — join
or no join.** ⭐ **SAMPLE A IS BURNED.** Any revalidation runs on **sample B** (the next
six pairs), **once**.

⚠️ I predicted in the protocol that this control would be hard to pass, and wrote *"that
is a reason to run it, not a reason to soften it."* It failed as predicted. **The value
of having predicted it is zero if the renderer is now tuned against sample A** — which is
precisely why the burn rule was written before the result, and why sample B is not being
spent on the first fix I think of.
