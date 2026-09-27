"""Pinned adapter for the upstream RVC WebUI inference implementation.

The operator installs the exact upstream source checkout separately and points
``RVC_OFFICIAL_ROOT`` at it.  This service never downloads or executes a model
uploaded by a browser; only administrator-mounted ``.pth``/``.index`` files are
eligible for loading.
"""

from __future__ import annotations

import os
import hashlib
import json
import math
import shutil
import sys
import tempfile
import typing
from dataclasses import dataclass
from pathlib import Path


OFFICIAL_COMMIT = "8f2fdbf483955f924b4c87ab34919170d0b704ed"
OFFICIAL_TAG = "2.3.260718"
UPSTREAM_NOISE_SCALE = 0.66666
DEFAULT_NOISE_SCALE = 0.35


def model_noise_scale(model_path: Path) -> float:
    """Use the same operator-owned synthesis setting as the browser engine."""
    try:
        metadata = json.loads((model_path.parent / "meta.json").read_text(encoding="utf-8"))
        value = metadata.get("noiseScale", DEFAULT_NOISE_SCALE)
        if isinstance(value, bool):
            return DEFAULT_NOISE_SCALE
        value = float(value)
        if math.isfinite(value) and 0 < value <= 1:
            return value
    except (OSError, ValueError, TypeError, AttributeError):
        pass
    return DEFAULT_NOISE_SCALE


def model_profile_revision(model_path: Path) -> str:
    path = model_path.parent/'meta.json'
    content = path.read_bytes() if path.is_file() else b''
    return hashlib.sha256(content + repr(model_noise_scale(model_path)).encode('ascii')).hexdigest()


def configure_synthesis_noise(synthesizer, noise_scale: float):
    """Scale only the prior's random component, without changing model weights.

    The pinned upstream v1/v2, F0/non-F0 infer methods hard-code 0.66666.
    Adjusting log standard deviation before their sampling step is exactly
    equivalent to replacing that multiplier; the mean and voiced mask stay
    untouched. A model-scoped hook also works during CUDA graph capture.
    """
    log_ratio = math.log(noise_scale / UPSTREAM_NOISE_SCALE)

    def scale_prior_noise(_module, _inputs, result):
        mean, log_std, mask = result
        return mean, log_std + log_ratio, mask

    return synthesizer.enc_p.register_forward_hook(scale_prior_noise)


class OfficialRuntimeError(RuntimeError):
    """Raised when the pinned upstream runtime is missing or incompatible."""


@dataclass(frozen=True)
class RuntimeInfo:
    root: Path
    device: str
    is_half: bool


def _runtime_root() -> Path:
    configured = os.getenv("RVC_OFFICIAL_ROOT", "/opt/rvc-official").strip()
    root = Path(configured).resolve()
    required = (
        root / "infer" / "vc" / "modules.py",
        root / "infer" / "vc" / "pipeline.py",
        root / "infer" / "hubert.py",
        root / "assets" / "hubert_base" / "config.json",
        root / "assets" / "hubert_base" / "preprocessor_config.json",
        root / "assets" / "hubert_base" / "pytorch_model.bin",
        root / "rmvpe.pt",
    )
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        raise OfficialRuntimeError("RVC official runtime is incomplete: " + ", ".join(missing))
    return root


def _verify_checkout(root: Path) -> None:
    """Require the setup script's commit marker before importing executable code."""
    marker = root / ".postprep-rvc-commit"
    try:
        recorded = marker.read_text(encoding="utf-8").strip()
    except OSError as error:
        raise OfficialRuntimeError("RVC official commit marker is missing") from error
    if recorded != OFFICIAL_COMMIT:
        raise OfficialRuntimeError(f"RVC official commit mismatch: expected {OFFICIAL_COMMIT}")


