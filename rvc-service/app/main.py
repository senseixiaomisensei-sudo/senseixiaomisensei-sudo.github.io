"""RVC voice-conversion inference adapter for PostPrep's AI voice changer.

Deliberately not a browser service: it accepts one server-to-server bearer
token, has no browser CORS, never auto-downloads models, and deletes conversion
audio as soon as a request finishes. Explicit training jobs retain only their
uploaded dataset until completion/cancellation/failure. Generated files receive
a random download token and are removed after a short retention window.

Model weights are NOT bundled. The operator mounts RVC `.pth` (and optional
`.index`) files into RVC_MODELS_DIR; every mounted model is listed by
GET /v1/models and selectable by id from the website.
"""

from __future__ import annotations

import asyncio
import gc
import json
import logging
import math
import os
import secrets
import shutil
import subprocess
import tempfile
import uuid
from collections import OrderedDict
from contextlib import asynccontextmanager
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from app.separation_runtime import (
    SeparationRuntimeError,
    remix_song,
    separate_song,
    separation_status,
)
from app.training_runtime import TrainingRuntimeError, run_training

try:
    from edge_tts import Communicate
    HAS_EDGE_TTS = True
except ImportError:  # pragma: no cover - optional until the service environment is updated
    Communicate = None
    HAS_EDGE_TTS = False


MAX_AUDIO_BYTES = 25 * 1024 * 1024
TTS_MAX_TEXT_CHARS = 800
TTS_DEFAULT_VOICE = os.getenv("RVC_TTS_VOICE", "zh-CN-XiaoxiaoNeural")
MIN_AUDIO_SECONDS = 1
MAX_AUDIO_SECONDS = 600
LONG_AUDIO_THRESHOLD_SECONDS = 20
LONG_CHUNK_SECONDS = 20
LONG_CHUNK_CROSSFADE_SECONDS = 0.5
OUTPUT_RETENTION_SECONDS = max(900, min(int(os.getenv("RVC_OUTPUT_RETENTION_SECONDS", "7200")), 21600))
MAX_CONCURRENCY = max(1, min(int(os.getenv("RVC_MAX_CONCURRENCY", "1")), 2))
MODELS_DIR = Path(os.getenv("RVC_MODELS_DIR", "/models/rvc")).resolve()
WORK_ROOT = Path(os.getenv("RVC_WORK_ROOT", "/tmp/rvc-work")).resolve()
OUTPUT_ROOT = Path(os.getenv("RVC_OUTPUT_ROOT", "/tmp/rvc-output")).resolve()
GATEWAY_TOKEN = os.getenv("RVC_GATEWAY_TOKEN", "").strip()
MAX_CACHED_MODELS = max(1, min(int(os.getenv("RVC_MAX_CACHED_MODELS", "2")), 8))
OFFICIAL_ROOT = Path(os.getenv("RVC_OFFICIAL_ROOT", "")).resolve()
TRAIN_ROOT = Path(os.getenv("RVC_TRAIN_ROOT", str(WORK_ROOT.parent / "training"))).resolve()
TRAIN_JOB_RETENTION_SECONDS = max(3600, min(int(os.getenv("RVC_TRAIN_JOB_RETENTION_SECONDS", "86400")), 7 * 86400))
TRAIN_UPLOAD_SESSION_SECONDS = max(900, min(int(os.getenv("RVC_TRAIN_UPLOAD_SESSION_SECONDS", "7200")), 24 * 3600))
MAX_TRAIN_FILES = max(2, min(int(os.getenv("RVC_MAX_TRAIN_FILES", "12")), 20))
MAX_TRAIN_FILE_BYTES = 25 * 1024 * 1024
MAX_TRAIN_TOTAL_BYTES = 96 * 1024 * 1024
MIN_TRAIN_SECONDS = 30
MAX_TRAIN_SECONDS = 30 * 60
DEFAULT_TRAIN_EPOCHS = max(40, min(int(os.getenv("RVC_TRAIN_EPOCHS", "80")), 200))
TRAIN_PYTHON = Path(os.getenv("RVC_TRAIN_PYTHON", os.sys.executable)).resolve()
logger = logging.getLogger("postprep.rvc")
ALLOWED_EXTENSIONS = {"wav", "mp3", "m4a", "ogg", "webm", "flac", "aac"}
ALLOWED_MIME_TYPES = {
    "audio/wav",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp4",
    "audio/x-m4a",
    "audio/ogg",
    "audio/webm",
    "audio/flac",
    "audio/x-flac",
    "audio/aac",
    # Some HTTP clients (curl, PowerShell, generic uploaders) send a generic
    # type for audio files; ffmpeg still parses the real format below.
    "application/octet-stream",
}
ALLOWED_FORMATS = {"wav", "mp3"}
ALLOWED_F0_METHODS = {"auto", "rmvpe", "fcpe", "pm"}
ALLOWED_RESAMPLE = {0, 16000, 24000, 32000, 44100, 48000}
ALLOWED_AUDIO_MODES = {"voice", "song"}
# A high threshold keeps ordinary speech untouched. The compressor and
# look-ahead limiter only guard loud/near-clipped shouts before the official
# RVC feature extractor; they cannot reconstruct clipping already baked into
# the source recording.
INPUT_SAFETY_FILTER = (
    "highpass=f=45:p=2,"
    "lowpass=f=7600:p=1,"
    # Gentle tracked FFT denoising improves low-SNR and reverberant uploads
    # without a gate, so quiet consonants and sustained singing notes remain.
    "afftdn=nr=6:nf=-55:tn=1:ad=0.8,"
    "speechnorm=p=0.88:e=3:c=2:r=0.0005:f=0.0005:m=0.06,"
    "acompressor=threshold=0.58:ratio=4:attack=2:release=120:knee=3.5:makeup=1,"
    "alimiter=limit=0.90:attack=5:release=100:level=0"
)
# RVC generators can emit isolated full-band impulses or an over-bright upper
# spectrum on high-energy input.  Repair clicks first, then apply a restrained
# de-esser/anti-alias low-pass before the final true-peak guard.  Four public
# checkpoints need a narrower band because the same shout-stress fixture
# produced >0.85 adjacent-sample jumps with the 12 kHz profile.
OUTPUT_SAFETY_FILTER = (
    "adeclick=threshold=2.5:burst=2,"
    "deesser=i=0.15:m=0.3:f=0.55,"
    "lowpass=f=12000:p=1,"
    "alimiter=limit=0.90:attack=5:release=100:level=0"
)
SHOUT_HARSHNESS_GUARD_MODELS = frozenset({"midori", "mika", "shiroko", "toki", "yuzu"})
SHOUT_HARSHNESS_FILTER = (
    "adeclick=threshold=2:burst=2,"
    "deesser=i=0.25:m=0.35:f=0.52,"
    "lowpass=f=10000:p=2,"
    "alimiter=limit=0.90:attack=5:release=100:level=0"
)
HIGH_ENERGY_INPUT_FILTER = (
    # This branch is selected from the unsmoothed upload/stem, before the
    # standard limiter can hide clipping evidence from the profile detector.
    "highpass=f=45:p=2,"
    "lowpass=f=7600:p=1,"
    "afftdn=nr=6:nf=-55:tn=1:ad=0.8,"
    "speechnorm=p=0.88:e=3:c=2:r=0.0005:f=0.0005:m=0.06,"
    "acompressor=threshold=0.58:ratio=4:attack=2:release=120:knee=3.5:makeup=1,"
    "alimiter=limit=0.86:attack=2:release=100:level=0"
)
HIGH_ENERGY_OUTPUT_FILTER = (
    "adeclick=threshold=1.8:burst=2,"
    "deesser=i=0.24:m=0.32:f=0.53,"
    "lowpass=f=11500:p=2,"
    "acompressor=threshold=0.72:ratio=1.6:attack=1:release=80:knee=2:makeup=1,"
    "alimiter=limit=0.88:attack=3:release=90:level=0"
)
PITCH_COMPLEX_OUTPUT_FILTER = (
    "adeclick=threshold=2:burst=2,"
    "deesser=i=0.20:m=0.30:f=0.54,"
    "lowpass=f=13000:p=1,"
    "alimiter=limit=0.89:attack=3:release=90:level=0"
)


class RvcServiceError(Exception):
    def __init__(self, status_code: int, code: str) -> None:
        super().__init__(code)
        self.status_code = status_code
        self.code = code


