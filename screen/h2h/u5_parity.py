"""DEV-only parity check: our run_asreview_u5 order == the real `asreview simulate --ai elas_u5` CLI order
(pinned ASReview main build, same starting records, same seed). Run with the venv-u5 interpreter."""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

H = Path(sys.argv[1]); data = Path(sys.argv[2]); review = sys.argv[3]; seed = sys.argv[4]
sys.path.insert(0, str(H))
dev = [x.strip() for x in (H / "sets" / "dev.txt").read_text().splitlines() if x.strip() and not x.startswith("#")]
assert review in dev, "DEV reviews only"
pri = json.loads((H / "priors" / f"{review}.json").read_text())["priors"][seed]
with tempfile.TemporaryDirectory() as td:
    ours = Path(td) / "ours.json"
    subprocess.run([sys.executable, str(H / "run_asreview_u5.py"), "--review", review, "--seeds", seed,
                    "--data-dir", str(data), "--out", str(ours)], check=True, stdin=subprocess.DEVNULL)
    o1 = json.loads(ours.read_text())["runs"][seed]["order"]
    proj = Path(td) / "cli.asreview"
    exe = Path(sys.executable).with_name("asreview.exe")
    subprocess.run([str(exe), "simulate", str(data / f"{review}.csv"), "--ai", "elas_u5", "--prior-idx", *map(str, pri),
                    "--seed", seed, "-o", str(proj)], check=True, stdin=subprocess.DEVNULL, capture_output=True,
                   env={**__import__("os").environ, "PYTHONUTF8": "1"})  # the CLI prints records; cp1252 console
    import sqlite3
    import zipfile
    zipfile.ZipFile(proj).extract("results.db", td)  # the project archive's results table, in labelling order
    con = sqlite3.connect(str(Path(td) / "results.db"))
    tables = [r[0] for r in con.execute("select name from sqlite_master where type='table'")]
    o2 = [int(r[0]) for r in con.execute("select record_id from results order by rowid")]
    con.close()
print(json.dumps({"review": review, "seed": seed, "len_ours": len(o1), "len_cli": len(o2),
                  "identical_prefix_to_last_relevant": o1 == o2[: len(o1)], "first_diff":
                  next((i for i, (a, b) in enumerate(zip(o1, o2)) if a != b), None)}))
