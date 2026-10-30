"""v3 separation model set: readiness, and one-time background download.

The models come from the same PyMSS catalog that the pinned
``pymss==2.0.14`` already ships (``resources/model_catalog.json``), so no new
Python dependency is needed. Downloads are performed once, in a background
thread started with the service (opt-in: ``RVC_V3=1`` and
``RVC_V3_AUTO_FETCH=1``; default OFF), into
``RVC_SEPARATOR_MODELS_DIR`` with ``.part`` files renamed only after the
catalog byte size matches. Until a model is complete the v3 chain simply
skips that stage (or falls back to the legacy separator), so a slow or
blocked network never breaks conversion.

Sources are tried in order: ModelScope (fast in mainland China), hf-mirror,
Hugging Face. ``RVC_V3_MODEL_SOURCES`` overrides the order (comma list).
"""
from __future__ import annotations

import importlib.resources
import json
import logging
import os
import threading
import time
import urllib.parse
import urllib.request
from pathlib import Path

logger = logging.getLogger(__name__)

MAIN_MODEL = os.getenv('RVC_V3_SEPARATOR_MODEL', 'model_bs_roformer_ep_368_sdr_12.9628.ckpt').strip()
KARAOKE_MODEL = os.getenv('RVC_V3_KARAOKE_MODEL', 'bs_roformer_karaoke_frazer_becruily.ckpt').strip()
DEREVERB_MODEL = os.getenv('RVC_V3_DEREVERB_MODEL', 'dereverb_bs_roformer_anvuew_sdr_22.5050.ckpt').strip()

SOURCES = {
    'modelscope': 'https://www.modelscope.cn/models/baicai1145/pymss/resolve/master/',
    'hf-mirror': 'https://hf-mirror.com/baicai1145/pymss/resolve/main/',
    'huggingface': 'https://huggingface.co/baicai1145/pymss/resolve/main/',
}

_lock = threading.Lock()
_state = {'running': False, 'lastError': '', 'completed': [], 'startedAt': None}


def models_dir() -> Path:
    return Path(os.getenv('RVC_SEPARATOR_MODELS_DIR', '/models/pymss')).resolve()


def catalog() -> dict:
    try:
        text = importlib.resources.files('pymss').joinpath('resources/model_catalog.json').read_text(encoding='utf-8')
        data = json.loads(text)
    except (ModuleNotFoundError, FileNotFoundError, OSError, ValueError):
        return {}
    return {entry['name']: entry for entry in data.get('models', []) if entry.get('supported')}


def files_for(name: str, entries: dict | None = None) -> list[tuple[str, int | None]]:
    entry = (entries if entries is not None else catalog()).get(name)
    if not entry:
        return []
    files = [(entry['relpath'], int(entry['size_bytes']) if entry.get('size_bytes') else None)]
    if entry.get('config_relpath'):
        files.append((entry['config_relpath'], None))
    for rel in entry.get('auxiliary_relpaths') or []:
        files.append((rel, None))
    return files


def model_ready(name: str, entries: dict | None = None) -> bool:
    if not name:
        return False
    files = files_for(name, entries)
    if not files:
        return False
    root = models_dir()
    for rel, size in files:
        path = root / rel
        if not path.is_file() or path.stat().st_size == 0:
            return False
        if size is not None and path.stat().st_size != size:
            return False
    return True


def wanted_models() -> list[str]:
    from app.v3_quality import enabled
    names = []
    if enabled('SEPARATOR'):
        names.append(MAIN_MODEL)
        if enabled('KARAOKE'):
            names.append(KARAOKE_MODEL)
        if enabled('DEREVERB'):
            names.append(DEREVERB_MODEL)
    return [n for n in dict.fromkeys(names) if n]


def status() -> dict:
    entries = catalog()
    return dict(models={name: model_ready(name, entries) for name in wanted_models()},
                download=dict(_state), directory=str(models_dir()))


def _download(rel: str, size: int | None, sources: list[str], timeout=60) -> None:
    destination = models_dir() / rel
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.is_file() and destination.stat().st_size > 0 and (size is None or destination.stat().st_size == size):
        return
    last = None
    for source in sources:
        base = SOURCES.get(source)
        if not base:
            continue
        url = base + urllib.parse.quote(rel, safe='/')
        part = destination.with_name(destination.name + '.part')
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'postprep-rvc/3'})
            with urllib.request.urlopen(request, timeout=timeout) as response, part.open('wb') as stream:
                while True:
                    block = response.read(1 << 20)
                    if not block:
                        break
                    stream.write(block)
            got = part.stat().st_size
            if got == 0 or (size is not None and got != size):
                raise OSError(f'size mismatch {got} != {size}')
            os.replace(part, destination)
            logger.info('v3 model file ready %s (%s)', rel, source)
            return
        except Exception as error:  # try next mirror
            last = error
            part.unlink(missing_ok=True)
            logger.warning('v3 model download failed %s via %s: %s', rel, source, error)
    raise OSError(f'{rel}: {last}')


def ensure_models(names: list[str] | None = None) -> dict:
    """Blocking download of missing files; safe to call repeatedly."""
    names = names or wanted_models()
    entries = catalog()
    order = [s.strip() for s in os.getenv('RVC_V3_MODEL_SOURCES', 'modelscope,hf-mirror,huggingface').split(',') if s.strip()]
    result = {}
    for name in names:
        if model_ready(name, entries):
            result[name] = 'ready'
            continue
        try:
            for rel, size in files_for(name, entries):
                _download(rel, size, order)
            result[name] = 'ready' if model_ready(name, entries) else 'incomplete'
        except Exception as error:
            result[name] = f'failed: {error}'[:300]
            _state['lastError'] = result[name]
    return result


def start_background_fetch() -> bool:
    from app.v3_quality import master_enabled
    if not master_enabled() or os.getenv('RVC_V3_AUTO_FETCH', '0').strip() != '1':
        return False
    with _lock:
        if _state['running']:
            return False
        if all(model_ready(n) for n in wanted_models()):
            return False
        _state['running'] = True
        _state['startedAt'] = time.time()

    def worker():
        try:
            outcome = ensure_models()
            _state['completed'] = [k for k, v in outcome.items() if v == 'ready']
        finally:
            _state['running'] = False

    threading.Thread(target=worker, name='rvc-v3-model-fetch', daemon=True).start()
    return True


if __name__ == '__main__':  # manual: python -m app.v3_models
    logging.basicConfig(level=logging.INFO)
    print(json.dumps(ensure_models(), indent=2))
