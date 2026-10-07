from pathlib import Path

import numpy as np
import pytest
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "tests" / "fixtures"

# Sample photographs from dlib's own examples. Fetched rather than committed --
# they are somebody's face, and the repository is not the place for that.
FIXTURE_URL = "https://raw.githubusercontent.com/davisking/dlib/master/examples/faces/"
FIXTURE_NAMES = ("2007_007763.jpg", "2008_002506.jpg", "bald_guys.jpg")


def pytest_configure(config):
    config.addinivalue_line("markers", "models: needs the dlib weights on disk")


@pytest.fixture(scope="session")
def fixtures_present() -> bool:
    return all((FIXTURES / name).exists() for name in FIXTURE_NAMES)


@pytest.fixture(scope="session")
def engine():
    """
    Loaded once for the whole run.

    The recogniser alone takes about a second and a half to load; per-test
    would make the suite mostly model loading.
    """
    from app.engine import FaceEngine, ModelsMissing

    instance = FaceEngine(ROOT / "models")
    try:
        instance.load()
    except ModelsMissing as error:
        pytest.skip(str(error))
    return instance


@pytest.fixture(scope="session")
def face() -> np.ndarray:
    """One clear frontal face."""
    path = FIXTURES / "2008_002506.jpg"
    if not path.exists():
        pytest.skip(f"{path.name} is missing; run the fetch in tests/README")
    return np.array(Image.open(path).convert("RGB"))


@pytest.fixture(scope="session")
def other_face() -> np.ndarray:
    """A different person, for the half of matching that must fail."""
    path = FIXTURES / "bald_guys.jpg"
    if not path.exists():
        pytest.skip(f"{path.name} is missing; run the fetch in tests/README")
    return np.array(Image.open(path).convert("RGB"))
