"""
The HTTP surface, and mostly what it must refuse.

Three of these are about leaking rather than about working: the frames are
photographs of people's faces, and the ways they escape are a response body, an
error message, and a log line.
"""

from __future__ import annotations

import base64
import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.config import ConfigError, load_settings
from app.main import MAX_FRAMES, TOKEN_HEADER, DescriptorRequest, app, settings


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as running:
        yield running


@pytest.fixture(scope="module")
def token() -> str:
    return settings.token


def jpeg(width: int = 64, height: int = 48, colour=(120, 110, 100)) -> str:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), colour).save(buffer, format="JPEG")
    return base64.b64encode(buffer.getvalue()).decode()


class TestAuthorisation:
    def test_no_token_is_refused(self, client):
        response = client.post("/descriptor", json={"frames": [jpeg()]})
        assert response.status_code == 401

    def test_a_wrong_token_is_refused(self, client):
        response = client.post(
            "/descriptor",
            json={"frames": [jpeg()]},
            headers={TOKEN_HEADER: "not-the-token"},
        )
        assert response.status_code == 401

    def test_the_refusal_does_not_describe_the_token(self, client):
        response = client.post(
            "/descriptor",
            json={"frames": [jpeg()]},
            headers={TOKEN_HEADER: "not-the-token"},
        )
        body = response.text.lower()
        assert "length" not in body and "expected" not in body

    def test_health_needs_no_token(self, client):
        # Something has to be able to ask whether this is up without holding a
        # credential, or the only way to check is to attempt a sign-in.
        assert client.get("/health").status_code == 200


class TestFramesNeverComeBack:
    """
    A frame that goes in must not appear in anything that comes out.

    FastAPI's default validation handler puts the offending input into the
    response, which here would be a base64 photograph of a face echoed back to
    the caller and into whatever records responses.
    """

    def test_a_validation_error_does_not_echo_the_frame(self, client, token):
        frame = jpeg()
        response = client.post(
            "/descriptor",
            json={"frames": [frame], "jitters": 99},  # jitters is out of range
            headers={TOKEN_HEADER: token},
        )
        assert response.status_code == 422
        assert frame not in response.text
        assert frame[:64] not in response.text

    def test_a_validation_error_still_says_which_field_was_wrong(self, client, token):
        response = client.post(
            "/descriptor",
            json={"frames": [jpeg()], "jitters": 99},
            headers={TOKEN_HEADER: token},
        )
        assert "jitters" in response.text

    def test_an_unreadable_frame_is_refused_without_quoting_it(self, client, token):
        rubbish = base64.b64encode(b"this is not a jpeg" * 8).decode()
        response = client.post(
            "/descriptor",
            json={"frames": [rubbish]},
            headers={TOKEN_HEADER: token},
        )
        assert response.status_code == 400
        assert rubbish not in response.text
        assert "Frame 0" in response.json()["detail"]

    def test_a_successful_reply_carries_no_image_data(self, client, token):
        frame = jpeg()
        response = client.post(
            "/descriptor",
            json={"frames": [frame]},
            headers={TOKEN_HEADER: token},
        )
        assert response.status_code == 200
        assert frame not in response.text


class TestLimits:
    def test_too_many_frames_are_refused(self, client, token):
        response = client.post(
            "/descriptor",
            json={"frames": [jpeg()] * (MAX_FRAMES + 1)},
            headers={TOKEN_HEADER: token},
        )
        assert response.status_code == 422

    def test_an_empty_burst_is_refused(self, client, token):
        response = client.post(
            "/descriptor", json={"frames": []}, headers={TOKEN_HEADER: token}
        )
        assert response.status_code == 422

    def test_frames_that_are_not_base64_are_refused(self, client, token):
        response = client.post(
            "/descriptor",
            json={"frames": ["!!! not base64 !!!"]},
            headers={TOKEN_HEADER: token},
        )
        assert response.status_code == 400


class TestShape:
    def test_a_faceless_frame_answers_with_nulls_not_an_error(self, client, token):
        """
        "I looked and saw nobody" is an answer, not a failure.

        The caller needs the frame count and the scores to tell that apart from
        a camera sending nothing, and a 500 would throw both away.
        """
        response = client.post(
            "/descriptor", json={"frames": [jpeg()]}, headers={TOKEN_HEADER: token}
        )
        body = response.json()
        assert response.status_code == 200
        assert body["descriptor"] is None
        assert body["bestFrameIndex"] is None
        assert body["frames"][0]["detected"] is False

    def test_every_frame_sent_is_reported(self, client, token):
        response = client.post(
            "/descriptor", json={"frames": [jpeg()] * 3}, headers={TOKEN_HEADER: token}
        )
        assert len(response.json()["frames"]) == 3

    def test_preview_mode_measures_without_describing(self, client, token):
        """
        The mode the live guide runs on.

        Asking for a descriptor every half second would cost ~380ms a time and
        make the guide lag behind the person it is guiding; without it the same
        request is ~15ms. The frame measurements have to survive, because they
        are the whole point of asking.
        """
        response = client.post(
            "/descriptor",
            json={"frames": [jpeg()], "describe": False},
            headers={TOKEN_HEADER: token},
        )
        body = response.json()
        assert response.status_code == 200
        assert body["descriptor"] is None
        assert len(body["frames"]) == 1
        assert "score" in body["frames"][0]
        assert "box" in body["frames"][0]

    def test_describing_is_what_happens_unless_asked_otherwise(self, client, token):
        # A caller that forgets the flag must get the safe, complete answer,
        # not silently lose the descriptor it was relying on.
        assert DescriptorRequest(frames=[jpeg()]).describe is True

    def test_health_names_the_detector_and_carries_no_secret(self, client, token):
        body = client.get("/health").json()
        assert body["ok"] is True
        assert body["detector"] == "hog"
        assert body["descriptorLength"] == 128
        # Which dlib build is answering, since one is ~14x faster to describe.
        assert isinstance(body["blas"], bool)
        assert token not in client.get("/health").text

    def test_interactive_docs_are_not_served(self, client):
        # Nothing should be reaching this port from a browser, so it is not
        # given a page that invites one.
        for path in ("/docs", "/redoc", "/openapi.json"):
            assert client.get(path).status_code == 404


class TestConfigurationRefusals:
    """
    Two settings that stop the process rather than warn.

    An open port and a default password are not misconfigurations to be logged
    when the thing behind them is biometric data.
    """

    def base(self) -> dict[str, str]:
        return {"FACE_SERVICE_TOKEN": "a-token-long-enough-to-pass"}

    def test_a_public_bind_is_refused(self):
        for host in ("0.0.0.0", "192.168.1.10", "::"):
            with pytest.raises(ConfigError, match="loopback"):
                load_settings({**self.base(), "FACE_HOST": host})

    def test_loopback_is_allowed(self):
        for host in ("127.0.0.1", "::1", "localhost"):
            assert load_settings({**self.base(), "FACE_HOST": host}).host == host

    def test_the_placeholder_token_is_refused(self):
        with pytest.raises(ConfigError, match="placeholder"):
            load_settings({"FACE_SERVICE_TOKEN": "change-me"})

    def test_a_missing_token_is_refused(self):
        with pytest.raises(ConfigError):
            load_settings({})

    def test_a_short_token_is_refused(self):
        with pytest.raises(ConfigError, match="16"):
            load_settings({"FACE_SERVICE_TOKEN": "short"})

    def test_a_host_that_is_not_an_address_is_refused(self):
        with pytest.raises(ConfigError):
            load_settings({**self.base(), "FACE_HOST": "face.example.com"})
