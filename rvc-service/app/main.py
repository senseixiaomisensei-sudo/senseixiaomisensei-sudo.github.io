"""RVC voice-conversion inference adapter for PostPrep's AI voice changer.

Deliberately not a browser service: it accepts one server-to-server bearer
token, has no browser CORS, never auto-downloads models, and deletes source
audio as soon as a request finishes. Generated files receive a random
download token and are removed after a short retention window.

Model weights are NOT bundled. The operator mounts RVC `.pth` (and optional
`.index`) files into RVC_MODELS_DIR; every mounted model is listed by
GET /v1/models and selectable by id from the website.
"""

from __future__ import annotations

import asyncio
import os
import secrets
import shutil
import subprocess
import tempfile
import uuid
from collections import OrderedDict
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse


MAX_AUDIO_BYTES = 25 * 1024 * 1024
MIN_AUDIO_SECONDS = 1
MAX_AUDIO_SECONDS = 180
OUTPUT_RETENTION_SECONDS = max(300, min(int(os.getenv("RVC_OUTPUT_RETENTION_SECONDS", "900")), 3600))
MAX_CONCURRENCY = max(1, min(int(os.getenv("RVC_MAX_CONCURRENCY", "1")), 2))
MODELS_DIR = Path(os.getenv("RVC_MODELS_DIR", "/models/rvc")).resolve()
WORK_ROOT = Path(os.getenv("RVC_WORK_ROOT", "/tmp/rvc-work")).resolve()
OUTPUT_ROOT = Path(os.getenv("RVC_OUTPUT_ROOT", "/tmp/rvc-output")).resolve()
GATEWAY_TOKEN = os.getenv("RVC_GATEWAY_TOKEN", "").strip()
MAX_CACHED_MODELS = max(1, min(int(os.getenv("RVC_MAX_CACHED_MODELS", "2")), 8))
ALLOWED_EXTENSIONS = {"wav", "mp3", "m4a", "ogg", "webm"}
ALLOWED_MIME_TYPES = {
    "audio/wav",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp4",
    "audio/x-m4a",
    "audio/ogg",
    "audio/webm",
    # Some HTTP clients (curl, PowerShell, generic uploaders) send a generic
    # type for audio files; ffmpeg still parses the real format below.
    "application/octet-stream",
}
ALLOWED_FORMATS = {"wav", "mp3"}
ALLOWED_F0_METHODS = {"rmvpe", "fcpe", "pm"}
ALLOWED_RESAMPLE = {0, 16000, 24000, 32000, 44100, 48000}


class RvcServiceError(Exception):
    def __init__(self, status_code: int, code: str) -> None:
        super().__init__(code)
        self.status_code = status_code
        self.code = code


@dataclass(frozen=True)
class OutputRecord:
    path: Path
    token: str
    expires_at: datetime


outputs: dict[str, OutputRecord] = {}
outputs_lock = asyncio.Lock()
inference_lock = asyncio.Semaphore(MAX_CONCURRENCY)

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
            "hasIndex": index.is_file(),
            "license": str(meta.get("license") or "unverified"),
            "source": str(meta.get("source") or ""),
            "modelVersion": str(meta.get("modelVersion") or ""),
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


async def load_model_async(pth: Path):
    async with model_cache_lock:
        return await asyncio.to_thread(acquire_model, pth)


async def cleanup_expired_outputs() -> None:
    expired: list[OutputRecord] = []
    now = utcnow()
    async with outputs_lock:
        for job_id, record in tuple(outputs.items()):
            if record.expires_at <= now:
                expired.append(record)
                outputs.pop(job_id, None)
    for record in expired:
        record.path.unlink(missing_ok=True)


async def cleanup_loop() -> None:
    while True:
        await asyncio.sleep(60)
        await cleanup_expired_outputs()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    WORK_ROOT.mkdir(parents=True, exist_ok=True)
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    require_config()
    cleanup_task = asyncio.create_task(cleanup_loop())
    try:
        yield
    finally:
        cleanup_task.cancel()
        await asyncio.gather(cleanup_task, return_exceptions=True)
        await cleanup_expired_outputs()


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


