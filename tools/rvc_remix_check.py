"""Verify a completed song's short-lived stem remix without GPU inference."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import requests


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("job_id")
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--records", type=Path, required=True)
    parser.add_argument("--base", default="http://127.0.0.1:8089")
    parser.add_argument("--token-file", type=Path, default=Path(r"E:\大肥鱼\rvc-local\.gateway-token"))
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    record = json.loads(args.records.read_text(encoding="utf-8"))[args.job_id]
    capability = record["token"]
    headers = {"Authorization": "Bearer " + args.token_file.read_text(encoding="utf-8").strip()}
    settings = [
        ("人声降低6dB-伴奏提高3dB", -6, 3, False, False),
        ("独立人声", 0, 0, False, True),
        ("独立伴奏", 0, 0, True, False),
        ("双路静音", 0, 0, True, True),
        ("恢复默认混音", 0, 0, False, False),
    ]
    results = []
    for label, vocal, backing, vocal_mute, backing_mute in settings:
        response = requests.post(f"{args.base}/v1/output/{args.job_id}/remix",
                                 headers=headers, params={"token": capability},
                                 data={"vocal_gain_db": str(vocal),
                                       "accompaniment_gain_db": str(backing),
                                       "vocal_mute": str(vocal_mute).lower(),
                                       "accompaniment_mute": str(backing_mute).lower()}, timeout=120)
        response.raise_for_status()
        payload = response.json()
        audio = requests.get(f"{args.base}/v1/output/{args.job_id}",
                             headers=headers, params={"token": capability}, timeout=120)
        audio.raise_for_status()
        output = args.output_dir / f"{label}.wav"
        output.write_bytes(audio.content)
        item = {"label": label, "path": str(output), "bytes": len(audio.content),
                "revision": payload["mixRevision"], "state": payload["state"]}
        results.append(item)
        print(json.dumps(item, ensure_ascii=False), flush=True)
    (args.output_dir / "remix-check.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
