"""Download pinned same-character candidates into a non-scanned audit folder."""

from __future__ import annotations

import argparse
import json
import urllib.request
from pathlib import Path

from rvc_resource_inventory import checkpoint_info, sha256


def download(file: dict, destination: Path) -> dict:
    expected_size = int(file["size"])
    expected_hash = str(file["sha256"] or "")
    if not expected_hash or expected_size <= 0 or expected_size > 160 * 1024 * 1024:
        return {"error": "Missing LFS digest or invalid size"}
    if destination.is_file() and destination.stat().st_size == expected_size and sha256(destination) == expected_hash:
        return {"sha256": expected_hash, "bytes": expected_size, "cached": True}
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_name(destination.name + ".part")
    offset = partial.stat().st_size if partial.is_file() else 0
    headers = {"Range": f"bytes={offset}-"} if 0 < offset < expected_size else {}
    request = urllib.request.Request(file["url"], headers=headers)
    with urllib.request.urlopen(request, timeout=90) as response:
        append = response.status == 206 and offset > 0
        with partial.open("ab" if append else "wb") as output:
            while block := response.read(1024 * 1024):
                output.write(block)
    actual_size = partial.stat().st_size
    actual_hash = sha256(partial)
    if actual_size != expected_size or actual_hash != expected_hash:
        return {"error": "LFS size/hash mismatch", "bytes": actual_size, "sha256": actual_hash}
    partial.replace(destination)
    return {"sha256": actual_hash, "bytes": actual_size, "cached": False}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inventory", type=Path, required=True)
    parser.add_argument("--destination", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    inventory = json.loads(args.inventory.read_text(encoding="utf-8"))
    result = {}
    for model_id, candidate in inventory["candidates"].items():
        if candidate.get("sameWeightHashAsMounted"):
            result[model_id] = {"state": "identical-mounted-weight", "files": []}
            continue
        downloaded = []
        for file in candidate.get("files", []):
            path = args.destination / model_id / Path(file["path"]).name
            try:
                outcome = download(file, path)
            except Exception as error:
                outcome = {"error": type(error).__name__}
            downloaded.append({"source": file["path"], "local": str(path), **outcome})
            print(f"{model_id}: {path.name}: {outcome.get('error') or 'verified'}", flush=True)
        weight = next((Path(item["local"]) for item in downloaded
                       if item["local"].endswith(".pth") and not item.get("error")), None)
        checkpoint = checkpoint_info(weight) if weight else {"error": "No verified weight"}
        index = next((Path(item["local"]) for item in downloaded
                      if item["local"].endswith(".index") and not item.get("error")), None)
        index_dimension = None
        if index:
            try:
                import faiss
                import numpy as np
                index_dimension = int(faiss.deserialize_index(
                    np.frombuffer(index.read_bytes(), dtype=np.uint8)).d)
            except Exception as error:
                checkpoint["indexError"] = type(error).__name__
        compatible = (not checkpoint.get("error") and not checkpoint.get("versionMismatch")
                      and index_dimension == checkpoint.get("featureDim")
                      and checkpoint.get("speakerCount", 0) > 0
                      and checkpoint.get("sampleRate") in {32000, 40000, 48000})
        result[model_id] = {"state": "structurally-valid" if compatible else "invalid-or-incomplete",
                            "files": downloaded, "checkpoint": checkpoint,
                            "indexDimension": index_dimension,
                            "readyForAudioEvaluation": bool(compatible),
                            "activeRevisionSwitched": False}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"structurallyValid": [key for key, item in result.items()
                                            if item["state"] == "structurally-valid"]}))


if __name__ == "__main__":
    main()
