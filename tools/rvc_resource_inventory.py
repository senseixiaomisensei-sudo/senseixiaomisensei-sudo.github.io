"""Inventory mounted and browser RVC resources without executing checkpoints."""

from __future__ import annotations

import argparse
import gc
import hashlib
import json
import typing
import urllib.parse
import urllib.request
from pathlib import Path

import torch


SOURCE_REPO = "andhikagg/rvc-blue-archive"
SOURCE_REVISION = "df977abe54df1db5f5b6ad289a94d645d8656039"
CANDIDATE_DIRS = {
    "arona": "Arona", "arisu": "tendou-arisu", "shiroko": "sunaookami-shiroko",
    "hoshino": "TakanashiHoshino", "yuuka": "HayaseYuuka", "hina": "SorasakiHina",
    "noa": "NoaBlueArchive", "reisa": "uzawa-reisa", "asuna": "ichinose-asuna",
    "aru": "rikuhachima-aru", "mika": "misono-mika",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def checkpoint_info(path: Path) -> dict:
    try:
        with torch.serialization.safe_globals([typing.OrderedDict]):
            checkpoint = torch.load(path, map_location="cpu", weights_only=True)
        if not isinstance(checkpoint, dict) or not isinstance(checkpoint.get("weight"), dict):
            return {"error": "Unsupported checkpoint structure"}
        config = checkpoint.get("config")
        weights = checkpoint["weight"]
        speakers = weights.get("emb_g.weight")
        phone_embedding = weights.get("enc_p.emb_phone.weight")
        feature_dim = (int(phone_embedding.shape[1])
                       if hasattr(phone_embedding, "shape") and len(phone_embedding.shape) == 2 else None)
        declared_version = checkpoint.get("version")
        inferred_version = {256: "v1", 768: "v2"}.get(feature_dim)
        result = {
            "version": str(declared_version or inferred_version or "unknown"),
            "versionInferredFromEmbedding": not bool(declared_version),
            "versionMismatch": bool(declared_version and inferred_version
                                    and declared_version != inferred_version),
            "sampleRate": int(config[-1]) if isinstance(config, (list, tuple)) and config else None,
            "f0": int(checkpoint.get("f0")) if checkpoint.get("f0") in {0, 1} else None,
            "speakerCount": int(speakers.shape[0]) if hasattr(speakers, "shape") else None,
            "featureDim": feature_dim,
            "configLength": len(config) if isinstance(config, (list, tuple)) else None,
            "tensorCount": len(weights),
        }
        del checkpoint
        gc.collect()
        return result
    except Exception as error:
        return {"error": f"Safe load failed: {type(error).__name__}"}


def index_path(model: Path) -> Path | None:
    direct = model.with_suffix(".index")
    if direct.is_file():
        return direct
    candidates = [path for path in model.parent.glob("*.index")
                  if "trained" not in path.name.lower()]
    return candidates[0] if len(candidates) == 1 else None


def source_files(directory: str) -> list[dict]:
    path = urllib.parse.quote(f"weights/blue-archive/{directory}")
    url = f"https://huggingface.co/api/spaces/{SOURCE_REPO}/tree/{SOURCE_REVISION}/{path}?expand=true"
    with urllib.request.urlopen(url, timeout=30) as stream:
        entries = json.load(stream)
    return [{"path": entry["path"], "size": entry.get("size"),
             "sha256": (entry.get("lfs") or {}).get("oid"),
             "url": f"https://huggingface.co/spaces/{SOURCE_REPO}/resolve/{SOURCE_REVISION}/{urllib.parse.quote(entry['path'])}"}
            for entry in entries if entry["path"].endswith((".pth", ".index"))]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", type=Path, required=True)
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    catalog = {entry["id"]: entry for entry in json.loads(args.catalog.read_text(encoding="utf-8"))["models"]}
    mounted = {}
    for path in sorted(args.models.rglob("*.pth")):
        relative = path.relative_to(args.models)
        if any(part.startswith("backup_") or part.endswith("_candidates") for part in relative.parts):
            continue
        model_id = path.parent.name if path.stem in {"model", path.parent.name} else path.stem
        if model_id in mounted:
            continue
        index = index_path(path)
        metadata = {}
        try:
            metadata = json.loads((path.parent / "meta.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            pass
        browser = catalog.get(model_id, {})
        mounted[model_id] = {
            "characterId": model_id,
            "activeWeight": {"path": str(path), "bytes": path.stat().st_size, "sha256": sha256(path)},
            "activeIndex": {"path": str(index), "bytes": index.stat().st_size, "sha256": sha256(index)} if index else None,
            "checkpoint": checkpoint_info(path),
            "noiseScale": metadata.get("noiseScale", browser.get("noiseScale")),
            "source": metadata.get("source", browser.get("source", "")),
            "rights": metadata.get("rights", metadata.get("license", browser.get("license", "unverified"))),
            "browser": {
                "supportsDevice": browser.get("supportsDevice") is True,
                "manifestCheckpointSha256": browser.get("checkpointSha256"),
                "manifestIndexSha256": browser.get("indexSha256"),
                "chunks": browser.get("chunks", []),
                "retrieval": browser.get("retrieval"),
                "sampleRate": browser.get("sampleRate"),
                "noiseScale": browser.get("noiseScale"),
            },
            "quality": {"P0A": "unverified by listening", "P0B": "unverified by listening",
                        "P0C": "unverified by listening"},
            "rollback": "active resource preserved until a validated same-character switch",
        }
    candidates = {}
    for model_id, directory in CANDIDATE_DIRS.items():
        try:
            files = source_files(directory)
            active = mounted.get(model_id, {})
            current_sha = (active.get("activeWeight") or {}).get("sha256")
            candidates[model_id] = {
                "directory": directory, "files": files,
                "sameWeightHashAsMounted": any(file["sha256"] == current_sha for file in files if file["path"].endswith(".pth")),
                "author": "andhikagg repository; individual model creator unverified",
                "license": "not established from repository file listing",
            }
        except Exception as error:
            candidates[model_id] = {"directory": directory, "error": type(error).__name__}
    report = {"sourceRepository": SOURCE_REPO, "sourceRevision": SOURCE_REVISION,
              "sourceSpaceCardLicense": "MIT (Space card; individual model-weight rights unverified)",
              "mounted": mounted, "candidates": candidates}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"mountedCount": len(mounted),
                      "candidateCount": len(candidates),
                      "candidateErrors": {k: v.get("error") for k, v in candidates.items() if v.get("error")},
                      "sameWeight": [k for k, v in candidates.items() if v.get("sameWeightHashAsMounted")]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
