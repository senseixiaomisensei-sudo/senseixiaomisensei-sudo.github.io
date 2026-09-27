"""Install only the hash-pinned local resources needed by declared Japanese RVC models."""
import argparse
import hashlib
from pathlib import Path
import sys
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'rvc-service'))
from app.content_encoder import JAPANESE_FILES, JAPANESE_REVISION


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('encoder_root', type=Path, help='RVC_EMBEDDER_ROOT (parent of hubert-base-japanese)')
    args = parser.parse_args()
    directory = args.encoder_root.resolve() / 'hubert-base-japanese'
    directory.mkdir(parents=True, exist_ok=True)
    for name, expected in JAPANESE_FILES.items():
        target = directory / name
        if target.is_file() and digest(target) == expected:
            print(f'{name}: verified existing file', flush=True)
            continue
        url = f'https://huggingface.co/yky-h/japanese-hubert-base/resolve/{JAPANESE_REVISION}/{name}'
        partial = target.with_name(target.name + '.partial')
        with requests.get(url, stream=True, timeout=(20, 90)) as response:
            response.raise_for_status()
            with partial.open('wb') as stream:
                for block in response.iter_content(1024 * 1024):
                    stream.write(block)
        if digest(partial) != expected:
            raise ValueError(f'Downloaded resource hash mismatch: {name}')
        partial.replace(target)
        print(f'{name}: verified {expected}', flush=True)


if __name__ == '__main__':
    main()
