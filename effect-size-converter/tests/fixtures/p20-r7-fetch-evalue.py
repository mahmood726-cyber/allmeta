"""Fetch the pinned EValue reference source into an R-created temp directory.

No package installation, git process, or repository cache is needed. The blob
hashes are the same pins used by tests/fixtures/evalue-input-reference.R.
"""
import hashlib
from pathlib import Path
import sys
from urllib.request import urlopen


COMMIT = "44c2dc41ce49444619bc2d97c16d87c7caef6f07"
PINS = {
    "R/EValue.R": "13c8b75aef067f6e203e923a2b7342066179dc3b",
    "R/effect_measures.R": "13af2244f6b1c04d13363fdc2b6a549351933105",
    "R/utils.R": "83966e9c541da39100487711f54c4895e8ddd7f9",
}


def main():
    destination = Path(sys.argv[1])
    for filename in [*PINS, "DESCRIPTION"]:
        url = f"https://raw.githubusercontent.com/cran/EValue/{COMMIT}/{filename}"
        with urlopen(url, timeout=60) as response:
            data = response.read()
        if filename in PINS:
            header = b"blob " + str(len(data)).encode("ascii") + b"\0"
            actual = hashlib.sha1(header + data).hexdigest()
            if actual != PINS[filename]:
                raise ValueError(f"Pinned source hash mismatch: {filename}")
        target = destination / filename
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("xb") as output:
            output.write(data)
        print(f"Fetched pinned EValue source: {filename}", flush=True)


if __name__ == "__main__":
    main()
