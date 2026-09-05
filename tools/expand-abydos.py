"""Stage and validate three community voices; never deserialize model code."""
import hashlib
import io
import json
import subprocess
import sys
import zipfile
from pathlib import Path

import requests
import torch

ROOT = Path(__file__).resolve().parents[1]
STAGE = ROOT.parent / 'rvc-local' / 'work' / 'abydos-expansion'
VOICES = {
    'nonomi': ('十六夜野乃美 (Nonomi)', 'https://huggingface.co/ryzusaku/rvc_v2_models/resolve/main/IzayoiNonomi.zip'),
    'ayane': ('奥空绫音 (Ayane)', 'https://huggingface.co/ryzusaku/rvc_v2_models/resolve/main/OkusoraAyane.zip'),
    'serika': ('黑见芹香 (Serika)', 'https://huggingface.co/spaces/Ilzhabimantara/rvc-Blue-archives-hoyogames/resolve/main/weights/blue-archive/kuromi-serika/'),
}
if '--maki-hanako' in sys.argv:
    STAGE = STAGE.parent / 'maki-hanako-expansion'
    VOICES = {
        'maki': ('小涂真纪 (Maki)', 'https://www.101soundboards.com/tts/1034740-konuri-maki-blue-archive-sq-tts-text-to-speech/download_model'),
        'hanako': ('浦和花子 (Hanako)', 'https://huggingface.co/spaces/Ilzhabimantara/rvc-Blue-archives-hoyogames/resolve/main/weights/blue-archive/urawa-hanako/'),
    }

def download(url):
    response = requests.get(url, timeout=(20, 180))
    response.raise_for_status()
    return response.content

def main():
    torch.set_num_threads(4)
    for cid, (name, source) in VOICES.items():
        folder = STAGE / cid
        folder.mkdir(parents=True, exist_ok=True)
        pth, index = folder / 'model.pth', folder / 'model.index'
        if not pth.exists() or not index.exists():
            if source.endswith(('.zip', '/download_model')):
                cached = STAGE / (cid + '.zip')
                archive = zipfile.ZipFile(io.BytesIO(cached.read_bytes() if cached.exists() else download(source)))
                weights = [item for item in archive.infolist() if item.filename.endswith('.pth')]
                indexes = [item for item in archive.infolist() if item.filename.endswith('.index') and 'trained' not in Path(item.filename).name]
                if len(weights) != 1 or len(indexes) != 1:
                    raise ValueError(f'Ambiguous archive: {archive.namelist()}')
                if any(item.file_size > 512 * 1024**2 for item in weights + indexes):
                    raise ValueError('Oversized model')
                pth.write_bytes(archive.read(weights[0]))
                index.write_bytes(archive.read(indexes[0]))
            else:
                pth.write_bytes(download(source + ('UrawaHanako.pth' if cid == 'hanako' else 'kuromi-serika.pth')))
                index.write_bytes(download(source + ('added_IVF501_Flat_nprobe_1_UrawaHanako_v2.index' if cid == 'hanako' else 'added_IVF65_Flat_nprobe_1_kuromi-serika_v2.index')))
        checkpoint = torch.load(io.BytesIO(pth.read_bytes()), map_location='cpu', weights_only=True)
        version = checkpoint.get('version')
        if version not in ('v1', 'v2'):
            raise ValueError(f'{cid}: unsupported RVC architecture')
        sr = int(str(checkpoint.get('sr', checkpoint['config'][-1])).replace('k', '000'))
        print(f'{cid}: validated weights, sample rate {sr}', flush=True)
        onnx = folder / (cid + '.onnx')
        if not onnx.exists():
            subprocess.run([sys.executable, str(ROOT / 'tools/export-rvc-explicit-noise.py'), str(pth), str(onnx)], check=True)
        subprocess.run([sys.executable, str(ROOT / 'tools/build-rvc-retrieval-codebook.py'), str(index), str(folder / 'retrieval.bin')], check=True)
        meta = dict(id=cid, name=name, source=source, sampleRate=sr, rvcVersion=version, supportsDevice=version == 'v2',
                    checkpointSha256=hashlib.sha256(pth.read_bytes()).hexdigest(),
                    indexSha256=hashlib.sha256(index.read_bytes()).hexdigest())
        (folder / 'verified.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding='utf-8')
        print(f'{cid}: staged', flush=True)

if __name__ == '__main__':
    main()
