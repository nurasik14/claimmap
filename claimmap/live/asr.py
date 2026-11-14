"""Speech-to-text: a lazy faster-whisper singleton that runs in a worker thread, plus ffmpeg decoding.

Notes from the spikes: the pip CUDA libs must be preloaded before importing faster_whisper, and
faster-whisper's own file decoding is broken here, so we always hand it a float32 numpy array.
"""
from __future__ import annotations

import asyncio
import ctypes
import glob
import os
import site
import threading
from dataclasses import dataclass
from typing import Protocol

import numpy as np

SAMPLE_RATE = 16000
MODEL_NAME = os.environ.get("CLAIMMAP_WHISPER_MODEL", "small.en")


@dataclass
class Seg:
    start: float  # seconds, relative to the start of the audio passed to transcribe()
    end: float
    text: str


class Transcriber(Protocol):
    detail: str

    async def warm(self) -> str: ...
    async def transcribe(self, audio: np.ndarray) -> list[Seg]: ...


def _preload_cuda_libs() -> None:
    for sp in site.getsitepackages():
        for lib in sorted(glob.glob(os.path.join(sp, "nvidia", "*", "lib", "*.so*"))):
            try:
                ctypes.CDLL(lib, mode=ctypes.RTLD_GLOBAL)
            except OSError:
                pass


class WhisperTranscriber:
    """faster-whisper on CUDA float16, falling back to CPU int8. One shared instance, one call at a time."""

    def __init__(self, model_name: str = MODEL_NAME):
        self.model_name = model_name
        self.detail = ""
        self._model = None
        self._load_lock = threading.Lock()
        self._run_lock = threading.Lock()

    # -- sync internals (run in a worker thread) --
    def _load(self) -> str:
        with self._load_lock:
            if self._model is not None:
                return self.detail
            _preload_cuda_libs()
            from faster_whisper import WhisperModel

            probe = np.random.default_rng(0).normal(0, 0.01, SAMPLE_RATE).astype(np.float32)
            try:
                m = WhisperModel(self.model_name, device="cuda", compute_type="float16")
                list(m.transcribe(probe, beam_size=1, vad_filter=False)[0])  # forces the CUDA kernels to load
                self.detail = f"{self.model_name} on GPU (cuda float16)"
            except Exception as e:  # missing CUDA libs / no GPU / OOM
                m = WhisperModel(self.model_name, device="cpu", compute_type="int8")
                list(m.transcribe(probe, beam_size=1, vad_filter=False)[0])
                self.detail = f"{self.model_name} on CPU (int8; GPU unavailable: {str(e)[:80]})"
            self._model = m
            return self.detail

    def _run(self, audio: np.ndarray) -> list[Seg]:
        self._load()
        with self._run_lock:
            segs, _ = self._model.transcribe(audio, language="en", beam_size=1, vad_filter=True,
                                             vad_parameters={"min_silence_duration_ms": 500},
                                             condition_on_previous_text=False)
            out = []
            for s in segs:  # generator: must be consumed here, inside the thread
                text = s.text.strip()
                if text and getattr(s, "no_speech_prob", 0.0) < 0.8:
                    out.append(Seg(float(s.start), float(s.end), text))
            return out

    # -- async API --
    async def warm(self) -> str:
        return await asyncio.to_thread(self._load)

    async def transcribe(self, audio: np.ndarray) -> list[Seg]:
        return await asyncio.to_thread(self._run, audio)


_singleton: WhisperTranscriber | None = None


def get_transcriber() -> Transcriber:
    global _singleton
    if _singleton is None:
        _singleton = WhisperTranscriber()
    return _singleton


def pcm16_to_float(pcm: bytes | bytearray) -> np.ndarray:
    n = len(pcm) // 2 * 2
    return np.frombuffer(bytes(pcm[:n]), dtype="<i2").astype(np.float32) / 32768.0


async def decode_file(path: str) -> bytes:
    """Decode any audio file to raw s16le 16 kHz mono PCM with the system ffmpeg."""
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", "-nostdin", "-loglevel", "error", "-i", path, "-f", "s16le", "-ac", "1", "-ar", str(SAMPLE_RATE), "-",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    out, err = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg could not decode {os.path.basename(path)}: {err.decode(errors='replace')[:200]}")
    return out
