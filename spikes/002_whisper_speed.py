"""Spike 002: faster-whisper speed on the RTX 4050 for a ~20 s pitch chunk. Throwaway.
Run: uv run python 002_whisper_speed.py sample_pitch.mp3"""
import ctypes, glob, os, sys, time, site

# Load the pip-installed CUDA libs (cublas/cudnn) so CTranslate2 can find them.
for sp in site.getsitepackages():
    for lib in sorted(glob.glob(os.path.join(sp, "nvidia", "*", "lib", "*.so*"))):
        try:
            ctypes.CDLL(lib, mode=ctypes.RTLD_GLOBAL)
        except OSError:
            pass

from faster_whisper import WhisperModel

import subprocess, numpy as np
# Decode with system ffmpeg (the bundled PyAV build rejects faster-whisper's open() kwargs).
raw = subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-i", sys.argv[1], "-f", "s16le",
                      "-ac", "1", "-ar", "16000", "-"], capture_output=True, check=True).stdout
audio = np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0
for name, device, ctype in [("small.en", "cuda", "float16"), ("distil-large-v3", "cuda", "float16"), ("small.en", "cpu", "int8")]:
    t = time.perf_counter()
    try:
        m = WhisperModel(name, device=device, compute_type=ctype)
    except Exception as e:
        print(name, device, "LOAD ERROR", str(e)[:200]); continue
    load = time.perf_counter() - t
    runs = []
    for _ in range(3):
        t = time.perf_counter()
        segs, info = m.transcribe(audio, beam_size=1, vad_filter=True)
        text = " ".join(s.text.strip() for s in segs)
        runs.append(time.perf_counter() - t)
    print(f"{name:16} {device:4} load={load:.1f}s audio={info.duration:.1f}s transcribe={min(runs):.2f}-{max(runs):.2f}s")
    print("   ", text[:200])
    del m
