"""
The dlib half: detect, locate the eyes, describe once.

This module holds no policy. It does not know what score is good enough, how
wide a face should be, what counts as a blink, or who is signing in. It runs
the models and reports numbers; every threshold lives in the web application,
in src/lib/face-quality.ts and src/lib/face-liveness.ts, where it already is
and where it is already tested.

That split is deliberate. A blink rule written here as well would be a second
copy of a rule that must agree with the first, and the two would drift without
anything failing.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path

import dlib
import numpy as np
from PIL import Image

# The 68-point scheme puts each eye in six consecutive landmarks, which is
# exactly what eyeAspectRatio() in the web application expects. The points are
# passed through rather than turned into a ratio here, so that function stays
# the only place the blink rule is written.
LEFT_EYE = slice(36, 42)
RIGHT_EYE = slice(42, 48)

LANDMARK_MODEL = "shape_predictor_68_face_landmarks.dat"
RECOGNITION_MODEL = "dlib_face_recognition_resnet_model_v1.dat"
DESCRIPTOR_LENGTH = 128

# Reported back so the diagnostics line names what produced a reading rather
# than leaving it to be inferred.
#
# There used to be a second entry here. dlib's CNN detector (mmod_human_face
# _detector.dat) was going to back HOG up whenever HOG came up empty, and it
# was measured instead of assumed. On this machine, on the same photograph:
#
#     width   CNN         faces     HOG        faces
#       240    954ms          0       7ms          1
#       320   1620ms          1      11ms          3
#       480   3691ms          3      24ms          3
#       640   6409ms          3      41ms          3
#
# It is not a fallback if it is slower and finds less. A six-second pause in a
# sign-in is worse than a clear refusal, so the CNN was dropped along with its
# 0.7MB of weights. Written down here so it is not added back on the assumption
# that a bigger model must be a better one.
DETECTOR = "hog"

# Joining two different scales, in one place, with both ends measured.
#
# dlib's HOG detector returns an SVM decision value, not a probability. The web
# application's MIN_DETECTION_SCORE is 0.5 on a 0-1 confidence, so the two
# scales have to meet somewhere, and here is better than scattered through the
# caller.
#
# Where they meet was measured, not guessed. Raw scores from the sample
# photographs, at the width the browser sends:
#
#     solid frontal faces     +1.0 .. +2.3
#     marginal                +0.1 .. +0.4
#     weak, but a real face          -0.3
#
# So the useful range is about -0.5 to +1.5, mapped linearly and clamped. That
# puts the 0.5 refusal line at a raw +0.5: above every marginal reading and
# below every solid one, which is the gap the line belongs in.
#
# The first attempt used score / (score + 1), which put the line at a raw +1.0
# and would have refused half the solid detections above as "not sure that is a
# face". Both ends are named so they can be moved once there are readings from
# a real bench rather than from sample photographs.
HOG_SCORE_FLOOR = -0.5
HOG_SCORE_CEILING = 1.5

# Do not upsample before detecting.
#
# Measured on this machine at 640px wide: upsample=1 costs 158ms per frame and
# upsample=0 costs 41ms, and both find the same faces. Upsampling exists to
# reach faces smaller than dlib's 80x80 training window -- and a face that
# small in a 640px frame is 12% of the width, which MIN_FACE_WIDTH (0.25)
# refuses anyway. So it cannot rescue a frame that would be accepted; it only
# spends four times as long proving it.
HOG_UPSAMPLE = 0

# Frames are resized down to this width before anything looks at them.
#
# Cost grows with area, not with usefulness: the same photograph at 1986px took
# 1620ms per frame against 41ms at 640px, for the same face. The browser is
# asked for 640x480, so this is a guard against a caller that sends something
# else rather than a normal part of the path.
MAX_FRAME_WIDTH = 640

# After the first face in a burst, look for the next one near where it was.
#
# A burst is 1.4 seconds of somebody holding still to blink, so the face in
# frame n+1 is within a few pixels of the face in frame n. Scanning the whole
# 640px frame again for it was most of the burst's detection cost. Measured on
# this machine, headshot fixtures, face ~216px wide:
#
#                                  ms/frame   box vs full   eye points vs full
#     full frame                   43 .. 60        --              --
#     crop, 35% margin             19 .. 29     +-11..13px      +-1..3px
#     crop, 35%, face to 120px     13 .. 16     +-12..23px      +-1px
#
# The last row is what runs. The box moves by about one step of HOG's own
# pyramid, which a head moving a few pixels already does between frames; the
# eye points, which the blink rule reads, moved least of any variant. The raw
# score stayed on the same side of the 0.5 line for every face measured.
#
# The margin is a fraction of the previous box on every side: 35% of a 216px
# face is ~75px of movement in 120ms, far more than anybody holding still.
ROI_MARGIN = 0.35

# The width the face is shrunk to inside the crop before detecting. dlib's
# window is 80x80, so 120 leaves it a pyramid step or two to settle in rather
# than asking it to find a face exactly at its own size.
ROI_FACE_WIDTH = 120

# Rec. 601 luma, matching pixelLuminance() in src/lib/face-frame.ts. Two
# implementations of one formula, so it is written here as the same constants
# rather than as an approximation.
LUMA_WEIGHTS = np.array([0.299, 0.587, 0.114], dtype=np.float64)


class ModelsMissing(RuntimeError):
    """The .dat weights are not on disk. Run scripts/fetch_models.py."""


class DeadlinePassed(RuntimeError):
    """
    The caller stopped waiting before this work finished.

    The web application aborts its request after a fixed budget, but a
    handler blocked in dlib never notices the connection go: it computes the
    whole burst and writes an answer to nobody. Under load that is most of
    the work the service does. So the caller says up front when it will stop
    listening, and the engine checks between frames.
    """


def _check_deadline(deadline: float | None) -> None:
    if deadline is not None and time.time() > deadline:
        raise DeadlinePassed()


@dataclass
class FrameReading:
    """One frame, measured. Fractions of the frame, never pixels."""

    detected: bool
    score: float = 0.0
    box: dict[str, float] = field(default_factory=dict)
    left_eye: list[list[float]] = field(default_factory=list)
    right_eye: list[list[float]] = field(default_factory=list)
    luminance: float = 0.0


@dataclass
class Analysis:
    frames: list[FrameReading]
    descriptor: list[float] | None
    best_frame_index: int | None
    detector_used: str
    elapsed_ms: int


def _normalise_score(raw: float) -> float:
    """dlib's unbounded decision value onto the 0-1 the web side speaks."""
    span = HOG_SCORE_CEILING - HOG_SCORE_FLOOR
    return float(min(1.0, max(0.0, (raw - HOG_SCORE_FLOOR) / span)))


