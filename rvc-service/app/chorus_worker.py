"""Isolated, pinned singing-source separator; never use pitch-band splitting."""
from __future__ import annotations
import argparse
import contextlib
import hashlib
import importlib.util
import json
import sys
import types
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from scipy.signal import resample_poly

REVISION = '8e750521b5942f4717656cac86a23cf0bd90dea5'
RATE = 24000


def load_model(root: Path):
    manifest = json.loads((root / '固定资源.json').read_text(encoding='utf-8'))
    if manifest['revision'] != REVISION:
        raise ValueError('CHORUS_RESOURCE_REVISION')
    for name, expected in manifest['files'].items():
        path = (root / name).resolve()
        if root.resolve() not in path.parents or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError('CHORUS_RESOURCE_HASH')
    # Import the inference-only modules without the author's training/UI imports.
    for name, folder in [('look2hear', root/'look2hear'),
                         ('look2hear.models', root/'look2hear/models'),
                         ('look2hear.models.layers', root/'look2hear/models/layers')]:
        package = types.ModuleType(name)
        package.__path__ = [str(folder)]
        sys.modules[name] = package
    name = 'look2hear.models.unmixx_model'
    path = root / 'look2hear/models/unmixx_model.py'
    source = path.read_text(encoding='utf-8')
    # Asteroid's sole inference dependency is last-axis padding. No network,
    # training dependencies or arbitrary checkpoint objects are executed.
    source = source.replace('from asteroid.utils.torch_utils import pad_x_to_y',
        'def pad_x_to_y(x, y):\n    return F.pad(x, (0, y.shape[-1] - x.shape[-1]))')
    # Upstream computes b=[batch,source,time] but accidentally uses the flattened
    # output in mixture consistency. Sum over sources, never over audio samples.
    source = source.replace('reconstructed = pad_x_to_y(output, input)',
                            'reconstructed = pad_x_to_y(b, input)')
    module = types.ModuleType(name)
    module.__package__ = 'look2hear.models'
    sys.modules[name] = module
    exec(compile(source, str(path), 'exec'), module.__dict__)
    with contextlib.redirect_stdout(sys.stderr):
        model = module.UNMIXX(sample_rate=RATE, out_channels=128, in_channels=256,
            num_blocks=8, upsampling_depth=5, win=960, stride=240, num_sources=2)
    ckpt = torch.load(root/'ckpt/best.ckpt', map_location='cpu', weights_only=True)
    state = {k.removeprefix('audio_model.'): v for k, v in ckpt['state_dict'].items()}
    model.load_state_dict(state, strict=True)
    return model.eval().cuda(), manifest, hashlib.sha256(source.encode()).hexdigest()


def align_pair(previous: np.ndarray, current: np.ndarray) -> tuple[np.ndarray, bool]:
    """Assign the overlap by waveform error; do not reorder by pitch or volume."""
    n = min(previous.shape[-1], current.shape[-1])
    a, b = previous[:, -n:], current[:, :n]
    direct = float(np.mean((a-b)**2))
    reverse = float(np.mean((a-b[::-1])**2))
    ambiguous = max(direct, reverse) < 1e-12 or abs(direct-reverse) < .08*max(direct, reverse)
    return (current[::-1].copy() if reverse < direct else current), ambiguous


