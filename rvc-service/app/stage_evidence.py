"""Small, private per-inference records; retained by diagnostics' existing cap."""
from pathlib import Path
import json

import numpy as np
import soundfile as sf

from app.inference_errors import InferenceStageError


def observe(pipeline, stage, values, *, sample_rate=None, **details):
    if hasattr(values, 'detach'):
        values = values.detach().float().cpu().numpy()
    data = np.asarray(values)
    finite = np.isfinite(data)
    stats = dict(stage=stage, shape=list(data.shape), dtype=str(data.dtype),
                 nonFinite=int(data.size - np.count_nonzero(finite)), **details)
    if data.size and np.any(finite):
        stats.update(minimum=float(data[finite].min()), maximum=float(data[finite].max()))
    root = getattr(pipeline, 'diagnostic_f0_dir', None)
    if root is not None:
        root = Path(root).parent
        root.mkdir(parents=True, exist_ok=True)
        if sample_rate is not None:
            stats.update(sampleRate=int(sample_rate), channels=1, frames=data.size,
                         durationSeconds=data.size/sample_rate)
            name = f'{len(pipeline.stage_records):03d}-{stage}.wav'
            # Never materialize a corrupt file as a successful float snapshot.
            if not stats['nonFinite']:
                sf.write(root/name, data.astype(np.float32), sample_rate, subtype='FLOAT')
                stats['file'] = name
    pipeline.stage_records.append(stats)
    if stats['nonFinite']:
        raise InferenceStageError(stage, f"{stats['nonFinite']} non-finite values")
    return stats


def flush(pipeline, metadata=None):
    root = getattr(pipeline, 'diagnostic_f0_dir', None)
    if root is not None:
        path = Path(root).parent/'inference.json'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(dict(metadata or {}, stages=pipeline.stage_records),
                                   ensure_ascii=False, indent=2), encoding='utf-8')
