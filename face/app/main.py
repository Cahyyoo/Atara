"""
The HTTP surface: one door in, numbers out.

Everything here is about what must not happen. The frames are photographs of
people's faces, so the rules are that they are never written to disk, never
echoed back, and never reach a log line -- and that the service is not
reachable by anyone except the web application in front of it.
"""

from __future__ import annotations

import base64
import binascii
import io
import secrets
import time
from contextlib import asynccontextmanager

import numpy as np
from anyio import CapacityLimiter
from fastapi import FastAPI, Header, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field

import dlib

from app.config import ConfigError, load_settings
from app.engine import (
    DESCRIPTOR_LENGTH,
    DETECTOR,
    DeadlinePassed,
    FaceEngine,
    ModelsMissing,
)

# A burst, not a film. The browser sends one run of frames per attempt; this is
# a ceiling on what one request may cost, not a target.
MAX_FRAMES = 16

# Roughly a 640x480 JPEG at any sane quality. Base64 inflates by a third, and
# the check is applied to the decoded bytes.
MAX_FRAME_BYTES = 2 * 1024 * 1024

TOKEN_HEADER = "X-Face-Token"

# Unix milliseconds after which the web application has stopped waiting.
# Loopback only, so the two clocks are the same clock.
DEADLINE_HEADER = "X-Face-Deadline"

# Connections one worker will hold before uvicorn itself answers 503. A
# backstop, not the gate: the web application keeps its own count of what it
# has sent and refuses before anything reaches here.
LIMIT_CONCURRENCY = 4

settings = load_settings()
engine = FaceEngine(settings.model_dir)

# One dlib run per process at a time.
#
# The analysis is handed to a thread so that the event loop stays free to
# accept connections, answer /health and notice a caller hanging up -- when
# dlib releases the GIL, which it does for at least part of the work. Whether
# it does or not, a second analysis in the same process would only fight the
# first for the same cores, so this limiter keeps them in single file.
# Throughput comes from `workers=N`, one process per physical core.
_engine_turn = CapacityLimiter(1)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Loaded at startup, so a missing model is a service that refuses to start
    # rather than a sign-in that fails at the counter.
    engine.load()
    engine.warm_up()
    yield


app = FastAPI(
    title="Atara face service",
    # No interactive docs: they invite a browser to this port, and nothing
    # should be reaching this port from a browser.
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
)


class DescriptorRequest(BaseModel):
    frames: list[str] = Field(min_length=1, max_length=MAX_FRAMES)
    # dlib's own jitter count. 0 and 1 both cost one pass, measured; 2 doubles
    # it. Capped so a caller cannot ask for a hundred and hold the service.
    jitters: int = Field(default=1, ge=0, le=4)
    # False asks only "where is the face and how is it framed".
    #
    # This is what makes the guide able to turn green while somebody is still
    # positioning themselves, instead of only telling them afterwards. The
    # recogniser is ~380ms and the detector ~11ms on a small frame, so leaving
    # it out is the difference between a check that can run every half second
    # and one that cannot.
    describe: bool = True


