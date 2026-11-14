"""Live pitch session (agent B). Public API: LiveSession(deck, emit) with start, feed_pcm, feed_text,
replay_file, stop. Run `uv run python -m claimmap.live --help` for the CLI."""
from claimmap.live.session import Emit, LiveSession

__all__ = ["LiveSession", "Emit"]
