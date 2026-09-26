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
import hashlib
import json
import logging
import math
import os
import re

import numpy as np
import secrets
import shutil
import subprocess
import tempfile
import threading
import uuid
from collections import OrderedDict
from contextlib import asynccontextmanager
from dataclasses import asdict, dataclass, replace
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from app.audio_activity import suppress_silent_synthesis
from app.audio_dynamics import apply_dynamics, apply_static_gain
from app.diagnostics import capture_job, configured_root
from app.separation_runtime import (
    SeparationRuntimeError,
    calibrate_song_vocals,
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
MAX_AUDIO_SECONDS = 900
LONG_AUDIO_THRESHOLD_SECONDS = 20
LONG_CHUNK_SECONDS = 20
LONG_CHUNK_CROSSFADE_SECONDS = 0.5
OUTPUT_RETENTION_SECONDS = max(900, min(int(os.getenv("RVC_OUTPUT_RETENTION_SECONDS", "7200")), 21600))
MAX_REMIX_STEM_JOB_BYTES = 256 * 1024 * 1024
MAX_REMIX_STEM_TOTAL_BYTES = 1024 * 1024 * 1024
remix_stem_lock = threading.Lock()
MAX_CONCURRENCY = max(1, min(int(os.getenv("RVC_MAX_CONCURRENCY", "1")), 2))
SITE_ROOT = Path(__file__).resolve().parents[2]
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
PIPELINE_FILES = ("main.py", "pitch_safety.py", "audio_dynamics.py", "audio_activity.py",
                  "audio_repair.py", "separation_runtime.py", "official_runtime.py")


def source_revision() -> str:
    digest = hashlib.sha256()
    for name in PIPELINE_FILES:
        digest.update(name.encode("utf-8"))
        digest.update((Path(__file__).parent / name).read_bytes())
    return digest.hexdigest()[:16]


def checkout_revision() -> str:
    configured = os.getenv("RVC_BACKEND_BUILD_SHA", "").strip().lower()
    if re.fullmatch(r"[a-f0-9]{40}", configured):
        return configured
    try:
        return subprocess.check_output(
            ["git", "-C", str(SITE_ROOT), "rev-parse", "HEAD"],
            stderr=subprocess.DEVNULL, text=True, timeout=5,
        ).strip()
    except (OSError, subprocess.SubprocessError):
        return "unknown"


BACKEND_BUILD_SHA = checkout_revision()
PIPELINE_REVISION = source_revision()
FILE_HASH_CACHE: dict[str, tuple[int, int, str]] = {}


def verified_file_hash(path: Path) -> str:
    stat = path.stat()
    key = str(path.resolve())
    cached = FILE_HASH_CACHE.get(key)
    if cached and cached[:2] == (stat.st_size, stat.st_mtime_ns):
        return cached[2]
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    value = digest.hexdigest()
    FILE_HASH_CACHE[key] = (stat.st_size, stat.st_mtime_ns, value)
    return value
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
    # Do not run adaptive FFT denoising on every voice: it reshapes harmonics
    # and adds 25 ms delay before extraction, including on clean recordings.
    "acompressor=threshold=0.58:ratio=4:attack=2:release=120:knee=3.5:makeup=1,"
    "alimiter=limit=0.90:attack=5:release=100:level=0:latency=1"
)
# Separated singing is already denoised. Speech half-cycle normalization and
# a second adaptive denoiser can reshape synthetic vowels and sustained notes.
# Retain only band/peak safety for song stems; do not reshape their harmonics.
SINGING_INPUT_FILTER = (
    "highpass=f=45:p=2,"
    "lowpass=f=7600:p=1,"
    "alimiter=limit=0.90:attack=5:release=100:level=0:latency=1"
)
HIGH_ENERGY_INPUT_FILTER = (
    # This branch is selected from the unsmoothed upload/stem, before the
    # standard limiter can hide clipping evidence from the profile detector.
    "highpass=f=45:p=2,"
    "lowpass=f=7600:p=1,"
    "acompressor=threshold=0.58:ratio=4:attack=2:release=120:knee=3.5:makeup=1,"
    "alimiter=limit=0.86:attack=2:release=100:level=0:latency=1"
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
    auto_vocal_gain: float = 1.0
    vocal_gain_db: float = 0.0
    accompaniment_gain_db: float = 0.0
    vocal_mute: bool = False
    accompaniment_mute: bool = False
    mix_revision: int = 0
    remix_available: bool = False
    source_duration_seconds: float = 0.0
    stem_sample_rate: int = 0
    fingerprint: str = ""


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
remix_lock = asyncio.Lock()
inference_lock = asyncio.Semaphore(MAX_CONCURRENCY)
job_tasks: set[asyncio.Task] = set()
training_records: dict[str, TrainingRecord] = {}
training_tasks: set[asyncio.Task] = set()
training_lock = asyncio.Lock()
active_training_job_id = ""

# Loaded RVCInference instances keyed by actual weight and index revision.
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
        sample_rate = meta.get("sampleRate")
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
            **({"sampleRate": sample_rate} if sample_rate in {32000, 40000, 48000} else {}),
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

    index_text = find_index_path(pth)
    revision = verified_file_hash(pth)
    index_revision = verified_file_hash(Path(index_text)) if index_text else "none"
    key = f"{pth.resolve()}|{revision}|{index_revision}"
    cached = model_cache.get(key)
    if cached is not None:
        model_cache.move_to_end(key)
        return cached
    # A same-path replacement must release the previous model and its staged
    # index; otherwise the process can keep synthesizing from old tensors.
    for old_key in list(model_cache):
        if old_key.startswith(f"{pth.resolve()}|"):
            model_cache.pop(old_key)
    inference = OfficialRvcModel(pth, index_text)
    model_cache[key] = inference
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
            if record.state not in {"queued", "processing", "remixing"} and record.expires_at <= now:
                expired.append((job_id, record))
                outputs.pop(job_id, None)
                if record.request_id and request_jobs.get(record.request_id) == job_id:
                    request_jobs.pop(record.request_id, None)
    for job_id, record in expired:
        record.path.unlink(missing_ok=True)
        # A remixed record points at its newest revision, but the original
        # output still occupies the same short-lived storage allocation.
        for original in (OUTPUT_ROOT / f"{job_id}.wav", OUTPUT_ROOT / f"{job_id}.mp3"):
            original.unlink(missing_ok=True)
        for old_mix in OUTPUT_ROOT.glob(f"{job_id}-mix*.*"):
            old_mix.unlink(missing_ok=True)
        for stem in remix_stem_paths(job_id):
            stem.unlink(missing_ok=True)


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


def persist_output_records() -> None:
    """Atomically snapshot job records so a restart keeps completed outputs
    downloadable instead of vanishing from the poll endpoint."""
    try:
        snapshot = {}
        now = utcnow()
        for job_id, record in outputs.items():
            if record.expires_at <= now:
                continue
            snapshot[job_id] = {
                "token": record.token,
                "file": record.path.name,
                "state": record.state,
                "format": record.format,
                "request_id": record.request_id,
                "audio_mode": record.audio_mode,
                "auto_vocal_gain": record.auto_vocal_gain,
                "vocal_gain_db": record.vocal_gain_db,
                "accompaniment_gain_db": record.accompaniment_gain_db,
                "vocal_mute": record.vocal_mute,
                "accompaniment_mute": record.accompaniment_mute,
                "mix_revision": record.mix_revision,
                "remix_available": record.remix_available,
                "source_duration_seconds": record.source_duration_seconds,
                "stem_sample_rate": record.stem_sample_rate,
                "fingerprint": record.fingerprint,
                "expires_at": record.expires_at.isoformat(),
            }
        temporary = OUTPUT_ROOT / "records.json.tmp"
        temporary.write_text(json.dumps(snapshot), encoding="utf-8")
        temporary.replace(OUTPUT_ROOT / "records.json")
    except (OSError, ValueError, TypeError):
        pass


def load_output_records() -> None:
    """Rebuild job records after a restart. Completed outputs stay
    downloadable; jobs that were queued/processing when the process died
    become failed with an explicit code instead of being polled forever."""
    try:
        snapshot = json.loads((OUTPUT_ROOT / "records.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return
    now = utcnow()
    for job_id, entry in snapshot.items():
        try:
            expires_at = datetime.fromisoformat(str(entry["expires_at"]))
        except (KeyError, ValueError, TypeError):
            continue
        if expires_at <= now:
            continue
        path = OUTPUT_ROOT / str(entry.get("file", ""))
        state = "completed" if path.is_file() else "failed"
        outputs[job_id] = OutputRecord(
            path=path,
            token=str(entry.get("token", "")),
            expires_at=expires_at,
            format=str(entry.get("format", "wav")),
            state=state,
            error_code="" if state == "completed" else "RVC_SERVICE_RESTARTED",
            request_id=str(entry.get("request_id", "")),
            audio_mode=str(entry.get("audio_mode", "voice")),
            auto_vocal_gain=float(entry.get("auto_vocal_gain", entry.get("vocal_gain", 1.0))),
            vocal_gain_db=float(entry.get("vocal_gain_db", 0.0)),
            accompaniment_gain_db=float(entry.get("accompaniment_gain_db", 0.0)),
            vocal_mute=entry.get("vocal_mute") is True,
            accompaniment_mute=entry.get("accompaniment_mute") is True,
            mix_revision=int(entry.get("mix_revision", 0)),
            remix_available=(entry.get("remix_available") is True
                             and all(p.is_file() for p in remix_stem_paths(job_id))),
            source_duration_seconds=float(entry.get("source_duration_seconds", 0.0)),
            stem_sample_rate=int(entry.get("stem_sample_rate", 0)),
            fingerprint=str(entry.get("fingerprint", "")),
            stage="completed" if state == "completed" else "failed",
        )
        if entry.get("request_id"):
            request_jobs[str(entry["request_id"])] = job_id


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    WORK_ROOT.mkdir(parents=True, exist_ok=True)
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    TRAIN_ROOT.mkdir(parents=True, exist_ok=True)
    require_config()
    load_training_records()
    load_output_records()
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
    headers = {"Cache-Control": "no-store"}
    if error.status_code == 429:
        headers["Retry-After"] = "6"
    return JSONResponse({"code": error.code}, status_code=error.status_code, headers=headers)


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
    if result.returncode == 0 and (not math.isfinite(duration) or duration <= 0):
        # MediaRecorder WebM streams often have no container duration. Decode
        # a bounded mono stream so valid recordings work without trusting tags.
        decoded = subprocess.run(
            ["ffmpeg", "-nostdin", "-v", "error", "-i", str(path),
             "-t", str(MAX_AUDIO_SECONDS + 1), "-vn", "-ac", "1", "-ar", "8000",
             "-f", "s16le", "pipe:1"],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=120,
            check=False,
        )
        duration = len(decoded.stdout) / 16000 if decoded.returncode == 0 else 0
    if result.returncode != 0 or not math.isfinite(duration) or duration <= 0:
        raise RvcServiceError(400, "RVC_INVALID_AUDIO")
    return duration


def normalize_audio(source: Path, destination: Path, *, singing: bool = False) -> AudioProfile:
    duration = probe_duration(source)
    if duration < MIN_AUDIO_SECONDS:
        raise RvcServiceError(400, "RVC_AUDIO_TOO_SHORT")
    if duration > MAX_AUDIO_SECONDS:
        raise RvcServiceError(400, "RVC_AUDIO_TOO_LONG")
    profile = analyze_audio_profile(source)
    selected_filter = SINGING_INPUT_FILTER if singing else HIGH_ENERGY_INPUT_FILTER if profile.high_energy else INPUT_SAFETY_FILTER
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


def analyze_audio_profile(path: Path, pitch_shift: int = 0) -> AudioProfile:
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
        if audio.size > sample_rate * 30:
            window = sample_rate * 10
            analysis_audio = np.concatenate([audio[:window], audio[audio.size // 2:audio.size // 2 + window], audio[-window:]])
        else:
            analysis_audio = audio
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
            ).to_pitch_ac(time_step=0.01, pitch_floor=40.0, pitch_ceiling=min(2000.0, sample_rate / 2 - 1))
            f0 = np.asarray(pitch.selected_array["frequency"], dtype=np.float64)
            valid = np.isfinite(f0) & (f0 > 0)
            voiced = f0[valid]
            if voiced.size >= 20:
                p10, p90, p95 = np.percentile(voiced, [10, 90, 95])
                consecutive = valid[1:] & valid[:-1]
                jumps = np.abs(12 * np.log2(np.maximum(f0[1:][consecutive], 1) / np.maximum(f0[:-1][consecutive], 1)))
                pitch_scale = 2 ** (pitch_shift / 12)
                high_pitch = bool(p90 * pitch_scale >= 440 or p95 * pitch_scale >= 650)
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


def snapshot_diagnostic_audio(source: Path, diagnostic_dir: Path | None, name: str) -> None:
    if diagnostic_dir is None or not source.is_file():
        return
    try:
        diagnostic_dir.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, diagnostic_dir / name)
    except OSError:
        logger.warning("diagnostic snapshot failed stage=%s", name)


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
    preferred_method: str | None = None,
    diagnostic_dir: Path | None = None,
) -> str:
    inference = acquire_model(model_path)
    # The pinned pitch adapter defaults to the verified contour. A strong
    # explicitly requested filter radius enables a small voiced-only median.
    profile = profile_hint or analyze_audio_profile(input_wav)
    if pitch > 0 and not profile.high_pitch:
        shifted_profile = analyze_audio_profile(input_wav, pitch_shift=pitch)
        profile = replace(profile, high_pitch=shifted_profile.high_pitch)
    inference_input = input_wav if profile_hint is not None else prepare_inference_audio(input_wav, profile)
    selected_method = preferred_method or (
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
                # WebUI-route parity: the caller's exact slider values reach
                # the official pipeline unmodified, matching a local run.
                index_rate=index_rate,
                protect=protect,
                resample_rate=resample_rate,
                # Apply the requested envelope once at 40 ms resolution after
                # joining, instead of also applying upstream's 1-second window.
                rms_mix_rate=1.0,
                filter_radius=int(filter_radius),
                diagnostic_f0_dir=diagnostic_dir / "f0" if diagnostic_dir else None,
            )
            if output_wav.is_file() and output_wav.stat().st_size > 44:
                snapshot_diagnostic_audio(output_wav, diagnostic_dir, f"raw-{method}.wav")
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
    # Detect artifacts from the synthesized vocal itself. A fixed filter by
    # model name dulled natural consonants and left other voices untreated.
    from app.audio_repair import repair_vocal_file

    repair_vocal_file(output_wav)
    snapshot_diagnostic_audio(output_wav, diagnostic_dir, "repaired.wav")
    aligned_output = output_wav.with_name(f"{output_wav.stem}-aligned{output_wav.suffix}")
    # The vocoder may round each chunk down by one or two F0 frames. Restore
    # that small tail before overlap-joining, otherwise long files accumulate
    # time drift (and source/output envelope alignment eventually fails).
    source_duration = probe_duration(inference_input)
    output_filter = f"apad,atrim=end={source_duration:.6f}"
    postprocess_timeout = max(120, min(600, int(probe_duration(output_wav) * 1.5) + 60))
    result = subprocess.run(
        [
            "ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(output_wav),
            "-af", output_filter, "-c:a", "pcm_f32le", str(aligned_output),
        ],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=postprocess_timeout,
    )
    if result.returncode == 0 and aligned_output.is_file() and aligned_output.stat().st_size > 44:
        aligned_output.replace(output_wav)
        snapshot_diagnostic_audio(output_wav, diagnostic_dir, "aligned.wav")
    else:
        aligned_output.unlink(missing_ok=True)
        raise RvcServiceError(502, "RVC_OUTPUT_SAFETY_FAILED")
    return used_method


def split_long_audio(input_wav: Path, chunk_root: Path, duration_seconds: float) -> list[Path]:
    chunk_root.mkdir(parents=True, exist_ok=True)
    chunks: list[Path] = []
    spans: list[dict[str, float | int | str]] = []
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
        spans.append({"index": index, "startSeconds": round(start, 6),
                      "durationSeconds": round(probe_duration(chunk_path), 6),
                      "sampleRate": 16000, "file": chunk_path.name})
    if not chunks:
        raise RvcServiceError(502, "RVC_LONG_AUDIO_SPLIT_FAILED")
    manifest = {"sourceDurationSeconds": duration_seconds,
                "crossfadeSeconds": LONG_CHUNK_CROSSFADE_SECONDS,
                "chunks": spans,
                "overlaps": [
                    {"startSeconds": round(float(span["startSeconds"]), 6),
                     "endSeconds": round(float(previous["startSeconds"]) + float(previous["durationSeconds"]), 6)}
                    for previous, span in zip(spans, spans[1:])
                ]}
    (chunk_root / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
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
    filters.append(f"{previous}atrim=end={duration_seconds:.6f}[out]")
    command.extend([
        "-filter_complex",
        ";".join(filters),
        "-map",
        "[out]",
        "-c:a",
        "pcm_f32le",
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
    diagnostic_dir: Path | None = None,
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
            None,
            diagnostic_dir / "whole" if diagnostic_dir else None,
        )
    source_chunks = split_long_audio(input_wav, work_root / "source", duration_seconds)
    preferred_method = (
        "fcpe" if f0_method == "auto" and profile_hint and (profile_hint.high_pitch or profile_hint.complex_pitch)
        else select_f0_method(input_wav, f0_method)
    )
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
            preferred_method,
            diagnostic_dir / f"chunk-{index:03d}" if diagnostic_dir else None,
        ))
        output_chunks.append(converted_chunk)
    join_long_audio(output_chunks, output_wav, duration_seconds)
    manifest_path = work_root / "source" / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["f0MethodRequested"] = f0_method
    manifest["f0MethodPreferred"] = preferred_method
    manifest["f0MethodsUsed"] = methods
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
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
    diagnostic_dir: Path | None = None,
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
                None,
                diagnostic_dir / "whole" if diagnostic_dir else None,
            )

    source_chunks = await asyncio.to_thread(split_long_audio, input_wav, work_root / "source", duration_seconds)
    preferred_method = (
        "fcpe" if f0_method == "auto" and profile_hint and (profile_hint.high_pitch or profile_hint.complex_pitch)
        else await asyncio.to_thread(select_f0_method, input_wav, f0_method)
    )
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
                preferred_method,
                diagnostic_dir / f"chunk-{index:03d}" if diagnostic_dir else None,
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
    manifest_path = work_root / "source" / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["f0MethodRequested"] = f0_method
    manifest["f0MethodPreferred"] = preferred_method
    manifest["f0MethodsUsed"] = methods
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
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


def transcode(source: Path, destination: Path, target_format: str, gain_db: float = 0.0) -> None:
    timeout = max(120, min(600, int(probe_duration(source) * 1.5) + 60))
    if target_format == "mp3":
        result = subprocess.run(
            ["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(source),
             "-af", f"volume={gain_db:.3f}dB", "-codec:a", "libmp3lame", "-b:a", "320k", str(destination)],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=timeout,
        )
        if result.returncode != 0 or not destination.is_file() or destination.stat().st_size < 1:
            raise RvcServiceError(502, "RVC_EMPTY_OUTPUT")


def encoded_true_peak_dbfs(path: Path) -> float:
    """Measure the decoded output, including reconstruction between samples."""
    result = subprocess.run(
        ["ffmpeg", "-nostdin", "-hide_banner", "-i", str(path),
         "-af", "ebur128=peak=true", "-f", "null", "NUL" if os.name == "nt" else "/dev/null"],
        check=False, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True,
        timeout=max(120, min(600, int(probe_duration(path) * 1.5) + 60)),
    )
    match = re.search(r"True peak:\s+Peak:\s+(-?(?:\d+(?:\.\d+)?|inf))\s+dBFS", result.stderr)
    if result.returncode != 0 or not match:
        raise RvcServiceError(502, "RVC_OUTPUT_SAFETY_FAILED")
    return float(match.group(1))


def transcode_mp3_true_peak_safe(source: Path, destination: Path) -> float:
    """Retry from the lossless mix, never by re-encoding an old MP3."""
    source_duration = probe_duration(source)
    gain_db = 0.0
    for attempt in range(3):
        candidate = destination.with_name(f"{destination.stem}-{attempt}.mp3")
        transcode(source, candidate, "mp3", gain_db)
        try:
            if abs(probe_duration(candidate) - source_duration) > .15:
                raise RvcServiceError(502, "RVC_OUTPUT_SAFETY_FAILED")
            measured_peak = encoded_true_peak_dbfs(candidate)
            if measured_peak <= -1.0:
                candidate.replace(destination)
                return measured_peak
            gain_db += min(-0.1, -1.1 - measured_peak)
        finally:
            candidate.unlink(missing_ok=True)
    raise RvcServiceError(502, "RVC_OUTPUT_SAFETY_FAILED")


def job_expiry() -> datetime:
    return utcnow() + timedelta(seconds=OUTPUT_RETENTION_SECONDS)


def remix_stem_paths(job_id: str) -> tuple[Path, Path]:
    return (OUTPUT_ROOT / f"{job_id}-vocals.wav",
            OUTPUT_ROOT / f"{job_id}-instrumental.wav")


def retain_song_stems(job_id: str, vocals: Path, instrumental: Path) -> bool:
    """Keep balanced stems for the output's short lifetime, within a hard cap."""
    targets = remix_stem_paths(job_id)
    total_new = vocals.stat().st_size + instrumental.stat().st_size
    if total_new > MAX_REMIX_STEM_JOB_BYTES:
        return False
    with remix_stem_lock:
        used = sum(path.stat().st_size for path in OUTPUT_ROOT.glob("*-vocals.wav"))
        used += sum(path.stat().st_size for path in OUTPUT_ROOT.glob("*-instrumental.wav"))
        if used + total_new > MAX_REMIX_STEM_TOTAL_BYTES:
            return False
        staged = [target.with_suffix(".wav.tmp") for target in targets]
        try:
            shutil.copyfile(vocals, staged[0])
            shutil.copyfile(instrumental, staged[1])
            staged[0].replace(targets[0])
            staged[1].replace(targets[1])
        finally:
            for path in staged:
                path.unlink(missing_ok=True)
    return True


def parse_mix_controls(vocal_gain_db: str, accompaniment_gain_db: str,
                       vocal_mute: str, accompaniment_mute: str,
                       audio_mode: str) -> tuple[float, float, bool, bool]:
    try:
        vocal = float(vocal_gain_db)
        accompaniment = float(accompaniment_gain_db)
    except (TypeError, ValueError):
        raise RvcServiceError(400, "RVC_INVALID_PARAMETER") from None
    if (not math.isfinite(vocal) or not math.isfinite(accompaniment)
            or not -24 <= vocal <= 6 or not -24 <= accompaniment <= 6
            or vocal_mute not in {"true", "false"}
            or accompaniment_mute not in {"true", "false"}):
        raise RvcServiceError(400, "RVC_INVALID_PARAMETER")
    muted_vocal = vocal_mute == "true"
    muted_accompaniment = accompaniment_mute == "true"
    if audio_mode == "voice" and (accompaniment != 0 or muted_accompaniment):
        raise RvcServiceError(400, "RVC_INVALID_PARAMETER")
    return vocal, accompaniment, muted_vocal, muted_accompaniment


@app.get("/healthz")
async def healthz(request: Request) -> dict[str, object]:
    ensure_authorized(request)
    from app.official_runtime import OFFICIAL_COMMIT, OFFICIAL_TAG, runtime_info

    info = await asyncio.to_thread(runtime_info)
    separator = await asyncio.to_thread(separation_status)
    model_id = request.query_params.get("model_id", "")
    model_hashes = {}
    if model_id and re_full_slug(model_id):
        try:
            path = await asyncio.to_thread(find_model_path, model_id)
            index_text = find_index_path(path)
            model_hashes = {
                "modelId": model_id,
                "modelSha256": await asyncio.to_thread(verified_file_hash, path),
                "indexSha256": await asyncio.to_thread(verified_file_hash, Path(index_text)) if index_text else "",
            }
        except (RvcServiceError, OSError):
            model_hashes = {}
    return {
        "ready": True,
        "maxAudioSeconds": MAX_AUDIO_SECONDS,
        "engine": "RVC-Project/Retrieval-based-Voice-Conversion-WebUI",
        "tag": OFFICIAL_TAG,
        "commit": OFFICIAL_COMMIT,
        "upstreamCommit": OFFICIAL_COMMIT,
        "backendBuildSha": BACKEND_BUILD_SHA,
        "pipelineRevision": PIPELINE_REVISION,
        "modelHashes": model_hashes,
        "capabilities": {"voice": True, "song": separator["ready"], "training": True},
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


def output_payload(job_id: str, record: OutputRecord) -> dict[str, object]:
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
    payload["vocalGainDb"] = record.vocal_gain_db
    payload["accompanimentGainDb"] = record.accompaniment_gain_db
    payload["vocalMute"] = record.vocal_mute
    payload["accompanimentMute"] = record.accompaniment_mute
    payload["mixRevision"] = record.mix_revision
    if record.audio_mode == "song" and record.state == "completed":
        payload["autoVocalGain"] = round(record.auto_vocal_gain, 4)
        payload["vocalGain"] = round(record.auto_vocal_gain, 4)
        payload["remixAvailable"] = record.remix_available and all(
            path.is_file() for path in remix_stem_paths(job_id))
    return payload


async def reserve_conversion_job(request_id: str, fingerprint: str,
                                 output_format: str, audio_mode: str) -> tuple[str, OutputRecord, bool]:
    """Reserve a slot and an idempotency key together, before slow upload I/O."""
    async with outputs_lock:
        existing_id = request_jobs.get(request_id) if request_id else None
        existing = outputs.get(existing_id or "")
        if existing and existing.fingerprint != fingerprint:
            raise RvcServiceError(409, "RVC_REQUEST_CONFLICT")
        if existing and existing.state != "failed":
            return existing_id, existing, False
        if existing_id and (not existing or existing.state == "failed"):
            request_jobs.pop(request_id, None)
        active = sum(record.state in {"uploading", "preparing", "queued", "processing"}
                     for record in outputs.values())
        if active >= 2:
            raise RvcServiceError(429, "RVC_QUEUE_BUSY")
        job_id = str(uuid.uuid4())
        record = OutputRecord(
            path=OUTPUT_ROOT / f"{job_id}.{output_format}",
            token=secrets.token_urlsafe(32), expires_at=job_expiry(),
            format=output_format, state="uploading", stage="uploading",
            request_id=request_id, audio_mode=audio_mode, fingerprint=fingerprint,
        )
        outputs[job_id] = record
        if request_id:
            request_jobs[request_id] = job_id
        return job_id, record, True


async def release_preparing_job(job_id: str, request_id: str) -> None:
    async with outputs_lock:
        outputs.pop(job_id, None)
        if request_id and request_jobs.get(request_id) == job_id:
            request_jobs.pop(request_id, None)
    persist_output_records()


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






def _load_mono_f32(path: Path) -> tuple[np.ndarray, int]:
    """Decode any audio file to mono float32 via ffmpeg, returning samples + rate."""
    raw = path.with_name(path.stem + "-f32le.tmp")
    result = subprocess.run(
        [
            "ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(path),
            "-vn", "-ac", "1", "-f", "f32le", "-c:a", "pcm_f32le", str(raw),
        ],
        check=False, capture_output=True,
        timeout=max(120, min(600, int(probe_duration(path) * 1.5) + 60)),
    )
    try:
        if result.returncode != 0 or not raw.is_file() or raw.stat().st_size < 4:
            raise RvcServiceError(502, "RVC_DECODE_FAILED")
        samples = np.frombuffer(raw.read_bytes(), dtype="<f4").astype(np.float32)
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "a:0",
             "-show_entries", "stream=sample_rate", "-of", "csv=p=0", str(path)],
            check=True, capture_output=True, text=True,
        )
        rate = int((probe.stdout.strip().splitlines() or ["0"])[0] or 0)
        return samples, (rate or 16000)
    finally:
        raw.unlink(missing_ok=True)


def detect_expressive_mask(vocal: np.ndarray, sample_rate: int) -> np.ndarray:
    """Mark non-pitched expressive frames (laughter, cries, breaths, moans).

    Praat pitch tracking gives per-10 ms F0 and pulse strength. Expressive
    content shows up as unvoiced-but-loud frames (breaths), weakly periodic
    frames (laughter/crying), or erratic semitone jumps (emotional delivery).
    Returns a per-frame gain in [0, 1] (1 = passthrough the original voice).
    """
    import parselmouth

    frame_count = max(1, int(round(len(vocal) / (sample_rate * 0.01))))
    hop = len(vocal) / frame_count
    rms = np.zeros(frame_count)
    for frame in range(frame_count):
        start = int(frame * hop)
        end = min(len(vocal), start + int(hop) + 1)
        segment = vocal[start:max(end, start + 1)]
        rms[frame] = math.sqrt(float(np.mean(segment.astype(np.float64) ** 2)) + 1e-12)
    try:
        sound = parselmouth.Sound(vocal, sampling_frequency=sample_rate)
        pitch = sound.to_pitch_ac(time_step=0.01, pitch_floor=50.0,
                                  pitch_ceiling=min(1100.0, sample_rate / 2 - 100))
        f0 = np.zeros(frame_count)
        strength = np.zeros(frame_count)
        selected = pitch.selected_array
        values = np.asarray(selected["frequency"], dtype=np.float64)
        powers = np.asarray(selected["strength"], dtype=np.float64)
        usable = min(frame_count, len(values))
        f0[:usable] = values[:usable]
        strength[:usable] = powers[:usable]
    except Exception:
        f0 = np.zeros(frame_count)
        strength = np.zeros(frame_count)

    energy_floor = max(0.004, float(np.median(rms)) * 0.25)
    expressive = np.zeros(frame_count)
    for frame in range(frame_count):
        if rms[frame] < energy_floor:
            continue
        if f0[frame] <= 0:
            expressive[frame] = 1.0  # unvoiced but audible: breath / noise
        elif strength[frame] > 0 and strength[frame] < 0.45:
            expressive[frame] = 1.0  # weak periodicity: laughter / crying
    # Erratic semitone jumps inside voiced runs: emotional delivery.
    jumps = np.zeros(frame_count)
    for frame in range(1, frame_count):
        if f0[frame] > 0 and f0[frame - 1] > 0:
            semitones = abs(12.0 * math.log2(f0[frame] / f0[frame - 1]))
            if semitones >= 1.0:
                jumps[frame] = 1.0
    for frame in range(2, frame_count - 2):
        if f0[frame] > 0 and np.mean(jumps[frame - 2:frame + 3]) >= 0.5:
            expressive[frame] = 1.0
    # Two smoothing passes so passthrough regions never zipper.
    smooth = expressive.copy()
    for _ in range(2):
        padded = np.concatenate(([smooth[0]], smooth, [smooth[-1]]))
        smooth = np.convolve(padded, np.ones(3) / 3.0, mode="valid")
    return np.clip(smooth, 0.0, 1.0)


def apply_expressive_passthrough(converted_wav: Path, original_vocal_wav: Path) -> bool:
    """Blend the original voice back into converted output at expressive frames.

    Returns True when the file was rewritten. Singing regions are untouched;
    laughter stays laughter, cries stay cries, breaths stay breaths.
    """
    converted, converted_rate = _load_mono_f32(converted_wav)
    original, original_rate = _load_mono_f32(original_vocal_wav)
    if len(converted) < 64 or len(original) < 64:
        return False
    mask = detect_expressive_mask(original, original_rate)
    if not np.any(mask > 0):
        return False
    positions = np.linspace(0.0, 1.0, len(converted))
    mask_up = np.interp(positions, np.linspace(0.0, 1.0, len(mask)), mask)
    original_up = np.interp(positions, np.linspace(0.0, 1.0, len(original)), original)
    # Level-match the passthrough to the converted voice inside the masked
    # regions so laughter does not jump out of the mix.
    masked_converted = converted * mask_up
    converted_energy = math.sqrt(float(np.mean(masked_converted.astype(np.float64) ** 2)) + 1e-12)
    original_energy = math.sqrt(float(np.mean((original_up * mask_up).astype(np.float64) ** 2)) + 1e-12)
    gain = max(0.25, min(2.0, converted_energy / max(original_energy, 1e-6)))
    blended = converted * (1.0 - mask_up) + original_up * mask_up * gain
    blended_path = converted_wav.with_name(converted_wav.stem + "-expressive.wav")
    raw = blended_path.with_name(blended_path.stem + "-f32le.tmp")
    raw.write_bytes(blended.astype("<f4").tobytes())
    result = subprocess.run(
        [
            "ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "f32le", "-ar",
            str(converted_rate), "-ac", "1", "-i", str(raw),
            "-af", "alimiter=limit=0.971:level=false",
            "-c:a", "pcm_s16le", str(blended_path),
        ],
        check=False, capture_output=True,
        timeout=max(120, min(600, int(len(blended) / converted_rate * 1.5) + 60)),
    )
    raw.unlink(missing_ok=True)
    if result.returncode != 0 or not blended_path.is_file() or blended_path.stat().st_size < 44:
        blended_path.unlink(missing_ok=True)
        return False
    blended_path.replace(converted_wav)
    return True


def detect_breath_mask(vocal: np.ndarray, sample_rate: int) -> np.ndarray:
    """Mark sustained unvoiced energy (breaths/gasps) between sung phrases.

    Only runs of >=150 ms loud unvoiced frames qualify, and every run is
    trimmed by 80 ms per side before smoothing, so the mask can never reach a
    sung note. Consonants are far shorter than 150 ms and stay converted.
    Returns per-10 ms gains in [0, 1].
    """
    import parselmouth

    frame_count = max(1, int(round(len(vocal) / (sample_rate * 0.01))))
    hop = len(vocal) / frame_count
    squared = np.concatenate(([0.0], np.cumsum(vocal.astype(np.float64) ** 2)))
    centers = np.arange(frame_count)
    left = np.maximum(0, (centers * hop).astype(int))
    right = np.minimum(len(vocal), ((centers + 1) * hop).astype(int) + 1)
    rms = np.sqrt(np.maximum(0.0, (squared[right] - squared[left]) / np.maximum(1, right - left)))
    try:
        sound = parselmouth.Sound(
            np.ascontiguousarray(vocal, dtype=np.float64), sampling_frequency=float(sample_rate)
        )
        pitch = sound.to_pitch_ac(
            time_step=0.01, pitch_floor=50.0,
            pitch_ceiling=min(1100.0, sample_rate / 2 - 100),
        )
        values = np.asarray(pitch.selected_array["frequency"], dtype=np.float64)
        f0 = np.zeros(frame_count)
        usable = min(frame_count, len(values))
        f0[:usable] = values[:usable]
    except Exception:
        return np.zeros(frame_count)

    floor = max(0.004, float(np.median(rms)) * 0.3)
    loud_unvoiced = (f0 <= 0) & (rms > floor)
    mask = np.zeros(frame_count)
    padded = np.concatenate(([False], loud_unvoiced, [False]))
    starts = np.flatnonzero(~padded[:-1] & padded[1:])
    ends = np.flatnonzero(padded[:-1] & ~padded[1:])
    for start, end in zip(starts, ends):
        if end - start < 15:  # 150 ms minimum: a real breath, not a consonant
            continue
        inner_start = start + 8  # 80 ms guard: never touch sung audio
        inner_end = end - 8
        if inner_end <= inner_start:
            continue
        mask[inner_start:inner_end] = 1.0
    smooth = mask.copy()
    for _ in range(2):
        padded_mask = np.concatenate(([smooth[0]], smooth, [smooth[-1]]))
        smooth = np.convolve(padded_mask, np.ones(3) / 3.0, mode="valid")
    return np.clip(smooth, 0.0, 1.0)


def apply_breath_passthrough(converted_wav: Path, original_vocal_wav: Path) -> bool:
    """Re-inject real breaths into converted output; singing stays untouched.

    Returns True when the file was rewritten. The mask only covers sustained
    unvoiced runs far from any sung note, so the character voice keeps every
    melodic frame and overlaps are structurally impossible.
    """
    converted, converted_rate = _load_mono_f32(converted_wav)
    original, original_rate = _load_mono_f32(original_vocal_wav)
    if len(converted) < 64 or len(original) < 64:
        return False
    mask = detect_breath_mask(original, original_rate)
    if not np.any(mask > 0) or float(np.mean(mask > 0.5)) > 0.25:
        return False
    positions = np.linspace(0.0, 1.0, len(converted))
    mask_up = np.interp(positions, np.linspace(0.0, 1.0, len(mask)), mask)
    original_up = np.interp(positions, np.linspace(0.0, 1.0, len(original)), original)
    masked_converted = converted * mask_up
    converted_energy = math.sqrt(float(np.mean(masked_converted.astype(np.float64) ** 2)) + 1e-12)
    original_energy = math.sqrt(float(np.mean((original_up * mask_up).astype(np.float64) ** 2)) + 1e-12)
    gain = max(0.25, min(2.0, converted_energy / max(original_energy, 1e-6)))
    blended = converted * (1.0 - mask_up) + original_up * mask_up * gain
    blended_path = converted_wav.with_name(converted_wav.stem + "-breath.wav")
    raw = blended_path.with_name(blended_path.stem + "-f32le.tmp")
    raw.write_bytes(blended.astype("<f4").tobytes())
    result = subprocess.run(
        [
            "ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "f32le", "-ar",
            str(converted_rate), "-ac", "1", "-i", str(raw),
            "-c:a", "pcm_f32le", str(blended_path),
        ],
        check=False, capture_output=True,
        timeout=max(120, min(600, int(len(blended) / converted_rate * 1.5) + 60)),
    )
    raw.unlink(missing_ok=True)
    if result.returncode != 0 or not blended_path.is_file() or blended_path.stat().st_size < 44:
        blended_path.unlink(missing_ok=True)
        return False
    blended_path.replace(converted_wav)
    return True


def finalize_true_peak_safe(output_wav: Path, ceiling_dbfs: float = -1.0) -> bool:
    """Protect inter-sample peaks with one gain, preserving dynamics."""
    from app.audio_repair import protect_true_peak

    try:
        protect_true_peak(output_wav, ceiling_dbfs)
    except (OSError, RuntimeError, ValueError) as error:
        raise RvcServiceError(502, "RVC_OUTPUT_SAFETY_FAILED") from error
    return True


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
    vocal_gain_db: float,
    accompaniment_gain_db: float,
    vocal_mute: bool,
    accompaniment_mute: bool,
    f0_method: str,
    request_id: str,
    model_id: str,
    started_at: float,
    audio_mode: str,
    duration_seconds: float,
    input_profile: AudioProfile,
    diagnostic: bool = False,
) -> None:
    diagnostic_dir = job_root / "diagnostic-stages" if diagnostic else None
    used_f0_method = ""
    auto_vocal_gain = 1.0
    activity_details: dict[str, object] = {}
    stage_times: dict[str, float] = {}
    stage_started = asyncio.get_running_loop().time()
    def mark_stage(name: str) -> None:
        nonlocal stage_started
        now = asyncio.get_running_loop().time()
        stage_times[name] = round(now - stage_started, 3)
        stage_started = now
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
            mark_stage("separation")
            async with outputs_lock:
                record = outputs.get(job_id)
                if record:
                    record.stage = "converting"
            separated_vocals = job_root / "separated-vocals-16k.wav"
            converted_vocals = job_root / "converted-vocals.wav"
            vocal_profile = await asyncio.to_thread(normalize_audio, stems.vocals, separated_vocals, singing=True)
            mark_stage("vocalNormalization")
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
                diagnostic_dir,
            )
            mark_stage("conversion")
            snapshot_diagnostic_audio(converted_vocals, diagnostic_dir, "vocals-joined.wav")
            activity_details = await asyncio.to_thread(
                suppress_silent_synthesis, converted_vocals, separated_vocals,
            )
            mark_stage("activityGuard")
            snapshot_diagnostic_audio(converted_vocals, diagnostic_dir, "vocals-activity.wav")
            # Preserve the source's short-time dynamics, not its speaker identity.
            await asyncio.to_thread(apply_dynamics, converted_vocals, separated_vocals, 1.0 - rms_mix_rate)
            mark_stage("dynamics")
            snapshot_diagnostic_audio(converted_vocals, diagnostic_dir, "vocals-dynamics.wav")
            auto_vocal_gain = await asyncio.to_thread(calibrate_song_vocals, stems.vocals, converted_vocals)
            mark_stage("vocalBalance")
            snapshot_diagnostic_audio(converted_vocals, diagnostic_dir, "vocals-balanced.wav")
            async with outputs_lock:
                record = outputs.get(job_id)
                if record:
                    record.auto_vocal_gain = auto_vocal_gain
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
                vocal_gain_db,
                accompaniment_gain_db,
                vocal_mute,
                accompaniment_mute,
            )
            mark_stage("remix")
            snapshot_diagnostic_audio(output_wav, diagnostic_dir, "remixed.wav")
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
                diagnostic_dir,
            )
            mark_stage("conversion")
            snapshot_diagnostic_audio(output_wav, diagnostic_dir, "voice-joined.wav")
            activity_details = await asyncio.to_thread(
                suppress_silent_synthesis, output_wav, input_wav,
            )
            mark_stage("activityGuard")
            snapshot_diagnostic_audio(output_wav, diagnostic_dir, "voice-activity.wav")
            await asyncio.to_thread(apply_dynamics, output_wav, input_wav, 1.0 - rms_mix_rate)
            mark_stage("dynamics")
            snapshot_diagnostic_audio(output_wav, diagnostic_dir, "voice-dynamics.wav")
            await asyncio.to_thread(apply_static_gain, output_wav, vocal_gain_db, vocal_mute)
            snapshot_diagnostic_audio(output_wav, diagnostic_dir, "voice-user-gain.wav")
        async with outputs_lock:
            record = outputs.get(job_id)
            if record:
                record.stage = "encoding"
        # True-peak safety for every conversion output (song and voice).
        # MP3 encoding can add inter-sample overshoot, so reserve 0.5 dB.
        await asyncio.to_thread(finalize_true_peak_safe, output_wav, -1.5 if output_format == "mp3" else -1.0)
        mark_stage("truePeak")
        snapshot_diagnostic_audio(output_wav, diagnostic_dir, "final-true-peak.wav")
        if output_format == "mp3":
            await asyncio.to_thread(transcode_mp3_true_peak_safe, output_wav, output_path)
        else:
            shutil.copyfile(output_wav, output_path)
        mark_stage("encoding")
        if not output_path.is_file() or output_path.stat().st_size < 1:
            raise RvcServiceError(502, "RVC_EMPTY_OUTPUT")
        remix_available = False
        if audio_mode == "song":
            remix_available = await asyncio.to_thread(
                retain_song_stems, job_id, converted_vocals, stems.instrumental,
            )
        async with outputs_lock:
            record = outputs.get(job_id)
            if record:
                record.state = "completed"
                record.stage = "completed"
                record.f0_method = used_f0_method
                record.expires_at = job_expiry()
                record.remix_available = remix_available
                record.source_duration_seconds = duration_seconds
                record.stem_sample_rate = stems.sample_rate if audio_mode == "song" else 0
        persist_output_records()
        logger.info(
            "conversion completed request_id=%s job_id=%s model=%s mode=%s f0=%s vocal_gain=%.3f seconds=%.2f",
            request_id,
            job_id,
            model_id,
            audio_mode,
            used_f0_method,
            record.auto_vocal_gain if record else 1.0,
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
        if diagnostic:
            try:
                root = configured_root(SITE_ROOT)
                if root is not None:
                    from app.official_runtime import OFFICIAL_COMMIT, runtime_info
                    index_text = find_index_path(model_path)
                    metadata = {
                        "jobId": job_id, "modelId": model_id, "audioMode": audio_mode,
                        "pitch": pitch, "indexRate": index_rate, "protect": protect,
                        "rmsMixRate": rms_mix_rate, "filterRadius": filter_radius,
                        "resample": resample, "requestedF0Method": f0_method,
                        "actualF0Method": used_f0_method,
                        "autoVocalGain": auto_vocal_gain,
                        "userVocalGainDb": vocal_gain_db,
                        "userAccompanimentGainDb": accompaniment_gain_db,
                        "vocalMute": vocal_mute,
                        "accompanimentMute": accompaniment_mute,
                        "sourceDurationSeconds": duration_seconds, "noiseSeed": 20260823,
                        "backendBuildSha": BACKEND_BUILD_SHA,
                        "pipelineRevision": PIPELINE_REVISION, "upstreamCommit": OFFICIAL_COMMIT,
                        "modelSha256": verified_file_hash(model_path),
                        "indexSha256": verified_file_hash(Path(index_text)) if index_text else "",
                        "retrievalEnabled": bool(index_text and index_rate > 0),
                        "runtime": str(runtime_info()),
                        "sourceActivity": activity_details,
                        "stageElapsedSeconds": stage_times,
                    }
                    await asyncio.to_thread(capture_job, root, job_id, job_root, output_path, metadata)
            except (OSError, RuntimeError, ValueError):
                logger.exception("diagnostic capture failed job_id=%s", job_id)
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
    filter_radius: str = Form("0"),
    resample: str = Form("0"),
    rms_mix_rate: str = Form("1"),
    vocal_gain_db: str = Form("0"),
    accompaniment_gain_db: str = Form("0"),
    vocal_mute: str = Form("false"),
    accompaniment_mute: str = Form("false"),
    f0_method: str = Form("rmvpe"),
    format: str = Form("wav"),
    language: str = Form("zh"),
    audio_mode: str = Form("voice"),
    request_id: str = Form(""),
    audio: UploadFile = File(...),
) -> dict[str, object]:
    ensure_authorized(request)
    diagnostic = bool(
        request.headers.get("X-PostPrep-Diagnostic") == "1"
        and request.client is not None
        and request.client.host in {"127.0.0.1", "::1"}
        and configured_root(SITE_ROOT) is not None
    )
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
    if not (math.isfinite(index_rate_value) and math.isfinite(protect_value)
            and math.isfinite(rms_mix_value) and 0 <= index_rate_value <= 1
            and 0 <= protect_value <= 0.5 and 0 <= rms_mix_value <= 1):
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
    mix_vocal_db, mix_accompaniment_db, mix_vocal_mute, mix_accompaniment_mute = parse_mix_controls(
        vocal_gain_db, accompaniment_gain_db, vocal_mute, accompaniment_mute, audio_mode,
    )
    if client_request_id and not valid_request_id(client_request_id):
        raise RvcServiceError(400, "RVC_INVALID_REQUEST_ID")

    extension = safe_extension(audio)
    try:
        model_path = find_model_path(model_id)
    except RvcServiceError:
        await audio.close()
        raise
    fingerprint = hashlib.sha256(json.dumps({
        "model": model_id, "pitch": pitch_value, "indexRate": index_rate_value,
        "protect": protect_value, "rmsMixRate": rms_mix_value,
        "vocalGainDb": mix_vocal_db, "accompanimentGainDb": mix_accompaniment_db,
        "vocalMute": mix_vocal_mute, "accompanimentMute": mix_accompaniment_mute,
        "filterRadius": filter_radius_value, "resample": resample_value,
        "f0Method": f0_method, "format": format, "audioMode": audio_mode,
        "filename": audio.filename, "contentType": audio.content_type,
    }, sort_keys=True).encode("utf-8")).hexdigest()
    await cleanup_expired_outputs()
    try:
        job_id, record, created = await reserve_conversion_job(
            client_request_id, fingerprint, format, audio_mode)
    except RvcServiceError:
        await audio.close()
        raise
    if not created:
        await audio.close()
        logger.info("idempotent retry request_id=%s job_id=%s", trace_id, job_id)
        return output_payload(job_id, record)
    record.vocal_gain_db = mix_vocal_db
    record.accompaniment_gain_db = mix_accompaniment_db
    record.vocal_mute = mix_vocal_mute
    record.accompaniment_mute = mix_accompaniment_mute
    persist_output_records()
    job_root = None
    output_path = record.path
    try:
        job_root = Path(tempfile.mkdtemp(prefix=f"{job_id}-", dir=WORK_ROOT))
        input_raw = job_root / f"input.{extension}"
        input_wav = job_root / "input.wav"
        output_wav = job_root / "output.wav"
        await write_upload(audio, input_raw)
        async with outputs_lock:
            record.state = "preparing"
            record.stage = "preparing"
        duration_seconds = await asyncio.to_thread(probe_duration, input_raw)
        if duration_seconds < MIN_AUDIO_SECONDS:
            raise RvcServiceError(400, "RVC_AUDIO_TOO_SHORT")
        if duration_seconds > MAX_AUDIO_SECONDS:
            raise RvcServiceError(400, "RVC_AUDIO_TOO_LONG")
        input_profile = AudioProfile()
        if audio_mode == "voice":
            input_profile = await asyncio.to_thread(normalize_audio, input_raw, input_wav)
        async with outputs_lock:
            record.state = "queued"
            record.stage = "queued"
        persist_output_records()
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
            vocal_gain_db=mix_vocal_db,
            accompaniment_gain_db=mix_accompaniment_db,
            vocal_mute=mix_vocal_mute,
            accompaniment_mute=mix_accompaniment_mute,
            f0_method=f0_method,
            request_id=trace_id,
            model_id=model_id,
            started_at=started_at,
            audio_mode=audio_mode,
            duration_seconds=duration_seconds,
            input_profile=input_profile,
            diagnostic=diagnostic,
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
        return output_payload(job_id, record)
    except (RvcServiceError, asyncio.CancelledError):
        await release_preparing_job(job_id, client_request_id)
        output_path.unlink(missing_ok=True)
        if job_root is not None:
            shutil.rmtree(job_root, ignore_errors=True)
        raise
    except (OSError, subprocess.SubprocessError, RuntimeError, ValueError):
        logger.exception(
            "conversion failed request_id=%s model=%s seconds=%.2f",
            trace_id,
            model_id,
            asyncio.get_running_loop().time() - started_at,
        )
        await release_preparing_job(job_id, client_request_id)
        output_path.unlink(missing_ok=True)
        if job_root is not None:
            shutil.rmtree(job_root, ignore_errors=True)
        raise RvcServiceError(502, "RVC_INFERENCE_FAILED") from None
    finally:
        await audio.close()


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
    if record.state in {"uploading", "preparing", "queued", "processing", "remixing"}:
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
        headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
                 "X-RVC-F0-Method": record.f0_method,
                 "X-RVC-Mix-Revision": str(record.mix_revision),
                 "X-RVC-Remix-Available": "true" if record.remix_available
                 and all(path.is_file() for path in remix_stem_paths(job_id)) else "false"},
    )