@torch.inference_mode()
def split_pair(model, audio: np.ndarray) -> tuple[np.ndarray, list[dict]]:
    # 12 s windows / 2 s overlap bound GPU memory, complementary linear fades
    # keep correlated waveforms at unity gain. The first/last sample are retained.
    window, overlap = RATE*12, RATE*2
    result = np.zeros((2, len(audio)), np.float32)
    boundaries = []
    end = 0
    for start in range(0, len(audio), window-overlap):
        stop = min(start+window, len(audio))
        x = audio[start:stop]
        if len(x) < 960:
            x = np.pad(x, (0, 960-len(x)))
        y = model(torch.from_numpy(x)[None, None].cuda(), istest=True)[0]
        y = y[0, :, :stop-start].float().cpu().numpy()
        if y.shape != (2, stop-start) or not np.isfinite(y).all():
            raise ValueError('CHORUS_INVALID_STEMS')
        n = max(0, end-start)
        ambiguous = False
        if n:
            y, ambiguous = align_pair(result[:, start:end], y)
            weight = np.linspace(0, 1, n, dtype=np.float32)
            result[:, start:end] = result[:, start:end]*(1-weight) + y[:, :n]*weight
        result[:, start+n:stop] = y[:, n:]
        boundaries.append({'startSample': start, 'endSample': stop, 'assignmentUncertain': ambiguous})
        end = stop
        if stop == len(audio): break
    return result, boundaries


def split_evidence(pair: np.ndarray) -> dict:
    energy = np.mean(pair.astype(np.float64)**2, axis=1)
    ratio = float(min(energy)/max(max(energy), 1e-15))
    correlation = float(abs(np.dot(pair[0].astype(np.float64), pair[1]) /
        max(np.sqrt(np.sum(pair[0].astype(np.float64)**2)*np.sum(pair[1].astype(np.float64)**2)), 1e-15)))
    # These are separation diagnostics, not a calibrated speaker probability.
    return {'secondaryEnergyRatio': ratio, 'waveformCorrelation': correlation,
            'distinctCandidate': ratio >= .035 and correlation < .65}


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--root', type=Path, required=True)
    p.add_argument('--input', type=Path, required=True)
    p.add_argument('--output-dir', type=Path, required=True)
    p.add_argument('--count', choices=['auto','2','3','4'], default='auto')
    a = p.parse_args()
    torch.manual_seed(777)
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False
    audio, rate = sf.read(a.input, dtype='float32', always_2d=True)
    audio = audio.mean(axis=1)
    if not np.isfinite(audio).all(): raise ValueError('CHORUS_INVALID_INPUT')
    if rate != RATE:
        import math
        gcd = math.gcd(rate, RATE)
        audio = resample_poly(audio, RATE//gcd, rate//gcd).astype(np.float32)
    model, manifest, code_hash = load_model(a.root)
    tracks, bounds = split_pair(model, audio)
    evidence = [{'parent': 'mix', **split_evidence(tracks), 'boundaries': bounds}]
    wanted = 4 if a.count == 'auto' else int(a.count)
    leaves = [t for t in tracks]
    while len(leaves) < wanted:
        candidates = []
        for i, leaf in enumerate(leaves):
            pair, boundaries = split_pair(model, leaf)
            info = split_evidence(pair)
            evidence.append({'parent': i, **info, 'boundaries': boundaries})
            if info['distinctCandidate']:
                candidates.append((info['secondaryEnergyRatio']*(1-info['waveformCorrelation']), i, pair))
        if not candidates: break
        _, i, pair = max(candidates, key=lambda v: v[0])
        leaves[i:i+1] = list(pair)
    a.output_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for i, track in enumerate(leaves):
        path = a.output_dir / f'singer-{i+1}.wav'
        sf.write(path, track, RATE, subtype='FLOAT')
        paths.append(str(path.resolve()))
    payload = {'engine': 'unmixx-recursive', 'modelRevision': REVISION, 'modelSha256': manifest['files']['ckpt/best.ckpt'],
        'adaptedCodeSha256': code_hash, 'sampleRate': RATE, 'frames': len(audio), 'tracks': paths,
        'requestedCount': a.count, 'estimatedCount': len(leaves), 'countNeedsReview': True,
        'experimentalRecursive': len(leaves)>2, 'evidence': evidence,
        'reconstructionRms': float(np.sqrt(np.mean((np.sum(leaves, axis=0)-audio).astype(np.float64)**2)))}
    (a.output_dir/'analysis.json').write_text(json.dumps(payload, indent=2), encoding='utf-8')
    print(json.dumps(payload))


if __name__ == '__main__': main()
