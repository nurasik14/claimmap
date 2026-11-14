"""Orchestrator check: a live-only session gets live score events and an automatic AI fact-check on stop."""
import asyncio, json, time, urllib.request
import websockets  # provided by uvicorn[standard]

BASE = "http://localhost:8020"


def post(path, body):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req))


async def main():
    deck_id = post("/api/session", {"title": "QA auto-check session"})["deck_id"]
    seen = {}
    async with websockets.connect(f"ws://localhost:8020/ws/live/{deck_id}") as ws:
        for line in ["We have 40 paying customers and we grew revenue 30 percent month over month.",
                     "Our market is worth 12 billion dollars and we have no competitors at all.",
                     "Actually we now have 55 paying customers after the last quarter."]:
            await ws.send(json.dumps({"type": "text", "text": line}))
            await asyncio.sleep(7)
        await ws.send(json.dumps({"type": "stop"}))
        t0 = time.time()
        while time.time() - t0 < 15:
            try:
                ev = json.loads(await asyncio.wait_for(ws.recv(), 5))
            except Exception:
                break
            seen[ev["type"]] = seen.get(ev["type"], 0) + 1
            if ev["type"] == "score":
                print("live score", ev["score"]["total"])
            if ev["type"] == "checking":
                print("checking:", ev["detail"])
    print("events:", seen)
    for _ in range(60):
        a = json.load(urllib.request.urlopen(f"{BASE}/api/deck/{deck_id}"))
        if a["status"] == "done":
            break
        time.sleep(2)
    print("final:", a["status"], a["progress"][:120])
    print("score:", a["score"]["total"], [d["text"][:40] + f" {d['effect']:+}" for d in a["score"]["drivers"][:4]])
    urllib.request.urlopen(urllib.request.Request(f"{BASE}/api/deck/{deck_id}", method="DELETE"))


asyncio.run(main())
