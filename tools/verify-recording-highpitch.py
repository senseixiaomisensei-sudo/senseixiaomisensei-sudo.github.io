"""Operator smoke check: authenticated loopback conversion and public download."""
import io
import json
import time
import uuid
from pathlib import Path

import numpy as np
import requests
import soundfile as sf

root = Path(__file__).resolve().parents[2] / "rvc-local"
headers = {"Authorization": "Bearer " + (root / ".gateway-token").read_text().strip()}
base = "http://127.0.0.1:8088"
for model, hz, shift in [("maki", 260, 12), ("hoshino", 610, 0), ("key", 880, 0)]:
    t = np.arange(48000) / 16000
    # Voiced synthetic vowel with harmonics and vibrato; avoid a pure sine.
    phase = 2 * np.pi * np.cumsum(hz * 2 ** (0.25 * np.sin(2*np.pi*5*t) / 12)) / 16000
    audio = sum(np.sin(n * phase) / n for n in range(1, 7)) * 0.12
    stream = io.BytesIO()
    sf.write(stream, audio, 16000, format="WAV")
    response = requests.post(base + "/v1/convert", headers=headers,
        data={"model_id": model, "pitch": shift, "f0_method": "auto", "format": "wav",
              "index_rate": 0.3, "protect": 0.25, "request_id": uuid.uuid4().hex},
        files={"audio": ("vowel.wav", stream.getvalue(), "audio/wav")}, timeout=30)
    response.raise_for_status()
    job = response.json()
    url = f"{base}/v1/output/{job['jobId']}?token={job['downloadToken']}"
    deadline = time.monotonic() + 150
    while True:
        response = requests.get(url, headers=headers, timeout=30)
        if response.status_code != 202:
            break
        if time.monotonic() >= deadline:
            raise TimeoutError(model)
        time.sleep(3)
    response.raise_for_status()
    samples, sr = sf.read(io.BytesIO(response.content))
    assert np.isfinite(samples).all() and np.max(np.abs(samples)) < 0.99
    assert np.sqrt(np.mean(samples ** 2)) > 0.0001
    assert abs(len(samples) / sr - 3) < 0.25
    public = requests.get(
        f"https://postprep-ae6.pages.dev/rvc-api/output/{job['jobId']}",
        params={"token": job["downloadToken"]},
        headers={"Origin": "https://senseixiaomisensei-sudo.github.io"}, timeout=45)
    public.raise_for_status()
    assert public.content == response.content
    print(json.dumps({"model": model, "inputHz": hz, "shift": shift,
        "peak": round(float(np.max(np.abs(samples))), 4),
        "maxStep": round(float(np.max(np.abs(np.diff(samples)))), 4),
        "publicHttp": public.status_code}), flush=True)
