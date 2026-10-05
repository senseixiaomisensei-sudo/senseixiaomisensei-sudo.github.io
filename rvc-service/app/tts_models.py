"""Fixed model catalog, bounded downloads and safe installation; no client URLs."""
from __future__ import annotations
import hashlib, json, os, tarfile, urllib.request
from pathlib import Path

CATALOG = json.loads(Path(__file__).with_name('tts_catalog.json').read_text(encoding='utf-8'))
MODELS = {model['id']: model for model in CATALOG['models']}
MAX_BYTES = CATALOG['maxModelBytes']

def digest(path, algorithm='sha256'):
    h = hashlib.new(algorithm)
    with path.open('rb') as source:
        for data in iter(lambda: source.read(1024 * 1024), b''): h.update(data)
    return h.hexdigest()

def verify_file(path, spec):
    if not path.is_file() or path.is_symlink() or path.stat().st_size != spec['bytes']:
        raise ValueError('RVC_TTS_DOWNLOAD_INVALID')
    if spec.get('sha256'):
        valid = digest(path) == spec['sha256']
    else:
        h = hashlib.sha1(f"blob {spec['bytes']}\0".encode())
        with path.open('rb') as source:
            for data in iter(lambda: source.read(1024 * 1024), b''): h.update(data)
        valid = h.hexdigest() == spec['gitBlob']
    if not valid: raise ValueError('RVC_TTS_DOWNLOAD_INVALID')

def download(url, path, size, progress):
    # A verified partial download is reusable after an interrupted connection.
    part = path.with_name(path.name + '.part')
    for attempt in range(3):
        offset = part.stat().st_size if part.exists() else 0
        req = urllib.request.Request(url, headers={'Range': f'bytes={offset}-'} if offset else {})
        try:
            with urllib.request.urlopen(req, timeout=90) as response:
                append = offset > 0 and response.status == 206
                if append and not response.headers.get('Content-Range', '').startswith(f'bytes {offset}-'):
                    raise ValueError('RVC_TTS_DOWNLOAD_INVALID')
                total = offset if append else 0
                with part.open('ab' if append else 'wb') as output:
                    while data := response.read(1024 * 1024):
                        total += len(data)
                        if total > size: raise ValueError('RVC_TTS_DOWNLOAD_INVALID')
                        output.write(data); progress(total)
                if total != size: raise OSError('incomplete download')
                part.replace(path); return
        except (OSError, TimeoutError):
            if attempt == 2: raise

def acquire(model_id, destination, progress=lambda n: None):
    model = MODELS[model_id]
    if not 0 < model['downloadBytes'] <= MAX_BYTES: raise ValueError('RVC_TTS_SIZE_LIMIT')
    destination.mkdir(parents=True, exist_ok=True)
    if model.get('files'):
        complete = 0
        for spec in model['files']:
            path = destination / spec['path']; path.parent.mkdir(parents=True, exist_ok=True)
            if path.exists():
                try: verify_file(path, spec)
                except ValueError: path.unlink()
            if not path.exists():
                url = f"https://huggingface.co/{model['repository']}/resolve/{model['revision']}/{spec['path']}"
                download(url, path, spec['bytes'], lambda n: progress(complete + n))
                verify_file(path, spec)
            complete += spec['bytes']; progress(complete)
    else:
        archive = destination / 'package.tar.bz2'
        if not archive.exists(): download(model['url'], archive, model['downloadBytes'], progress)
        if archive.stat().st_size != model['downloadBytes'] or digest(archive) != model['archiveSha256']:
            raise ValueError('RVC_TTS_DOWNLOAD_INVALID')
        total = 0; extracted = set()
        with tarfile.open(archive, 'r:bz2') as package:
            for member in package:
                relative = Path(member.name)
                if relative.parts[0] != model['archiveRoot'] or '..' in relative.parts or relative.is_absolute():
                    raise ValueError('RVC_TTS_DOWNLOAD_INVALID')
                if member.isdir(): continue
                relative = Path(*relative.parts[1:])
                allowed = relative.as_posix() in {'model.onnx','voices.bin','tokens.txt','lexicon-us-en.txt','lexicon-zh.txt','lexicon-gb-en.txt','LICENSE','README.md','date-zh.fst','number-zh.fst','phone-zh.fst'} or relative.parts[0] in {'espeak-ng-data','dict'}
                if not allowed: continue
                total += member.size
                if not member.isfile() or member.size < 0 or total > MAX_BYTES or relative.as_posix() in extracted:
                    raise ValueError('RVC_TTS_DOWNLOAD_INVALID')
                target = destination / relative; target.parent.mkdir(parents=True, exist_ok=True)
                with package.extractfile(member) as source, target.open('wb') as output:
                    for data in iter(lambda: source.read(1024 * 1024), b''): output.write(data)
                extracted.add(relative.as_posix())
        if not {'model.onnx','voices.bin','tokens.txt','lexicon-us-en.txt','lexicon-zh.txt'} <= extracted:
            raise ValueError('RVC_TTS_DOWNLOAD_INVALID')
        archive.unlink()

def verify_install(model_id, path):
    model = MODELS[model_id]
    manifest = json.loads((path / 'installed.json').read_text(encoding='utf-8'))
    revision = model.get('revision', model.get('archiveSha256'))
    if manifest.get('revision') != revision: raise ValueError('RVC_TTS_MODEL_INVALID')
    if model.get('files'):
        for spec in model['files']: verify_file(path / spec['path'], spec)
    else:
        files = manifest.get('files', {})
        if not {'model.onnx','voices.bin','tokens.txt','lexicon-us-en.txt','lexicon-zh.txt'} <= set(files):
            raise ValueError('RVC_TTS_MODEL_INVALID')
        for name, expected in files.items():
            relative = Path(name)
            if relative.is_absolute() or '..' in relative.parts or digest(path / relative) != expected:
                raise ValueError('RVC_TTS_MODEL_INVALID')
    return manifest

def write_manifest(model_id, path, proof):
    model = MODELS[model_id]
    files = {file.relative_to(path).as_posix(): digest(file) for file in path.rglob('*') if file.is_file() and file.name != 'installed.json'}
    data = {'modelId': model_id, 'revision': model.get('revision', model.get('archiveSha256')), 'files': files, 'synthesisProof': proof}
    (path / 'installed.json').write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    return data
