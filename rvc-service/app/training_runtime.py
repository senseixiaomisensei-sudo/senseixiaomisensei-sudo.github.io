"""Pinned RVC v2 training pipeline used by PostPrep.

The browser only uploads user-selected audio and polls a job.  All executable
training code comes from the operator-pinned RVC-Project checkout.  Uploads are
never executed and are deleted after the job finishes.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from random import Random
from typing import Callable


OFFICIAL_COMMIT = "8f2fdbf483955f924b4c87ab34919170d0b704ed"
TRAIN_SAMPLE_RATE = "40k"
TRAIN_SAMPLE_RATE_HZ = 40000
TRAIN_VERSION = "v2"
TRAIN_WITH_F0 = True


class TrainingRuntimeError(RuntimeError):
    def __init__(self, code: str, message: str = "") -> None:
        super().__init__(message or code)
        self.code = code


def _required_file(root: Path, relative: str) -> Path:
    path = (root / relative).resolve()
    if not path.is_file():
        raise TrainingRuntimeError("RVC_TRAINING_RUNTIME_NOT_READY", f"missing {relative}")
    return path


def validate_training_runtime(root: Path) -> dict[str, str]:
    marker = _required_file(root, ".postprep-rvc-commit").read_text(encoding="utf-8").strip()
    if marker != OFFICIAL_COMMIT:
        raise TrainingRuntimeError("RVC_TRAINING_RUNTIME_NOT_READY", "official commit mismatch")
    required = {
        "preprocess": _required_file(root, "train/preprocess.py"),
        "extract_f0": _required_file(root, "train/dataset/extract_f0.py"),
        "extract_hubert": _required_file(root, "train/dataset/extract_hubert_feature.py"),
        "train": _required_file(root, "train/train.py"),
        "train_index": _required_file(root, "train/train_index.py"),
        # Upstream intentionally reuses the 40 kHz config for both v1 and v2;
        # v2 changes the feature dimension and model class at runtime.
        "config": _required_file(root, "configs/v1/40k.json"),
        "hubert": _required_file(root, "assets/hubert_base/pytorch_model.bin"),
        "rmvpe": _required_file(root, "assets/rmvpe/rmvpe.pt"),
        "pretrained_g": _required_file(root, "assets/pretrained_v2/f0G40k.pth"),
        "pretrained_d": _required_file(root, "assets/pretrained_v2/f0D40k.pth"),
    }
    return {key: str(value) for key, value in required.items()}


def _run(
    command: list[str],
    *,
    cwd: Path,
    env: dict[str, str],
    log_path: Path,
    timeout_seconds: int,
    cancelled: Callable[[], bool],
    tick: Callable[[], None] | None = None,
) -> None:
    creation_flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    with log_path.open("a", encoding="utf-8", errors="replace") as log:
        log.write("\n$ " + " ".join(command) + "\n")
        log.flush()
        process = subprocess.Popen(
            command,
            cwd=str(cwd),
            env=env,
            stdout=log,
            stderr=subprocess.STDOUT,
            text=True,
            creationflags=creation_flags,
        )
        started = time.monotonic()
        try:
            while process.poll() is None:
                if cancelled():
                    process.terminate()
                    try:
                        process.wait(timeout=15)
                    except subprocess.TimeoutExpired:
                        process.kill()
                    raise TrainingRuntimeError("RVC_TRAINING_CANCELLED")
                if time.monotonic() - started > timeout_seconds:
                    process.terminate()
                    try:
                        process.wait(timeout=15)
                    except subprocess.TimeoutExpired:
                        process.kill()
                    raise TrainingRuntimeError("RVC_TRAINING_TIMEOUT")
                if tick is not None:
                    try:
                        tick()
                    except (OSError, RuntimeError, ValueError):
                        pass
                time.sleep(1)
        finally:
            if process.poll() is None:
                process.kill()
        if process.returncode != 0:
            raise TrainingRuntimeError("RVC_TRAINING_STEP_FAILED", f"exit {process.returncode}")


def _build_filelist(exp_dir: Path) -> int:
    gt_dir = exp_dir / "0_gt_wavs"
    feature_dir = exp_dir / "3_feature768"
    f0_dir = exp_dir / "2a_f0"
    f0nsf_dir = exp_dir / "2b-f0nsf"
    names = (
        {path.stem for path in gt_dir.glob("*.wav")}
        & {path.stem for path in feature_dir.glob("*.npy")}
        & {path.name.removesuffix(".wav.npy") for path in f0_dir.glob("*.wav.npy")}
        & {path.name.removesuffix(".wav.npy") for path in f0nsf_dir.glob("*.wav.npy")}
    )
    if not names:
        raise TrainingRuntimeError("RVC_TRAINING_NO_VALID_SEGMENTS")
    rows = [
        "|".join(
            (
                str(gt_dir / f"{name}.wav"),
                str(feature_dir / f"{name}.npy"),
                str(f0_dir / f"{name}.wav.npy"),
                str(f0nsf_dir / f"{name}.wav.npy"),
                "0",
            )
        )
        for name in sorted(names)
    ]
    Random(20260824).shuffle(rows)
    (exp_dir / "filelist.txt").write_text("\n".join(rows), encoding="utf-8")
    return len(rows)


def run_training(
    *,
    python_executable: Path,
    official_root: Path,
    dataset_dir: Path,
    work_dir: Path,
    models_dir: Path,
    model_id: str,
    display_name: str,
    epochs: int,
    batch_size: int,
    source_duration_seconds: float,
    update: Callable[[str, int, str], None],
    cancelled: Callable[[], bool],
) -> dict[str, str | int | float]:
    paths = validate_training_runtime(official_root)
    experiment = f"postprep_{model_id}"
    exp_dir = official_root / "logs" / experiment
    weights_dir = official_root / "assets" / "weights"
    outside_index_dir = official_root / "assets" / "indices"
    training_log = work_dir / "training.log"
    shutil.rmtree(exp_dir, ignore_errors=True)
    exp_dir.mkdir(parents=True, exist_ok=True)
    weights_dir.mkdir(parents=True, exist_ok=True)
    outside_index_dir.mkdir(parents=True, exist_ok=True)
    training_log.write_text("", encoding="utf-8")

    env = dict(os.environ)
    env.update(
        {
            "PYTHONIOENCODING": "utf-8",
            "PYTHONUTF8": "1",
            "OPENBLAS_NUM_THREADS": "1",
            "OMP_NUM_THREADS": "1",
            "CUDA_VISIBLE_DEVICES": "0",
            "PYTHONPATH": str(official_root),
            "weight_root": str(weights_dir),
            "index_root": str(official_root / "logs"),
            "outside_index_root": str(outside_index_dir),
        }
    )
    py = str(python_executable)

    try:
        update("preprocessing", 12, "正在按官方 RVC 流程切分与标准化音频")
        _run(
            [py, "-m", "train.preprocess", str(dataset_dir), str(TRAIN_SAMPLE_RATE_HZ), "2", str(exp_dir), "False", "3.7"],
            cwd=official_root,
            env=env,
            log_path=training_log,
            timeout_seconds=1800,
            cancelled=cancelled,
        )

        update("extracting_pitch", 28, "正在使用 RMVPE 提取音高")
        _run(
            [py, "-m", "train.dataset.extract_f0", "cuda", "1", "0", "0", str(exp_dir), "True"],
            cwd=official_root,
            env=env,
            log_path=training_log,
            timeout_seconds=2400,
            cancelled=cancelled,
        )

        update("extracting_features", 42, "正在使用 HuBERT 提取语义特征")
        _run(
            [py, "-m", "train.dataset.extract_hubert_feature", "cuda:0", "1", "0", "0", str(exp_dir), TRAIN_VERSION, "True"],
            cwd=official_root,
            env=env,
            log_path=training_log,
            timeout_seconds=2400,
            cancelled=cancelled,
        )

        segments = _build_filelist(exp_dir)
        shutil.copyfile(paths["config"], exp_dir / "config.json")
        exported_weight = weights_dir / f"{experiment}.pth"
        exported_weight.unlink(missing_ok=True)

        update("training", 50, f"正在训练 RVC v2 模型（{epochs} 轮）")
        last_reported_epoch = 0

        def report_training_epoch() -> None:
            nonlocal last_reported_epoch
            candidates = (exp_dir / "train.log", training_log)
            text = ""
            for candidate in candidates:
                if candidate.is_file():
                    text += candidate.read_text(encoding="utf-8", errors="replace")[-16000:]
            matches = re.findall(r"(?:轮次|Epoch)\s*[：:]\s*(\d+)", text, flags=re.IGNORECASE)
            if not matches:
                return
            epoch = min(epochs, max(int(value) for value in matches))
            if epoch <= last_reported_epoch:
                return
            last_reported_epoch = epoch
            update("training", 50 + round(epoch / max(1, epochs) * 40), f"正在训练 RVC v2 模型：{epoch}/{epochs} 轮")

        _run(
            [
                py,
                "-m",
                "train.train",
                "-e",
                experiment,
                "-sr",
                TRAIN_SAMPLE_RATE,
                "-f0",
                "1",
                "-bs",
                str(batch_size),
                "-g",
                "0",
                "-te",
                str(epochs),
                "-se",
                str(max(10, min(epochs, 20))),
                "-pg",
                paths["pretrained_g"],
                "-pd",
                paths["pretrained_d"],
                "-l",
                "1",
                "-c",
                "0",
                "-sw",
                "0",
                "-v",
                TRAIN_VERSION,
            ],
            cwd=official_root,
            env=env,
            log_path=training_log,
            timeout_seconds=6 * 60 * 60,
            cancelled=cancelled,
            tick=report_training_epoch,
        )
        if not exported_weight.is_file() or exported_weight.stat().st_size < 10 * 1024 * 1024:
            raise TrainingRuntimeError("RVC_TRAINING_MODEL_MISSING")

        update("indexing", 92, "正在构建 FAISS 音色检索索引")
        _run(
            [py, "-m", "train.train_index", experiment, TRAIN_VERSION, str(outside_index_dir), "4"],
            cwd=official_root,
            env=env,
            log_path=training_log,
            timeout_seconds=1800,
            cancelled=cancelled,
        )
        index_candidates = sorted(exp_dir.glob("added_*.index"), key=lambda path: path.stat().st_mtime, reverse=True)
        if not index_candidates:
            raise TrainingRuntimeError("RVC_TRAINING_INDEX_MISSING")

        update("installing", 97, "正在安装训练完成的模型")
        destination = models_dir / model_id
        staging = models_dir / f".{model_id}.installing"
        shutil.rmtree(staging, ignore_errors=True)
        staging.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(exported_weight, staging / "model.pth")
        shutil.copyfile(index_candidates[0], staging / "model.index")
        metadata = {
            "name": display_name,
            "emoji": "🎓",
            "description": "由用户上传的纯人声音频按固定 RVC v2 流程训练",
            "tags": ["训练模型", "RVC v2", "40k"],
            "license": "user-provided-authorized-audio",
            "source": "",
            "modelVersion": f"{OFFICIAL_COMMIT[:12]}:{epochs}e",
            "trained": True,
            "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "trainingDurationSeconds": round(source_duration_seconds, 2),
            "trainingSegments": segments,
        }
        (staging / "meta.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
        shutil.rmtree(destination, ignore_errors=True)
        staging.replace(destination)
        return {
            "modelId": model_id,
            "name": display_name,
            "epochs": epochs,
            "segments": segments,
            "durationSeconds": round(source_duration_seconds, 2),
        }
    finally:
        shutil.rmtree(exp_dir, ignore_errors=True)
        for candidate in weights_dir.glob(f"{experiment}*.pth"):
            candidate.unlink(missing_ok=True)
        for candidate in outside_index_dir.glob(f"{experiment}_*.index"):
            candidate.unlink(missing_ok=True)
