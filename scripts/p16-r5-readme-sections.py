"""Read-only renderer probe for the P16-R5 Node regression tests."""
import json
import runpy
from pathlib import Path


namespace = runpy.run_path(str(Path(__file__).with_name("gen_app_readmes.py")))
render = namespace["_render_auto_section"]
print(json.dumps({
    "nma": render("nma-inconsistency", {}, [], None),
    "generic": render("control-app", {}, [], None),
}))
