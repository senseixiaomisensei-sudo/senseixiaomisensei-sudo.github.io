"""Bounded, private, lossless reuse of a pinned separator's completed stems."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
import threading
import time

TTL_SECONDS = 3600
MAX_BYTES = 512 * 1024 * 1024
_lock = threading.RLock()
_resource_hashes = {}


def cache_root() -> Path | None:
    configured = os.getenv('RVC_SEPARATION_CACHE_DIR')
    runtime = os.getenv('RVC_RUNTIME_CACHE')
    return Path(configured or str(Path(runtime) / 'separation-stems')).resolve() if configured or runtime else None


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def resource_digest(path: Path) -> str:
    stat = path.stat()
    key = (str(path.resolve()), stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns)
    if key not in _resource_hashes:
        _resource_hashes.clear() if len(_resource_hashes) > 32 else None
        _resource_hashes[key] = digest(path)
    return _resource_hashes[key]


def cache_key(source: Path, resources: list[Path], runtime: str) -> str:
    payload = {'schema': 1, 'source': digest(source),
               'resources': [resource_digest(path) for path in resources], 'runtime': runtime}
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def _remove(root: Path, entry: Path) -> None:
    # Only our own direct, non-symlink children can be recursively removed.
    if entry.is_symlink() or entry.resolve().parent != root.resolve():
        return
    if re.fullmatch(r'[a-f0-9]{64}|partial-[a-z0-9_]+', entry.name):
        shutil.rmtree(entry, ignore_errors=True)


def cleanup() -> None:
    root = cache_root()
    if root is None or not root.is_dir():
        return
    with _lock:
        entries = []
        for entry in root.iterdir():
            if not entry.is_dir() or entry.is_symlink():
                continue
            try:
                meta = json.loads((entry / 'manifest.json').read_text(encoding='utf8'))
                created = float(meta['createdAt'])
                size = sum(p.stat().st_size for p in entry.iterdir() if p.is_file())
            except (OSError, ValueError, KeyError, TypeError):
                _remove(root, entry)
                continue
            if time.time() - created >= TTL_SECONDS:
                _remove(root, entry)
            else:
                entries.append((created, size, entry))
        total = sum(item[1] for item in entries)
        for _, size, entry in sorted(entries):
            if total <= MAX_BYTES:
                break
            _remove(root, entry)
            total -= size


def restore(key: str, destination: Path) -> int | None:
    root = cache_root()
    if root is None:
        return None
    with _lock:
        cleanup()
        entry = root / key
        try:
            meta = json.loads((entry / 'manifest.json').read_text(encoding='utf8'))
            if meta['key'] != key or not 8000 <= int(meta['sampleRate']) <= 192000:
                raise ValueError('Invalid cache manifest')
            # Never trust an incomplete or corrupted stem, even if it plays.
            for name in ('vocals.wav', 'instrumental.wav'):
                expected = meta['files'][name]
                path = entry / name
                if path.is_symlink() or path.stat().st_size != expected['bytes'] or digest(path) != expected['sha256']:
                    raise ValueError('Corrupted cache stem')
            destination.mkdir(parents=True, exist_ok=True)
            for name in ('vocals.wav', 'instrumental.wav'):
                shutil.copyfile(entry / name, destination / name)
            return int(meta['sampleRate'])
        except (OSError, ValueError, KeyError, TypeError):
            if entry.exists():
                _remove(root, entry)
            return None


def store(key: str, vocals: Path, instrumental: Path, sample_rate: int) -> None:
    root = cache_root()
    if root is None or vocals.stat().st_size + instrumental.stat().st_size > MAX_BYTES - 4096:
        return
    with _lock:
        root.mkdir(parents=True, exist_ok=True)
        cleanup()
        temporary = Path(tempfile.mkdtemp(prefix='partial-', dir=root))
        try:
            files = {}
            for name, source in [('vocals.wav', vocals), ('instrumental.wav', instrumental)]:
                target = temporary / name
                shutil.copyfile(source, target)
                files[name] = {'bytes': target.stat().st_size, 'sha256': digest(target)}
            meta = {'key': key, 'createdAt': time.time(), 'sampleRate': sample_rate, 'files': files}
            (temporary / 'manifest.json').write_text(json.dumps(meta), encoding='utf8')
            entry = root / key
            if entry.exists():
                _remove(root, entry)
            temporary.rename(entry)
            cleanup()
        finally:
            if temporary.exists():
                _remove(root, temporary)