@dataclass(frozen=True)
class AudioProfile:
    peak: float = 0.0
    rms: float = 0.0
    clipped_fraction: float = 0.0
    high_band_ratio: float = 0.0
    high_energy: bool = False
    high_pitch: bool = False
    complex_pitch: bool = False


@dataclass
class OutputRecord:
    path: Path
    token: str
    expires_at: datetime
    format: str
    state: str = "queued"
    error_code: str = ""
    f0_method: str = ""
    request_id: str = ""
    audio_mode: str = "voice"
    stage: str = "queued"


@dataclass
class TrainingRecord:
    job_id: str
    token: str
    display_name: str
    model_id: str
    root: str
    collection_name: str = "我的训练模型"
    state: str = "uploading"
    stage: str = "uploading"
    progress: int = 0
    message: str = ""
    files: int = 0
    total_bytes: int = 0
    duration_seconds: float = 0.0
    epochs: int = DEFAULT_TRAIN_EPOCHS
    created_at: str = ""
    updated_at: str = ""
    error_code: str = ""
    cancel_requested: bool = False
    result_model_id: str = ""


outputs: dict[str, OutputRecord] = {}
request_jobs: dict[str, str] = {}
outputs_lock = asyncio.Lock()
inference_lock = asyncio.Semaphore(MAX_CONCURRENCY)
job_tasks: set[asyncio.Task] = set()
training_records: dict[str, TrainingRecord] = {}
training_tasks: set[asyncio.Task] = set()
training_lock = asyncio.Lock()
active_training_job_id = ""

# Loaded RVCInference instances keyed by resolved .pth path (LRU).
model_cache: "OrderedDict[str, object]" = OrderedDict()
model_cache_lock = asyncio.Lock()


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def require_config() -> None:
    if len(GATEWAY_TOKEN) < 32:
        raise RuntimeError("RVC service is not configured (RVC_GATEWAY_TOKEN too short)")
    if not MODELS_DIR.is_dir():
        raise RuntimeError("RVC service is not configured (RVC_MODELS_DIR missing)")
    if not OFFICIAL_ROOT.is_dir():
        raise RuntimeError("RVC service is not configured (RVC_OFFICIAL_ROOT missing)")


def scan_models() -> list[dict]:
    """List mounted RVC models: id, display metadata, index availability."""
    if not MODELS_DIR.is_dir():
        return []
    results: list[dict] = []
    for pth in sorted(MODELS_DIR.rglob("*.pth")):
        relative = pth.relative_to(MODELS_DIR)
        if any(part.startswith("backup_") or part.endswith("_candidates") for part in relative.parts):
            continue
        parent = pth.parent
        # models/<name>/<name>.pth or models/<name>/model.pth -> id "<name>";
        # models/<name>.pth (flat) -> id "<name>".
        if parent != MODELS_DIR and (pth.stem == parent.name or pth.stem == "model"):
            model_id = parent.name
        else:
            model_id = pth.stem
        model_id = "".join(ch for ch in model_id if ch.isalnum() or ch in "-_")
        if not model_id:
            continue
        index = pth.with_suffix(".index")
        if not index.is_file():
            # Official RVC commonly names indexes added_IVF..._<voice>_v2.index.
            candidates = [candidate for candidate in pth.parent.glob("*.index") if "trained" not in candidate.name.lower()]
            if len(candidates) == 1:
                index = candidates[0]
            else:
                for candidate in candidates:
                    if pth.stem.lower() in candidate.stem.lower() or candidate.stem == "model":
                        index = candidate
                        break
        meta: dict = {}
        meta_candidates = [pth.with_suffix(".pth.meta.json"), pth.with_suffix(".meta.json"), pth.parent / "meta.json"]
        for candidate in meta_candidates:
            if candidate.is_file():
                try:
                    import json

                    with candidate.open("r", encoding="utf-8") as handle:
                        parsed = json.load(handle)
                    if isinstance(parsed, dict):
                        meta = parsed
                except (OSError, ValueError):
                    meta = {}
                break
        results.append({
            "id": model_id,
            "name": str(meta.get("name") or pth.stem),
            "emoji": str(meta.get("emoji") or "🎵"),
            "description": str(meta.get("description") or ""),
            "tags": meta.get("tags") if isinstance(meta.get("tags"), list) else [],
            "collectionId": str(meta.get("collectionId") or ""),
            "collectionName": str(meta.get("collectionName") or ""),
            "hasIndex": index.is_file(),
            "license": str(meta.get("license") or "unverified"),
            "source": str(meta.get("source") or ""),
            "modelVersion": str(meta.get("modelVersion") or ""),
            "trained": meta.get("trained") is True,
            "createdAt": str(meta.get("createdAt") or ""),
            "file": str(relative).replace("\\", "/"),
        })
    return results


