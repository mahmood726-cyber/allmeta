"""
CLI for the unified truth-recovery engine.

    python -m truth_recovery info
    python -m truth_recovery estimate --csv studies.csv          # cols: y,v  (or effect,se / yi,vi)
    python -m truth_recovery estimate --json '{"y":[...],"v":[...]}'
    python -m truth_recovery serve --port 8731                   # local bridge for browser apps

`serve` starts a localhost-only HTTP bridge so in-browser allmeta apps can offer the
engine as a selectable option (the estimator itself is Python+sklearn and cannot run in
the browser). POST /estimate  {"y":[...], "v":[...]}  ->  the estimate() dict as JSON.
"""

import argparse
import csv
import json
import sys

from . import estimate, info, __version__


def _read_csv(path):
    y, v = [], []
    with open(path, newline="") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        raise SystemExit(f"no rows in {path}")
    cols = {c.lower(): c for c in rows[0].keys()}
    ycol = cols.get("y") or cols.get("yi") or cols.get("effect") or cols.get("loghr")
    vcol = cols.get("v") or cols.get("vi") or cols.get("var")
    secol = cols.get("se") or cols.get("std") or cols.get("sterr")
    if ycol is None or (vcol is None and secol is None):
        raise SystemExit("CSV needs a y/effect column and a v(variance) or se column")
    for r in rows:
        y.append(float(r[ycol]))
        if vcol is not None:
            v.append(float(r[vcol]))
        else:
            v.append(float(r[secol]) ** 2)
    return y, v


def _cmd_estimate(args):
    if args.csv:
        y, v = _read_csv(args.csv)
    elif args.json:
        d = json.loads(args.json)
        y, v = d["y"], d.get("v")
        se = d.get("se")
        r = estimate(y, v=v, se=se)
        print(json.dumps(r, indent=2))
        return
    else:
        raise SystemExit("provide --csv or --json")
    print(json.dumps(estimate(y, v), indent=2))


def _cmd_info(_args):
    print(json.dumps(info(), indent=2))


def _cmd_serve(args):
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    class H(BaseHTTPRequestHandler):
        def _cors(self):
            # localhost-only bridge; allow file:// and 127.0.0.1 origins
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")

        def do_OPTIONS(self):
            self.send_response(204); self._cors(); self.end_headers()

        def do_GET(self):
            if self.path.rstrip("/") in ("", "/info", "/health"):
                body = json.dumps(info()).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self._cors(); self.end_headers(); self.wfile.write(body)
            else:
                self.send_response(404); self._cors(); self.end_headers()

        def do_POST(self):
            try:
                n = int(self.headers.get("Content-Length", 0))
                d = json.loads(self.rfile.read(n) or b"{}")
                r = estimate(d["y"], v=d.get("v"), se=d.get("se"))
                body = json.dumps(r).encode()
                self.send_response(200)
            except Exception as e:  # honest error payload, never a fake estimate
                body = json.dumps({"error": str(e)}).encode()
                self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self._cors(); self.end_headers(); self.wfile.write(body)

        def log_message(self, *a):  # quiet
            pass

    srv = ThreadingHTTPServer(("127.0.0.1", args.port), H)
    print(f"truth_recovery engine bridge v{__version__} on http://127.0.0.1:{args.port}  "
          f"(POST /estimate {{y,v}})", file=sys.stderr)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        srv.shutdown()


def main(argv=None):
    p = argparse.ArgumentParser(prog="truth_recovery",
                                description="Unified truth-recovery (honest coverage) engine")
    sub = p.add_subparsers(dest="cmd", required=True)
    pe = sub.add_parser("estimate", help="estimate from a CSV or JSON of (y, v)")
    pe.add_argument("--csv"); pe.add_argument("--json")
    pe.set_defaults(func=_cmd_estimate)
    sub.add_parser("info", help="engine descriptor").set_defaults(func=_cmd_info)
    ps = sub.add_parser("serve", help="localhost HTTP bridge for browser apps")
    ps.add_argument("--port", type=int, default=8731)
    ps.set_defaults(func=_cmd_serve)
    args = p.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
