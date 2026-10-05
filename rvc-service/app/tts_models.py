"""Fixed model catalog, bounded downloads and safe installation; no client URLs."""
from __future__ import annotations
import hashlib, json, os, shutil, subprocess, sys, urllib.request
from pathlib import Path

CATALOG = json.loads(Path(__file__).with_name('tts_catalog.json').read_text(encoding='utf-8'))
MODELS = {model['id']: model for model in CATALOG['models']}
MAX_BYTES = CATALOG['maxModelBytes']
MAX_SOURCE_BYTES = CATALOG.get('maxSourceBytes', MAX_BYTES)

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
    if not 0 < model['downloadBytes'] <= MAX_SOURCE_BYTES or not 0 < model.get('installedBytes',model['downloadBytes']) <= MAX_BYTES:
        raise ValueError('RVC_TTS_SIZE_LIMIT')
    destination.mkdir(parents=True, exist_ok=True)
    if model.get('files'):
        complete = 0
        for spec in model['files']:
            path = destination / spec['path']; path.parent.mkdir(parents=True, exist_ok=True)
            if path.exists():
                try: verify_file(path, spec)
                except ValueError: path.unlink()
            if not path.exists():
                if spec.get('bundledPath'):
                    relative=Path(spec['bundledPath'])
                    if relative.is_absolute() or '..' in relative.parts: raise ValueError('RVC_TTS_DOWNLOAD_INVALID')
                    source=Path(__file__).parent/relative
                    verify_file(source,spec);shutil.copyfile(source,path)
                    verify_file(path,spec)
                    complete += spec['bytes'];progress(complete)
                    continue
                repository=spec.get('repository',model['repository'])
                revision=spec.get('revision',model['revision'])
                remote=spec.get('remotePath',spec['path'])
                url = f"https://huggingface.co/{repository}/resolve/{revision}/{remote}"
                if spec.get('transform'):
                    if spec['transform'] != 'bf16-gpt-torch-2.7.1': raise ValueError('RVC_TTS_PACK_STRUCTURE_INVALID')
                    source=destination/'.source-gpt.pth'
                    original={'bytes':spec['sourceBytes'],'sha256':spec['sourceSha256']}
                    if source.exists():
                        try: verify_file(source,original)
                        except ValueError: source.unlink()
                    if not source.exists(): download(url,source,original['bytes'],lambda n: progress(complete+n))
                    verify_file(source,original)
                    python=os.getenv('RVC_TTS_PACK_PYTHON',sys.executable)
                    subprocess.run([python,str(Path(__file__).with_name('tts_pack.py')),str(source),str(path)],check=True,timeout=300,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
                    verify_file(path,spec);source.unlink()
                else:
                    download(url, path, spec['bytes'], lambda n: progress(complete + n))
                verify_file(path, spec)
            complete += spec.get('sourceBytes',spec['bytes']); progress(complete)
    else:
        raise ValueError('RVC_TTS_INVALID_MODEL')

def verify_install(model_id, path):
    model = MODELS[model_id]
    manifest = json.loads((path / 'installed.json').read_text(encoding='utf-8'))
    revision = model.get('bundleRevision',model.get('revision', model.get('archiveSha256')))
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
    data = {'modelId': model_id, 'revision': model.get('bundleRevision',model.get('revision', model.get('archiveSha256'))), 'files': files, 'synthesisProof': proof}
    (path / 'installed.json').write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    return data
