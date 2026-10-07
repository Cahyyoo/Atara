"""
Build webcam-framed sample photographs for the tests.

dlib's own examples are wide shots: in 2008_002506.jpg the face is 21% of the
frame width, and the application refuses anything under MIN_FACE_WIDTH (0.25)
as "too far away". Testing the product against a frame the product is right to
refuse proves nothing.

So the faces are found and re-cropped to the framing a laptop webcam actually
produces -- one head, roughly a third of the width, 640x480. The output is what
the end-to-end tests post.

    python scripts/make_fixtures.py

Writes headshot-a.jpg (one person) and headshot-b.jpg (another) next to the
originals in tests/fixtures/. Neither is committed: they are somebody's face.
"""

from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

import dlib
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "tests" / "fixtures"
SOURCE_URL = "https://raw.githubusercontent.com/davisking/dlib/master/examples/faces/"

# Which source photograph becomes which headshot. Two different people, because
# the test that matters most is the one where they must NOT match.
SOURCES = {
    "headshot-a.jpg": "2008_002506.jpg",
    "headshot-b.jpg": "2007_007763.jpg",
}

OUTPUT_SIZE = (640, 480)

# How much of the finished frame the face should span.
#
# Comfortably inside MIN_FACE_WIDTH (0.25) and MAX_FACE_WIDTH (0.8), and close
# to where somebody sitting at a laptop actually lands. Deliberately not near
# either limit: a fixture that sat on a threshold would make an unrelated
# change to that threshold look like a broken chain.
TARGET_FACE_WIDTH = 0.36


def fetch(name: str) -> Path:
    path = FIXTURES / name
    if path.exists():
        return path
    FIXTURES.mkdir(parents=True, exist_ok=True)
    print(f"  get  {name}")
    urllib.request.urlretrieve(f"{SOURCE_URL}{name}", path)
    return path


def crop_to_webcam(image: Image.Image, rect) -> Image.Image:
    """A 4:3 frame around one face, at TARGET_FACE_WIDTH of the width."""
    face_centre_x = rect.left() + rect.width() / 2
    face_centre_y = rect.top() + rect.height() / 2

    crop_width = rect.width() / TARGET_FACE_WIDTH
    crop_height = crop_width * OUTPUT_SIZE[1] / OUTPUT_SIZE[0]

    # Faces sit above the middle of a webcam frame, not in it: cropping on the
    # face centre puts the chin in the middle and the forehead at the top.
    left = face_centre_x - crop_width / 2
    top = face_centre_y - crop_height * 0.45

    # Kept inside the source rather than padded, so nothing is invented.
    left = max(0, min(left, image.width - crop_width))
    top = max(0, min(top, image.height - crop_height))
    crop_width = min(crop_width, image.width)
    crop_height = min(crop_height, image.height)

    box = (int(left), int(top), int(left + crop_width), int(top + crop_height))
    return image.crop(box).resize(OUTPUT_SIZE, Image.LANCZOS)


def main() -> int:
    detector = dlib.get_frontal_face_detector()
    print(f"webcam-framed fixtures -> {FIXTURES}")

    failed = False
    for target, source in SOURCES.items():
        image = Image.open(fetch(source)).convert("RGB")

        # Upsampled here and nowhere else: this runs once, off the hot path,
        # and finding the face in a wide shot is the whole job.
        boxes, scores, _ = detector.run(np.array(image), 1, 0.0)
        if not boxes:
            print(f"  FAIL {source}: no face found to crop around")
            failed = True
            continue

        best = int(np.argmax(scores))
        cropped = crop_to_webcam(image, boxes[best])
        cropped.save(FIXTURES / target, format="JPEG", quality=85)

        # Measured back through the detector, because a crop that lands outside
        # the thresholds is a fixture that will fail for the wrong reason.
        check, check_scores, _ = detector.run(np.array(cropped), 0, -0.5)
        if not check:
            print(f"  FAIL {target}: the crop is no longer detectable")
            failed = True
            continue

        width = check[int(np.argmax(check_scores))].width() / cropped.width
        verdict = "ok" if 0.25 < width < 0.8 else "OUTSIDE THE THRESHOLDS"
        print(f"  {target}  from {source}  face {width:.0%} of width  {verdict}")
        failed = failed or verdict != "ok"

    print("\nDone." if not failed else "\nSomething is wrong with the crops.")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