def _downscale(image: np.ndarray) -> np.ndarray:
    """No wider than MAX_FRAME_WIDTH. Already-small frames are handed back as they are."""
    height, width = image.shape[:2]
    if width <= MAX_FRAME_WIDTH:
        return image

    scale = MAX_FRAME_WIDTH / width
    resized = Image.fromarray(image).resize(
        (MAX_FRAME_WIDTH, max(1, round(height * scale))), Image.BILINEAR
    )
    return np.array(resized)


def _mean_luminance(image: np.ndarray, rect) -> float:
    """
    Brightness of the face, not of the frame.

    A bright window behind a dark face would otherwise pass as well lit, and
    that is exactly the shot worth refusing.
    """
    height, width = image.shape[:2]
    top = max(0, rect.top())
    left = max(0, rect.left())
    bottom = min(height, rect.bottom())
    right = min(width, rect.right())

    if bottom <= top or right <= left:
        # Unmeasurable is not the same as dark, so it is not reported as dark.
        return float("inf")

    patch = image[top:bottom, left:right, :3].astype(np.float64)
    return float((patch @ LUMA_WEIGHTS).mean())


class FaceEngine:
    """
    Models are loaded once and held.

    Loading the recogniser takes about a second and the landmark model rather
    longer; doing it per request would put that on every sign-in.
    """

    def __init__(self, model_dir: Path) -> None:
        self.model_dir = Path(model_dir)
        self._hog = dlib.get_frontal_face_detector()
        self._shape = None
        self._recogniser = None

    def _path(self, name: str) -> Path:
        path = self.model_dir / name
        if not path.exists():
            raise ModelsMissing(
                f"{name} is not in {self.model_dir}. Run: python scripts/fetch_models.py"
            )
        return path

    def check_models(self) -> None:
        """
        The files are there; nothing is loaded.

        For the supervisor process under `workers=N`: it must still refuse to
        start when the weights are missing, but it never answers a request, so
        loading 120MB of models into it would be 120MB nobody uses. Each
        worker loads its own copy in the lifespan.
        """
        self._path(LANDMARK_MODEL)
        self._path(RECOGNITION_MODEL)

    def load(self) -> None:
        """Eager load, so a missing model is a startup failure, not a login failure."""
        self._shape = dlib.shape_predictor(str(self._path(LANDMARK_MODEL)))
        self._recogniser = dlib.face_recognition_model_v1(
            str(self._path(RECOGNITION_MODEL))
        )

    def warm_up(self) -> None:
        """
        One pass through every model on a blank image, before anyone is waiting.

        The first call into each model pays for allocations and, on the BLAS
        build, for OpenBLAS starting its threads. Paid here, in the lifespan,
        it is a slower startup rather than a slower first sign-in on every
        worker. A blank frame finds no face, so the landmarks and the
        recogniser are called directly: the recogniser on a 150px chip, which
        is the aligned size it would otherwise be handed.
        """
        if self._shape is None or self._recogniser is None:
            raise ModelsMissing("FaceEngine.load() has not been called.")
        blank = np.zeros((360, 480, 3), dtype=np.uint8)
        self._detect_hog(blank)
        self._shape(blank, dlib.rectangle(160, 100, 320, 260))
        self._recogniser.compute_face_descriptor(
            np.zeros((150, 150, 3), dtype=np.uint8)
        )

    def _detect_hog(self, image: np.ndarray):
        """
        The strongest face in the frame, with its raw score.

        run() rather than __call__ because the score is the difference between
        "no face" and "a face just under the line", and those need opposite
        advice. -0.5 as the adjustment lets weak detections through so that
        difference is visible; what is good enough is decided by the caller.
        """
        boxes, scores, _ = self._hog.run(image, HOG_UPSAMPLE, HOG_SCORE_FLOOR)
        if not boxes:
            return None
        best = int(np.argmax(scores))
        return boxes[best], float(scores[best])

    def _detect_near(self, image: np.ndarray, previous):
        """
        The face again, looked for only around where it just was.

        Returns the box in the full frame's pixels, so everything after this
        -- landmarks, luminance, the descriptor -- runs on the whole image
        exactly as it would have. None when it has gone from the crop; the
        caller then looks at the whole frame, so a missed crop costs time,
        never a reading.
        """
        height, width = image.shape[:2]
        margin_x = int(previous.width() * ROI_MARGIN)
        margin_y = int(previous.height() * ROI_MARGIN)
        left = max(0, previous.left() - margin_x)
        top = max(0, previous.top() - margin_y)
        right = min(width, previous.right() + margin_x)
        bottom = min(height, previous.bottom() + margin_y)
        if right <= left or bottom <= top:
            return None

        crop = image[top:bottom, left:right]
        scale = 1.0
        if previous.width() > ROI_FACE_WIDTH:
            scale = ROI_FACE_WIDTH / previous.width()
            crop = np.array(
                Image.fromarray(crop).resize(
                    (
                        max(1, round(crop.shape[1] * scale)),
                        max(1, round(crop.shape[0] * scale)),
                    ),
                    Image.BILINEAR,
                )
            )
        else:
            # A slice is a view with the frame's strides; dlib wants its own.
            crop = np.ascontiguousarray(crop)

        found = self._detect_hog(crop)
        if found is None:
            return None
        rect, raw = found
        return (
            dlib.rectangle(
                round(rect.left() / scale) + left,
                round(rect.top() / scale) + top,
                round(rect.right() / scale) + left,
                round(rect.bottom() / scale) + top,
            ),
            raw,
        )

    def _measure(self, image: np.ndarray, rect, raw_score: float):
        shape = self._shape(image, rect)
        height, width = image.shape[:2]

        def relative(points) -> list[list[float]]:
            return [[p.x / width, p.y / height] for p in points]

        parts = list(shape.parts())
        reading = FrameReading(
            detected=True,
            score=_normalise_score(raw_score),
            box={
                "x": rect.left() / width,
                "y": rect.top() / height,
                "width": rect.width() / width,
                "height": rect.height() / height,
            },
            left_eye=relative(parts[LEFT_EYE]),
            right_eye=relative(parts[RIGHT_EYE]),
            luminance=_mean_luminance(image, rect),
        )
        return reading, shape

    def analyse(
        self,
        images: list[np.ndarray],
        jitters: int = 1,
        describe: bool = True,
        deadline: float | None = None,
    ) -> Analysis:
        """
        Measure every frame; describe exactly one.

        The recogniser is the expensive model and only one descriptor is ever
        used, so it runs once, on the strongest frame, after the rest is known.

        `deadline` is a Unix time in seconds after which the caller is gone.
        It is checked before every frame and before the descriptor pass, so a
        burst whose caller timed out costs at most one frame's detection
        rather than the whole run.
        """
        if self._shape is None or self._recogniser is None:
            raise ModelsMissing("FaceEngine.load() has not been called.")

        started = time.perf_counter()
        # Resized once, up front, so the detector, the landmarks and the
        # descriptor all see the same pixels. Measuring on one scale and
        # describing on another would put the box in the wrong place.
        images = [_downscale(image) for image in images]
        readings: list[FrameReading] = []
        shapes: dict[int, object] = {}
        # The last face found, which the next frame is searched around.
        previous = None

        for image in images:
            _check_deadline(deadline)
            found = None
            if previous is not None:
                found = self._detect_near(image, previous)
            if found is None:
                found = self._detect_hog(image)
            if found is None:
                readings.append(FrameReading(detected=False))
                continue
            rect, raw = found
            previous = rect
            reading, shape = self._measure(image, rect, raw)
            shapes[len(readings)] = shape
            readings.append(reading)

        best_index = None
        if shapes:
            best_index = max(shapes, key=lambda i: readings[i].score)

        descriptor = None
        if describe and best_index is not None:
            # The single most expensive step; the last place it is worth asking.
            _check_deadline(deadline)
            computed = self._recogniser.compute_face_descriptor(
                images[best_index], shapes[best_index], jitters
            )
            descriptor = [float(value) for value in computed]

        return Analysis(
            frames=readings,
            descriptor=descriptor,
            best_frame_index=best_index,
            detector_used=DETECTOR,
            elapsed_ms=int((time.perf_counter() - started) * 1000),
        )
