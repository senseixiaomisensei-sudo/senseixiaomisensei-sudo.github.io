"""Honor the content-feature contract stored in an operator-owned checkpoint.

Equal feature dimensions do not make differently trained encoders compatible.
Japanese HuBERT uses a pinned, local safetensors export from its contributor's
mirror. No inference request downloads executable code or model resources.
"""
from dataclasses import asdict, dataclass
from pathlib import Path
import hashlib
import os

JAPANESE_REVISION = '9c86c1a3424e8cddca3e59d01c2ed5477e628fcc'
JAPANESE_FILES = {
    'model.safetensors': '9ee2d1c9e6041e4185491183451bd7bd5d771564343874a3ef9c006218663406',
    'config.json': '2cc68fe950504f7468f4e786a31b8bf65c922de2b9f92cd252e3919bed689fe1',
    'preprocessor_config.json': '11b3be6aa5979d76000d415a42e74e78fbc7de313e9d3d1a8ac41416b34b3ae9',
}


@dataclass(frozen=True)
class EncoderContract:
    name: str
    output_layer: int
    feature_dimension: int
    declaration: str


def checkpoint_encoder_contract(checkpoint: dict) -> EncoderContract:
    version = checkpoint.get('version', 'v1')
    if version not in {'v1', 'v2'}:
        raise ValueError('Unsupported RVC feature version')
    declared = checkpoint.get('embedder_name')
    name = str(declared or 'hubert_base')
    if name in {'hubert-base', 'contentvec'}:
        name = 'hubert_base'
    if name not in {'hubert_base', 'hubert-base-japanese'}:
        raise ValueError(f'Unsupported content encoder: {name}')
    expected_layer = 9 if version == 'v1' else 12
    layer = checkpoint.get('embedder_output_layer', expected_layer)
    if isinstance(layer, bool) or not isinstance(layer, int) or layer != expected_layer:
        raise ValueError('Checkpoint declares an unverified content encoder output layer')
    if name == 'hubert-base-japanese' and version != 'v2':
        raise ValueError('Japanese HuBERT projection for RVC v1 has not been verified')
    return EncoderContract(name, layer, 256 if version == 'v1' else 768,
                           'checkpoint' if declared else 'legacy-default')


def _hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def load_content_encoder(contract: EncoderContract, config, model_path: Path):
    from infer.vc.utils import load_hubert
    record = asdict(contract)
    record['inputSampleRate'] = 16000
    record['waveformNormalization'] = False
    if contract.name == 'hubert_base':
        from infer.hubert import HUBERT_MODEL_PATH
        encoder = load_hubert(config)
        record.update(checkpointSha256=_hash(HUBERT_MODEL_PATH / 'pytorch_model.bin'),
                      configSha256=_hash(HUBERT_MODEL_PATH / 'config.json'))
        return encoder, record

    root = Path(os.getenv('RVC_EMBEDDER_ROOT', str(model_path.parents[2] / 'encoders')))
    directory = root / 'hubert-base-japanese'
    for name, expected in JAPANESE_FILES.items():
        path = directory / name
        if not path.is_file() or _hash(path) != expected:
            raise ValueError(f'Required Japanese HuBERT resource is missing or has changed: {name}')
    import torch
    from transformers import HubertModel
    encoder = HubertModel.from_pretrained(
        str(directory), local_files_only=True, use_safetensors=True,
        torch_dtype=torch.float16 if config.is_half else torch.float32,
    ).to(config.device).eval()
    record.update(checkpointSha256=JAPANESE_FILES['model.safetensors'],
                  configSha256=JAPANESE_FILES['config.json'], revision=JAPANESE_REVISION,
                  source='https://huggingface.co/yky-h/japanese-hubert-base')
    return encoder, record