def find_model_path(model_id: str) -> Path:
    if not model_id or not re_full_slug(model_id):
        raise RvcServiceError(400, "RVC_INVALID_MODEL")
    candidates = [
        MODELS_DIR / f"{model_id}.pth",
        MODELS_DIR / model_id / "model.pth",
        MODELS_DIR / model_id / f"{model_id}.pth",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()
    discovered: list[Path] = []
    for candidate in sorted(MODELS_DIR.rglob("*.pth")):
        relative = candidate.relative_to(MODELS_DIR)
        if any(part.startswith("backup_") or part.endswith("_candidates") for part in relative.parts):
            continue
        parent = candidate.parent
        candidate_id = parent.name if parent != MODELS_DIR and candidate.stem in {parent.name, "model"} else candidate.stem
        candidate_id = "".join(ch for ch in candidate_id if ch.isalnum() or ch in "-_")
        if candidate_id == model_id:
            discovered.append(candidate)
    if len(discovered) == 1:
        return discovered[0].resolve()
    raise RvcServiceError(404, "RVC_MODEL_NOT_FOUND")


def find_index_path(pth: Path) -> str:
    for candidate in (pth.with_suffix(".index"), pth.parent / "model.index"):
        if candidate.is_file():
            return str(candidate)
    candidates = [candidate for candidate in pth.parent.glob("*.index") if "trained" not in candidate.name.lower()]
    if len(candidates) == 1:
        return str(candidates[0])
    for candidate in candidates:
        if pth.stem.lower() in candidate.stem.lower():
            return str(candidate)
    return ""


def acquire_model(pth: Path):
    """Load (or reuse) the pinned official RVC WebUI inference runtime."""
    from app.official_runtime import OfficialRvcModel

    cached = model_cache.get(str(pth))
    if cached is not None:
        model_cache.move_to_end(str(pth))
        return cached
    inference = OfficialRvcModel(pth, find_index_path(pth))
    model_cache[str(pth)] = inference
    while len(model_cache) > MAX_CACHED_MODELS:
        model_cache.popitem(last=False)
    return inference


def release_cached_models() -> None:
    """Release parent-process RVC models before the isolated separator uses VRAM."""
    model_cache.clear()
    gc.collect()
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except (ImportError, RuntimeError):
        pass


async def load_model_async(pth: Path):
    async with model_cache_lock:
        return await asyncio.to_thread(acquire_model, pth)


async def cleanup_expired_outputs() -> None:
    expired: list[tuple[str, OutputRecord]] = []
    now = utcnow()
    async with outputs_lock:
        for job_id, record in tuple(outputs.items()):
            if record.state not in {"queued", "processing"} and record.expires_at <= now:
                expired.append((job_id, record))
                outputs.pop(job_id, None)
                if record.request_id and request_jobs.get(record.request_id) == job_id:
                    request_jobs.pop(record.request_id, None)
    for _, record in expired:
        record.path.unlink(missing_ok=True)


def training_job_root(job_id: str) -> Path:
    return (TRAIN_ROOT / "jobs" / job_id).resolve()


def training_status_path(record: TrainingRecord) -> Path:
    return Path(record.root) / "status.json"


def persist_training_record(record: TrainingRecord) -> None:
    path = training_status_path(record)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(asdict(record), ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def load_training_records() -> None:
    jobs_root = TRAIN_ROOT / "jobs"
    jobs_root.mkdir(parents=True, exist_ok=True)
    for status_path in jobs_root.glob("*/status.json"):
        try:
            payload = json.loads(status_path.read_text(encoding="utf-8"))
            record = TrainingRecord(**payload)
            if record.state in {"queued", "preprocessing", "extracting_pitch", "extracting_features", "training", "indexing", "installing"}:
                record.state = "failed"
                record.stage = "failed"
                record.error_code = "RVC_TRAINING_INTERRUPTED"
                record.message = "训练服务曾重启，请重新提交训练任务"
                record.updated_at = utcnow().isoformat()
                persist_training_record(record)
            training_records[record.job_id] = record
        except (OSError, TypeError, ValueError):
            continue


async def cleanup_expired_training_jobs() -> None:
    cutoff = utcnow() - timedelta(seconds=TRAIN_JOB_RETENTION_SECONDS)
    upload_cutoff = utcnow() - timedelta(seconds=TRAIN_UPLOAD_SESSION_SECONDS)
    expired: list[TrainingRecord] = []
    async with training_lock:
        for job_id, record in tuple(training_records.items()):
            try:
                updated = datetime.fromisoformat(record.updated_at)
            except ValueError:
                updated = utcnow()
            abandoned_upload = record.state == "uploading" and updated <= upload_cutoff
            inactive_expired = record.state not in {"uploading", "queued", "preprocessing", "extracting_pitch", "extracting_features", "training", "indexing", "installing"} and updated <= cutoff
            if abandoned_upload or inactive_expired:
                expired.append(record)
                training_records.pop(job_id, None)
    for record in expired:
        shutil.rmtree(Path(record.root), ignore_errors=True)


async def cleanup_loop() -> None:
    while True:
        await asyncio.sleep(60)
        await cleanup_expired_outputs()
        await cleanup_expired_training_jobs()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    WORK_ROOT.mkdir(parents=True, exist_ok=True)
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    TRAIN_ROOT.mkdir(parents=True, exist_ok=True)
    require_config()
    load_training_records()
    cleanup_task = asyncio.create_task(cleanup_loop())
    try:
        yield
    finally:
        cleanup_task.cancel()
        for task in tuple(job_tasks):
            task.cancel()
        for task in tuple(training_tasks):
            task.cancel()
        await asyncio.gather(cleanup_task, return_exceptions=True)
        if job_tasks:
            await asyncio.gather(*tuple(job_tasks), return_exceptions=True)
        if training_tasks:
            await asyncio.gather(*tuple(training_tasks), return_exceptions=True)
        await cleanup_expired_outputs()
        await cleanup_expired_training_jobs()


app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)


@app.exception_handler(RvcServiceError)
async def rvc_error_handler(_: Request, error: RvcServiceError) -> JSONResponse:
    return JSONResponse({"code": error.code}, status_code=error.status_code, headers={"Cache-Control": "no-store"})


def authorized(request: Request) -> bool:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return False
    return bool(GATEWAY_TOKEN) and secrets.compare_digest(header.removeprefix("Bearer ").strip(), GATEWAY_TOKEN)


def ensure_authorized(request: Request) -> None:
    if not authorized(request):
        raise HTTPException(status_code=401, detail="Unauthorized")


def safe_extension(upload: UploadFile) -> str:
    name = str(upload.filename or "").lower()
    extension = name.rsplit(".", 1)[-1] if "." in name else ""
    if extension not in ALLOWED_EXTENSIONS:
        raise RvcServiceError(400, "RVC_INVALID_AUDIO")
    mime = str(upload.content_type or "").lower()
    if mime and mime not in ALLOWED_MIME_TYPES:
        raise RvcServiceError(400, "RVC_INVALID_AUDIO")
    return extension


async def write_upload(upload: UploadFile, destination: Path) -> None:
    total = 0
    try:
        with destination.open("wb") as handle:
            while chunk := await upload.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_AUDIO_BYTES:
                    raise RvcServiceError(413, "RVC_AUDIO_TOO_LARGE")
                handle.write(chunk)
    finally:
        await upload.close()
    if total < 1:
        raise RvcServiceError(400, "RVC_INVALID_AUDIO")


def probe_duration(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        timeout=20,
    )
    try:
        duration = float(result.stdout.strip())
    except (TypeError, ValueError):
        duration = 0.0
    if result.returncode != 0 or duration <= 0:
        raise RvcServiceError(400, "RVC_INVALID_AUDIO")
    return duration


def normalize_audio(source: Path, destination: Path) -> AudioProfile:
    duration = probe_duration(source)
    if duration < MIN_AUDIO_SECONDS:
        raise RvcServiceError(400, "RVC_AUDIO_TOO_SHORT")
    if duration > MAX_AUDIO_SECONDS:
        raise RvcServiceError(400, "RVC_AUDIO_TOO_LONG")
    profile = analyze_audio_profile(source)
    selected_filter = HIGH_ENERGY_INPUT_FILTER if profile.high_energy else INPUT_SAFETY_FILTER
    result = subprocess.run(
        [
            "ffmpeg", "-nostdin", "-v", "error", "-i", str(source), "-vn",
            # Official RVC consumes mono 16 kHz float audio before HuBERT.
            # The high-threshold guard contains excessive shout peaks before
            # feature extraction without applying a cosmetic EQ to normal
            # speech.
            "-af", selected_filter,
            "-ac", "1", "-ar", "16000", "-c:a", "pcm_f32le", str(destination),
        ],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=120,
    )
    if result.returncode != 0 or not destination.is_file() or destination.stat().st_size < 1:
        raise RvcServiceError(400, "RVC_INVALID_AUDIO")
    return profile


def analyze_audio_profile(path: Path) -> AudioProfile:
    """Detect only the extreme-input branch; ordinary audio remains untouched."""
    try:
        import numpy as np
        import soundfile as sf

        try:
            audio, sample_rate = sf.read(str(path), dtype="float32", always_2d=False)
        except (OSError, RuntimeError, ValueError):
            decoded = subprocess.run(
                ["ffmpeg", "-nostdin", "-v", "error", "-i", str(path), "-t", "30", "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "pipe:1"],
                check=False,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                timeout=90,
            )
            if decoded.returncode != 0 or len(decoded.stdout) < 8000 * 4:
                return AudioProfile()
            audio = np.frombuffer(decoded.stdout, dtype="<f4").copy()
            sample_rate = 16000
        if getattr(audio, "ndim", 1) > 1:
            audio = np.mean(audio, axis=1)
        audio = np.asarray(audio, dtype=np.float32)
        if audio.size < max(8000, sample_rate // 2):
            return AudioProfile()
        absolute = np.abs(audio)
        peak = float(np.max(absolute))
        rms = float(np.sqrt(np.mean(np.square(audio, dtype=np.float64))))
        clipped_fraction = float(np.mean(absolute >= 0.985))
        analysis_audio = audio[: min(audio.size, sample_rate * 30)]
        spectrum = np.abs(np.fft.rfft(analysis_audio))
        frequencies = np.fft.rfftfreq(analysis_audio.size, d=1 / sample_rate)
        total_energy = float(np.sum(np.square(spectrum))) + 1e-12
        high_band_ratio = float(np.sum(np.square(spectrum[frequencies >= 3500])) / total_energy)
        high_energy = bool(
            clipped_fraction >= 0.0005
            or rms >= 0.22
            or (peak >= 0.88 and rms >= 0.15)
            or (peak >= 0.82 and high_band_ratio >= 0.18)
        )
        high_pitch = False
        complex_pitch = False
        try:
            import parselmouth

            pitch = parselmouth.Sound(
                np.ascontiguousarray(analysis_audio, dtype=np.float64),
                sampling_frequency=float(sample_rate),
            ).to_pitch_ac(time_step=0.01, pitch_floor=55.0, pitch_ceiling=min(1100.0, sample_rate / 2 - 1))
            f0 = np.asarray(pitch.selected_array["frequency"], dtype=np.float64)
            valid = np.isfinite(f0) & (f0 > 0)
            voiced = f0[valid]
            if voiced.size >= 20:
                p10, p90, p95 = np.percentile(voiced, [10, 90, 95])
                consecutive = valid[1:] & valid[:-1]
                jumps = np.abs(12 * np.log2(np.maximum(f0[1:][consecutive], 1) / np.maximum(f0[:-1][consecutive], 1)))
                high_pitch = bool(p90 >= 440 or p95 >= 650)
                complex_pitch = bool(12 * np.log2(max(p90, 1) / max(p10, 1)) >= 18 or (jumps.size >= 20 and float(np.mean(jumps >= 3)) >= 0.08))
        except (ImportError, OSError, RuntimeError, ValueError):
            pass
        return AudioProfile(
            peak=peak,
            rms=rms,
            clipped_fraction=clipped_fraction,
            high_band_ratio=high_band_ratio,
            high_energy=high_energy,
            high_pitch=high_pitch,
            complex_pitch=complex_pitch,
        )
    except (ImportError, OSError, RuntimeError, ValueError):
        return AudioProfile()


def prepare_inference_audio(input_wav: Path, profile: AudioProfile) -> Path:
    if not profile.high_energy:
        return input_wav
    duration = probe_duration(input_wav)
    guarded = input_wav.with_name(f"{input_wav.stem}-high-energy.wav")
    result = subprocess.run(
        [
            "ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(input_wav),
            "-af", HIGH_ENERGY_INPUT_FILTER,
            "-ac", "1", "-ar", "16000", "-c:a", "pcm_f32le", str(guarded),
        ],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=max(120, min(600, int(duration * 1.5) + 60)),
    )
    if result.returncode == 0 and guarded.is_file() and guarded.stat().st_size > 44:
        return guarded
    guarded.unlink(missing_ok=True)
    return input_wav


def render_conversion(
    model_path: Path,
    input_wav: Path,
    output_wav: Path,
    pitch: int,
    index_rate: float,
    protect: float,
    filter_radius: int,
    resample_rate: int,
    rms_mix_rate: float,
    f0_method: str,
    profile_hint: AudioProfile | None = None,
) -> str:
    inference = acquire_model(model_path)
    # Upstream 2.3.260718 removed the old post-F0 median-filter parameter.
    # Keep accepting it at the HTTP boundary for backward compatibility, but
    # use the exact upstream RMVPE/FCPE/PM pipeline without an invented filter.
    _ = filter_radius
    profile = profile_hint or analyze_audio_profile(input_wav)
    inference_input = input_wav if profile_hint is not None else prepare_inference_audio(input_wav, profile)
    selected_method = (
        "fcpe"
        if f0_method == "auto" and (profile.high_pitch or profile.complex_pitch)
        else select_f0_method(inference_input, f0_method)
    )
    methods = [selected_method]
    if f0_method == "auto":
        methods.append("fcpe" if selected_method == "rmvpe" else "rmvpe")
    last_error: Exception | None = None
    used_method = selected_method
    for method in dict.fromkeys(methods):
        output_wav.unlink(missing_ok=True)
        try:
            inference.infer(
                inference_input,
                output_wav,
                pitch=pitch,
                f0_method=method,
                # Reduce retrieval grain and preserve transients only for an
                # objectively high-energy input.  Ordinary/mid-range audio
                # retains the caller's exact established settings.
                index_rate=min(index_rate, 0.22) if profile.high_energy else min(index_rate, 0.26) if profile.high_pitch or profile.complex_pitch else index_rate,
                protect=min(protect, 0.18) if profile.high_energy or profile.high_pitch or profile.complex_pitch else protect,
                resample_rate=resample_rate,
                rms_mix_rate=min(rms_mix_rate, 0.90) if profile.high_energy or profile.high_pitch or profile.complex_pitch else rms_mix_rate,
            )
            if output_wav.is_file() and output_wav.stat().st_size > 44:
                used_method = method
                break
        except (OSError, RuntimeError, ValueError) as error:
            last_error = error
            logger.warning("pitch extraction failed with %s; trying fallback", method)
    else:
        if last_error:
            raise last_error
        raise RvcServiceError(502, "RVC_EMPTY_OUTPUT")
    if not output_wav.is_file() or output_wav.stat().st_size < 1:
        raise RvcServiceError(502, "RVC_EMPTY_OUTPUT")
    # The upstream generator writes PCM; a final transparent limiter prevents
    # a very loud synthesized peak from clipping in the browser/player.
    limited_output = output_wav.with_name(f"{output_wav.stem}-limited{output_wav.suffix}")
    model_id = model_path.parent.name if model_path.parent != MODELS_DIR else model_path.stem
    if profile.high_energy:
        output_filter = HIGH_ENERGY_OUTPUT_FILTER
    elif profile.high_pitch or profile.complex_pitch:
        output_filter = PITCH_COMPLEX_OUTPUT_FILTER
    elif model_id in SHOUT_HARSHNESS_GUARD_MODELS:
        output_filter = SHOUT_HARSHNESS_FILTER
    else:
        output_filter = OUTPUT_SAFETY_FILTER
    postprocess_timeout = max(120, min(600, int(probe_duration(output_wav) * 1.5) + 60))
    result = subprocess.run(
        [
            "ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(output_wav),
            "-af", output_filter, "-c:a", "pcm_s16le", str(limited_output),
        ],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=postprocess_timeout,
    )
    if result.returncode == 0 and limited_output.is_file() and limited_output.stat().st_size > 44:
        limited_output.replace(output_wav)
    else:
        # Keep a valid RVC result even when a host ffmpeg build lacks the
        # optional limiter filter.
        limited_output.unlink(missing_ok=True)
    return used_method


def split_long_audio(input_wav: Path, chunk_root: Path, duration_seconds: float) -> list[Path]:
    chunk_root.mkdir(parents=True, exist_ok=True)
    chunks: list[Path] = []
    maximum_step = LONG_CHUNK_SECONDS - LONG_CHUNK_CROSSFADE_SECONDS
    chunk_count = max(
        1,
        math.ceil(
            max(0.0, duration_seconds - LONG_CHUNK_CROSSFADE_SECONDS)
            / maximum_step
        ),
    )
    # Balance the duration across every chunk instead of leaving a tiny final
    # fragment.  Upstream RVC can spend disproportionate time padding very
    # short tails after a long job; equal chunks also keep memory predictable.
    chunk_duration = (
        duration_seconds + LONG_CHUNK_CROSSFADE_SECONDS * (chunk_count - 1)
    ) / chunk_count
    step = chunk_duration - LONG_CHUNK_CROSSFADE_SECONDS
    for index in range(chunk_count):
        start = index * step
        current_duration = min(chunk_duration, duration_seconds - start)
        chunk_path = chunk_root / f"source-{index:03d}.wav"
        result = subprocess.run(
            [
                "ffmpeg",
                "-nostdin",
                "-v",
                "error",
                "-y",
                "-ss",
                f"{start:.6f}",
                "-i",
                str(input_wav),
                "-t",
                f"{current_duration:.6f}",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-c:a",
                "pcm_f32le",
                str(chunk_path),
            ],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=120,
        )
        if result.returncode != 0 or not chunk_path.is_file() or chunk_path.stat().st_size <= 44:
            raise RvcServiceError(502, "RVC_LONG_AUDIO_SPLIT_FAILED")
        chunks.append(chunk_path)
    if not chunks:
        raise RvcServiceError(502, "RVC_LONG_AUDIO_SPLIT_FAILED")
    return chunks


def join_long_audio(chunks: list[Path], destination: Path, duration_seconds: float) -> None:
    if len(chunks) == 1:
        shutil.copyfile(chunks[0], destination)
        return
    command = ["ffmpeg", "-nostdin", "-v", "error", "-y"]
    for chunk in chunks:
        command.extend(["-i", str(chunk)])
    filters: list[str] = []
    previous = "[0:a]"
    for index in range(1, len(chunks)):
        output = f"[xf{index}]"
        filters.append(
            f"{previous}[{index}:a]acrossfade=d={LONG_CHUNK_CROSSFADE_SECONDS}:c1=tri:c2=tri{output}"
        )
        previous = output
    filters.append(
        f"{previous}atrim=end={duration_seconds:.6f},"
        "alimiter=limit=0.90:attack=5:release=100:level=0[out]"
    )
    command.extend([
        "-filter_complex",
        ";".join(filters),
        "-map",
        "[out]",
        "-c:a",
        "pcm_s16le",
        str(destination),
    ])
    result = subprocess.run(
        command,
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=max(180, min(900, int(duration_seconds * 1.5) + 90)),
    )
    if result.returncode != 0 or not destination.is_file() or destination.stat().st_size <= 44:
        destination.unlink(missing_ok=True)
        raise RvcServiceError(502, "RVC_LONG_AUDIO_JOIN_FAILED")


def render_duration_safe_conversion(
    model_path: Path,
    input_wav: Path,
    output_wav: Path,
    work_root: Path,
    duration_seconds: float,
    pitch: int,
    index_rate: float,
    protect: float,
    filter_radius: int,
    resample_rate: int,
    rms_mix_rate: float,
    f0_method: str,
    profile_hint: AudioProfile | None = None,
) -> str:
    if duration_seconds <= LONG_AUDIO_THRESHOLD_SECONDS:
        return render_conversion(
            model_path,
            input_wav,
            output_wav,
            pitch,
            index_rate,
            protect,
            filter_radius,
            resample_rate,
            rms_mix_rate,
            f0_method,
            profile_hint,
        )
    source_chunks = split_long_audio(input_wav, work_root / "source", duration_seconds)
    output_chunks: list[Path] = []
    methods: list[str] = []
    for index, source_chunk in enumerate(source_chunks):
        converted_chunk = work_root / f"converted-{index:03d}.wav"
        methods.append(render_conversion(
            model_path,
            source_chunk,
            converted_chunk,
            pitch,
            index_rate,
            protect,
            filter_radius,
            resample_rate,
            rms_mix_rate,
            f0_method,
            profile_hint,
        ))
        output_chunks.append(converted_chunk)
    join_long_audio(output_chunks, output_wav, duration_seconds)
    return "+".join(dict.fromkeys(methods))


async def render_duration_safe_conversion_async(
    model_path: Path,
    input_wav: Path,
    output_wav: Path,
    work_root: Path,
    duration_seconds: float,
    pitch: int,
    index_rate: float,
    protect: float,
    filter_radius: int,
    resample_rate: int,
    rms_mix_rate: float,
    f0_method: str,
    profile_hint: AudioProfile | None = None,
) -> str:
    """Run short clips unchanged and yield the GPU between long-audio chunks."""
    if duration_seconds <= LONG_AUDIO_THRESHOLD_SECONDS:
        async with inference_lock:
            return await asyncio.to_thread(
                render_conversion,
                model_path,
                input_wav,
                output_wav,
                pitch,
                index_rate,
                protect,
                filter_radius,
                resample_rate,
                rms_mix_rate,
                f0_method,
                profile_hint,
            )

    source_chunks = await asyncio.to_thread(split_long_audio, input_wav, work_root / "source", duration_seconds)
    output_chunks: list[Path] = []
    methods: list[str] = []
    for index, source_chunk in enumerate(source_chunks):
        converted_chunk = work_root / f"converted-{index:03d}.wav"
        async with inference_lock:
            method = await asyncio.to_thread(
                render_conversion,
                model_path,
                source_chunk,
                converted_chunk,
                pitch,
                index_rate,
                protect,
                filter_radius,
                resample_rate,
                rms_mix_rate,
                f0_method,
                profile_hint,
            )
        methods.append(method)
        output_chunks.append(converted_chunk)
        await asyncio.to_thread(gc.collect)
        try:
            import torch

            if torch.cuda.is_available():
                await asyncio.to_thread(torch.cuda.empty_cache)
        except (ImportError, RuntimeError):
            pass
        await asyncio.sleep(0)
    await asyncio.to_thread(join_long_audio, output_chunks, output_wav, duration_seconds)
    return "+".join(dict.fromkeys(methods))


def select_f0_method(input_wav: Path, requested_method: str) -> str:
    """Use FCPE for sustained singing and RMVPE for ordinary/unclear speech."""
    if requested_method != "auto":
        return requested_method
    try:
        import numpy as np
        import parselmouth
        import soundfile as sf

        audio, sample_rate = sf.read(str(input_wav), dtype="float32", always_2d=False)
        if getattr(audio, "ndim", 1) > 1:
            audio = np.mean(audio, axis=1)
        if len(audio) < sample_rate * 2:
            return "rmvpe"
        pitch = parselmouth.Sound(
            np.ascontiguousarray(audio, dtype=np.float64),
            sampling_frequency=float(sample_rate),
        ).to_pitch_ac(
            time_step=0.01,
            pitch_floor=55.0,
            pitch_ceiling=min(1100.0, sample_rate / 2 - 1),
        )
        f0 = np.asarray(pitch.selected_array["frequency"], dtype=np.float64)
        valid = np.isfinite(f0) & (f0 > 0)
        voiced = f0[valid]
        if voiced.size < 20:
            return "rmvpe"
        semitones = 12 * np.log2(np.maximum(voiced, 1))
        window_frames = 40  # 0.4 seconds at a 10 ms hop
        if semitones.size < window_frames:
            return "rmvpe"
        stable_windows = [
            float(np.max(semitones[start:start + window_frames]) - np.min(semitones[start:start + window_frames])) < 0.7
            for start in range(0, semitones.size - window_frames + 1, 10)
        ]
        stable_fraction = float(np.mean(stable_windows)) if stable_windows else 0.0
        return "fcpe" if stable_fraction >= 0.35 else "rmvpe"
    except (ImportError, OSError, RuntimeError, ValueError):
        return "rmvpe"


def transcode(source: Path, destination: Path, target_format: str) -> None:
    timeout = max(120, min(600, int(probe_duration(source) * 1.5) + 60))
    if target_format == "mp3":
        result = subprocess.run(
            ["ffmpeg", "-nostdin", "-v", "error", "-i", str(source), "-codec:a", "libmp3lame", "-b:a", "192k", str(destination)],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=timeout,
        )
        if result.returncode != 0 or not destination.is_file() or destination.stat().st_size < 1:
            raise RvcServiceError(502, "RVC_EMPTY_OUTPUT")


def job_expiry() -> datetime:
    return utcnow() + timedelta(seconds=OUTPUT_RETENTION_SECONDS)


@app.get("/healthz")
async def healthz(request: Request) -> dict[str, object]:
    ensure_authorized(request)
    from app.official_runtime import OFFICIAL_COMMIT, OFFICIAL_TAG, runtime_info

    info = await asyncio.to_thread(runtime_info)
    separator = await asyncio.to_thread(separation_status)
    return {
        "ready": True,
        "engine": "RVC-Project/Retrieval-based-Voice-Conversion-WebUI",
        "tag": OFFICIAL_TAG,
        "commit": OFFICIAL_COMMIT,
        "device": info.device,
        "half": info.is_half,
        "training": bool(active_training_job_id),
        "separation": separator,
    }


@app.get("/v1/models")
async def list_models(request: Request) -> dict[str, list[dict]]:
    ensure_authorized(request)
    return {"models": await asyncio.to_thread(scan_models)}


@app.get("/v1/tts-health")
async def tts_health(request: Request) -> dict[str, bool]:
    ensure_authorized(request)
    return {"ready": HAS_EDGE_TTS}


@app.post("/v1/tts")
async def synthesize_tts(request: Request) -> Response:
    ensure_authorized(request)
    if not HAS_EDGE_TTS or Communicate is None:
        raise RvcServiceError(503, "RVC_TTS_UNAVAILABLE")
    try:
        payload = await request.json()
    except (ValueError, TypeError):
        raise RvcServiceError(400, "RVC_TTS_INVALID_INPUT") from None
    text = str(payload.get("text") or "").strip()
    if not text:
        raise RvcServiceError(400, "RVC_TTS_EMPTY_TEXT")
    if len(text) > TTS_MAX_TEXT_CHARS:
        raise RvcServiceError(413, "RVC_TTS_TEXT_TOO_LONG")
    try:
        communicate = Communicate(text, TTS_DEFAULT_VOICE)
        audio = bytearray()
        async for chunk in communicate.stream():
            if chunk.get("type") == "audio":
                audio.extend(chunk.get("data") or b"")
    except Exception:  # edge-tts wraps websocket/network failures in provider-specific exceptions
        raise RvcServiceError(502, "RVC_TTS_SYNTH_FAILED") from None
    if not audio:
        raise RvcServiceError(502, "RVC_TTS_EMPTY_OUTPUT")
    return Response(
        content=bytes(audio),
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )


def valid_request_id(value: str) -> bool:
    return 16 <= len(value) <= 80 and all(ch.isalnum() or ch in "-_" for ch in value)


def output_payload(job_id: str, record: OutputRecord) -> dict[str, str]:
    payload = {
        "jobId": job_id,
        "downloadToken": record.token,
        "expiresAt": record.expires_at.isoformat().replace("+00:00", "Z"),
        "format": record.format,
        "state": record.state,
        "audioMode": record.audio_mode,
        "stage": record.stage,
    }
    if record.f0_method:
        payload["f0Method"] = record.f0_method
    return payload


def valid_training_token(value: str) -> bool:
    return 32 <= len(value) <= 128 and all(ch.isalnum() or ch in "-_" for ch in value)


def get_training_record(job_id: str, token: str) -> TrainingRecord:
    if not re_full_uuid(job_id) or not valid_training_token(token):
        raise HTTPException(status_code=404, detail="Not found")
    record = training_records.get(job_id)
    if record is None or not secrets.compare_digest(token, record.token):
        raise HTTPException(status_code=404, detail="Not found")
    return record


def training_payload(record: TrainingRecord) -> dict[str, object]:
    return {
        "jobId": record.job_id,
        "state": record.state,
        "stage": record.stage,
        "progress": max(0, min(100, int(record.progress))),
        "message": record.message,
        "files": record.files,
        "totalBytes": record.total_bytes,
        "durationSeconds": round(record.duration_seconds, 2),
        "epochs": record.epochs,
        "modelId": record.result_model_id,
        "displayName": record.display_name,
        "collectionName": record.collection_name,
        "errorCode": record.error_code,
        "updatedAt": record.updated_at,
    }


def apply_training_update(record: TrainingRecord, stage: str, progress: int, message: str) -> None:
    record.state = stage
    record.stage = stage
    record.progress = max(record.progress, max(0, min(99, int(progress))))
    record.message = message[:300]
    record.updated_at = utcnow().isoformat()
    persist_training_record(record)


async def release_model_cache() -> None:
    async with model_cache_lock:
        model_cache.clear()
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except (ImportError, RuntimeError):
        pass


async def process_training_job(record: TrainingRecord) -> None:
    global active_training_job_id
    root = Path(record.root)
    dataset_dir = root / "audio"
    loop = asyncio.get_running_loop()
    try:
        async with training_lock:
            active_training_job_id = record.job_id
        await release_model_cache()
        async with inference_lock:
            def update(stage: str, progress: int, message: str) -> None:
                loop.call_soon_threadsafe(apply_training_update, record, stage, progress, message)

            result = await asyncio.to_thread(
                run_training,
                python_executable=TRAIN_PYTHON,
                official_root=OFFICIAL_ROOT,
                dataset_dir=dataset_dir,
                work_dir=root,
                models_dir=MODELS_DIR,
                model_id=record.model_id,
                display_name=record.display_name,
                collection_name=record.collection_name,
                epochs=record.epochs,
                batch_size=1,
                source_duration_seconds=record.duration_seconds,
                update=update,
                cancelled=lambda: record.cancel_requested,
            )
        record.state = "completed"
        record.stage = "completed"
        record.progress = 100
        record.message = "训练完成，模型已加入下方独立训练模型区"
        record.result_model_id = str(result["modelId"])
        record.updated_at = utcnow().isoformat()
        persist_training_record(record)
    except asyncio.CancelledError:
        record.state = "failed"
        record.stage = "failed"
        record.error_code = "RVC_TRAINING_INTERRUPTED"
        record.message = "训练服务已停止"
        record.updated_at = utcnow().isoformat()
        persist_training_record(record)
        raise
    except TrainingRuntimeError as error:
        record.state = "cancelled" if error.code == "RVC_TRAINING_CANCELLED" else "failed"
        record.stage = record.state
        record.error_code = error.code
        record.message = "训练已取消" if record.state == "cancelled" else "训练流程未完成，请查看任务诊断"
        record.updated_at = utcnow().isoformat()
        persist_training_record(record)
        logger.warning("training failed job_id=%s code=%s", record.job_id, error.code)
    except (OSError, RuntimeError, subprocess.SubprocessError, ValueError):
        record.state = "failed"
        record.stage = "failed"
        record.error_code = "RVC_TRAINING_FAILED"
        record.message = "训练服务处理失败"
        record.updated_at = utcnow().isoformat()
        persist_training_record(record)
        logger.exception("training failed job_id=%s", record.job_id)
    finally:
        shutil.rmtree(dataset_dir, ignore_errors=True)
        await release_model_cache()
        async with training_lock:
            if active_training_job_id == record.job_id:
                active_training_job_id = ""


@app.post("/v1/training/init")
async def init_training(
    request: Request,
    display_name: str = Form(...),
    collection_name: str = Form("我的训练模型"),
    consent: str = Form(...),
    epochs: str = Form(str(DEFAULT_TRAIN_EPOCHS)),
) -> dict[str, object]:
    ensure_authorized(request)
    clean_name = " ".join(display_name.strip().split())[:60]
    if len(clean_name) < 1:
        raise RvcServiceError(400, "RVC_TRAINING_INVALID_NAME")
    clean_collection = " ".join(
        "".join(ch for ch in collection_name.strip() if ch.isprintable() and ch not in "<>").split()
    )[:30]
    if not clean_collection:
        clean_collection = "我的训练模型"
    if consent.lower() not in {"true", "1", "yes"}:
        raise RvcServiceError(400, "RVC_TRAINING_CONSENT_REQUIRED")
    try:
        epoch_value = int(epochs)
    except ValueError:
        raise RvcServiceError(400, "RVC_TRAINING_INVALID_EPOCHS") from None
    if not 40 <= epoch_value <= 200:
        raise RvcServiceError(400, "RVC_TRAINING_INVALID_EPOCHS")
    await cleanup_expired_training_jobs()
    active_count = sum(
        record.state in {"uploading", "queued", "preprocessing", "extracting_pitch", "extracting_features", "training", "indexing", "installing"}
        for record in training_records.values()
    )
    if active_count >= 2:
        raise RvcServiceError(429, "RVC_TRAINING_QUEUE_FULL")
    job_id = str(uuid.uuid4())
    token = secrets.token_urlsafe(32)
    model_id = f"trained-{job_id.split('-', 1)[0]}"
    root = training_job_root(job_id)
    (root / "audio").mkdir(parents=True, exist_ok=False)
    now = utcnow().isoformat()
    record = TrainingRecord(
        job_id=job_id,
        token=token,
        display_name=clean_name,
        model_id=model_id,
        root=str(root),
        collection_name=clean_collection,
        epochs=epoch_value,
        created_at=now,
        updated_at=now,
        message="任务已创建，请上传至少两段纯人声音频",
    )
    async with training_lock:
        training_records[job_id] = record
    persist_training_record(record)
    return {**training_payload(record), "uploadToken": token}


@app.post("/v1/training/{job_id}/audio/{slot}")
async def upload_training_audio(
    request: Request,
    job_id: str,
    slot: int,
    token: str,
    audio: UploadFile = File(...),
) -> dict[str, object]:
    ensure_authorized(request)
    record = get_training_record(job_id, token)
    if record.state != "uploading":
        await audio.close()
        raise RvcServiceError(409, "RVC_TRAINING_ALREADY_STARTED")
    if not 0 <= slot < MAX_TRAIN_FILES:
        await audio.close()
        raise RvcServiceError(400, "RVC_TRAINING_TOO_MANY_FILES")
    extension = safe_extension(audio)
    destination = Path(record.root) / "audio" / f"{slot:02d}.{extension}"
    metadata_dir = Path(record.root) / "metadata"
    metadata_dir.mkdir(parents=True, exist_ok=True)
    metadata_path = metadata_dir / f"{slot:02d}.json"
    temporary = destination.with_suffix(destination.suffix + ".part")
    temporary.unlink(missing_ok=True)
    try:
        await write_upload(audio, temporary)
        if temporary.stat().st_size > MAX_TRAIN_FILE_BYTES:
            raise RvcServiceError(413, "RVC_TRAINING_FILE_TOO_LARGE")
        duration = await asyncio.to_thread(probe_duration, temporary)
        if duration < MIN_AUDIO_SECONDS / 2:
            raise RvcServiceError(400, "RVC_TRAINING_AUDIO_TOO_SHORT")
        existing_slot_files = [
            path for path in destination.parent.glob(f"{slot:02d}.*")
            if path.is_file() and path.suffix.lower().lstrip(".") in ALLOWED_EXTENSIONS
        ]
        existing_bytes = sum(path.stat().st_size for path in existing_slot_files)
        projected = record.total_bytes - existing_bytes + temporary.stat().st_size
        if projected > MAX_TRAIN_TOTAL_BYTES:
            raise RvcServiceError(413, "RVC_TRAINING_DATASET_TOO_LARGE")
        for stale in existing_slot_files:
            if stale != temporary:
                stale.unlink(missing_ok=True)
        temporary.replace(destination)
        metadata_path.write_text(json.dumps({"duration": duration}), encoding="utf-8")
        audio_files = [
            path for path in destination.parent.iterdir()
            if path.is_file() and path.suffix.lower().lstrip(".") in ALLOWED_EXTENSIONS
        ]
        record.files = len(audio_files)
        record.total_bytes = sum(path.stat().st_size for path in audio_files)
        total_duration = 0.0
        for path in audio_files:
            try:
                total_duration += float(json.loads((metadata_dir / f"{path.stem}.json").read_text(encoding="utf-8"))["duration"])
            except (OSError, KeyError, TypeError, ValueError):
                total_duration += await asyncio.to_thread(probe_duration, path)
        record.duration_seconds = total_duration
        if record.duration_seconds > MAX_TRAIN_SECONDS:
            destination.unlink(missing_ok=True)
            metadata_path.unlink(missing_ok=True)
            raise RvcServiceError(413, "RVC_TRAINING_AUDIO_TOO_LONG")
        record.progress = min(10, max(record.progress, record.files))
        record.message = f"已接收 {record.files} 段音频，共 {record.duration_seconds:.1f} 秒"
        record.updated_at = utcnow().isoformat()
        persist_training_record(record)
        return training_payload(record)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise


@app.post("/v1/training/{job_id}/start")
async def start_training(request: Request, job_id: str, token: str) -> dict[str, object]:
    global active_training_job_id
    ensure_authorized(request)
    record = get_training_record(job_id, token)
    if record.state != "uploading":
        raise RvcServiceError(409, "RVC_TRAINING_ALREADY_STARTED")
    if record.files < 2 or record.duration_seconds < MIN_TRAIN_SECONDS:
        raise RvcServiceError(400, "RVC_TRAINING_DATASET_TOO_SHORT")
    if record.duration_seconds > MAX_TRAIN_SECONDS:
        raise RvcServiceError(400, "RVC_TRAINING_AUDIO_TOO_LONG")
    async with training_lock:
        if active_training_job_id:
            raise RvcServiceError(429, "RVC_TRAINING_QUEUE_FULL")
        active_training_job_id = record.job_id
    record.state = "queued"
    record.stage = "queued"
    record.progress = max(10, record.progress)
    record.message = "训练任务已进入本机 GPU 队列"
    record.updated_at = utcnow().isoformat()
    persist_training_record(record)
    task = asyncio.create_task(process_training_job(record))
    training_tasks.add(task)
    task.add_done_callback(training_tasks.discard)
    return training_payload(record)


@app.get("/v1/training/{job_id}")
async def training_status(request: Request, job_id: str, token: str) -> JSONResponse:
    ensure_authorized(request)
    record = get_training_record(job_id, token)
    status = 202 if record.state not in {"completed", "failed", "cancelled"} else 200
    return JSONResponse(
        training_payload(record),
        status_code=status,
        headers={"Cache-Control": "no-store", "Retry-After": "8" if status == 202 else "0"},
    )


@app.post("/v1/training/{job_id}/cancel")
async def cancel_training(request: Request, job_id: str, token: str) -> dict[str, object]:
    ensure_authorized(request)
    record = get_training_record(job_id, token)
    if record.state in {"completed", "failed", "cancelled"}:
        return training_payload(record)
    if record.state == "uploading":
        record.state = "cancelled"
        record.stage = "cancelled"
        record.cancel_requested = True
        record.message = "训练任务已取消"
        record.updated_at = utcnow().isoformat()
        shutil.rmtree(Path(record.root) / "audio", ignore_errors=True)
        persist_training_record(record)
        return training_payload(record)
    record.cancel_requested = True
    record.message = "正在安全停止训练任务"
    record.updated_at = utcnow().isoformat()
    persist_training_record(record)
    return training_payload(record)


async def process_conversion_job(
    *,
    job_id: str,
    job_root: Path,
    model_path: Path,
    input_raw: Path,
    input_wav: Path,
    output_wav: Path,
    output_path: Path,
    output_format: str,
    pitch: int,
    index_rate: float,
    protect: float,
    filter_radius: int,
    resample: int,
    rms_mix_rate: float,
    f0_method: str,
    request_id: str,
    model_id: str,
    started_at: float,
    audio_mode: str,
    duration_seconds: float,
    input_profile: AudioProfile,
) -> None:
    try:
        if audio_mode == "song":
            async with inference_lock:
                async with outputs_lock:
                    record = outputs.get(job_id)
                    if record:
                        record.state = "processing"
                        record.stage = "separating"
                await asyncio.to_thread(release_cached_models)
                stems = await asyncio.to_thread(separate_song, input_raw, job_root / "stems")
            async with outputs_lock:
                record = outputs.get(job_id)
                if record:
                    record.stage = "converting"
            separated_vocals = job_root / "separated-vocals-16k.wav"
            converted_vocals = job_root / "converted-vocals.wav"
            vocal_profile = await asyncio.to_thread(normalize_audio, stems.vocals, separated_vocals)
            used_f0_method = await render_duration_safe_conversion_async(
                model_path,
                separated_vocals,
                converted_vocals,
                job_root / "long-vocals",
                duration_seconds,
                pitch,
                index_rate,
                protect,
                filter_radius,
                resample,
                rms_mix_rate,
                f0_method,
                vocal_profile,
            )
            async with outputs_lock:
                record = outputs.get(job_id)
                if record:
                    record.stage = "remixing"
            await asyncio.to_thread(
                remix_song,
                stems.instrumental,
                converted_vocals,
                output_wav,
                duration_seconds,
                stems.sample_rate,
            )
        else:
            async with outputs_lock:
                record = outputs.get(job_id)
                if record:
                    record.state = "processing"
                    record.stage = "converting"
            used_f0_method = await render_duration_safe_conversion_async(
                model_path,
                input_wav,
                output_wav,
                job_root / "long-voice",
                duration_seconds,
                pitch,
                index_rate,
                protect,
                filter_radius,
                resample,
                rms_mix_rate,
                f0_method,
                input_profile,
            )
        async with outputs_lock:
            record = outputs.get(job_id)
            if record:
                record.stage = "encoding"
        if output_format == "mp3":
            await asyncio.to_thread(transcode, output_wav, output_path, "mp3")
        else:
            shutil.copyfile(output_wav, output_path)
        if not output_path.is_file() or output_path.stat().st_size < 1:
            raise RvcServiceError(502, "RVC_EMPTY_OUTPUT")
        async with outputs_lock:
            record = outputs.get(job_id)
            if record:
                record.state = "completed"
                record.stage = "completed"
                record.f0_method = used_f0_method
                record.expires_at = job_expiry()
        logger.info(
            "conversion completed request_id=%s job_id=%s model=%s mode=%s f0=%s seconds=%.2f",
            request_id,
            job_id,
            model_id,
            audio_mode,
            used_f0_method,
            asyncio.get_running_loop().time() - started_at,
        )
    except asyncio.CancelledError:
        output_path.unlink(missing_ok=True)
        raise
    except RvcServiceError as error:
        output_path.unlink(missing_ok=True)
        async with outputs_lock:
            record = outputs.get(job_id)
            if record:
                record.state = "failed"
                record.stage = "failed"
                record.error_code = error.code
        logger.warning("conversion failed request_id=%s model=%s code=%s", request_id, model_id, error.code)
    except SeparationRuntimeError as error:
        output_path.unlink(missing_ok=True)
        async with outputs_lock:
            record = outputs.get(job_id)
            if record:
                record.state = "failed"
                record.stage = "failed"
                record.error_code = error.code
        logger.warning("song conversion failed request_id=%s model=%s code=%s", request_id, model_id, error.code)
    except (OSError, subprocess.SubprocessError, RuntimeError, ValueError):
        output_path.unlink(missing_ok=True)
        async with outputs_lock:
            record = outputs.get(job_id)
            if record:
                record.state = "failed"
                record.stage = "failed"
                record.error_code = "RVC_INFERENCE_FAILED"
        logger.exception(
            "conversion failed request_id=%s model=%s seconds=%.2f",
            request_id,
            model_id,
            asyncio.get_running_loop().time() - started_at,
        )
    finally:
        shutil.rmtree(job_root, ignore_errors=True)
        if duration_seconds > LONG_AUDIO_THRESHOLD_SECONDS:
            await asyncio.to_thread(release_cached_models)


@app.post("/v1/convert")
async def create_job(
    request: Request,
    model_id: str = Form(...),
    pitch: str = Form("0"),
    index_rate: str = Form("0.5"),
    protect: str = Form("0.25"),
    filter_radius: str = Form("3"),
    resample: str = Form("0"),
    rms_mix_rate: str = Form("1"),
    f0_method: str = Form("rmvpe"),
    format: str = Form("wav"),
    language: str = Form("zh"),
    audio_mode: str = Form("voice"),
    request_id: str = Form(""),
    audio: UploadFile = File(...),
) -> dict[str, str]:
    ensure_authorized(request)
    if active_training_job_id:
        await audio.close()
        raise RvcServiceError(503, "RVC_TRAINING_ACTIVE")
    trace_id = str(request.headers.get("X-PostPrep-Request-Id") or request.headers.get("CF-Ray") or uuid.uuid4())[:96]
    client_request_id = request_id.strip()
    started_at = asyncio.get_running_loop().time()
    content_length = request.headers.get("Content-Length")
    try:
        declared_length = int(content_length) if content_length else 0
    except ValueError:
        declared_length = 0
    if declared_length > MAX_AUDIO_BYTES + 1024 * 1024:
        raise RvcServiceError(413, "RVC_AUDIO_TOO_LARGE")

    if not re_full_slug(model_id):
        raise RvcServiceError(400, "RVC_INVALID_MODEL")
    try:
        pitch_value = int(pitch)
    except ValueError:
        raise RvcServiceError(400, "RVC_INVALID_PARAMETER") from None
    if not -24 <= pitch_value <= 24:
        raise RvcServiceError(400, "RVC_INVALID_PARAMETER")
    try:
        index_rate_value = float(index_rate)
        protect_value = float(protect)
        rms_mix_value = float(rms_mix_rate)
    except ValueError:
        raise RvcServiceError(400, "RVC_INVALID_PARAMETER") from None
    if not (0 <= index_rate_value <= 1 and 0 <= protect_value <= 0.5 and 0 <= rms_mix_value <= 1):
        raise RvcServiceError(400, "RVC_INVALID_PARAMETER")
    try:
        filter_radius_value = int(filter_radius)
    except ValueError:
        raise RvcServiceError(400, "RVC_INVALID_PARAMETER") from None
    if not 0 <= filter_radius_value <= 7:
        raise RvcServiceError(400, "RVC_INVALID_PARAMETER")
    try:
        resample_value = int(resample)
    except ValueError:
        raise RvcServiceError(400, "RVC_INVALID_PARAMETER") from None
    if resample_value not in ALLOWED_RESAMPLE:
        raise RvcServiceError(400, "RVC_INVALID_PARAMETER")
    if f0_method not in ALLOWED_F0_METHODS:
        raise RvcServiceError(400, "RVC_INVALID_PARAMETER")
    if format not in ALLOWED_FORMATS:
        raise RvcServiceError(400, "RVC_INVALID_PARAMETER")
    if language not in {"zh", "en"}:
        raise RvcServiceError(400, "RVC_INVALID_LANGUAGE")
    if audio_mode not in ALLOWED_AUDIO_MODES:
        raise RvcServiceError(400, "RVC_INVALID_PARAMETER")
    if client_request_id and not valid_request_id(client_request_id):
        raise RvcServiceError(400, "RVC_INVALID_REQUEST_ID")

    if client_request_id:
        async with outputs_lock:
            existing_job_id = request_jobs.get(client_request_id)
            existing_record = outputs.get(existing_job_id or "")
        if existing_job_id and existing_record:
            await audio.close()
            logger.info("idempotent retry request_id=%s job_id=%s", trace_id, existing_job_id)
            return output_payload(existing_job_id, existing_record)

    extension = safe_extension(audio)
    job_id = str(uuid.uuid4())
    job_root = Path(tempfile.mkdtemp(prefix=f"{job_id}-", dir=WORK_ROOT))
    output_path = OUTPUT_ROOT / f"{job_id}.{format}"
    try:
        model_path = find_model_path(model_id)
        input_raw = job_root / f"input.{extension}"
        input_wav = job_root / "input.wav"
        output_wav = job_root / "output.wav"
        await write_upload(audio, input_raw)
        duration_seconds = await asyncio.to_thread(probe_duration, input_raw)
        if duration_seconds < MIN_AUDIO_SECONDS:
            raise RvcServiceError(400, "RVC_AUDIO_TOO_SHORT")
        if duration_seconds > MAX_AUDIO_SECONDS:
            raise RvcServiceError(400, "RVC_AUDIO_TOO_LONG")
        input_profile = AudioProfile()
        if audio_mode == "voice":
            input_profile = await asyncio.to_thread(normalize_audio, input_raw, input_wav)
        expires_at = job_expiry()
        download_token = secrets.token_urlsafe(32)
        async with outputs_lock:
            outputs[job_id] = OutputRecord(
                path=output_path,
                token=download_token,
                expires_at=expires_at,
                format=format,
                request_id=client_request_id,
                audio_mode=audio_mode,
            )
            if client_request_id:
                request_jobs[client_request_id] = job_id
        task = asyncio.create_task(process_conversion_job(
            job_id=job_id,
            job_root=job_root,
            model_path=model_path,
            input_raw=input_raw,
            input_wav=input_wav,
            output_wav=output_wav,
            output_path=output_path,
            output_format=format,
            pitch=pitch_value,
            index_rate=index_rate_value,
            protect=protect_value,
            filter_radius=filter_radius_value,
            resample=resample_value,
            rms_mix_rate=rms_mix_value,
            f0_method=f0_method,
            request_id=trace_id,
            model_id=model_id,
            started_at=started_at,
            audio_mode=audio_mode,
            duration_seconds=duration_seconds,
            input_profile=input_profile,
        ))
        job_tasks.add(task)
        task.add_done_callback(job_tasks.discard)
        logger.info(
            "conversion queued request_id=%s job_id=%s model=%s mode=%s seconds=%.2f",
            trace_id,
            job_id,
            model_id,
            audio_mode,
            asyncio.get_running_loop().time() - started_at,
        )
        return output_payload(job_id, outputs[job_id])
    except RvcServiceError:
        output_path.unlink(missing_ok=True)
        shutil.rmtree(job_root, ignore_errors=True)
        raise
    except (OSError, subprocess.SubprocessError, RuntimeError, ValueError):
        logger.exception(
            "conversion failed request_id=%s model=%s seconds=%.2f",
            trace_id,
            model_id,
            asyncio.get_running_loop().time() - started_at,
        )
        output_path.unlink(missing_ok=True)
        shutil.rmtree(job_root, ignore_errors=True)
        raise RvcServiceError(502, "RVC_INFERENCE_FAILED") from None


@app.get("/v1/output/{job_id}")
async def get_output(request: Request, job_id: str, token: str):
    ensure_authorized(request)
    if not re_full_uuid(job_id) or not token or len(token) > 128:
        raise HTTPException(status_code=404, detail="Not found")
    await cleanup_expired_outputs()
    async with outputs_lock:
        record = outputs.get(job_id)
    if record is None or not secrets.compare_digest(token, record.token):
        raise HTTPException(status_code=404, detail="Not found")
    if record.state in {"queued", "processing"}:
        return JSONResponse(
            output_payload(job_id, record),
            status_code=202,
            headers={"Cache-Control": "no-store", "Retry-After": "6"},
        )
    if record.state == "failed":
        return JSONResponse(
            {"code": record.error_code or "RVC_INFERENCE_FAILED"},
            status_code=502,
            headers={"Cache-Control": "no-store"},
        )
    if record.state != "completed" or not record.path.is_file():
        return JSONResponse(
            {"code": "RVC_OUTPUT_UNAVAILABLE"},
            status_code=502,
            headers={"Cache-Control": "no-store"},
        )
    media_type = "audio/mpeg" if record.path.suffix.lower() == ".mp3" else "audio/wav"
    return FileResponse(
        record.path,
        media_type=media_type,
        filename=f"postprep-rvc-audio{record.path.suffix}",
        headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
    )


def re_full_slug(value: str) -> bool:
    return bool(value) and len(value) <= 64 and all(ch.isalnum() or ch in "-_" for ch in value)


def re_full_uuid(value: str) -> bool:
    try:
        return str(uuid.UUID(value)) == value.lower()
    except (ValueError, AttributeError):
        return False
