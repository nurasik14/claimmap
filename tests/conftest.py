"""Shared test setup: every test writes analyses, PDFs and slide images to a temporary store, never data/decks."""
import os

import pytest

os.environ.setdefault("CLAIMMAP_FAKE_LLM", "1")

from claimmap import store  # noqa: E402


@pytest.fixture(autouse=True, scope="session")
def _temp_store(tmp_path_factory):
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(store, "DECKS", tmp_path_factory.mktemp("decks"))
        yield
