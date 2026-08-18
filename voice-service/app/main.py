"""Protected, short-retention voice inference adapter for PostPrep.

It deliberately accepts only the broker's bearer token, has no browser CORS,
does not auto-download models, and never logs source audio or text. The model
must be mounted at COSYVOICE_MODEL_DIR after its weight license is reviewed.
"""

from __future__ import annotations

import asyncio
import os
import secrets
import shutil
import subprocess
import tempfile
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse


MAX_REFERENCE_BYTES = 20 * 1024 * 1024
MAX_SOURCE_BYTES = 25 * 1024 * 1024
MAX_TEXT_CHARS = 1000
MAX_REFERENCE_SECONDS = 180
MAX_SOURCE_SECONDS = 180
OUTPUT_RETENTION_SECONDS = max(300, min(int(os.getenv("VOICE_OUTPUT_RETENTION_SECONDS", "900")), 3600))
MAX_CONCURRENCY = max(1, min(int(os.getenv("VOICE_MAX_CONCURRENCY", "1")), 2))
MODEL_DIR = Path(os.getenv("COSYVOICE_MODEL_DIR", "/models/CosyVoice-300M")).resolve()
WORK_ROOT = Path(os.getenv("VOICE_WORK_ROOT", "/tmp/postprep-voice-work")).resolve()
OUTPUT_ROOT = Path(os.getenv("VOICE_OUTPUT_ROOT", "/tmp/postprep-voice-output")).resolve()
GATEWAY_TOKEN = os.getenv("VOICE_GATEWAY_TOKEN", "").strip()
ALLOWED_MODES = {"read", "cover"}
ALLOWED_RIGHTS_SCOPES = {"self", "written-permission", "original-fictional"}
ALLOWED_EXTENSIONS = {"wav", "mp3", "m4a", "ogg"}
ALLOWED_MIME_TYPES = {
    "audio/wav",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp4",
    "audio/x-m4a",
    "audio/ogg",
}
REQUIRED_RIGHTS_DECLARATION = "I HAVE THE RIGHTS"


class VoiceServiceError(Exception):
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


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def require_config() -> None:
    if len(GATEWAY_TOKEN) < 32 or not MODEL_DIR.is_dir():
        raise RuntimeError("Voice service is not configured")


def load_model():
    require_config()
    from cosyvoice.cli.cosyvoice import AutoModel

    return AutoModel(model_dir=str(MODEL_DIR))


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
    app.state.model = await asyncio.to_thread(load_model)
    cleanup_task = asyncio.create_task(cleanup_loop())
    try:
        yield
    finally:
        cleanup_task.cancel()
        await asyncio.gather(cleanup_task, return_exceptions=True)
        await cleanup_expired_outputs()


app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)


@app.exception_handler(VoiceServiceError)
async def voice_error_handler(_: Request, error: VoiceServiceError) -> JSONResponse:
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
        raise VoiceServiceError(400, "VOICE_INVALID_AUDIO")
    mime = str(upload.content_type or "").lower()
    if mime and mime not in ALLOWED_MIME_TYPES:
        raise VoiceServiceError(400, "VOICE_INVALID_AUDIO")
    return extension


async def write_upload(upload: UploadFile, destination: Path, maximum_bytes: int) -> None:
    total = 0
    try:
        with destination.open("wb") as handle:
            while chunk := await upload.read(1024 * 1024):
                total += len(chunk)
                if total > maximum_bytes:
                    raise VoiceServiceError(413, "VOICE_AUDIO_TOO_LARGE")
                handle.write(chunk)
    finally:
        await upload.close()
    if total < 1:
        raise VoiceServiceError(400, "VOICE_INVALID_AUDIO")


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
        raise VoiceServiceError(400, "VOICE_INVALID_AUDIO")
    return duration


def normalize_audio(source: Path, destination: Path, max_seconds: int) -> None:
    duration = probe_duration(source)
    if duration < 5:
        raise VoiceServiceError(400, "VOICE_AUDIO_TOO_SHORT")
    if duration > max_seconds:
        raise VoiceServiceError(400, "VOICE_AUDIO_TOO_LONG")
    result = subprocess.run(
        [
            "ffmpeg", "-nostdin", "-v", "error", "-i", str(source), "-vn",
            "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(destination),
        ],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=90,
    )
    if result.returncode != 0 or not destination.is_file() or destination.stat().st_size < 1:
        raise VoiceServiceError(400, "VOICE_INVALID_AUDIO")


def merge_and_save(model_output, destination: Path, sample_rate: int) -> None:
    import torch
    import torchaudio

    segments = []
    for item in model_output:
        speech = item.get("tts_speech") if isinstance(item, dict) else None
        if speech is None:
            continue
        speech = speech.detach().cpu()
        if speech.ndim == 1:
            speech = speech.unsqueeze(0)
        segments.append(speech)
    if not segments:
        raise VoiceServiceError(502, "VOICE_EMPTY_OUTPUT")
    torchaudio.save(str(destination), torch.cat(segments, dim=-1), sample_rate)


