"""Optional CPU TTS: explicit pinned download, integrity and synthesis readiness."""
from __future__ import annotations

import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import threading
import urllib.request

import numpy as np
import soundfile as sf

MODEL_ID = 'vits-icefall-zh-aishell3'
URL = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-icefall-zh-aishell3.tar.bz2'
ARCHIVE_SHA256 = 'ab468db3a3308cdd861495e0db2f25d79418a0c00639f74944c7cdf5dd8c6ec1'
DOWNLOAD_BYTES = 31559701
FILES = {'model.onnx', 'lexicon.txt', 'tokens.txt', 'date.fst', 'number.fst', 'phone.fst', 'new_heteronym.fst', 'speakers.txt'}
ROOT = Path(os.getenv('RVC_TTS_MODELS_DIR', str(Path(os.getenv('RVC_RUNTIME_CACHE', tempfile.gettempdir())) / 'postprep-tts'))).resolve()
_lock = threading.RLock()
_synthesis = threading.Lock()
_engine = None
_state = {'state': 'not-installed', 'ready': False, 'downloadedBytes': 0}


def _build(path):
    import sherpa_onnx
    config = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                model=str(path / 'model.onnx'), lexicon=str(path / 'lexicon.txt'), tokens=str(path / 'tokens.txt')),
            num_threads=2, provider='cpu', debug=False),
        rule_fsts=','.join(str(path / name) for name in ('phone.fst', 'date.fst', 'number.fst', 'new_heteronym.fst')),
        max_num_sentences=1)
    if not config.validate(): raise ValueError('RVC_TTS_MODEL_INVALID')
    engine = sherpa_onnx.OfflineTts(config)
    probe = engine.generate('你好，今天是平静的一天。', sid=66, speed=1.)
    if len(probe.samples) < probe.sample_rate // 2 or not np.isfinite(probe.samples).all():
        raise ValueError('RVC_TTS_MODEL_INVALID')
    return engine


def _verify_installed():
    global _engine
    path = ROOT / MODEL_ID
    manifest = json.loads((path / 'installed.json').read_text(encoding='utf-8'))
    if manifest.get('archiveSha256') != ARCHIVE_SHA256 or set(manifest.get('files', {})) != FILES:
        raise ValueError('RVC_TTS_MODEL_INVALID')
    for name, digest in manifest['files'].items():
        if hashlib.sha256((path / name).read_bytes()).hexdigest() != digest:
            raise ValueError('RVC_TTS_MODEL_INVALID')
    _engine = _build(path)
    _state.update(state='ready', ready=True, code=None, modelSha256=manifest['files']['model.onnx'])


def status():
    with _lock:
        if _state['state'] == 'not-installed' and (ROOT / MODEL_ID / 'installed.json').is_file():
            try: _verify_installed()
            except Exception: _state.update(state='failed', ready=False, code='RVC_TTS_MODEL_INVALID')
        return {**_state, 'engine': 'sherpa-onnx-cpu', 'modelId': MODEL_ID, 'downloadBytes': DOWNLOAD_BYTES,
                'languages': ['zh'], 'speakerId': 66, 'installAvailable': importlib.util.find_spec('sherpa_onnx') is not None}


def extract_verified(archive, destination):
    """Only data files; no scripts, links, path traversal or arbitrary extraction."""
    if archive.stat().st_size != DOWNLOAD_BYTES or hashlib.sha256(archive.read_bytes()).hexdigest() != ARCHIVE_SHA256:
        raise ValueError('RVC_TTS_DOWNLOAD_INVALID')
    hashes = {}
    with tarfile.open(archive, 'r:bz2') as package:
        for member in package.getmembers():
            if member.name not in {f'{MODEL_ID}/{name}' for name in FILES}: continue
            if not member.isfile() or not 0 < member.size <= 40 * 1024 * 1024:
                raise ValueError('RVC_TTS_DOWNLOAD_INVALID')
            name = member.name.split('/')[-1]
            if name in hashes: raise ValueError('RVC_TTS_DOWNLOAD_INVALID')
            data = package.extractfile(member).read()
            (destination / name).write_bytes(data)
            hashes[name] = hashlib.sha256(data).hexdigest()
    if set(hashes) != FILES: raise ValueError('RVC_TTS_DOWNLOAD_INVALID')
    return hashes


def _install():
    global _engine
    try:
        ROOT.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='download-', dir=ROOT) as temporary:
            work = Path(temporary)
            archive = work / 'model.tar.bz2'
            with urllib.request.urlopen(URL, timeout=60) as response, archive.open('wb') as output:
                total = 0
                while data := response.read(256 * 1024):
                    total += len(data)
                    if total > DOWNLOAD_BYTES: raise ValueError('RVC_TTS_DOWNLOAD_INVALID')
                    output.write(data)
                    with _lock: _state['downloadedBytes'] = total
            with _lock: _state['state'] = 'validating'
            candidate = work / MODEL_ID
            candidate.mkdir()
            hashes = extract_verified(archive, candidate)
            engine = _build(candidate)
            (candidate / 'installed.json').write_text(json.dumps({'archiveSha256': ARCHIVE_SHA256, 'files': hashes}), encoding='utf-8')
            # A failed previous install is kept for rollback, outside model scanning.
            target = ROOT / MODEL_ID
            if target.exists(): target.rename(ROOT / f'{MODEL_ID}-previous-{os.urandom(4).hex()}')
            candidate.rename(target)
            with _lock:
                _engine = engine
                _state.update(state='ready', ready=True, code=None, modelSha256=hashes['model.onnx'])
    except Exception:
        with _lock: _state.update(state='failed', ready=False, code='RVC_TTS_INSTALL_FAILED')


def install():
    with _lock:
        current = status()
        if not current['installAvailable']: raise ValueError('RVC_TTS_RUNTIME_UNAVAILABLE')
        if current['ready'] or current['state'] in {'downloading', 'validating'}: return current
        _state.update(state='downloading', ready=False, downloadedBytes=0, code=None)
        threading.Thread(target=_install, name='optional-tts-download', daemon=True).start()
        return status()


def synthesize(text):
    if not status()['ready']: raise ValueError('RVC_TTS_UNAVAILABLE')
    if not _synthesis.acquire(blocking=False): raise ValueError('RVC_TTS_BUSY')
    try:
        audio = _engine.generate(text, sid=66, speed=1.)
        samples = np.asarray(audio.samples, dtype=np.float32)
        if not len(samples) or not np.isfinite(samples).all(): raise ValueError('RVC_TTS_EMPTY_OUTPUT')
        # Float WAV avoids quantization clipping; retain generous headroom for conversion.
        peak = float(np.max(np.abs(samples)))
        if peak > .8: samples *= .8 / peak
        output = io.BytesIO()
        sf.write(output, samples, audio.sample_rate, format='WAV', subtype='FLOAT')
        return output.getvalue()
    finally: _synthesis.release()