def normalize_audio(source: Path, destination: Path) -> None:
    duration = probe_duration(source)
    if duration < MIN_AUDIO_SECONDS:
        raise RvcServiceError(400, "RVC_AUDIO_TOO_SHORT")
    if duration > MAX_AUDIO_SECONDS:
        raise RvcServiceError(400, "RVC_AUDIO_TOO_LONG")
    result = subprocess.run(
        [
            "ffmpeg", "-nostdin", "-v", "error", "-i", str(source), "-vn",
            # Official RVC consumes mono 16 kHz float audio before HuBERT.
            # Normalize once here to avoid an unnecessary 44.1 kHz round-trip
            # and int16 quantization before the upstream loader.
            "-ac", "1", "-ar", "16000", "-c:a", "pcm_f32le", str(destination),
        ],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=120,
    )
    if result.returncode != 0 or not destination.is_file() or destination.stat().st_size < 1:
        raise RvcServiceError(400, "RVC_INVALID_AUDIO")


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
) -> None:
    inference = acquire_model(model_path)
    # Upstream 2.3.260718 removed the old post-F0 median-filter parameter.
    # Keep accepting it at the HTTP boundary for backward compatibility, but
    # use the exact upstream RMVPE/FCPE/PM pipeline without an invented filter.
    _ = filter_radius
    inference.infer(
        input_wav,
        output_wav,
        pitch=pitch,
        f0_method=f0_method,
        index_rate=index_rate,
        protect=protect,
        resample_rate=resample_rate,
        rms_mix_rate=rms_mix_rate,
    )
    if not output_wav.is_file() or output_wav.stat().st_size < 1:
        raise RvcServiceError(502, "RVC_EMPTY_OUTPUT")


def transcode(source: Path, destination: Path, target_format: str) -> None:
    if target_format == "mp3":
        result = subprocess.run(
            ["ffmpeg", "-nostdin", "-v", "error", "-i", str(source), "-codec:a", "libmp3lame", "-b:a", "192k", str(destination)],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=120,
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
    return {
        "ready": True,
        "engine": "RVC-Project/Retrieval-based-Voice-Conversion-WebUI",
        "tag": OFFICIAL_TAG,
        "commit": OFFICIAL_COMMIT,
        "device": info.device,
        "half": info.is_half,
    }


@app.get("/v1/models")
async def list_models(request: Request) -> dict[str, list[dict]]:
    ensure_authorized(request)
    return {"models": await asyncio.to_thread(scan_models)}


@app.post("/v1/convert")
async def create_job(
    request: Request,
    model_id: str = Form(...),
    pitch: str = Form("0"),
    index_rate: str = Form("0.5"),
    protect: str = Form("0.33"),
    filter_radius: str = Form("3"),
    resample: str = Form("0"),
    rms_mix_rate: str = Form("1"),
    f0_method: str = Form("rmvpe"),
    format: str = Form("wav"),
    language: str = Form("zh"),
    audio: UploadFile = File(...),
) -> dict[str, str]:
    ensure_authorized(request)
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
        await asyncio.to_thread(normalize_audio, input_raw, input_wav)

        async with inference_lock:
            await asyncio.to_thread(
                render_conversion,
                model_path,
                input_wav,
                output_wav,
                pitch_value,
                index_rate_value,
                protect_value,
                filter_radius_value,
                resample_value,
                rms_mix_value,
                f0_method,
            )
        if format == "mp3":
            await asyncio.to_thread(transcode, output_wav, output_path, "mp3")
        else:
            shutil.copyfile(output_wav, output_path)
        if not output_path.is_file() or output_path.stat().st_size < 1:
            raise RvcServiceError(502, "RVC_EMPTY_OUTPUT")
        expires_at = job_expiry()
        download_token = secrets.token_urlsafe(32)
        async with outputs_lock:
            outputs[job_id] = OutputRecord(path=output_path, token=download_token, expires_at=expires_at)
        return {
            "jobId": job_id,
            "downloadToken": download_token,
            "expiresAt": expires_at.isoformat().replace("+00:00", "Z"),
            "format": format,
        }
    except RvcServiceError:
        output_path.unlink(missing_ok=True)
        raise
    except (OSError, subprocess.SubprocessError, RuntimeError, ValueError):
        output_path.unlink(missing_ok=True)
        raise RvcServiceError(502, "RVC_INFERENCE_FAILED") from None
    finally:
        shutil.rmtree(job_root, ignore_errors=True)


@app.get("/v1/output/{job_id}")
async def get_output(request: Request, job_id: str, token: str) -> FileResponse:
    ensure_authorized(request)
    if not re_full_uuid(job_id) or not token or len(token) > 128:
        raise HTTPException(status_code=404, detail="Not found")
    await cleanup_expired_outputs()
    async with outputs_lock:
        record = outputs.get(job_id)
    if record is None or not secrets.compare_digest(token, record.token) or not record.path.is_file():
        raise HTTPException(status_code=404, detail="Not found")
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
