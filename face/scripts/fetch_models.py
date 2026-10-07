"""
Fetch the dlib weights.

They are ~123MB and are not in the repository: inputs, not source. Run once
after cloning, and again only if the files are removed.

    python scripts/fetch_models.py

Every file is checked against a pinned SHA-256 after decompression. A model
that silently changed is a model whose descriptors no longer compare against
the ones already enrolled, and the threshold is 0.6 -- that drift would show up
as people being unable to sign in, not as an error.
"""

from __future__ import annotations

import bz2
import hashlib
import sys
import urllib.request
from pathlib import Path

MODEL_DIR = Path(__file__).resolve().parent.parent / "models"
# davisking's own model repository, not dlib.net/files.
#
# dlib.net answers 301 to https and then fails certificate verification here,
# which is a bad thing to teach a setup script to ignore. This is the same
# author publishing the same files over a chain that verifies normally.
BASE_URL = "https://raw.githubusercontent.com/davisking/dlib-models/master/"

# SHA-256 of the DECOMPRESSED .dat, filled in by --print-hashes below.
MODELS: dict[str, str] = {
    "shape_predictor_68_face_landmarks.dat": "fbdc2cb80eb9aa7a758672cbfdda32ba6300efe9b6e6c7a299ff7e736b11b92f",
    "dlib_face_recognition_resnet_model_v1.dat": "55533b28a95800a551ba546ba62fe69625c7e95a7061c338adffead08719da30",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def fetch(name: str) -> Path:
    target = MODEL_DIR / name
    if target.exists():
        print(f"  have {name}")
        return target

    url = f"{BASE_URL}{name}.bz2"
    print(f"  get  {name} ... ", end="", flush=True)

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    archive = target.with_suffix(target.suffix + ".bz2")
    urllib.request.urlretrieve(url, archive)

    with bz2.open(archive, "rb") as source, target.open("wb") as out:
        while block := source.read(1 << 20):
            out.write(block)
    archive.unlink()

    print(f"{target.stat().st_size / 1e6:.1f} MB")
    return target


def main() -> int:
    printing = "--print-hashes" in sys.argv
    print(f"dlib models -> {MODEL_DIR}")

    failed = False
    for name, expected in MODELS.items():
        path = fetch(name)
        actual = sha256(path)

        if printing:
            print(f'    "{name}": "{actual}",')
            continue

        if not expected:
            print(f"  WARN {name}: no pinned hash; got {actual}")
        elif actual != expected:
            # Left in place deliberately: deleting it would send the next run
            # straight back to the same URL for the same bad file.
            print(f"  FAIL {name}\n       expected {expected}\n       got      {actual}")
            failed = True

    if failed:
        print("\nA model did not match its pinned hash. Not safe to use.")
        return 1

    print("\nDone." if not printing else "")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