@app.post("/v1/output/{job_id}/remix")
async def remix_output(
    request: Request,
    job_id: str,
    token: str,
    vocal_gain_db: str = Form("0"),
    accompaniment_gain_db: str = Form("0"),
    vocal_mute: str = Form("false"),
    accompaniment_mute: str = Form("false"),
) -> dict[str, object]:
    ensure_authorized(request)
    if not re_full_uuid(job_id) or not valid_training_token(token):
        raise HTTPException(status_code=404, detail="Not found")
    mix = parse_mix_controls(vocal_gain_db, accompaniment_gain_db,
                             vocal_mute, accompaniment_mute, "song")
    await cleanup_expired_outputs()
    async with remix_lock:
        async with outputs_lock:
            record = outputs.get(job_id)
            if record is None or not secrets.compare_digest(token, record.token):
                raise HTTPException(status_code=404, detail="Not found")
            stems = remix_stem_paths(job_id)
            if (record.state != "completed" or record.audio_mode != "song"
                    or not record.remix_available or not all(path.is_file() for path in stems)
                    or record.expires_at <= utcnow()):
                raise RvcServiceError(409, "RVC_REMIX_UNAVAILABLE")
            record.state = "remixing"
            record.stage = "remixing"
            next_revision = record.mix_revision + 1
        mix_wav = OUTPUT_ROOT / f"{job_id}-mix{next_revision}.wav"
        next_path = OUTPUT_ROOT / f"{job_id}-mix{next_revision}.{record.format}"
        try:
            await asyncio.to_thread(
                remix_song, stems[1], stems[0], mix_wav,
                record.source_duration_seconds, record.stem_sample_rate, *mix,
            )
            await asyncio.to_thread(
                finalize_true_peak_safe, mix_wav,
                -1.5 if record.format == "mp3" else -1.0,
            )
            if record.format == "mp3":
                await asyncio.to_thread(transcode_mp3_true_peak_safe, mix_wav, next_path)
            else:
                next_path = mix_wav
            async with outputs_lock:
                record.path = next_path
                record.vocal_gain_db, record.accompaniment_gain_db = mix[:2]
                record.vocal_mute, record.accompaniment_mute = mix[2:]
                record.mix_revision = next_revision
                record.state = "completed"
                record.stage = "completed"
            persist_output_records()
            return output_payload(job_id, record)
        except (OSError, subprocess.SubprocessError, RuntimeError, ValueError):
            next_path.unlink(missing_ok=True)
            raise RvcServiceError(502, "RVC_REMIX_FAILED") from None
        finally:
            if mix_wav != next_path:
                mix_wav.unlink(missing_ok=True)
            async with outputs_lock:
                if record.state == "remixing":
                    record.state = "completed"
                    record.stage = "completed"


def re_full_slug(value: str) -> bool:
    return bool(value) and len(value) <= 64 and all(ch.isalnum() or ch in "-_" for ch in value)


def re_full_uuid(value: str) -> bool:
    try:
        return str(uuid.UUID(value)) == value.lower()
    except (ValueError, AttributeError):
        return False