def _select_device() -> tuple[str, bool]:
    import torch

    if not torch.cuda.is_available():
        return "cpu", False
    index = 0
    major, minor = torch.cuda.get_device_capability(index)
    memory = torch.cuda.get_device_properties(index).total_memory
    # Mirrors the upstream 2.3.260718 inference eligibility rule: at least
    # 4 GiB and SM 5.3; fp16 only on architectures newer than Pascal 6.1.
    if memory < 4 * 1024**3 or (major, minor) < (5, 3):
        return "cpu", False
    return f"cuda:{index}", (major, minor) > (6, 1)


def _config(device: str, is_half: bool):
    class ServiceConfig:
        pass

    config = ServiceConfig()
    config.device = device
    config.is_half = is_half
    if is_half:
        config.x_pad, config.x_query, config.x_center, config.x_max = 3, 10, 60, 65
    else:
        config.x_pad, config.x_query, config.x_center, config.x_max = 1, 6, 38, 41
    return config


class OfficialRvcModel:
    """One loaded upstream ``VC`` instance bound to an operator model."""

    def __init__(self, model_path: Path, index_path: str) -> None:
        # Configure cuBLAS before its first inference allocation. RNG seeding
        # alone does not make CUDA attention/retrieval replays reproducible.
        os.environ.setdefault("CUBLAS_WORKSPACE_CONFIG", ":4096:8")
        root = _runtime_root()
        _verify_checkout(root)
        root_text = str(root)
        if root_text not in sys.path:
            sys.path.insert(0, root_text)
        # Upstream I18nAuto resolves its locale files from the process working
        # directory, so inference services must enter the pinned checkout
        # before importing the upstream modules.
        os.chdir(root)
        os.environ["rmvpe_root"] = root_text
        os.environ["weight_root"] = str(model_path.parent)
        os.environ["index_root"] = str(model_path.parent)
        os.environ["outside_index_root"] = str(model_path.parent)

        device, is_half = _select_device()
        from infer.vc.modules import VC
        import torch

        # PyTorch 2.6+ defaults to the safer weights-only unpickler. Some
        # historical RVC checkpoints serialize typing.OrderedDict; allow only
        # that inert mapping type rather than disabling weights_only and
        # permitting arbitrary pickle execution.
        torch.serialization.add_safe_globals([typing.OrderedDict])

        staged_model, staged_index = _stage_checkpoint(
            model_path,
            Path(index_path) if index_path else None,
            torch,
        )
        os.environ["weight_root"] = str(staged_model.parent)
        os.environ["index_root"] = str(staged_model.parent)
        os.environ["outside_index_root"] = str(staged_model.parent)

        self.info = RuntimeInfo(root=root, device=device, is_half=is_half)
        self._vc = VC(_config(device, is_half))
        self._vc.get_vc(staged_model.name)
        from app.content_encoder import checkpoint_encoder_contract
        self.encoder_contract = checkpoint_encoder_contract(self._vc.cpt)
        self.encoder_metadata = None
        self.model_path = model_path
        from app.upstream_pipeline import ServicePipeline, UPSTREAM_PIPELINE_SHA256
        if _sha256(root / 'infer/vc/pipeline.py') != UPSTREAM_PIPELINE_SHA256:
            raise OfficialRuntimeError('Unreviewed upstream pipeline; reinstall the pinned checkout')
        self._vc.pipeline = ServicePipeline(self._vc.tgt_sr, self._vc.config)
        self.noise_scale = model_noise_scale(model_path)
        self.profile_revision = model_profile_revision(model_path)
        self._noise_hook = configure_synthesis_noise(self._vc.net_g, self.noise_scale)
        from types import MethodType
        from app.pitch_safety import safe_get_f0
        self._vc.pipeline.get_f0 = MethodType(safe_get_f0, self._vc.pipeline)
        # Keep the pinned upstream's fixed index/protect blend. Per-frame
        # adaptive retrieval regressed real A/B vocals and overflowed FAISS
        # distance weights on an operator model.
        self._index_path = str(staged_index) if staged_index else ""

    def infer(
        self,
        input_path: Path,
        output_path: Path,
        *,
        pitch: int,
        f0_method: str,
        index_rate: float,
        resample_rate: int,
        rms_mix_rate: float,
        protect: float,
        filter_radius: int = 3,
        diagnostic_f0_dir: Path | None = None,
        time_origin_seconds: float = 0.0,
        analysis_context=None,
    ) -> None:
        import random

        import numpy as np
        import soundfile as sf
        import torch

        # Upstream synthesizers sample excitation noise internally. Reset the
        # relevant RNGs and deterministic CUDA preferences to reduce run-to-run
        # spread. GPU inference is not promised to be bit-identical, so the
        # measured click/de-esser/limiter guard remains mandatory afterwards.
        seed = 20260823
        random.seed(seed)
        np.random.seed(seed)
        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)
        if hasattr(torch.backends, "cudnn"):
            torch.backends.cudnn.benchmark = False
            torch.backends.cudnn.deterministic = True
        try:
            torch.use_deterministic_algorithms(True, warn_only=True)
        except TypeError:
            torch.use_deterministic_algorithms(True)

        # The web default is zero. Enable the single 3-tap voiced-frame median
        # only for an explicit high filter radius; preserve ornaments otherwise.
        self._vc.pipeline.pitch_median_radius = 1 if int(filter_radius) >= 5 else 0
        pipeline = self._vc.pipeline
        pipeline.diagnostic_f0_dir = diagnostic_f0_dir
        pipeline.diagnostic_f0_count = 0
        pipeline.time_origin_seconds = time_origin_seconds
        pipeline.stage_records = []
        pipeline.analysis_context = analysis_context
        pipeline.synthesis_seed = seed
        pipeline.synthesis_backend = os.getenv('RVC_SYNTHESIS_BACKEND', 'eager')
        if pipeline.synthesis_backend not in {'eager','cuda-graph'}:
            raise OfficialRuntimeError('Invalid RVC_SYNTHESIS_BACKEND')
        from app.stage_evidence import flush, observe
        from app.inference_errors import InferenceStageError
        from tools.cuda_graph import cuda_graph_enabled, get_cuda_graph_stats
        self.last_run_metadata = {
            'modelVersion': self._vc.version, 'sampleRate': self._vc.tgt_sr,
            'f0Enabled': bool(self._vc.if_f0),
            'speakerCount': int(self._vc.net_g.emb_g.weight.shape[0]),
            'featureDimension': int(self._vc.net_g.enc_p.emb_phone.weight.shape[1]),
            'noiseScale': self.noise_scale, 'seed': seed,
            'cublasWorkspaceConfig': os.getenv('CUBLAS_WORKSPACE_CONFIG', ''),
            'profileRevision': self.profile_revision,
            'precision': 'float16' if self.info.is_half else 'float32',
            'executionBackend': 'cuda-graph' if cuda_graph_enabled(self.info.device) else 'eager',
            'adapterSha256': _sha256(Path(__file__).with_name('upstream_pipeline.py')),
            'timeOriginSeconds': time_origin_seconds,
        }
        try:
            # The WebUI wrapper catches all exceptions and converts them to
            # translated text. Keep its input contract, but preserve typed
            # stage failures and the adapter's float output for this service.
            from infer.audio import load_audio
            from app.content_encoder import load_content_encoder
            audio = load_audio(str(input_path), 16000)
            observe(pipeline, 'decoded-16k', audio, sample_rate=16000,
                    timeOriginSeconds=time_origin_seconds)
            input_gain = (1. if analysis_context is not None else
                          min(1., .95/max(float(np.max(np.abs(audio))), 1e-12)))
            if input_gain < 1:
                audio *= input_gain
            pipeline.stage_records.append({'stage':'input-headroom','gain':input_gain})
            if self._vc.hubert_model is None:
                self._vc.hubert_model, self.encoder_metadata = load_content_encoder(
                    self.encoder_contract, self._vc.config, self.model_path)
            self.last_run_metadata['contentEncoder'] = self.encoder_metadata
            audio = pipeline.pipeline(
                self._vc.hubert_model, self._vc.net_g, 0, audio, [0.,0.,0.],
                int(pitch), f0_method, self._index_path, index_rate,
                self._vc.if_f0, self._vc.tgt_sr, resample_rate, rms_mix_rate,
                self._vc.version, protect,
            )
            sample_rate = resample_rate if resample_rate >= 16000 else self._vc.tgt_sr
            if np.asarray(audio).dtype != np.float32:
                raise InferenceStageError('output-contract', 'Expected float32 synthesis')
            observe(pipeline, 'service-float', audio, sample_rate=int(sample_rate),
                    timeOriginSeconds=time_origin_seconds)
            sf.write(str(output_path), audio, int(sample_rate), subtype='FLOAT')
        except InferenceStageError as error:
            self.last_run_metadata['errorStage'] = error.stage
            raise
        finally:
            self.last_run_metadata['cudaGraphEnabled'] = bool(cuda_graph_enabled(self.info.device))
            self.last_run_metadata['synthesisGraphStats'] = get_cuda_graph_stats(self._vc.net_g)
            self.last_run_metadata['synthesisExecution'] = [row for row in pipeline.stage_records
                if row['stage']=='synthesis-execution']
            self.last_run_metadata['executionBackend'] = '+'.join(dict.fromkeys(
                row['backend'] for row in self.last_run_metadata['synthesisExecution'])) or 'not-executed'
            self.last_run_metadata['retrieval'] = [row for row in pipeline.stage_records
                if row['stage'] in {'index-load','retrieval-search'}]
            flush(pipeline, self.last_run_metadata)
            pipeline.diagnostic_f0_dir = None
            pipeline.analysis_context = None


