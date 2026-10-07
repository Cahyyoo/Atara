"""
Settings, and the two that are refused rather than warned about.

A face service that binds a public interface or runs with the default token is
not a misconfiguration to be logged -- it is an open biometric endpoint. Both
stop the process at startup instead.
"""

from __future__ import annotations

import ipaddress
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")

PLACEHOLDER_TOKEN = "change-me"
MIN_TOKEN_LENGTH = 16


class ConfigError(RuntimeError):
    """Raised when a setting would make the service unsafe to run."""


@dataclass(frozen=True)
class Settings:
    host: str
    port: int
    token: str
    model_dir: Path
    workers: int


def _default_workers() -> int:
    """
    One worker per physical core, assuming SMT.

    dlib's HOG and ResNet passes are floating-point bound; two hyperthreads on
    one core get little more than one. os.cpu_count() reports logical cores,
    so it is halved. Set FACE_WORKERS on a box without SMT, or to leave cores
    for MySQL and Node when they share the machine.
    """
    return max(1, (os.cpu_count() or 2) // 2)


def _check_workers(raw: str | None) -> int:
    if raw is None or raw.strip() == "":
        return _default_workers()
    try:
        workers = int(raw)
    except ValueError as error:
        raise ConfigError(f"FACE_WORKERS must be a whole number, got {raw!r}") from error
    if workers < 1:
        raise ConfigError(f"FACE_WORKERS must be at least 1, got {workers}")
    return workers


def _check_loopback(host: str) -> None:
    """
    Loopback only, and enforced here rather than left to the deployer.

    The weights sit behind a token, but a token on a public port only limits
    who gets an answer -- it does not stop anyone from posting photographs of
    people at it. Next.js is the front door and it is already authenticated;
    this service has no reason to be reachable from anywhere else.
    """
    if host == "localhost":
        return
    try:
        address = ipaddress.ip_address(host)
    except ValueError as error:
        raise ConfigError(
            f"FACE_HOST must be a loopback address, got {host!r}"
        ) from error

    if not address.is_loopback:
        raise ConfigError(
            f"FACE_HOST must be a loopback address (127.0.0.1 or ::1), got {host!r}. "
            "This service handles biometric images and must sit behind the web app."
        )


def _check_token(token: str) -> None:
    if not token or token == PLACEHOLDER_TOKEN:
        raise ConfigError(
            "FACE_SERVICE_TOKEN is unset or still the placeholder. Generate one with: "
            'python -c "import secrets; print(secrets.token_urlsafe(32))"'
        )
    if len(token) < MIN_TOKEN_LENGTH:
        raise ConfigError(
            f"FACE_SERVICE_TOKEN must be at least {MIN_TOKEN_LENGTH} characters."
        )


def load_settings(env: dict[str, str] | None = None) -> Settings:
    """Read and validate. `env` is a seam so the checks can be tested directly."""
    source = os.environ if env is None else env

    host = source.get("FACE_HOST", "127.0.0.1")
    _check_loopback(host)

    token = source.get("FACE_SERVICE_TOKEN", "")
    _check_token(token)

    model_dir = Path(source.get("FACE_MODEL_DIR", "models"))
    if not model_dir.is_absolute():
        model_dir = BASE_DIR / model_dir

    return Settings(
        host=host,
        port=int(source.get("FACE_PORT", "8001")),
        token=token,
        model_dir=model_dir,
        workers=_check_workers(source.get("FACE_WORKERS")),
    )
