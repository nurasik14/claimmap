"""Download the first 6 minutes of each real pitch video as MP3 into data/real_audio/<slug>.mp3 (yt-dlp).

Third-party content for a local demo only: data/real_audio/ must not be committed.
uv run python -I scripts/fetch_pitches.py [slug ...]
"""
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from real_items import PITCHES  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "data" / "real_audio"
SECONDS = 360
# YouTube bot-checks the VPN exit IP; the user approved using his Zen (Firefox-based) browser cookies, read locally.
# YouTube may ask for a bot check from VPN/datacenter IPs: point this at a Firefox-family profile you are logged in with.
ZEN_PROFILE = Path(os.environ.get("CLAIMMAP_COOKIES_PROFILE", "/nonexistent"))
COOKIES = (["--cookies-from-browser", f"firefox:{ZEN_PROFILE}"] if ZEN_PROFILE.exists() else []) + ["--js-runtimes", "node", "--remote-components", "ejs:github"]

want = set(sys.argv[1:])
OUT.mkdir(parents=True, exist_ok=True)
for p in PITCHES:
    if want and p["slug"] not in want:
        continue
    if (OUT / f"{p['slug']}.mp3").exists():
        print(f"{p['slug']}: already there")
        continue
    cmd = ["yt-dlp", "-q", "--no-warnings", *COOKIES, "-x", "--audio-format", "mp3", "--download-sections", f"*0-{SECONDS}",
           "-o", str(OUT / f"{p['slug']}.%(ext)s"), p["source_url"]]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:  # retry with the web player client
        r = subprocess.run(cmd[:1] + ["--extractor-args", "youtube:player_client=web"] + cmd[1:],
                           capture_output=True, text=True)
    print(f"{p['slug']}: {'ok' if r.returncode == 0 else 'FAIL ' + r.stderr[-300:]}", flush=True)
