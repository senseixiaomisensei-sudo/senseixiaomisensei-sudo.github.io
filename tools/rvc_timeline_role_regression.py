"""Real difficult excerpts for every existing catalog ID; no listening ratings.

Reusable source analysis is keyed by the actual encoder contract and precision.
Every role still runs its own checkpoint, retrieval, prior, decoder and repeats.
The full supplied songs are validated separately, never replaced by these clips.
"""
import argparse
from dataclasses import replace
import hashlib
import json
import os
from pathlib import Path
import sys
import time

import numpy as np
import soundfile as sf

p=argparse.ArgumentParser()
p.add_argument('output',type=Path)
p.add_argument('--a-input',type=Path,required=True)
p.add_argument('--c-input',type=Path,required=True)
p.add_argument('--model-ids',nargs='+')
p.add_argument('--device',choices=['auto','cpu'],default='auto')
args=p.parse_args()
args.output=args.output.resolve();args.output.mkdir(parents=True,exist_ok=True)
site=Path(__file__).resolve().parents[1]
os.environ.update(RVC_OFFICIAL_ROOT=r'D:\数据\rvc-runtime\official-rvc',
    RVC_MODELS_DIR=r'E:\大肥鱼\rvc-local\models',RVC_CUDA_GRAPH='0',
    CUBLAS_WORKSPACE_CONFIG=':4096:8',
    RVC_RUNTIME_CACHE=r'D:\rvc-cache',RVC_TIMELINE_INFERENCE='1',
    RVC_WORK_ROOT=str(args.output/'work'),RVC_OUTPUT_ROOT=str(args.output/'output'),
    RVC_DIAGNOSTIC_ROOT=str(args.output/'diagnostics'))
sys.path.insert(0,str(site/'rvc-service'))
from app import main as service
if args.device=='cpu':
    import torch
    from app import official_runtime
    torch.set_num_threads(4)
    official_runtime._select_device=lambda: ('cpu',False)
from app.analysis_timeline import prepare_analysis,prepare_priors,join_timeline
from app.timeline_rendering import render_window
from app.content_encoder import load_content_encoder
from app.audio_repair import repair_vocal_file

sha=lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
sources=[]
for name,path,start,end in [('A-25-50',args.a_input,25.,50.),
                          ('C-52-64',args.c_input,52.,64.),
                          ('C-180-196',args.c_input,180.,196.)]:
    data,sr=sf.read(path,dtype='float32')
    assert sr==16000 and data.ndim==1
    destination=args.output/(name+'.wav')
    sf.write(destination,data[round(start*sr):round(end*sr)],sr,subtype='FLOAT')
    sources.append(dict(name=name,path=destination,source=str(path),sourceSha256=sha(path),
                        startSeconds=start,endSeconds=end))

catalog=json.loads((site/'assets/rvc-models.json').read_text(encoding='utf8'))['models']
if args.model_ids:
    catalog=[dict(id=identity) for identity in args.model_ids]
cache={};rows=[]
for entry in catalog:
    started=time.monotonic();identity=entry['id'];root=args.output/identity;root.mkdir(exist_ok=True)
    row=dict(characterId=identity,sourceCatalogId=identity,clips=[],P0_A='未听评',P0_B='未听评',P0_C='未听评',
             fullSongValidation='仅 hoshino 在单独目录进行了完整 A/C；本表其余角色为困难片段回归')
    model=None
    try:
        path=service.find_model_path(identity);index=service.find_index_path(path)
        model=service.acquire_model(path)
        row.update(modelSha256=sha(path),indexSha256=sha(index) if index else None,
                   modelVersion=model._vc.version,sampleRate=model._vc.tgt_sr,
                   f0=bool(model._vc.if_f0),featureContract=model.encoder_contract.__dict__,
                   noiseScale=model.noise_scale,seed=20260823,indexRate=.45,protect=.33,pitch=0,
                   precision='float16' if model.info.is_half else 'float32',
                   pipelineRevision=service.PIPELINE_REVISION)
        if not row['f0']:
            raise ValueError('Non-F0 checkpoint: shared timeline path not supported')
        if model._vc.hubert_model is None:
            model._vc.hubert_model,model.encoder_metadata=load_content_encoder(
                model.encoder_contract,model._vc.config,model.model_path)
        for clip in sources:
            folder=root/clip['name'];folder.mkdir(exist_ok=True)
            key=(clip['name'],json.dumps(model.encoder_metadata,sort_keys=True),model.info.is_half)
            if key not in cache:
                cache[key]=prepare_analysis(model,clip['path'],'rmvpe',consensus=True)
            timeline=replace(cache[key],prior_mean=None,prior_logs=None)
            prepare_priors(model,timeline,.45,.33,0)
            chunks=[render_window(model,timeline,i,folder,0,.45,.33,0,None)
                    for i in range(len(timeline.spans))]
            raw=folder/'raw.wav'
            joins=join_timeline(chunks,timeline,raw,model._vc.tgt_sr)
            data,sr=sf.read(raw,dtype='float64')
            check=dict(**{k:v for k,v in clip.items() if k!='path'},frames=len(data),sampleRate=sr,
                finite=bool(np.isfinite(data).all()),peak=float(np.max(abs(data))),joins=joins,
                expectedFrames=round(timeline.input_samples*sr/16000),
                changedPitchFrames=int(np.count_nonzero(timeline.evidence['raw']!=timeline.f0)),
                runtime=model.last_run_metadata,rawSha256=sha(raw))
            assert check['finite'] and check['frames']==check['expectedFrames']
            if clip==sources[0]:
                replay=folder/'repeat';replay.mkdir(exist_ok=True)
                repeated=render_window(model,timeline,0,replay,0,.45,.33,0,None)
                a,_=sf.read(chunks[0]);b,_=sf.read(repeated)
                check['repeatMaxDifference']=float(np.max(abs(a-b)))
                assert check['repeatMaxDifference']<1e-4,'Repeat drift'
            rendered=folder/'角色人声.wav'
            sf.write(rendered,data,sr,subtype='FLOAT')
            repair_vocal_file(rendered)
            service.suppress_silent_synthesis(rendered,clip['path'])
            service.apply_dynamics(rendered,clip['path'],.5)
            service.finalize_true_peak_safe(rendered)
            check['output']=str(rendered)
            row['clips'].append(check)
        row['signalChecks']='passed'
    except Exception as error:
        row.update(signalChecks='failed',error=f'{type(error).__name__}: {error}')
    finally:
        model=None
        service.release_cached_models()
    row['elapsedSeconds']=round(time.monotonic()-started,2);rows.append(row)
    (args.output/'matrix.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps(dict(characterId=identity,signalChecks=row['signalChecks'],
        clips=len(row['clips']),elapsed=row['elapsedSeconds'],error=row.get('error')),ensure_ascii=False),flush=True)

assert len(rows)==len(catalog)
if any(row['signalChecks']=='failed' for row in rows):
    raise SystemExit('One or more real-role regressions failed; inspect matrix.json')
