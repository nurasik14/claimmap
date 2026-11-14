"""LLM access. Owned by the orchestrator. Agents call `call_json` and must not change its signature.

Backends (picked automatically):
  - "api": Anthropic SDK, used when ANTHROPIC_API_KEY is non-empty (env or ./.env).
  - "cli": `claude -p` on the user's Claude Max login (default on this machine; ~5 s per call).
Untrusted text (decks, transcripts) must go inside the `user` argument wrapped in tags the system prompt
calls data-only. The CLI backend runs with --tools "" so injected instructions cannot run commands.
Set CLAIMMAP_FAKE_LLM=1 in tests to forbid real calls (call_json raises FakeLLMError).
"""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

Tier = Literal["fast", "smart"]
CLI_MODELS = {"fast": "haiku", "smart": "sonnet"}
API_MODELS = {"fast": "claude-haiku-5-5", "smart": "claude-sonnet-5-5"}  # override via CLAIMMAP_API_MODEL_FAST/SMART
_CWD = tempfile.mkdtemp(prefix="claimmap-llm-")


class LLMError(RuntimeError):
    pass


class FakeLLMError(LLMError):
    pass


def backend() -> str:
    return "api" if os.environ.get("ANTHROPIC_API_KEY", "").strip() else "cli"


def call_json(system: str, user: str, schema: dict, tier: Tier = "fast", timeout: float = 120) -> dict:
    """Return a dict that matches `schema` (JSON Schema, top-level object). Raises LLMError."""
    if os.environ.get("CLAIMMAP_FAKE_LLM") == "1":
        raise FakeLLMError("real LLM calls are disabled (CLAIMMAP_FAKE_LLM=1); monkeypatch call_json in tests")
    t = time.perf_counter()
    out = _call_api(system, user, schema, tier, timeout) if backend() == "api" else _call_cli(system, user, schema, tier, timeout)
    if os.environ.get("CLAIMMAP_LLM_LOG") == "1":
        print(f"[llm] {backend()}:{tier} {time.perf_counter() - t:.1f}s")
    return out


def _call_cli(system: str, user: str, schema: dict, tier: Tier, timeout: float) -> dict:
    env = {k: v for k, v in os.environ.items() if k not in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN")}
    cmd = ["claude", "-p", "--model", CLI_MODELS[tier], "--tools", "", "--strict-mcp-config",
           "--setting-sources", "", "--no-session-persistence", "--output-format", "json",
           "--json-schema", json.dumps(schema), "--system-prompt", system]
    try:
        p = subprocess.run(cmd, input=user, capture_output=True, text=True, env=env, cwd=_CWD, timeout=timeout)
    except subprocess.TimeoutExpired as e:
        raise LLMError(f"claude CLI timed out after {timeout}s") from e
    try:
        d = json.loads(p.stdout)
    except json.JSONDecodeError as e:
        raise LLMError(f"claude CLI returned non-JSON (rc={p.returncode}): {p.stdout[:300]} {p.stderr[:300]}") from e
    if d.get("is_error") or d.get("structured_output") is None:
        raise LLMError(f"claude CLI error: {str(d.get('result'))[:300]}")
    return d["structured_output"]


def _call_api(system: str, user: str, schema: dict, tier: Tier, timeout: float) -> dict:
    import anthropic

    model = os.environ.get(f"CLAIMMAP_API_MODEL_{tier.upper()}", API_MODELS[tier])
    client = anthropic.Anthropic(timeout=timeout)
    try:
        r = client.messages.create(model=model, max_tokens=8192, system=system,
                                   output_config={"format": {"type": "json_schema", "schema": _strict(schema)}},  # type: ignore[arg-type]
                                   messages=[{"role": "user", "content": user}])
    except anthropic.APIError as e:
        raise LLMError(f"Anthropic API error: {e}") from e
    text = "".join(getattr(b, "text", "") for b in r.content)
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise LLMError(f"Anthropic API returned non-JSON (stop={r.stop_reason}): {text[:300]}") from e


def _strict(schema):
    """Structured outputs need additionalProperties=false on every object."""
    if isinstance(schema, dict):
        s = {k: _strict(v) for k, v in schema.items()}
        if s.get("type") == "object" or "properties" in s:
            s.setdefault("additionalProperties", False)
        return s
    if isinstance(schema, list):
        return [_strict(x) for x in schema]
    return schema
