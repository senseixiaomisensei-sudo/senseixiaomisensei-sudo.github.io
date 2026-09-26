"""Opt-in local-only evidence capture for one authorized conversion job."""

from __future__ import annotations

import json
import os
import shutil
import time
import uuid
from pathlib import Path

import numpy as np
import soundfile as sf

MAX_JOB_BYTES = 512 * 1024 * 1024
MAX_TOTAL_BYTES = 1024 * 1024 * 1024
MAX_AGE_SECONDS = 24 * 3600


def configured_root(site_root: Path) -> Path | None:
    raw = os.getenv("RVC_DIAGNOSTIC_ROOT", "").strip()
    if not raw:
        return None
    root = Path(raw).resolve()
    # Never save uploaded material in the public repository.
    if root == site_root or root.is_relative_to(site_root):
        return None
    return root


def _job_directories(root: Path):
    for item in root.iterdir():
        if not item.is_dir() or item.is_symlink():
            continue
        try:
            uuid.UUID(item.name)
        except ValueError:
            continue
        if item.resolve().parent == root.resolve():
            yield item


def _size(folder: Path) -> int:
    return sum(path.stat().st_size for path in folder.rglob("*") if path.is_file())


def prune(root: Path, keep: Path | None = None) -> None:
    if not root.is_dir():
        return
    folders = sorted(_job_directories(root), key=lambda item: item.stat().st_mtime)
    now = time.time()
    for folder in folders:
        if folder == keep:
            continue
        if now - folder.stat().st_mtime > MAX_AGE_SECONDS:
            shutil.rmtree(folder)
    folders = sorted(_job_directories(root), key=lambda item: item.stat().st_mtime)
    total = sum(_size(folder) for folder in folders)
    for folder in folders:
        if total <= MAX_TOTAL_BYTES:
            break
        if folder == keep:
            continue
        size = _size(folder)
        shutil.rmtree(folder)
        total -= size


def _audio_stats(path: Path) -> dict:
    info = sf.info(path)
    peak = 0.
    non_finite = 0
    for block in sf.blocks(path, blocksize=262144, dtype="float32", always_2d=True):
        finite = np.isfinite(block)
        non_finite += int(block.size - np.count_nonzero(finite))
        if np.any(finite):
            peak = max(peak, float(np.max(np.abs(block[finite]))))
    return {"sampleRate": info.samplerate, "channels": info.channels,
            "frames": info.frames, "durationSeconds": info.duration,
            "samplePeak": peak, "nonFiniteSamples": non_finite}


def capture_job(root: Path, job_id: str, job_root: Path,
                output_path: Path, metadata: dict) -> Path:
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    prune(root)
    target = root / str(uuid.UUID(job_id))
    if target.resolve().parent != root.resolve():
        raise ValueError("Invalid diagnostic target")
    if _size(job_root) > MAX_JOB_BYTES:
        target.mkdir(exist_ok=True)
        # Long jobs often exceed the cap because each chunk has several WAV
        # snapshots. Retain the alignment/F0 manifest and the major stage
        # outputs before sample chunks, while respecting the same byte cap.
        def priority(path: Path) -> tuple[int, str]:
            name = path.name
            rel = path.relative_to(job_root).as_posix()
            if name == "manifest.json" or path.suffix == ".npz":
                return 0, rel
            if name.startswith("input.") or rel.startswith("stems/"):
                return 1, rel
            if name == "separated-vocals-16k.wav":
                return 2, rel
            if rel.startswith("diagnostic-stages/") and name in {
                    "vocals-joined.wav", "vocals-activity.wav", "vocals-balanced.wav",
                    "vocals-dynamics.wav"}:
                return 3, rel
            if name in {"converted-vocals.wav", "output.wav"}:
                return 4, rel
            return 5, rel

        budget = max(0, MAX_JOB_BYTES - (output_path.stat().st_size if output_path.is_file() else 0))
        retained = 0
        omitted = 0
        for source in sorted((p for p in job_root.rglob("*") if p.is_file()), key=priority):
            size = source.stat().st_size
            if size > budget - retained:
                omitted += 1
                continue
            destination = target / "work" / source.relative_to(job_root)
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination)
            retained += size
        metadata["captureNote"] = "Selected stage evidence retained within the 512 MiB cap"
        metadata["omittedWorkFiles"] = omitted
        metadata["retainedWorkBytes"] = retained
    else:
        shutil.copytree(job_root, target / "work", dirs_exist_ok=True)
    if output_path.is_file():
        shutil.copyfile(output_path, target / f"result{output_path.suffix}")
    stats = {}
    for path in target.rglob("*.wav"):
        try:
            stats[path.relative_to(target).as_posix()] = _audio_stats(path)
        except (OSError, RuntimeError, ValueError):
            stats[path.relative_to(target).as_posix()] = {"error": "Could not inspect audio"}
    metadata["audioStages"] = stats
    (target / "diagnostic.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    prune(root, keep=target)
    return target
