"""Exercise installed voices with a real clip through the authenticated service."""
import argparse
import io
import json
from pathlib import Path
import time
import uuid

import numpy as np
import parselmouth
import requests
import soundfile as sf

parser = argparse.ArgumentParser()
parser.add_argument("source", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--token-file", type=Path, required=True)
parser.add_argument("--models", nargs="+", default=["maki"])
parser.add_argument("--base", default="http://127.0.0.1:8088")
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
headers = {"Authorization": "Bearer " + args.token_file.read_text().strip()}
rows = []
source_audio, source_rate = sf.read(args.source)
source_duration = len(source_audio) / source_rate
for model in args.models:
    with args.source.open("rb") as stream:
        response = requests.post(args.base + "/v1/convert", headers=headers,
            data=dict(model_id=model, pitch=0, index_rate=.3, protect=.25,
                      f0_method="auto", format="mp3", audio_mode="voice",
                      request_id=uuid.uuid4().hex),
            files={"audio": ("regression.wav", stream, "audio/wav")}, timeout=60)
    response.raise_for_status()
    job = response.json()
    url = args.base + "/v1/output/" + job["jobId"]
    deadline = time.monotonic() + 240
    while time.monotonic() < deadline:
        response = requests.get(url, params={"token":job["downloadToken"]}, headers=headers, timeout=30)
        if response.status_code != 202:
            break
        time.sleep(2)
    response.raise_for_status()
    if response.status_code == 202:
        raise TimeoutError(model)
    path = args.output / (model + ".mp3")
    path.write_bytes(response.content)
    audio, rate = sf.read(io.BytesIO(response.content))
    f0 = parselmouth.Sound(audio, rate).to_pitch_ac(time_step=.01,
        pitch_floor=40, pitch_ceiling=2000).selected_array["frequency"]
    voiced = f0[f0 > 0]
    row = dict(model=model, duration=len(audio)/rate, peak=float(np.max(abs(audio))),
               non_finite=int(np.sum(~np.isfinite(audio))),
               rms=float(np.sqrt(np.mean(audio ** 2))),
               f0_percentiles=np.percentile(voiced,[5,50,95]).tolist() if len(voiced) else [])
    assert row["non_finite"] == 0, (model, "non-finite output")
    assert row["peak"] < 1, (model, "clipped MP3 output")
    assert row["rms"] > .0001, (model, "silent output")
    assert abs(row["duration"] - source_duration) < .15, (model, "duration changed")
    rows.append(row)
    print(json.dumps(row), flush=True)
(args.output / "verification.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
