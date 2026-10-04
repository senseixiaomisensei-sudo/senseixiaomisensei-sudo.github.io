"""Measure existing, hash-verified character references; never publish the audio."""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

SITE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SITE / 'rvc-service'))
from app.chorus_worker import RATE, voice_range
from app.speech_runtime import speech_profile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=SITE / 'assets/rvc-voice-ranges.json')
    args = parser.parse_args()
    models = json.loads((SITE / 'assets/rvc-models.json').read_text(encoding='utf8'))['models']
    profiles = {}
    for model in models:
        cid = model['id']
        profile = speech_profile(cid)
        if not profile:
            continue
        source = Path(profile['path'])
        audio, rate = sf.read(source, dtype='float32', always_2d=True)
        audio = audio.mean(axis=1)
        if not np.isfinite(audio).all():
            raise ValueError(f'Non-finite reference: {cid}')
        if rate != RATE:
            divisor = math.gcd(rate, RATE)
            audio = resample_poly(audio, RATE // divisor, rate // divisor).astype(np.float32)
        profiles[cid] = {**voice_range(audio), 'characterId': cid,
            'referenceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'checkpointSha256': model['checkpointSha256']}
        print(cid, profiles[cid].get('medianHz', 'uncertain'), flush=True)
    payload = {'revision': 'reference-range-v1', 'method': 'pyin-bounded-v1',
        'scope': 'Conservative pitch suggestion from game speech references; not a singing quality certification.',
        'profiles': profiles}
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


if __name__ == '__main__':
    main()
