"""Render one repeatable song conversion through the running local service.

Audio and job metadata are written only to the supplied private output folder.
"""

import argparse
import hashlib
import json
import time
import uuid
from pathlib import Path

import requests


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--base", default="http://127.0.0.1:8088")
    parser.add_argument("--token-file", type=Path, required=True)
    parser.add_argument("--model", default="hoshino")
    parser.add_argument("--pitch", default="0")
    parser.add_argument("--index-rate", default="0.45")
    parser.add_argument("--protect", default="0.33")
    parser.add_argument("--rms-mix-rate", default="1")
    parser.add_argument("--f0-method", default="rmvpe")
    parser.add_argument("--format", choices=("wav", "mp3"), default="wav")
    parser.add_argument("--timeout", type=int, default=1200)
    args = parser.parse_args()

    token = args.token_file.read_text(encoding="utf-8").strip()
    headers = {"Authorization": f"Bearer {token}"}
    parameters = {
        "model_id": args.model,
        "pitch": args.pitch,
        "index_rate": args.index_rate,
        "protect": args.protect,
        "rms_mix_rate": args.rms_mix_rate,
        "f0_method": args.f0_method,
        "filter_radius": "0",
        "resample": "0",
        "format": args.format,
        "audio_mode": "song",
        "request_id": uuid.uuid4().hex,
    }
    started = time.monotonic()
    health = requests.get(f"{args.base}/healthz", headers=headers, timeout=20)
    health.raise_for_status()
    with args.source.open("rb") as stream:
        response = requests.post(
            f"{args.base}/v1/convert", headers=headers, data=parameters,
            files={"audio": (args.source.name, stream, "audio/mpeg")}, timeout=90,
        )
    response.raise_for_status()
    job = response.json()
    output_url = f"{args.base}/v1/output/{job['jobId']}"
    while True:
        response = requests.get(
            output_url, headers=headers,
            params={"token": job["downloadToken"]}, timeout=90,
        )
        if response.status_code != 202:
            break
        if time.monotonic() - started > args.timeout:
            raise TimeoutError(f"Conversion exceeded {args.timeout}s")
        time.sleep(3)
    response.raise_for_status()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(response.content)
    summary = {
        "source": str(args.source),
        "source_sha256": hashlib.sha256(args.source.read_bytes()).hexdigest(),
        "output": str(args.output),
        "output_sha256": hashlib.sha256(response.content).hexdigest(),
        "parameters": {k: v for k, v in parameters.items() if k != "request_id"},
        "job_id": job["jobId"],
        "elapsed_seconds": round(time.monotonic() - started, 3),
        "health": health.json(),
    }
    args.output.with_suffix(".json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({"output": str(args.output), "elapsed_seconds": summary["elapsed_seconds"], "job_id": job["jobId"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
