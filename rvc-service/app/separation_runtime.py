"""Pinned PyMSS song separation and accompaniment remix adapter."""

from __future__ import annotations

import importlib.util
import importlib.metadata
import json
import logging
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from app import separation_cache


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


SEPARATOR_OVERLAP = max(0, min(int(os.getenv("RVC_SEPARATOR_OVERLAP", "264600") or 264600), 352000))


@dataclass(frozen=True)
class SongStems:
    vocals: Path
    instrumental: Path
    sample_rate: int
    cache_hit: bool = False
    # v3: "vocals" is the (dry) lead that is converted; "instrumental" holds
    # everything that is not converted (accompaniment + backing harmony).
    chain: str = "legacy"
    stages: dict | None = None


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


def _v3_plan() -> dict | None:
    """Models the v3 chain can use right now, or None for the legacy chain."""
    from app.v3_quality import enabled
    if not enabled("SEPARATOR"):
        return None
    from app import v3_models
    entries = v3_models.catalog()
    main = v3_models.MAIN_MODEL
    if not v3_models.model_ready(main, entries):
        # keep the validated legacy checkpoint as the main stage
        main = SEPARATOR_MODEL if separation_status()["ready"] else ""
    if not main:
        return None
    karaoke = v3_models.KARAOKE_MODEL if enabled("KARAOKE") and v3_models.model_ready(v3_models.KARAOKE_MODEL, entries) else ""
    dereverb = v3_models.DEREVERB_MODEL if enabled("DEREVERB") and v3_models.model_ready(v3_models.DEREVERB_MODEL, entries) else ""
    if main == SEPARATOR_MODEL and not karaoke and not dereverb:
        return None  # nothing new available: identical to legacy
    files = []
    for name in (main, karaoke, dereverb):
        for rel, _ in v3_models.files_for(name, entries)[:2] if name else []:
            files.append(SEPARATOR_MODELS_DIR / rel)
    return {"main": main, "karaoke": karaoke, "dereverb": dereverb, "files": files}


