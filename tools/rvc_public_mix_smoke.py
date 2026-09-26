"""Check the deployed Pages/Worker/tunnel/GPU song and remix path."""

from __future__ import annotations

import argparse
import json
import time
import uuid
from pathlib import Path

import requests


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--base", default="https://postprep-ae6.pages.dev/rvc-api")
    parser.add_argument("--origin", default="https://senseixiaomisensei-sudo.github.io")
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    headers = {"Origin": args.origin}
    request_id = uuid.uuid4().hex
    with args.source.open("rb") as stream:
        response = requests.post(args.base, headers=headers, timeout=120,
                                 data={"modelId": "hoshino", "pitch": "0", "indexRate": "0.45",
                                       "protect": "0.33", "rmsMixRate": "1", "filterRadius": "0",
                                       "f0Method": "rmvpe", "format": "wav", "resample": "0",
                                       "audioMode": "song", "requestId": request_id,
                                       "vocalGainDb": "0", "accompanimentGainDb": "0",
                                       "vocalMute": "false", "accompanimentMute": "false",
                                       "model_id": "hoshino", "index_rate": "0.45",
                                       "f0_method": "rmvpe", "rms_mix_rate": "1",
                                       "filter_radius": "0", "audio_mode": "song",
                                       "request_id": request_id,
                                       "vocal_gain_db": "0", "accompaniment_gain_db": "0",
                                       "vocal_mute": "false", "accompaniment_mute": "false"},
                                 files={"audio": (args.source.name, stream, "audio/mpeg")})
    if not response.ok:
        raise RuntimeError(f"public submission HTTP {response.status_code}: {response.text[:400]}")
    job = response.json()
    job_id, capability = job["jobId"], job["downloadToken"]
    output_url = f"{args.base}/output/{job_id}"
    deadline = time.monotonic() + 600
    while True:
        audio = requests.get(output_url, headers=headers,
                             params={"token": capability}, timeout=120)
        if audio.status_code != 202:
            audio.raise_for_status()
            break
        if time.monotonic() >= deadline:
            raise TimeoutError("Public output did not complete")
        time.sleep(3)
    initial = args.output_dir / "production-default.wav"
    initial.write_bytes(audio.content)
    update = requests.post(f"{output_url}/remix", headers=headers,
                           params={"token": capability}, timeout=120,
                           files={key: (None, value) for key, value in {
                               "vocalGainDb": "-6", "accompanimentGainDb": "3",
                               "vocalMute": "false", "accompanimentMute": "false",
                               "vocal_gain_db": "-6", "accompaniment_gain_db": "3",
                               "vocal_mute": "false", "accompaniment_mute": "false",
                           }.items()})
    if not update.ok:
        raise RuntimeError(f"public remix HTTP {update.status_code}: {update.text[:400]}")
    remixed = requests.get(output_url, headers=headers,
                           params={"token": capability}, timeout=120)
    remixed.raise_for_status()
    changed = args.output_dir / "production-vocal-minus6-backing-plus3.wav"
    changed.write_bytes(remixed.content)
    report = {"jobId": job_id, "initialBytes": len(audio.content),
              "remixedBytes": len(remixed.content), "mixRevision": update.json().get("mixRevision"),
              "initialF0": audio.headers.get("X-RVC-F0-Method"),
              "remixAvailable": audio.headers.get("X-RVC-Remix-Available"),
              "productionDefault": str(initial), "productionRemixed": str(changed)}
    (args.output_dir / "public-smoke.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
