"""Split the local export; never write the whole ONNX into the repository."""
import argparse
import hashlib
import json
from pathlib import Path

def sha(data):
    return hashlib.sha256(data).hexdigest()

def split(source, destination, chunk_bytes=90_000_000):
    source, destination = Path(source), Path(destination)
    if not 0 < chunk_bytes < 95_000_000:
        raise ValueError("Each part must be smaller than 95 MB")
    destination.mkdir(parents=True, exist_ok=True)
    parts, digest, total = [], hashlib.sha256(), 0
    with source.open("rb") as stream:
        while block := stream.read(chunk_bytes):
            name = source.name + ".part%02d" % len(parts)
            (destination / name).write_bytes(block)
            parts.append(dict(name=name, bytes=len(block), sha256=sha(block)))
            digest.update(block)
            total += len(block)
    manifest = dict(file=source.name, bytes=total, sha256=digest.hexdigest(), parts=parts)
    (destination / "parts.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    print(json.dumps(split(args.source, args.destination), indent=2))
