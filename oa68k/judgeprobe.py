# -*- coding: utf-8 -*-
"""Liveness probe for the judge panel. PROTOCOL: oa68k/SCORING-PROTOCOL.md section 5.

ONE REAL COMPLETION PER FAMILY. THREE CALLS. NO RETRIES.

  * each probe writes its OWN per-run log file
  * the model string is read back OUT OF THAT FILE ON DISK, not out of a variable
  * the artefact must be NON-EMPTY and rc == 0
  * the prompt is passed as ARGV, never on stdin -- the stdin path answers as GPT-OSS
    regardless of the pin
  * a failure is published as a failure. NEVER retried into a pass.

A status file is not liveness. A reply that can only say "OK" is not a check.
"""
import io
import json
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import opencompscore as S  # noqa: E402

OUTDIR = r"F:\claude-temp\pend"
RESULT = os.path.join(OUTDIR, "judgeprobe_result.json")
AGY_SETTINGS = S.AGY_SETTINGS

PROMPT = ("Reply with exactly three lines and nothing else, no preamble, no code fence.\n"
          "MODEL=<the exact model identifier you are running as>\n"
          "FAMILY=<one of: anthropic, openai, google>\n"
          "SUM=<the value of 19+23>")

# family -> (argv builder, pinned model, how the pin is applied)
SEATS = {
    "anthropic": (lambda m: ["claude", "-p", "--model", m, PROMPT],
                  "claude-sonnet-5", "--model flag"),
    # PROBE_HARNESS_ERROR on the first run: subprocess does not resolve .cmd shims from
    # PATH on Windows (only .EXE, which is why agy worked and codex did not). That was
    # OUR fault, not the seat's, and it never reached the vendor -- no quota was spent.
    "openai": (lambda m: [r"C:\Users\mahmo\AppData\Roaming\npm\codex.cmd",
                          "exec", "-m", m, PROMPT],
               "gpt-5.5", "-m flag"),
    "google": (lambda m: ["agy", "--print", PROMPT],
               "Gemini 3.1 Pro (High)",
               "settings.json (agy --print IGNORES --model)"),
}
TIMEOUT = 300


def pin_agy(model):
    """agy --print ignores --model; the pin has to live in settings.json."""
    orig = io.open(AGY_SETTINGS, encoding="utf-8").read()
    j = json.loads(orig)
    was = j.get("model")
    j["model"] = model
    S.write_verified(AGY_SETTINGS, json.dumps(j, indent=2))
    return orig, was


