"""Contracts and floating-point mixing for short-lived chorus sessions."""
from __future__ import annotations
import json
import math
import os
import re
import subprocess
import sys
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

ENGINE_ROOT = Path(os.getenv('RVC_CHORUS_ENGINE_ROOT',
    'E:/大肥鱼/合唱与堆叠升级/20261003/分离引擎')).resolve()


def chorus_status():
    return {'ready': all((ENGINE_ROOT/name).is_file() for name in
        ['固定资源.json','ckpt/best.ckpt','look2hear/models/unmixx_model.py']),
        'engine': 'unmixx-recursive', 'maxSingers': 4, 'recursiveNeedsReview': True}


def encode_mobile_mp3(source: Path, destination: Path, bitrate: int, measure_peak):
    """Encode from a float/lossless source; verify the decoded true peak."""
    if bitrate not in {96,128}: raise ValueError('CHORUS_INVALID_PARAMETER')
    gain=0.
    destination.parent.mkdir(parents=True,exist_ok=True)
    try:
        for attempt in range(3):
            subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-i',str(source),
                '-af',f'volume={gain}dB','-c:a','libmp3lame','-b:a',f'{bitrate}k',str(destination)],
                check=True,timeout=180)
            peak=measure_peak(destination)
            if peak<=-1.: return {'bitrateKbps':bitrate,'truePeakDbtp':peak,'encodingGainDb':gain}
            if not math.isfinite(peak): raise ValueError('CHORUS_OUTPUT_SAFETY_FAILED')
            gain+=min(-.1,-1.1-peak)
        raise ValueError('CHORUS_OUTPUT_SAFETY_FAILED')
    except BaseException:
        destination.unlink(missing_ok=True)
        raise


def separate_singers(source: Path, output: Path, count: str):
    if count not in {'auto','2','3','4'}: raise ValueError('CHORUS_INVALID_COUNT')
    if not chorus_status()['ready']: raise ValueError('CHORUS_ENGINE_UNAVAILABLE')
    result = subprocess.run([sys.executable, str(Path(__file__).with_name('chorus_worker.py')),
        '--root', str(ENGINE_ROOT), '--input', str(source), '--output-dir', str(output), '--count', count],
        capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=3600,
        env={**os.environ, 'PYTHONUTF8':'1', 'PYTHONIOENCODING':'utf-8'})
    if result.returncode: raise RuntimeError('CHORUS_SEPARATION_FAILED')
    payload = json.loads(result.stdout.strip().splitlines()[-1])
    paths = [Path(p).resolve() for p in payload['tracks']]
    if not 1 <= len(paths) <= 4 or any(output.resolve() not in p.parents or not p.is_file() for p in paths):
        raise RuntimeError('CHORUS_INVALID_STEMS')
    return payload


def validate_tracks(value, count):
    if not isinstance(value, list) or len(value) != count or not 1 <= count <= 4:
        raise ValueError('CHORUS_INVALID_TRACKS')
    allowed = {'trackId','modelId','pitch','indexRate','protect','rmsMixRate','f0Method','gainDb','mute'}
    result = []
    for i, track in enumerate(value):
        if not isinstance(track, dict) or set(track)-allowed or type(track.get('trackId')) is not int or track['trackId'] != i+1:
            raise ValueError('CHORUS_INVALID_TRACKS')
        model = track.get('modelId', '')
        if not isinstance(model, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', model):
            raise ValueError('CHORUS_INVALID_MODEL')
        params = {'trackId': i+1, 'modelId': model}
        for key, default, low, high in [('pitch',0,-24,24),('indexRate',.3,0,1),
            ('protect',.25,0,.5),('rmsMixRate',1,0,1),('gainDb',0,-24,6)]:
            n = track.get(key, default)
            if isinstance(n, bool) or not isinstance(n, (int,float)) or not math.isfinite(n) or not low <= n <= high:
                raise ValueError('CHORUS_INVALID_PARAMETER')
            if key == 'pitch' and int(n) != n: raise ValueError('CHORUS_INVALID_PARAMETER')
            params[key] = int(n) if key == 'pitch' else float(n)
        params['mute'] = track.get('mute', False)
        params['f0Method'] = track.get('f0Method','rmvpe')
        if type(params['mute']) is not bool or params['f0Method'] not in {'auto','rmvpe','fcpe','pm'}:
            raise ValueError('CHORUS_INVALID_PARAMETER')
        result.append(params)
    return result


def mix_tracks(vocals: list[Path], params: list[dict], accompaniment: Path,
               output: Path, accompaniment_db=0., accompaniment_mute=False):
    """Apply user gains after calibration; never normalize individual stems."""
    if isinstance(accompaniment_db,bool) or not math.isfinite(accompaniment_db) or not -24 <= accompaniment_db <= 6:
        raise ValueError('CHORUS_INVALID_PARAMETER')
    if type(accompaniment_mute) is not bool or len(vocals) != len(params):
        raise ValueError('CHORUS_INVALID_PARAMETER')
    mix, rate = sf.read(accompaniment, dtype='float32', always_2d=True)
    if not np.isfinite(mix).all(): raise ValueError('CHORUS_INVALID_STEMS')
    mix *= 0. if accompaniment_mute else 10**(accompaniment_db/20)
    for path, param in zip(vocals, params):
        x, sr = sf.read(path, dtype='float32', always_2d=True)
        if not np.isfinite(x).all() or abs(len(x)/sr-len(mix)/rate) > .03:
            raise ValueError('CHORUS_ALIGNMENT_FAILED')
        if sr != rate:
            gcd = math.gcd(sr,rate)
            x = resample_poly(x,rate//gcd,sr//gcd,axis=0).astype(np.float32)
        # Only compensate the bounded RVC frame-rounding tail, never time-stretch.
        x = x[:len(mix)]
        if len(x) < len(mix): x = np.pad(x, ((0,len(mix)-len(x)),(0,0)))
        if x.shape[1] not in {1,mix.shape[1]}: raise ValueError('CHORUS_CHANNELS_FAILED')
        mix += x*(0. if param['mute'] else 10**(param['gainDb']/20))
    sf.write(output, mix, rate, subtype='FLOAT')