def _separate_v3(source: Path, output_dir: Path, plan: dict, on_cache_miss=None) -> SongStems:
    worker = Path(__file__).with_name("separation_worker_v3.py")
    key = None
    if separation_cache.cache_root() is not None:
        try:
            runtime = ["v3", plan["main"], plan["karaoke"], plan["dereverb"], SEPARATOR_DEVICE, str(SEPARATOR_OVERLAP)]
            for package in ('pymss', 'torch', 'torchaudio'):
                runtime.append(importlib.metadata.version(package))
            key = separation_cache.cache_key(source, [*plan["files"], worker], json.dumps(runtime))
            sample_rate = separation_cache.restore(key, output_dir)
            if sample_rate is not None:
                extra = separation_cache.restore_extra(key)
                return SongStems(output_dir.resolve() / 'vocals.wav', output_dir.resolve() / 'instrumental.wav',
                                 sample_rate, True, "v3", extra.get("stages") or {})
        except (OSError, importlib.metadata.PackageNotFoundError):
            key = None
    if on_cache_miss is not None:
        on_cache_miss()
    command = [sys.executable, str(worker), "--input", str(source), "--output-dir", str(output_dir),
               "--model-dir", str(SEPARATOR_MODELS_DIR), "--model", plan["main"],
               "--karaoke-model", plan["karaoke"], "--dereverb-model", plan["dereverb"],
               "--device", SEPARATOR_DEVICE, "--overlap", str(SEPARATOR_OVERLAP)]
    try:
        result = subprocess.run(command, check=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True, encoding='utf-8', errors='replace',
                                env={**os.environ, 'PYTHONUTF8': '1', 'PYTHONIOENCODING': 'utf-8'},
                                timeout=SEPARATOR_TIMEOUT_SECONDS * 2)
    except subprocess.TimeoutExpired as error:
        raise SeparationRuntimeError("RVC_SEPARATION_TIMEOUT") from error
    if result.returncode != 0:
        logging.getLogger(__name__).warning('v3 separation failed: %s', (result.stderr or '')[-600:])
        raise SeparationRuntimeError("RVC_SEPARATION_FAILED")
    try:
        payload = json.loads(result.stdout.strip().splitlines()[-1])
        vocals = Path(payload["vocals"]).resolve()
        instrumental = Path(payload["instrumental"]).resolve()
        sample_rate = int(payload["sampleRate"])
        stages = payload.get("stages") or {}
    except (IndexError, KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise SeparationRuntimeError("RVC_SEPARATION_FAILED") from error
    if (output_dir.resolve() not in vocals.parents or output_dir.resolve() not in instrumental.parents
            or not vocals.is_file() or not instrumental.is_file()):
        raise SeparationRuntimeError("RVC_SEPARATION_FAILED")
    if key is not None:
        try:
            separation_cache.store(key, vocals, instrumental, sample_rate, {"stages": stages})
        except OSError:
            pass
    return SongStems(vocals, instrumental, sample_rate, False, "v3", stages)


def separate_song(source: Path, output_dir: Path, on_cache_miss=None) -> SongStems:
    plan = None
    try:
        plan = _v3_plan()
    except Exception:  # never let the optional chain block conversion
        logging.getLogger(__name__).exception('v3 separation plan unavailable')
    if plan is not None:
        try:
            return _separate_v3(source, output_dir, plan, on_cache_miss)
        except SeparationRuntimeError as error:
            logging.getLogger(__name__).warning('v3 separation fell back to legacy: %s', error.code)
            if not separation_status()["ready"]:
                raise
            on_cache_miss = None  # models were already released for the v3 attempt
    if not separation_status()["ready"]:
        raise SeparationRuntimeError("RVC_SEPARATOR_UNAVAILABLE")
    worker = Path(__file__).with_name("separation_worker.py")
    key = None
    if separation_cache.cache_root() is not None:
        try:
            runtime = [SEPARATOR_MODEL, SEPARATOR_DEVICE]
            for package in ('pymss', 'torch', 'torchaudio'):
                runtime.append(importlib.metadata.version(package))
            key = separation_cache.cache_key(source, [
                SEPARATOR_MODELS_DIR / SEPARATOR_MODEL_RELATIVE,
                SEPARATOR_MODELS_DIR / SEPARATOR_CONFIG_RELATIVE, worker,
            ], json.dumps(runtime))
            sample_rate = separation_cache.restore(key, output_dir)
            if sample_rate is not None:
                return SongStems(output_dir.resolve() / 'vocals.wav',
                                 output_dir.resolve() / 'instrumental.wav', sample_rate, True)
        except (OSError, importlib.metadata.PackageNotFoundError):
            logging.getLogger(__name__).warning('Separation reuse unavailable; running normal inference')
            key = None
    if on_cache_miss is not None:
        on_cache_miss()
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
            encoding='utf-8',
            errors='replace',
            env={**os.environ, 'PYTHONUTF8':'1', 'PYTHONIOENCODING':'utf-8'},
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
    if key is not None:
        try:
            separation_cache.store(key, vocals, instrumental, sample_rate)
        except OSError:
            logging.getLogger(__name__).warning('Cannot retain separation cache; completed stems remain usable')
    return SongStems(vocals=vocals, instrumental=instrumental, sample_rate=sample_rate)


def calibrate_song_vocals(source_vocals: Path, converted_vocals: Path,
                          minimum_gain: float = 0.5, maximum_gain: float = 1.5) -> float:
    """Apply one conservative vocal gain before remix, measured on voiced frames.

    Band-limited measurement avoids comparing source hiss/air with a model's
    different high-frequency response. Only the converted stem is modified;
    the accompaniment, its channels and its timeline remain untouched.
    """
    import numpy as np
    import soundfile as sf
    from scipy.signal import butter, sosfiltfilt
    from app.audio_dynamics import envelope

    source, source_rate = sf.read(source_vocals, dtype="float32")
    converted, converted_rate = sf.read(converted_vocals, dtype="float32")
    if not np.isfinite(source).all() or not np.isfinite(converted).all():
        raise SeparationRuntimeError("RVC_REMIX_FAILED")
    if abs(len(source) / source_rate - len(converted) / converted_rate) > 0.2:
        raise SeparationRuntimeError("RVC_REMIX_FAILED")

    def measured_envelope(audio, rate):
        mono = np.mean(audio, axis=1) if audio.ndim == 2 else audio
        upper = min(4000., rate * .45)
        sos = butter(2, [120., upper], btype="bandpass", fs=rate, output="sos")
        return envelope(sosfiltfilt(sos, mono), rate)

    source_times, source_levels = measured_envelope(source, source_rate)
    converted_times, converted_levels = measured_envelope(converted, converted_rate)
    if not len(source_times) or not len(converted_times):
        return 1.0
    converted_levels = np.interp(source_times, converted_times, converted_levels)
    # Exclude silence, separator leakage and rare peaks before estimating a
    # single gain. Do not chase each syllable with another fast envelope.
    threshold = max(.003, float(np.quantile(source_levels, .25)))
    active = (source_levels > threshold) & (converted_levels > .003)
    if np.count_nonzero(active) < 20:
        return 1.0
    source_active = source_levels[active]
    converted_active = converted_levels[active]
    middle = ((source_active <= np.quantile(source_active, .95))
              & (converted_active <= np.quantile(converted_active, .95)))
    ratio = float(np.median(source_active[middle] / converted_active[middle]))
    gain = float(np.clip(ratio, minimum_gain, maximum_gain))
    sf.write(converted_vocals, converted * gain, converted_rate, subtype="FLOAT")
    return gain


def remix_song(
    instrumental: Path,
    converted_vocals: Path,
    destination: Path,
    duration_seconds: float,
    sample_rate: int,
    vocal_gain_db: float = 0.0,
    accompaniment_gain_db: float = 0.0,
    vocal_mute: bool = False,
    accompaniment_mute: bool = False,
) -> None:
    import math
    import soundfile as sf

    if not all(math.isfinite(value) and -24 <= value <= 6
               for value in (vocal_gain_db, accompaniment_gain_db)):
        raise SeparationRuntimeError("RVC_INVALID_PARAMETER")
    duration = max(1.0, float(duration_seconds))
    rate = sample_rate if sample_rate in {32000, 44100, 48000} else 44100
    # Only compensate the sub-frame rounding introduced by resampling. A large
    # mismatch is an upstream alignment defect and must not be hidden by apad.
    if (abs(sf.info(instrumental).duration - duration) > 0.1
            or abs(sf.info(converted_vocals).duration - duration) > 0.1):
        raise SeparationRuntimeError("RVC_REMIX_ALIGNMENT_FAILED")
    music_gain = 0.0 if accompaniment_mute else 10 ** (accompaniment_gain_db / 20)
    voice_gain = 0.0 if vocal_mute else 10 ** (vocal_gain_db / 20)
    filter_graph = (
        f"[0:a]aresample={rate}:async=0:first_pts=0,apad,atrim=end={duration:.6f},"
        f"volume={music_gain:.10f}[music];"
        f"[1:a]aresample={rate}:async=0:first_pts=0,"
        f"pan=stereo|c0=c0|c1=c0,apad,atrim=end={duration:.6f},"
        f"volume={voice_gain:.10f}[voice];"
        "[music][voice]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[out]"
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
            "pcm_f32le",
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
