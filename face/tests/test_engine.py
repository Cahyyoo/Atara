"""
What the engine must keep doing.

The descriptor tests are the load-bearing ones: a descriptor that no longer
separates two people is not an error anybody would see until somebody signs in
as somebody else.
"""

from __future__ import annotations

import numpy as np
import pytest

from app.engine import (
    DESCRIPTOR_LENGTH,
    HOG_SCORE_CEILING,
    HOG_SCORE_FLOOR,
    MAX_FRAME_WIDTH,
    _downscale,
    _normalise_score,
)

# The same number the web application uses, repeated here on purpose: if
# MATCH_THRESHOLD moves in src/lib/face-match.ts and these still pass, the two
# have disagreed and that is worth finding here.
MATCH_THRESHOLD = 0.6


def distance(a: list[float], b: list[float]) -> float:
    return float(np.linalg.norm(np.array(a) - np.array(b)))


class TestScoreMapping:
    """
    The join between dlib's scale and the web application's 0-1.

    Measured raw scores: solid faces +1.0..+2.3, marginal +0.1..+0.4, a weak
    but real face -0.3. The refusal line is 0.5 on the mapped scale.
    """

    def test_solid_detections_land_above_the_refusal_line(self):
        for raw in (1.0, 1.5, 2.3):
            assert _normalise_score(raw) > 0.5, raw

    def test_marginal_detections_land_below_it(self):
        for raw in (0.1, 0.2, 0.4):
            assert _normalise_score(raw) < 0.5, raw

    def test_the_line_sits_in_the_gap_between_them(self):
        # The gap is +0.4 to +1.0. Anywhere in it would do; this pins where it
        # actually is so a change has to be deliberate.
        assert 0.4 < (HOG_SCORE_FLOOR + HOG_SCORE_CEILING) / 2 < 1.0

    def test_stays_inside_zero_to_one(self):
        for raw in (-99.0, -0.5, 0.0, 1.5, 99.0):
            assert 0.0 <= _normalise_score(raw) <= 1.0

    def test_never_decreases(self):
        raws = [-1.0, -0.5, 0.0, 0.5, 1.0, 1.5, 3.0]
        mapped = [_normalise_score(r) for r in raws]
        assert mapped == sorted(mapped)


class TestDownscale:
    def test_large_frames_are_capped(self):
        image = np.zeros((1545, 1986, 3), dtype=np.uint8)
        assert _downscale(image).shape[1] == MAX_FRAME_WIDTH

    def test_aspect_ratio_survives(self):
        image = np.zeros((1545, 1986, 3), dtype=np.uint8)
        out = _downscale(image)
        assert abs(out.shape[0] / out.shape[1] - 1545 / 1986) < 0.01

    def test_small_frames_are_left_alone(self):
        # Not merely the same size -- the same object. Re-encoding a frame that
        # is already small enough would cost quality for nothing.
        image = np.zeros((480, 640, 3), dtype=np.uint8)
        assert _downscale(image) is image


class TestAnalyse:
    def test_finds_a_face_in_every_frame_of_a_clear_burst(self, engine, face):
        result = engine.analyse([face] * 4)
        assert [f.detected for f in result.frames] == [True] * 4

    def test_describes_exactly_one_frame(self, engine, face):
        result = engine.analyse([face] * 4)
        assert result.best_frame_index is not None
        assert len(result.descriptor) == DESCRIPTOR_LENGTH

    def test_reports_six_landmarks_per_eye(self, engine, face):
        """
        The contract with eyeAspectRatio() in src/lib/face-liveness.ts, which
        throws on any other count. Six is not a detail of this file; it is what
        the other side is written against.
        """
        best = engine.analyse([face]).frames[0]
        assert len(best.left_eye) == 6
        assert len(best.right_eye) == 6

    def test_geometry_is_reported_as_fractions(self, engine, face):
        """Never pixels: face-quality.ts compares against 0.25 and 0.8."""
        box = engine.analyse([face]).frames[0].box
        for key in ("x", "y", "width", "height"):
            assert 0.0 <= box[key] <= 1.0, key

        for point in engine.analyse([face]).frames[0].left_eye:
            assert 0.0 <= point[0] <= 1.0 and 0.0 <= point[1] <= 1.0

    def test_a_frame_with_no_face_is_reported_not_dropped(self, engine, face):
        blank = np.zeros_like(face)
        result = engine.analyse([blank, face, blank])
        # Three in, three out: the caller counts frames to tell "saw nothing"
        # from "saw something too poor to use".
        assert len(result.frames) == 3
        assert [f.detected for f in result.frames] == [False, True, False]
        assert result.best_frame_index == 1

    def test_no_face_anywhere_means_no_descriptor(self, engine, face):
        result = engine.analyse([np.zeros_like(face)] * 3)
        assert result.descriptor is None
        assert result.best_frame_index is None

    def test_an_empty_burst_does_not_raise(self, engine):
        result = engine.analyse([])
        assert result.frames == [] and result.descriptor is None


