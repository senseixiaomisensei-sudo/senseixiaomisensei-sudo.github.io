"""Pinned adapter for the upstream RVC WebUI inference implementation.

The operator installs the exact upstream source checkout separately and points
``RVC_OFFICIAL_ROOT`` at it.  This service never downloads or executes a model
uploaded by a browser; only administrator-mounted ``.pth``/``.index`` files are
eligible for loading.
"""

from __future__ import annotations

import os
import hashlib
import shutil
import sys
import tempfile
import typing
from dataclasses import dataclass
from pathlib import Path


OFFICIAL_COMMIT = "8f2fdbf483955f924b4c87ab34919170d0b704ed"
OFFICIAL_TAG = "2.3.260718"


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
    ) -> None:
        import soundfile as sf

        status, result = self._vc.vc_single(
            0,
            str(input_path),
            pitch,
            f0_method,
            self._index_path,
            index_rate,
            resample_rate,
            rms_mix_rate,
            protect,
        )
        if not result or result[0] is None or result[1] is None:
            raise OfficialRuntimeError(str(status))
        sample_rate, audio = result
        sf.write(str(output_path), audio, int(sample_rate), subtype="PCM_16")


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