@app.exception_handler(RequestValidationError)
async def _validation_error(_: Request, error: RequestValidationError) -> JSONResponse:
    """
    Report that a field was wrong, never what was in it.

    FastAPI's default handler puts the offending input into the response body,
    which for this service means a base64 photograph of somebody's face echoed
    back and written into whatever collects the response. The message is kept;
    the `input` and `ctx` keys are dropped.
    """
    safe = [
        {"loc": item.get("loc"), "msg": item.get("msg"), "type": item.get("type")}
        for item in error.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": safe})


def _authorise(token: str | None) -> None:
    # compare_digest rather than ==, so a wrong token takes the same time to
    # reject whichever character first differs.
    if token is None or not secrets.compare_digest(token, settings.token):
        raise _Unauthorised()


class _Unauthorised(Exception):
    pass


@app.exception_handler(_Unauthorised)
async def _unauthorised(_: Request, __: _Unauthorised) -> JSONResponse:
    return JSONResponse(status_code=401, content={"detail": "Unauthorised."})


class _BadFrame(Exception):
    def __init__(self, index: int, why: str) -> None:
        self.index = index
        self.why = why


@app.exception_handler(_BadFrame)
async def _bad_frame(_: Request, error: _BadFrame) -> JSONResponse:
    # The index and the reason. Never the bytes.
    return JSONResponse(
        status_code=400,
        content={"detail": f"Frame {error.index} {error.why}."},
    )


@app.exception_handler(DeadlinePassed)
async def _deadline_passed(_: Request, __: DeadlinePassed) -> JSONResponse:
    # 503 rather than 4xx: nothing about the request was wrong, the service
    # was simply too slow for it. The caller has already given up on this
    # response; the status is for the access log.
    return JSONResponse(status_code=503, content={"detail": "Deadline passed."})


def _deadline_from(header: str | None) -> float | None:
    """The caller's deadline as Unix seconds, or None when it did not say."""
    if header is None:
        return None
    try:
        return int(header) / 1000.0
    except ValueError:
        # A malformed header is a bug on the other side; treating it as "no
        # deadline" is the answer that never refuses a real sign-in over it.
        return None


def _decode(frame: str, index: int) -> np.ndarray:
    """One base64 JPEG to an RGB array, or a refusal that names no content."""
    try:
        raw = base64.b64decode(frame, validate=True)
    except (binascii.Error, ValueError) as error:
        raise _BadFrame(index, "is not valid base64") from error

    if len(raw) > MAX_FRAME_BYTES:
        raise _BadFrame(index, f"is larger than {MAX_FRAME_BYTES // 1024}KB")

    try:
        image = Image.open(io.BytesIO(raw))
        image.load()
    except (UnidentifiedImageError, OSError) as error:
        raise _BadFrame(index, "is not a readable image") from error

    return np.array(image.convert("RGB"))


@app.get("/health")
async def health() -> dict:
    """Readiness, and enough to tell two deployments apart. No secrets."""
    return {
        "ok": True,
        "detector": DETECTOR,
        "dlib": dlib.__version__,
        # dlib-bin says false; the wheel from scripts/build_dlib_blas.ps1 says
        # true and describes a face ~14x faster. Worth seeing from outside.
        "blas": bool(dlib.DLIB_USE_BLAS),
        "descriptorLength": DESCRIPTOR_LENGTH,
        "modelDir": settings.model_dir.name,
    }


def _analyse(frames: list[str], jitters: int, describe: bool, deadline: float | None):
    """The CPU-bound part, run off the event loop. Decoding is CPU too."""
    images = [_decode(frame, index) for index, frame in enumerate(frames)]
    return engine.analyse(images, jitters=jitters, describe=describe, deadline=deadline)


@app.post("/descriptor")
async def descriptor(
    body: DescriptorRequest,
    x_face_token: str | None = Header(default=None, alias=TOKEN_HEADER),
    x_face_deadline: str | None = Header(default=None, alias=DEADLINE_HEADER),
) -> dict:
    """
    Measure a burst of frames and describe the best one.

    Returns numbers only: what was seen, where, and how confident. Whether that
    is good enough, whether it blinked, and whether it matches anybody is
    decided by the caller, which is the only place those rules are written.
    """
    _authorise(x_face_token)
    deadline = _deadline_from(x_face_deadline)

    async with _engine_turn:
        # Checked after the wait, which is where the time went: a request that
        # queued past its caller's patience is refused before it costs a frame.
        if deadline is not None and time.time() > deadline:
            raise DeadlinePassed()
        result = await run_in_threadpool(
            _analyse, body.frames, body.jitters, body.describe, deadline
        )

    return {
        "frames": [
            {
                "detected": reading.detected,
                "score": reading.score,
                "box": reading.box,
                # Six points per eye, passed through so that the web
                # application's eyeAspectRatio stays the only implementation of
                # the blink rule.
                "leftEye": reading.left_eye,
                "rightEye": reading.right_eye,
                "luminance": reading.luminance,
            }
            for reading in result.frames
        ],
        "descriptor": result.descriptor,
        "bestFrameIndex": result.best_frame_index,
        "engine": {
            "detector": result.detector_used,
            "elapsedMs": result.elapsed_ms,
        },
    }


def main() -> int:
    import uvicorn

    try:
        current = load_settings()
    except ConfigError as error:
        print(f"Refusing to start: {error}")
        return 1

    try:
        # Presence only. This is the supervisor; the workers load the weights
        # in their own lifespan, and a copy here would be memory nobody uses.
        engine.check_models()
    except ModelsMissing as error:
        print(f"Refusing to start: {error}")
        return 1

    uvicorn.run(
        "app.main:app",
        host=current.host,
        port=current.port,
        # One process per physical core. Each computes one burst at a time,
        # so this is the service's whole throughput: about a sign-in a second
        # per worker, and the web application sizes its own queue to match.
        workers=current.workers,
        limit_concurrency=LIMIT_CONCURRENCY,
        # The default access log records method, path and status -- no bodies.
        # Left on deliberately: it is the only record that a sign-in was
        # attempted, and it carries nothing about whose face it was.
        access_log=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