def runtime_info() -> RuntimeInfo:
    root = _runtime_root()
    _verify_checkout(root)
    device, is_half = _select_device()
    return RuntimeInfo(root=root, device=device, is_half=is_half)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _stage_checkpoint(model_path: Path, index_path: Path | None, torch):
    """Safely normalize supported legacy metadata and use an ASCII cache path.

    FAISS on Windows cannot reliably open an index under a non-ASCII path.
    Staging also lets PyTorch's weights-only loader normalize one known Applio
    v2 metadata extension without changing any trained tensors.
    """
    model_digest = _sha256(model_path)
    cache_root = Path(os.getenv("RVC_RUNTIME_CACHE", Path(tempfile.gettempdir()) / "postprep-rvc-official")).resolve()
    stage = cache_root / model_digest
    stage.mkdir(parents=True, exist_ok=True)
    staged_model = stage / "model.pth"
    if not staged_model.is_file():
        # `.pth` files are third-party model containers.  Pin this to the
        # safe tensor-only loader instead of relying on PyTorch's version
        # default, so arbitrary pickle payloads are never deserialised.
        checkpoint = torch.load(model_path, map_location="cpu", weights_only=True)
        config = checkpoint.get("config") if isinstance(checkpoint, dict) else None
        version = checkpoint.get("version") if isinstance(checkpoint, dict) else None
        # Applio/RVC exports sometimes append the ContentVec output dimension
        # before sample rate. Upstream RVC v2 already fixes that dimension at
        # 768 in TextEncoder, so the redundant field must be removed.
        if isinstance(config, list) and version == "v2" and len(config) == 19 and config[-2] == 768:
            checkpoint = dict(checkpoint)
            checkpoint["config"] = [*config[:-2], config[-1]]
        torch.save(checkpoint, staged_model)

    staged_index = None
    if index_path and index_path.is_file():
        index_digest = _sha256(index_path)
        staged_index = stage / f"model-{index_digest}.index"
        if not staged_index.is_file():
            shutil.copyfile(index_path, staged_index)
    return staged_model, staged_index
