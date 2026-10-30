"""End-to-end A/B bench for song covers through the real HTTP service.

It drives the unchanged public protocol (/v1/convert song mode, polling
/v1/output, /v1/output/{id}/remix with the accompaniment muted to obtain the
converted vocal) so the same script measures the legacy chain and v3 chain:
start the service once with RVC_V3=0 and once with RVC_V3=1 (or leave unset)
and run this script with a different --label each time.

  python tools/rvc_v3_bench.py --url http://127.0.0.1:8088 --token-file tok \
      --manifest bench.json --model hoshino --label v3 --out ab-out

The manifest is a JSON list of {"name", "mix", "reference"(optional clean
vocal), "pitch"(optional; otherwise auto-chosen like the website)}.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rvc_v3_metrics import evaluate  # noqa: E402


def request(url, token, data=None, files=None, method=None, timeout=600):
    headers = {'Authorization': f'Bearer {token}'}
    body = None
    if files is not None or data is not None:
        boundary = uuid.uuid4().hex
        parts = []
        for key, value in (data or {}).items():
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode())
        for key, (name, payload, mime) in (files or {}).items():
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"; filename="{name}"\r\nContent-Type: {mime}\r\n\r\n'.encode() + payload + b'\r\n')
        parts.append(f'--{boundary}--\r\n'.encode())
        body = b''.join(parts)
        headers['Content-Type'] = f'multipart/form-data; boundary={boundary}'
    req = urllib.request.Request(url, data=body, headers=headers, method=method or ('POST' if body else 'GET'))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.status, response.read(), dict(response.headers)
    except urllib.error.HTTPError as error:
        return error.code, error.read(), dict(error.headers)


def wait_output(base, token, job, dl_token, deadline):
    while time.time() < deadline:
        status, body, headers = request(f'{base}/v1/output/{job}?token={dl_token}', token)
        if status == 200:
            return body, headers
        if status != 202:
            raise RuntimeError(f'job failed {status}: {body[:300]!r}')
        time.sleep(3)
    raise TimeoutError(job)


def suggest_pitch(reference_median_hz, target_median_hz, p90_hz):
    """Port of assets/rvc-auto-parameters.js song branch (matched reference)."""
    import math
    pitch = max(-12, min(12, round(12 * math.log2(target_median_hz / reference_median_hz))))
    if pitch > 0 and p90_hz > 0:
        pitch = min(pitch, max(0, math.floor(12 * math.log2(1000 / p90_hz))))
    return pitch


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--url', default='http://127.0.0.1:8088')
    p.add_argument('--token', default='')
    p.add_argument('--token-file')
    p.add_argument('--manifest', required=True)
    p.add_argument('--model', required=True)
    p.add_argument('--label', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--format', default='wav')
    p.add_argument('--index-rate', default='0.35')
    p.add_argument('--protect', default='0.12')
    p.add_argument('--register', default='0')
    p.add_argument('--timeout', type=float, default=3600)
    a = p.parse_args()
    token = a.token or Path(a.token_file).read_text().strip()
    out = Path(a.out) / a.label
    out.mkdir(parents=True, exist_ok=True)
    rows = []
    for clip in json.loads(Path(a.manifest).read_text(encoding='utf-8')):
        name = clip['name']
        pitch = clip.get('pitch', {}).get(a.model, 0) if isinstance(clip.get('pitch'), dict) else clip.get('pitch', 0)
        started = time.time()
        status, body, _ = request(f'{a.url}/v1/convert', token, data=dict(
            model_id=a.model, pitch=str(pitch), index_rate=a.index_rate, protect=a.protect,
            register_adaptation=a.register, filter_radius='0', resample='0', rms_mix_rate='1',
            f0_method='rmvpe', format=a.format, audio_mode='song', request_id=str(uuid.uuid4())),
            files={'audio': (Path(clip['mix']).name, Path(clip['mix']).read_bytes(), 'audio/wav')})
        if status != 200:
            print(name, 'convert rejected', status, body[:300], flush=True)
            rows.append(dict(name=name, error=f'{status}'))
            continue
        job = json.loads(body)
        audio, headers = wait_output(a.url, token, job['jobId'], job['downloadToken'], started + a.timeout)
        mix_path = out / f'{name}__{a.model}__mix.{a.format}'
        mix_path.write_bytes(audio)
        elapsed = time.time() - started
        status, body, _ = request(f'{a.url}/v1/output/{job["jobId"]}/remix?token={job["downloadToken"]}', token,
                                  data=dict(vocal_gain_db='0', accompaniment_gain_db='0', vocal_mute='false',
                                            accompaniment_mute='true'))
        vocal_path = None
        if status == 200:
            remix = json.loads(body)
            audio, _ = wait_output(a.url, token, remix['jobId'], remix['downloadToken'], time.time() + 600)
            vocal_path = out / f'{name}__{a.model}__vocal.{a.format}'
            vocal_path.write_bytes(audio)
        metrics = evaluate(vocal_path or mix_path, clip.get('reference'), pitch, mix_path, clip['mix'])
        row = dict(name=name, model=a.model, label=a.label, pitch=pitch, seconds=round(elapsed, 1),
                   headers={k: v for k, v in headers.items() if k.lower().startswith('x-rvc')}, **metrics)
        rows.append(row)
        (out / f'{name}__{a.model}.json').write_text(json.dumps(row, indent=2, ensure_ascii=False), encoding='utf-8')
        print(name, a.model, a.label, f"{elapsed:.0f}s",
              {k: (round(v, 4) if isinstance(v, float) else v) for k, v in metrics.items()
               if k in ('octaveJumpRate', 'grossPitchError', 'breakupRate', 'hfExcessDb', 'clicksPerMinute', 'truePeakDb')}, flush=True)
    (out / f'summary__{a.model}.json').write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding='utf-8')


if __name__ == '__main__':
    main()
