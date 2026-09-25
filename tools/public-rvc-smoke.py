"""Exercise the public Pages -> Worker -> tunnel -> GPU conversion route."""

import argparse
import io
import json
import time
import uuid
from pathlib import Path

import numpy as np
import requests
import soundfile as sf
from scipy.signal import resample_poly


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--model", default="hoshino")
    parser.add_argument("--base", default="https://postprep-ae6.pages.dev/rvc-api")
    parser.add_argument("--origin", default="https://senseixiaomisensei-sudo.github.io")
    args = parser.parse_args()
    headers = {"Origin": args.origin}
    with args.source.open("rb") as stream:
        response = requests.post(
            args.base, headers=headers,
            data={"model_id": args.model, "pitch": "0", "index_rate": "0.45",
                  "protect": "0.33", "rms_mix_rate": "1", "filter_radius": "0",
                  "f0_method": "rmvpe", "format": "wav", "audio_mode": "voice",
                  "request_id": uuid.uuid4().hex},
            files={"audio": (args.source.name, stream, "audio/wav")}, timeout=90,
        )
    response.raise_for_status()
    job = response.json()
    url = args.base + "/output/" + job["jobId"]
    deadline = time.monotonic() + 240
    while True:
        response = requests.get(url, headers=headers,
                                params={"token": job["downloadToken"]}, timeout=60)
        if response.status_code != 202:
            break
        if time.monotonic() >= deadline:
            raise TimeoutError("Public conversion did not finish")
        time.sleep(2)
    response.raise_for_status()
    audio, rate = sf.read(io.BytesIO(response.content), dtype="float32")
    source, source_rate = sf.read(args.source, dtype="float32")
    true_peak = float(np.max(np.abs(resample_poly(audio, 4, 1))))
    assert np.isfinite(audio).all()
    assert abs(len(audio) / rate - len(source) / source_rate) < .15
    assert true_peak <= .895
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(response.content)
    print(json.dumps({"output": str(args.output), "status": response.status_code,
                      "duration": len(audio) / rate, "truePeak4x": true_peak,
                      "bytes": len(response.content)}))


if __name__ == "__main__":
    main()
