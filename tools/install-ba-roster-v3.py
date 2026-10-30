"""Install the pinned Blue Archive roster v3 voices into the local RVC service model folder.

Usage (once, on the PC that runs rvc-service):
    python tools/install-ba-roster-v3.py --models-dir <RVC_MODELS_DIR> [--mirror] [--only id1,id2]

Each role in assets/rvc-cloud-roster.json is downloaded from its pinned Hugging Face revision
(or hf-mirror.com with --mirror), and installed only when the archive, checkpoint and index
SHA-256 values all match the reviewed record. Existing different files are never overwritten.
The service lists every <models-dir>/<id>/model.pth automatically after a restart.
Standard library only; no third-party code or model code is executed here.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import shutil
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROSTER = ROOT / "assets" / "rvc-cloud-roster.json"
UA = {"User-Agent": "PostPrep-roster-installer/1"}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fetch(url: str, expected_size: int | None = None) -> bytes:
    request = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(request, timeout=600) as response:
        data = response.read()
    if expected_size and len(data) != expected_size:
        raise ValueError(f"size mismatch for {url}: {len(data)} != {expected_size}")
    return data


def place(destination: Path, data: bytes) -> str:
    if destination.exists():
        if destination.read_bytes() != data:
            raise FileExistsError(f"Refusing to overwrite a different existing file: {destination}")
        return "kept"
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as handle:
        handle.write(data)
        staged = Path(handle.name)
    staged.replace(destination)
    return "installed"


def install(model: dict, models_dir: Path, mirror: bool) -> str:
    target = models_dir / model["id"]
    if (target / "model.pth").is_file() and (target / "model.index").is_file():
        if (sha256_bytes((target / "model.pth").read_bytes()) == model["checkpointSha256"]
                and sha256_bytes((target / "model.index").read_bytes()) == model["indexSha256"]):
            return "already installed"
    spec = model["download"]
    url = spec["mirrorUrl"] if mirror else spec["url"]
    if spec["kind"] == "zip":
        archive = fetch(url, spec.get("archiveBytes"))
        if sha256_bytes(archive) != spec["archiveSha256"]:
            raise ValueError("archive SHA-256 mismatch")
        with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
            weight = bundle.read(spec["weightPath"])
            index = bundle.read(spec["indexPath"])
    else:
        weight = fetch(url)
        index_url = spec["indexUrl"]
        if mirror:
            index_url = index_url.replace("https://huggingface.co/", "https://hf-mirror.com/")
        index = fetch(index_url)
    if sha256_bytes(weight) != model["checkpointSha256"]:
        raise ValueError("checkpoint SHA-256 mismatch")
    if sha256_bytes(index) != model["indexSha256"]:
        raise ValueError("index SHA-256 mismatch")
    meta = {
        "name": model["name"], "nameEn": model["nameEn"], "description": model["description"],
        "descriptionEn": model["descriptionEn"], "tags": model["tags"], "collectionId": model["collectionId"],
        "noiseScale": model["noiseScale"], "defaultIndexRate": model["defaultIndexRate"],
        "source": model["source"], "license": model["license"], "checkpointSha256": model["checkpointSha256"],
        # /v1/models passes these through; the page shows emoji as the avatar text for cloud-only voices.
        "emoji": model.get("avatarText") or "RVC", "sampleRate": model["sampleRate"],
    }
    states = [place(target / "model.pth", weight), place(target / "model.index", index),
              place(target / "meta.json", (json.dumps(meta, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))]
    return "installed" if "installed" in states else "kept"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--models-dir", required=True, type=Path)
    parser.add_argument("--mirror", action="store_true", help="download through hf-mirror.com")
    parser.add_argument("--only", default="", help="comma-separated role ids")
    args = parser.parse_args()
    roster = json.loads(ROSTER.read_text(encoding="utf-8"))
    wanted = {item for item in args.only.split(",") if item}
    failures = 0
    for model in roster["models"]:
        if wanted and model["id"] not in wanted:
            continue
        try:
            print(f"{model['id']}: {install(model, args.models_dir.resolve(), args.mirror)}", flush=True)
        except Exception as error:  # report and continue with the next role
            failures += 1
            print(f"{model['id']}: FAILED {error}", file=sys.stderr, flush=True)
    print("Restart the RVC service so the new voices are listed.")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
