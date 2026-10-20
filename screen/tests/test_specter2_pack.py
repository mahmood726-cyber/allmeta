import hashlib
import importlib.util
import json
import uuid
import unittest
from pathlib import Path

SCREEN = Path(__file__).resolve().parents[1]
PACK = SCREEN / "vendor/semantic/models/specter2"
PIN = "2b1dc054c82e7ad6cf20456b11bee978416468c1af399383dbbd66b307d5748a"

class SpecterPack(unittest.TestCase):
    def test_real_pack_and_provenance(self):
        manifest = json.loads((PACK / "parts.json").read_text())
        provenance = json.loads((PACK / "export_provenance.json").read_text())
        digest = hashlib.sha256()
        total = 0
        self.assertEqual(len(manifest["parts"]), 2)
        for part in manifest["parts"]:
            data = (PACK / part["name"]).read_bytes()
            self.assertEqual(len(data), part["bytes"])
            self.assertLess(len(data), 95_000_000)
            self.assertEqual(hashlib.sha256(data).hexdigest(), part["sha256"])
            digest.update(data)
            total += len(data)
        self.assertEqual(total, 110115365)
        self.assertEqual(digest.hexdigest(), PIN)
        self.assertEqual(manifest["sha256"], PIN)
        self.assertEqual(provenance["files"]["model_quantized.onnx"]["sha256"], PIN)
        self.assertFalse((PACK / "onnx/model_quantized.onnx").exists())

    def test_split_round_trip(self):
        spec = importlib.util.spec_from_file_location("split_model", SCREEN / "tools/split_model.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        tmp = SCREEN / "tests" / ("split-fixture-" + uuid.uuid4().hex)
        tmp.mkdir()
        try:
            source = Path(tmp) / "model_quantized.onnx"
            source.write_bytes(bytes(range(255)))
            dest = Path(tmp) / "parts"
            manifest = module.split(source, dest, 100)
            self.assertEqual(b"".join((dest / p["name"]).read_bytes() for p in manifest["parts"]), source.read_bytes())
            with self.assertRaises(ValueError):
                module.split(source, dest, 95_000_000)
        finally:
            for file in (tmp / "parts").glob("*"):
                file.unlink()
            (tmp / "parts").rmdir()
            (tmp / "model_quantized.onnx").unlink()
            tmp.rmdir()

if __name__ == "__main__":
    unittest.main()