def run_seat(family, log=print):
    build, model, how = SEATS[family]
    logfile = os.path.join(OUTDIR, "judgeprobe_%s.log" % family)
    argv = build(model)
    restore = None
    was = None
    if family == "google":
        restore, was = pin_agy(model)
        log("  pinned agy settings.json: %r -> %r (will be restored)" % (was, model))
    t0 = time.time()
    rc, out, err, harness_error = None, "", "", None
    try:
        # stdin MUST be closed. The first openai probe printed "Reading additional input
        # from stdin..." because subprocess inherits stdin -- and the stdin path is the
        # one the protocol forbids, because it answers as GPT-OSS regardless of the pin.
        # Fixed here. NOT re-run: that call reached the vendor and produced a real
        # completion which failed the readback, and re-spending on a fix I expect to
        # pass is retrying into a pass.
        p = subprocess.run(argv, capture_output=True, timeout=TIMEOUT,
                           stdin=subprocess.DEVNULL)
        rc = p.returncode
        out = p.stdout.decode("utf-8", "replace")
        err = p.stderr.decode("utf-8", "replace")
    except subprocess.TimeoutExpired:
        harness_error = "TIMEOUT_%ds" % TIMEOUT
    except FileNotFoundError:
        harness_error = "CLI_NOT_FOUND"
    except OSError as e:
        harness_error = "OSERROR:%s" % e
    finally:
        if restore is not None:
            S.write_verified(AGY_SETTINGS, restore)

    dt = time.time() - t0
    # THE PER-RUN LOG. Written before any verdict is formed.
    body = ("family=%s\npinned_model=%s\npin_via=%s\nargv=%s\nrc=%s\nseconds=%.1f\n"
            "harness_error=%s\n--- STDOUT ---\n%s\n--- STDERR ---\n%s\n"
            % (family, model, how, json.dumps(argv[:-1] + ["<prompt>"]), rc, dt,
               harness_error, out, err))
    n = S.write_verified(logfile, body)

    # READ THE PIN BACK OUT OF THE FILE ON DISK, not out of the variable above.
    from_disk = io.open(logfile, encoding="utf-8").read()
    marker = "--- STDOUT ---\n"
    stdout_on_disk = from_disk.split(marker, 1)[1].split("\n--- STDERR ---", 1)[0]

    if harness_error:
        verdict = "PROBE_HARNESS_ERROR:%s" % harness_error
    else:
        verdict = S.verify_judge_artefact(rc, stdout_on_disk, family)
    return {
        "family": family, "pinned_model": model, "pin_via": how,
        "logfile": logfile, "log_bytes": n, "seconds": round(dt, 1),
        "rc": rc, "harness_error": harness_error,
        "stdout_head": " ".join(stdout_on_disk.split())[:400],
        "stderr_head": " ".join(err.split())[:300],
        "verdict": verdict or "LIVE",
        "model_string_found_in_logfile": bool(
            not harness_error and rc == 0 and stdout_on_disk.strip()
            and any(t in stdout_on_disk.casefold() for t in S.FAMILIES[family][1])),
    }


def main():
    res = []
    only = None
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1]
    prev = {}
    if only and os.path.exists(RESULT):
        prev = {s["family"]: s for s in json.load(io.open(RESULT, encoding="utf-8"))["seats"]}
    for fam in ("anthropic", "openai", "google"):
        if only and fam != only:
            if fam in prev:
                res.append(prev[fam])
                print("=== %s: carried from the earlier run (%s) ==="
                      % (fam, prev[fam]["verdict"]))
            continue
        print("=== probing %s (%s) ===" % (fam, SEATS[fam][1]))
        r = run_seat(fam)
        res.append(r)
        print("  rc=%s  %.0fs  verdict=%s" % (r["rc"], r["seconds"], r["verdict"]))
        print("  log: %s (%d bytes)" % (r["logfile"], r["log_bytes"]))
        print("  said: %s" % (r["stdout_head"][:220] or "(empty)"))
        if r["stderr_head"]:
            print("  err : %s" % r["stderr_head"][:200])
        print("")

    live = [r["family"] for r in res if r["verdict"] == "LIVE"]
    panel = ("THREE_FAMILY" if len(live) == 3 else
             "DEGRADED_TWO_FAMILY" if len(live) == 2 else
             "DEGRADED_SINGLE_FAMILY" if len(live) == 1 else "NO_PANEL")
    out = {
        "probed_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "protocol": S.PROTOCOL,
        "calls_made": len(res),
        "retries": 0,
        "no_retry_rule": "One call per family. A failure is published as a failure and "
                         "is never retried into a pass.",
        "stdin_never_used": "Every prompt was passed as an argv argument. The stdin path "
                            "answers as GPT-OSS regardless of the pin.",
        "panel": panel,
        "live_families": live,
        "seats": res,
    }
    S.write_verified(RESULT, json.dumps(out, ensure_ascii=False, indent=1))
    print("PANEL: %s   live=%s" % (panel, live))
    for r in res:
        if r["verdict"] != "LIVE":
            print("  FAILED SEAT %s: %s" % (r["family"], r["verdict"]))
    print("wrote %s (%d bytes)" % (RESULT, os.path.getsize(RESULT)))
    return 0


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8",
                                  errors="replace", line_buffering=True)
    sys.exit(main())
