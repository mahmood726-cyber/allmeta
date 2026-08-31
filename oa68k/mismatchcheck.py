# -*- coding: utf-8 -*-
"""Check the four scored topics against the sidecar mismatch list -- and, separately,
assert a POSITIVE property per page.

⛔ ABSENCE FROM THAT FILE IS NOT CLEARANCE. The file says so in its own SCOPE block, and
it was misused once already by both its author and its recipient. So membership is
reported, and then IGNORED as evidence of safety; what carries weight is:

    POSITIVE ASSERTION -- every registration id the STORE OBJECT pools appears in the
    RENDERED, READER-VISIBLE text of the page that describes it.

⚠️ Membership is joined on FILENAME across two trees at different refs (the list was
generated in rapidmeta-finerenone against 98196b57; the pages scored here live in the
rob-lane worktree). A page NAME is not an artefact identity. That is a second reason the
positive assertion is the load-bearing check and membership is only a flag.

Usage: python mismatchcheck.py
"""
import hashlib
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import surfaceagree as A  # noqa: E402
import opencompscore as S  # noqa: E402

LIST = r"F:\rapidmeta-finerenone\outputs\DO_NOT_REBUILD_FROM_SIDECAR.json"
EXPECT_BYTES = 11139
EXPECT_SHA = "e28306de813b8a3f8ccfc1058caf5bdf2f201e84345521fe8719f15e066911cc"
RESULT = os.path.join(r"F:\claude-temp\pend", "mismatchcheck.json")
TOPICS = ["arni-hfref", "iv-iron-hf", "sglt2-hf", "sotagliflozin-hf"]
FINERENONE = os.path.join("F:" + os.sep, "rapidmeta-finerenone")
SIDECAR = {"arni-hfref": "ARNI_HF.json", "iv-iron-hf": "IV_IRON_HF.json",
           "sglt2-hf": "SGLT2_HF.json", "sotagliflozin-hf": "SOTAGLIFLOZIN_HF.json"}
PROTECTED = {"arni-hfref"}
RE_NCT = re.compile(r"NCT\d{8}")


def sha(b):
    return hashlib.sha256(b).hexdigest()


def visible(raw):
    v = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", raw)
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", v))


