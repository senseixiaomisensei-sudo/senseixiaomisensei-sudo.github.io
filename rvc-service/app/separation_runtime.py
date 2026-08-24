"""Pinned PyMSS song separation and accompaniment remix adapter."""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


SEPARATOR_MODEL = os.getenv(
    "RVC_SEPARATOR_MODEL",
    "model_bs_roformer_ep_368_sdr_12.9628.ckpt",
).strip()
SEPARATOR_MODELS_DIR = Path(
    os.getenv("RVC_SEPARATOR_MODELS_DIR", "/models/pymss")
).resolve()
SEPARATOR_DEVICE = os.getenv("RVC_SEPARATOR_DEVICE", "cuda").strip().lower()
SEPARATOR_TIMEOUT_SECONDS = max(
    180,
    min(int(os.getenv("RVC_SEPARATOR_TIMEOUT_SECONDS", "1800")), 3600),
)
SEPARATOR_MODEL_RELATIVE = Path(
    "vocal/vocal_extraction/model_bs_roformer_ep_368_sdr_12.9628.ckpt"
)
SEPARATOR_CONFIG_RELATIVE = Path(
    "vocal/vocal_extraction/model_bs_roformer_ep_368_sdr_12.9628.yaml"
)
SEPARATOR_MODEL_BYTES = 639_317_465
SEPARATOR_CONFIG_BYTES = 2_279


class SeparationRuntimeError(RuntimeError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class SongStems:
    vocals: Path
    instrumental: Path
    sample_rate: int


def separation_status() -> dict[str, object]:
    package_ready = importlib.util.find_spec("pymss") is not None
    model_path = SEPARATOR_MODELS_DIR / SEPARATOR_MODEL_RELATIVE
    config_path = SEPARATOR_MODELS_DIR / SEPARATOR_CONFIG_RELATIVE
    model_ready = model_path.is_file() and model_path.stat().st_size == SEPARATOR_MODEL_BYTES
    config_ready = config_path.is_file() and config_path.stat().st_size == SEPARATOR_CONFIG_BYTES
    return {
        "ready": package_ready and model_ready and config_ready,
        "engine": "PyMSS/MSST",
        "model": SEPARATOR_MODEL,
        "device": SEPARATOR_DEVICE,
    }


def separate_song(source: Path, output_dir: Path) -> SongStems:
    if not separation_status()["ready"]:
        raise SeparationRuntimeError("RVC_SEPARATOR_UNAVAILABLE")
    worker = Path(__file__).with_name("separation_worker.py")
    command = [
        sys.executable,
        str(worker),
        "--input",
        str(source),
        "--output-dir",
        str(output_dir),
        "--model-dir",
        str(SEPARATOR_MODELS_DIR),
        "--model",
        SEPARATOR_MODEL,
        "--device",
        SEPARATOR_DEVICE,
    ]
    try:
        result = subprocess.run(
            command,
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=SEPARATOR_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired as error:
        raise SeparationRuntimeError("RVC_SEPARATION_TIMEOUT") from error
    if result.returncode != 0:
        raise SeparationRuntimeError("RVC_SEPARATION_FAILED")
    try:
        payload = json.loads(result.stdout.strip().splitlines()[-1])
        vocals = Path(payload["vocals"]).resolve()
        instrumental = Path(payload["instrumental"]).resolve()
        sample_rate = int(payload["sampleRate"])
    except (IndexError, KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise SeparationRuntimeError("RVC_SEPARATION_FAILED") from error
    if (
        output_dir.resolve() not in vocals.parents
        or output_dir.resolve() not in instrumental.parents
        or not vocals.is_file()
        or not instrumental.is_file()
    ):
        raise SeparationRuntimeError("RVC_SEPARATION_FAILED")
    return SongStems(vocals=vocals, instrumental=instrumental, sample_rate=sample_rate)


def remix_song(
    instrumental: Path,
    converted_vocals: Path,
    destination: Path,
    duration_seconds: float,
    sample_rate: int,
) -> None:
    duration = max(1.0, float(duration_seconds))
    rate = sample_rate if sample_rate in {32000, 44100, 48000} else 44100
    filter_graph = (
        f"[0:a]aresample={rate}:async=1:first_pts=0,apad,atrim=end={duration:.6f}[music];"
        f"[1:a]aresample={rate}:async=1:first_pts=0,"
        f"pan=stereo|c0=c0|c1=c0,apad,atrim=end={duration:.6f}[voice];"
        "[music][voice]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,"
        "alimiter=limit=0.95:attack=5:release=100:level=0[out]"
    )
    result = subprocess.run(
        [
            "ffmpeg",
            "-nostdin",
            "-v",
            "error",
            "-y",
            "-i",
            str(instrumental),
            "-i",
            str(converted_vocals),
            "-filter_complex",
            filter_graph,
            "-map",
            "[out]",
            "-ar",
            str(rate),
            "-ac",
            "2",
            "-c:a",
            "pcm_s16le",
            str(destination),
        ],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=180,
    )
    if result.returncode != 0 or not destination.is_file() or destination.stat().st_size <= 44:
        destination.unlink(missing_ok=True)
        raise SeparationRuntimeError("RVC_REMIX_FAILED")