def render_read(model, text: str, reference_path: Path, output_path: Path) -> None:
    # CosyVoice's cross-lingual path does not require a user-supplied transcript for the reference voice.
    model_output = model.inference_cross_lingual(text, str(reference_path), stream=False)
    merge_and_save(model_output, output_path, int(model.sample_rate))


def render_cover(model, source_path: Path, reference_path: Path, output_path: Path) -> None:
    # Voice conversion preserves the authorized source vocal's timing and melody; it does not separate accompaniment.
    model_output = model.inference_vc(str(source_path), str(reference_path))
    merge_and_save(model_output, output_path, int(model.sample_rate))


def job_expiry() -> datetime:
    return utcnow() + timedelta(seconds=OUTPUT_RETENTION_SECONDS)


@app.get("/healthz")
async def healthz(request: Request) -> dict[str, bool]:
    ensure_authorized(request)
    return {"ready": True}


@app.post("/v1/jobs")
async def create_job(
    request: Request,
    mode: str = Form(...),
    rights_scope: str = Form(...),
    rights_declaration: str = Form(...),
    ai_disclosure: str = Form(...),
    language: str = Form("zh"),
    text: str | None = Form(None),
    reference_audio: UploadFile = File(...),
    source_audio: UploadFile | None = File(None),
) -> dict[str, str]:
    ensure_authorized(request)
    content_length = request.headers.get("Content-Length")
    try:
        declared_length = int(content_length) if content_length else 0
    except ValueError:
        declared_length = 0
    if declared_length > MAX_REFERENCE_BYTES + MAX_SOURCE_BYTES + 1024 * 1024:
        raise VoiceServiceError(413, "VOICE_AUDIO_TOO_LARGE")
    if mode not in ALLOWED_MODES:
        raise VoiceServiceError(400, "VOICE_INVALID_MODE")
    if rights_scope not in ALLOWED_RIGHTS_SCOPES or rights_declaration != REQUIRED_RIGHTS_DECLARATION:
        raise VoiceServiceError(403, "VOICE_RIGHTS_CONFIRMATION_REQUIRED")
    if ai_disclosure != "confirmed":
        raise VoiceServiceError(403, "VOICE_AI_DISCLOSURE_REQUIRED")
    if language not in {"zh", "en"}:
        raise VoiceServiceError(400, "VOICE_INVALID_LANGUAGE")
    if mode == "read" and (not text or len(text.strip()) > MAX_TEXT_CHARS):
        raise VoiceServiceError(400, "VOICE_INVALID_TEXT")
    if mode == "cover" and source_audio is None:
        raise VoiceServiceError(400, "VOICE_INVALID_AUDIO")
    if mode == "read" and source_audio is not None:
        raise VoiceServiceError(400, "VOICE_INVALID_MODE")

    reference_extension = safe_extension(reference_audio)
    source_extension = safe_extension(source_audio) if source_audio is not None else ""
    job_id = str(uuid.uuid4())
    job_root = Path(tempfile.mkdtemp(prefix=f"{job_id}-", dir=WORK_ROOT))
    output_path = OUTPUT_ROOT / f"{job_id}.wav"
    try:
        reference_input = job_root / f"reference-input.{reference_extension}"
        reference_wav = job_root / "reference.wav"
        await write_upload(reference_audio, reference_input, MAX_REFERENCE_BYTES)
        await asyncio.to_thread(normalize_audio, reference_input, reference_wav, MAX_REFERENCE_SECONDS)

        source_wav: Path | None = None
        if mode == "cover" and source_audio is not None:
            source_input = job_root / f"source-input.{source_extension}"
            source_wav = job_root / "source.wav"
            await write_upload(source_audio, source_input, MAX_SOURCE_BYTES)
            await asyncio.to_thread(normalize_audio, source_input, source_wav, MAX_SOURCE_SECONDS)

        async with inference_lock:
            if mode == "read":
                await asyncio.to_thread(render_read, request.app.state.model, text.strip(), reference_wav, output_path)
            else:
                await asyncio.to_thread(render_cover, request.app.state.model, source_wav, reference_wav, output_path)
        if not output_path.is_file() or output_path.stat().st_size < 1:
            raise VoiceServiceError(502, "VOICE_EMPTY_OUTPUT")
        expires_at = job_expiry()
        download_token = secrets.token_urlsafe(32)
        async with outputs_lock:
            outputs[job_id] = OutputRecord(path=output_path, token=download_token, expires_at=expires_at)
        return {
            "jobId": job_id,
            "downloadToken": download_token,
            "expiresAt": expires_at.isoformat().replace("+00:00", "Z"),
        }
    except VoiceServiceError:
        output_path.unlink(missing_ok=True)
        raise
    except (OSError, subprocess.SubprocessError, RuntimeError, ValueError):
        output_path.unlink(missing_ok=True)
        raise VoiceServiceError(502, "VOICE_INFERENCE_FAILED") from None
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
    return FileResponse(
        record.path,
        media_type="audio/wav",
        filename="postprep-ai-audio.wav",
        headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"},
    )


def re_full_uuid(value: str) -> bool:
    try:
        return str(uuid.UUID(value)) == value.lower()
    except (ValueError, AttributeError):
        return False