class TestWarmUp:
    def test_runs_on_a_loaded_engine(self, engine):
        # Called from the lifespan: a failure here is a worker that never starts.
        engine.warm_up()

    def test_leaves_readings_unchanged(self, engine, face):
        before = engine.analyse([face]).descriptor
        engine.warm_up()
        assert distance(engine.analyse([face]).descriptor, before) < 1e-6


@pytest.fixture(scope="module")
def headshot() -> np.ndarray:
    """
    The framing a laptop webcam sends, at the width the browser sends it.

    The ROI path is about following one face through a burst, so it is tested
    on the frame the product accepts rather than the wide shot it refuses.
    """
    from PIL import Image

    from tests.conftest import FIXTURES

    path = FIXTURES / "headshot-a.jpg"
    if not path.exists():
        pytest.skip(f"{path.name} is missing; run scripts/make_fixtures.py")
    image = Image.open(path).convert("RGB")
    width, height = image.size
    return np.array(
        image.resize((MAX_FRAME_WIDTH, round(height * MAX_FRAME_WIDTH / width)))
    )


class TestDetectNear:
    """
    Frames after the first are searched near the last face, not everywhere.

    What must not change is anything the web application judges on: that a
    face is found, which side of the 0.5 line its score is on, roughly where
    its box is, and who it is.
    """

    def test_agrees_with_the_full_frame_on_a_still_burst(self, engine, headshot):
        full_rect, full_raw = engine._detect_hog(headshot)
        rect, raw = engine._detect_near(headshot, full_rect)

        assert (_normalise_score(raw) > 0.5) == (_normalise_score(full_raw) > 0.5)
        # About one pyramid step, measured; see ROI_FACE_WIDTH in engine.py.
        tolerance = 0.15 * full_rect.width()
        for side in ("left", "top", "right", "bottom"):
            assert abs(getattr(rect, side)() - getattr(full_rect, side)()) <= tolerance, side

    def test_a_burst_reads_every_frame_the_same_way(self, engine, headshot):
        result = engine.analyse([headshot] * 6, describe=False)
        assert all(frame.detected for frame in result.frames)
        widths = [frame.box["width"] for frame in result.frames]
        # Still frames, so the width the distance check reads must not wander
        # far enough to flip "too far" on and off within one burst.
        assert max(widths) - min(widths) < 0.05

    def test_the_described_face_is_still_the_same_person(self, engine, headshot):
        # Frame 0 is found on the full frame, frames 1.. through the crop; the
        # descriptor comes from whichever scored best and must match either way.
        tracked = engine.analyse([headshot] * 4).descriptor
        single = engine.analyse([headshot]).descriptor
        assert distance(tracked, single) < MATCH_THRESHOLD

    def test_a_face_that_moved_away_is_found_on_the_full_frame(self, engine, headshot):
        # The face jumps to the other side of a wider canvas between frames,
        # out of any crop around where it was. The fallback has to catch it.
        height, width = headshot.shape[:2]
        canvas = np.zeros((height, width * 2, 3), dtype=np.uint8)
        left = canvas.copy()
        left[:, :width] = headshot
        right = canvas.copy()
        right[:, width:] = headshot

        result = engine.analyse([left, right], describe=False)
        assert [frame.detected for frame in result.frames] == [True, True]
        assert result.frames[1].box["x"] > result.frames[0].box["x"]

    def test_a_crop_with_nothing_in_it_is_none(self, engine, headshot):
        rect, _ = engine._detect_hog(headshot)
        assert engine._detect_near(np.zeros_like(headshot), rect) is None


class TestDescriptorSeparatesPeople:
    """
    The only tests here that would let somebody into the wrong account.

    A model swapped for one that loads but describes differently would pass
    every other test in this file.
    """

    def test_the_same_face_matches_itself(self, engine, face):
        a = engine.analyse([face]).descriptor
        b = engine.analyse([face]).descriptor
        assert distance(a, b) < MATCH_THRESHOLD

    def test_two_people_do_not_match(self, engine, face, other_face):
        a = engine.analyse([face]).descriptor
        b = engine.analyse([other_face]).descriptor
        assert distance(a, b) > MATCH_THRESHOLD

    def test_a_rescaled_frame_still_matches(self, engine, face):
        """
        The downscale guard must not change who somebody is.

        Enrolment and sign-in can arrive at different sizes, and if the resize
        moved the descriptor far enough, that alone would stop a match.
        """
        from PIL import Image

        big = np.array(
            Image.fromarray(face).resize(
                (face.shape[1] * 2, face.shape[0] * 2), Image.BICUBIC
            )
        )
        assert distance(
            engine.analyse([face]).descriptor,
            engine.analyse([big]).descriptor,
        ) < MATCH_THRESHOLD

    @pytest.mark.parametrize("jitters", [0, 1, 2])
    def test_jitter_count_does_not_change_who_you_are(self, engine, face, jitters):
        base = engine.analyse([face], jitters=1).descriptor
        other = engine.analyse([face], jitters=jitters).descriptor
        assert distance(base, other) < MATCH_THRESHOLD