def main(log=print):
    raw = io.open(LIST, "rb").read()
    ok_bytes, ok_sha = len(raw) == EXPECT_BYTES, sha(raw) == EXPECT_SHA
    log("list   : %s" % LIST)
    log("  bytes %d (expected %d) %s" % (len(raw), EXPECT_BYTES, "OK" if ok_bytes else "MISMATCH"))
    log("  sha256 %s %s" % (sha(raw), "OK" if ok_sha else "MISMATCH"))
    if not (ok_bytes and ok_sha):
        raise SystemExit("REFUSING: the list is not the artefact I was given")
    j = json.loads(raw.decode("utf-8"))
    members = {k: set(v["pages"]) for k, v in j["members"].items()}
    log("  members: %s" % {k: len(v) for k, v in members.items()})
    log("")

    sa = json.load(io.open(A.RESULT, encoding="utf-8"))
    page_of = {t: sa["per_topic"][t]["page_that_describes_it"] for t in TOPICS}

    rows = []
    for t in TOPICS:
        page = page_of[t]
        # --- membership (a flag, NOT clearance) ---
        mem = {k: (page in v) for k, v in members.items()}

        # --- POSITIVE ASSERTION, from a fresh read of both artefacts ---
        objp = os.path.join(A.SSOTDIR, t, t + ".json")
        objb = io.open(objp, "rb").read()
        obj = json.loads(objb.decode("utf-8"))
        pooled = sorted({x.get("nct") for x in
                         ((obj.get("inputs") or {}).get("trials") or []) if x.get("nct")})
        pagep = os.path.join(A.CORPUS, page)
        pageb = io.open(pagep, "rb").read()
        vis = visible(pageb.decode("utf-8", "replace"))
        on_page = set(RE_NCT.findall(vis))
        missing = [n for n in pooled if n not in on_page]
        extras = sorted(on_page - set(pooled))
        assertion = "HOLDS" if not missing else "FAILS"

        # --- THE ASSERTION THEIR LIST ACTUALLY ANSWERS: the r_validation SIDECAR, which
        # is a different artefact from the store object. My store-vs-page assertion HELD
        # on 8 of 8 of their confirmed_mismatch pages that resolve to a rob-lane object,
        # so it has NO demonstrated power against their hazard and must not be read as
        # clearing it.
        side_ids, side_k, side_note = [], None, None
        sc = os.path.join(FINERENONE, "outputs", "r_validation", SIDECAR[t])
        if os.path.exists(sc):
            sb = io.open(sc, "rb").read()
            side_ids = sorted(set(RE_NCT.findall(sb.decode("utf-8", "replace"))))
            side_k = json.loads(sb.decode("utf-8")).get("k")
            side_note = {"file": sc, "sha256": sha(sb), "bytes": len(sb)}
        sidecar_only = sorted(set(side_ids) - set(pooled))
        store_only = sorted(set(pooled) - set(side_ids))

        rows.append({
            "topic": t, "page": page, "protected": t in PROTECTED,
            "membership": mem,
            "sidecar": side_note, "sidecar_k": side_k, "sidecar_ids": side_ids,
            "sidecar_vs_store":
                "AGREE" if not (sidecar_only or store_only) else "DISAGREE",
            "sidecar_only_trials": sidecar_only, "store_only_trials": store_only,
            "sidecar_ids_missing_from_page": sorted(set(side_ids) - on_page),
            "third_question":
                "sidecar-vs-STORE is a THIRD question, distinct from their "
                "sidecar-vs-page (the 69) and from my store-vs-page. It binds scoring: "
                "if a page's sidecar pools a different trial set than its store object, "
                "the pooled number a reader sees may come from either.",
            "positive_assertion":
                "every registration id the store object pools appears in the rendered, "
                "reader-visible text of the page that describes it",
            "assertion_result": assertion,
            "k_pooled": len(pooled), "pooled": pooled,
            "missing_from_page": missing,
            "page_extra_ids_informational": len(extras),
            "store_file": objp, "store_sha256": sha(objb), "store_bytes": len(objb),
            "page_file": pagep, "page_sha256": sha(pageb), "page_bytes": len(pageb),
        })
        log("%-18s page=%-32s k=%d  POSITIVE ASSERTION: %s"
            % (t, page, len(pooled), assertion))
        log("   membership: confirmed_mismatch=%-5s untested=%-5s pending_refusal=%s"
            % (mem["confirmed_mismatch"], mem["untested"],
               mem["pending_refusal_text_rendering"]))
        if missing:
            log("   MISSING FROM PAGE: %s" % ", ".join(missing))
        log("   page extras (informational, a page names screened/excluded trials): %d"
            % len(extras))
        log("   sidecar k=%s ids=%d  sidecar_vs_store=%s"
            % (side_k, len(side_ids), rows[-1]["sidecar_vs_store"]))
        if sidecar_only or store_only:
            log("      sidecar-only %s | store-only %s" % (sidecar_only, store_only))
        log("   store sha256 %s... page sha256 %s..." % (sha(objb)[:16], sha(pageb)[:16]))
        log("")

    prot_fail = [r for r in rows if r["protected"] and
                 (r["assertion_result"] != "HOLDS" or any(r["membership"].values())
                  or r["sidecar_vs_store"] != "AGREE")]
    out = {
        "check": "sidecar mismatch membership + positive assertion",
        "list_file": LIST, "list_bytes": len(raw), "list_sha256": sha(raw),
        "list_generated_against_ref": j.get("generated_against_ref"),
        "absence_is_not_clearance":
            "The list's own SCOPE says absence from it is NOT clearance and it answers "
            "only 'which pages must not be rebuilt right now'. Membership below is a "
            "FLAG. The load-bearing result is the positive assertion.",
        "membership_join_caveat":
            "Membership is joined on FILENAME across two trees at different refs -- the "
            "list was generated in rapidmeta-finerenone against %s, the pages scored "
            "here are in the rob-lane worktree. A page NAME is not an artefact identity, "
            "so membership is indicative only." % j.get("generated_against_ref"),
        "protected_reviews": sorted(PROTECTED),
        "protected_failed": [r["topic"] for r in prot_fail],
        "rows": rows,
    }
    n = S.write_verified(RESULT, json.dumps(out, ensure_ascii=False, indent=1))
    log("wrote %s (%d bytes)" % (RESULT, n))
    if prot_fail:
        log("")
        log("⛔ PROTECTED REVIEW FLAGGED: %s -- reporting and stopping, not touching it."
            % ", ".join(r["topic"] for r in prot_fail))
    return out


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8",
                                  errors="replace", line_buffering=True)
    main()
