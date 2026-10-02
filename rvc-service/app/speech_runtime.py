"""Pinned reference-conditioned speech engine. No implicit RVC fallback."""
from __future__ import annotations
import hashlib,json,os,subprocess,sys
from pathlib import Path

ENGINE='seed-vc-v2-speech'

def config_root() -> Path:
    return Path(os.environ.get('RVC_SPEECH_ROOT', str(Path(__file__).resolve().parents[3]/'rvc-local'/'讲话引擎')))

def speech_profile(character_id: str) -> dict:
    root=config_root()
    try:
        config=json.loads((root/'引擎配置.json').read_text(encoding='utf8'))
        profile=json.loads((root/'角色参考清单.json').read_text(encoding='utf8')).get(character_id,{})
        if not profile.get('enabled'):
            return {}
        reference=Path(profile['path'])
        if not reference.is_file():
            return {}
        actual=hashlib.sha256(reference.read_bytes()).hexdigest()
        if actual!=profile['sha256'] or profile.get('characterId')!=character_id:
            return {}
        return {**profile,'engineRevision':config['revision'],'engine':ENGINE}
    except (OSError,ValueError,KeyError):
        return {}

def speech_status() -> dict:
    root=config_root()
    try:
        cfg=json.loads((root/'引擎配置.json').read_text(encoding='utf8'))
        refs=json.loads((root/'角色参考清单.json').read_text(encoding='utf8'))
        return dict(ready=True,engine=ENGINE,revision=cfg['revision'],codeCommit=cfg['codeCommit'],
                    steps=100,contentCfg=0,similarityCfg=.7,precision='fp32',
                    characters=[cid for cid in refs if speech_profile(cid)],
                    singingSupported=False,deviceSupported=False)
    except (OSError,ValueError,KeyError):
        return dict(ready=False,engine=ENGINE,characters=[])

def render_speech(source: Path, output: Path, character_id: str, profile: dict, diagnostics: Path) -> dict:
    # A short-lived process frees its model/CUDA allocations after each job and
    # cannot reuse another character's prompt or a stale reference checkpoint.
    cfg=json.loads((config_root()/'引擎配置.json').read_text(encoding='utf8'))
    current=speech_profile(character_id)
    if not current or current['sha256']!=profile['sha256'] or current['engineRevision']!=profile['engineRevision']:
        raise RuntimeError('Speech resource changed while queued')
    diagnostics.mkdir(parents=True,exist_ok=True)
    command=[cfg.get('python',sys.executable),'-X','utf8',str(Path(__file__).with_name('speech_worker.py')),
             '--config',str(config_root()/'引擎配置.json'),'--source',str(source),
             '--reference',current['path'],'--output',str(output),'--diagnostics',str(diagnostics)]
    env={**os.environ,'HF_HUB_OFFLINE':'1','TRANSFORMERS_OFFLINE':'1','PYTHONUTF8':'1'}
    with (diagnostics/'worker.log').open('w',encoding='utf8') as log:
        result=subprocess.run(command,env=env,stdout=log,stderr=log,timeout=3600,check=False)
    if result.returncode!=0 or not output.is_file():
        raise RuntimeError('Speech inference failed; see controlled diagnostic log')
    evidence=json.loads((diagnostics/'inference.json').read_text(encoding='utf8'))
    return {**evidence,'characterId':character_id,'referenceSha256':current['sha256'],
            'engineRevision':current['engineRevision'],'engine':ENGINE}
