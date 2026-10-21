"""Export a Hugging Face encoder (default ncbi/MedCPT-Article-Encoder) to ONNX (optimum) and dynamic-quantize to q8, laid out
the way transformers.js expects: <out>/<org>/<name>/{config,tokenizer*}.json + onnx/model{,_quantized}.onnx

usage: python convert_medcpt.py --out-root <dir> [--model ncbi/MedCPT-Article-Encoder] [--revision <sha>]
Run inside a venv with optimum[exporters,onnxruntime]. Caches must point off the system drive
(HF_HOME, TMP/TEMP)."""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from importlib.metadata import version

ap = argparse.ArgumentParser()
ap.add_argument("--out-root", required=True)
ap.add_argument("--model", default="ncbi/MedCPT-Article-Encoder")
ap.add_argument("--revision", default=None)
ap.add_argument("--local-name", default="local/MedCPT-Article-Encoder")
ap.add_argument("--note", default="")
a = ap.parse_args()

from huggingface_hub import HfApi, snapshot_download

rev = a.revision or HfApi().model_info(a.model).sha
dest = os.path.join(a.out_root, *a.local_name.split("/"))
os.makedirs(os.path.join(dest, "onnx"), exist_ok=True)
work = dest + "_optimum_export"

snap = snapshot_download(a.model, revision=rev)
# 1) optimum export (fp32)
cmd = [sys.executable, "-m", "optimum.exporters.onnx", "--model", snap, "--task", "feature-extraction",
       "--opset", "14", work]
print(" ".join(cmd), flush=True)
subprocess.run(cmd, check=True, stdin=subprocess.DEVNULL)

shutil.copy(os.path.join(work, "model.onnx"), os.path.join(dest, "onnx", "model.onnx"))
for f in os.listdir(work):
    if f.endswith(".json") or f.endswith(".txt"):
        shutil.copy(os.path.join(work, f), os.path.join(dest, f))

# 2) dynamic quantization -> q8 (transformers.js dtype 'q8' == onnx/model_quantized.onnx)
from onnxruntime.quantization import QuantType, quantize_dynamic

QARGS = dict(weight_type=QuantType.QInt8, per_channel=False, reduce_range=False)
quantize_dynamic(os.path.join(dest, "onnx", "model.onnx"), os.path.join(dest, "onnx", "model_quantized.onnx"), **QARGS)


def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as fh:
        for b in iter(lambda: fh.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


prov = {
    "source_model": a.model,
    "source_revision": rev,
    "exporter": "optimum.exporters.onnx --task feature-extraction --opset 14",
    "quantization": {"fn": "onnxruntime.quantization.quantize_dynamic",
                     **{k: str(v) for k, v in QARGS.items()}},
    "versions": {p: version(p) for p in ["torch", "transformers", "optimum", "optimum-onnx", "onnx", "onnxruntime"]},
    "python": sys.version.split()[0],
    "files": {f: {"bytes": os.path.getsize(os.path.join(dest, "onnx", f)), "sha256": sha(os.path.join(dest, "onnx", f))}
              for f in ["model.onnx", "model_quantized.onnx"]},
    "note": a.note,
}
with open(os.path.join(dest, "export_provenance.json"), "w", encoding="utf-8") as fh:
    json.dump(prov, fh, indent=2)
shutil.rmtree(work, ignore_errors=True)
print(json.dumps(prov, indent=2))
