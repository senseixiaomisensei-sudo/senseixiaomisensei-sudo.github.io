"""Replay a real source through a local authenticated RVC service and save evidence."""

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
    parser.add_argument("output", type=Path)
    parser.add_argument("--base", default="http://127.0.0.1:8089")
    parser.add_argument("--token-file", type=Path, default=Path(r"E:\大肥鱼\rvc-local\.gateway-token"))
    parser.add_argument("--model", default="hoshino")
    parser.add_argument("--mode", choices=("song", "voice"), default="song")
    parser.add_argument("--format", choices=("wav", "mp3"), default="wav")
    parser.add_argument("--pitch", type=int, default=0)
    parser.add_argument("--index-rate", type=float, default=.45)
    parser.add_argument("--protect", type=float, default=.33)
    parser.add_argument("--rms-mix-rate", type=float, default=1)
    parser.add_argument("--f0", default="rmvpe")
    parser.add_argument("--diagnostic", action="store_true")
    parser.add_argument("--deadline", type=int, default=1800)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    token = args.token_file.read_text(encoding="utf-8").strip()
    headers = {"Authorization": f"Bearer {token}"}
    if args.diagnostic:
        headers["X-PostPrep-Diagnostic"] = "1"
    params = {
        "model_id": args.model, "pitch": str(args.pitch), "index_rate": str(args.index_rate),
        "protect": str(args.protect), "rms_mix_rate": str(args.rms_mix_rate),
        "filter_radius": "0", "f0_method": args.f0, "format": args.format,
        "audio_mode": args.mode, "request_id": uuid.uuid4().hex,
        "vocal_gain_db": "0", "accompaniment_gain_db": "0",
        "vocal_mute": "false", "accompaniment_mute": "false",
    }
    started = time.monotonic()
    with args.source.open("rb") as stream:
        response = requests.post(f"{args.base}/v1/convert", headers=headers, data=params,
                                 files={"audio": (args.source.name, stream, "audio/mpeg")}, timeout=120)
    if not response.ok:
        raise RuntimeError(f"submission HTTP {response.status_code}: {response.text[:500]}")
    job = response.json()
    job_id, capability = job["jobId"], job["downloadToken"]
    print(json.dumps({"jobId": job_id, "state": job.get("state")}), flush=True)
    url = f"{args.base}/v1/output/{job_id}"
    last_stage = ""
    while True:
        response = requests.get(url, headers=headers, params={"token": capability}, timeout=120)
        if response.status_code != 202:
            break
        status = response.json()
        stage = str(status.get("stage") or status.get("state"))
        if stage != last_stage:
            print(json.dumps({"jobId": job_id, "stage": stage,
                              "elapsedSeconds": round(time.monotonic() - started, 1)}), flush=True)
            last_stage = stage
        if time.monotonic() - started >= args.deadline:
            raise TimeoutError(f"RVC job {job_id} exceeded deadline")
        time.sleep(3)
    response.raise_for_status()
    args.output.write_bytes(response.content)
    evidence = {
        "jobId": job_id, "modelId": args.model, "source": str(args.source),
        "sourceMode": args.mode, "output": str(args.output), "bytes": len(response.content),
        "elapsedSeconds": round(time.monotonic() - started, 1),
        "actualF0Method": response.headers.get("X-RVC-F0-Method", ""),
        "mixRevision": response.headers.get("X-RVC-Mix-Revision", ""),
        "remixAvailable": response.headers.get("X-RVC-Remix-Available", ""),
        "capabilityStored": False,
    }
    (args.output.parent / f"{args.output.stem}-job.json").write_text(
        json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")
    # The token is kept outside the shareable evidence and only long enough
    # to exercise the authorized short-lived remix operation.
    print(json.dumps(evidence, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
