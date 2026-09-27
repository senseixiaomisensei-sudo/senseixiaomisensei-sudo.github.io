"""Single-factor real synthesis, reusing hashed source analysis, never output audio."""
import argparse
from dataclasses import replace
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import time
import numpy as np
import soundfile as sf

p=argparse.ArgumentParser()
p.add_argument('reference',type=Path)
p.add_argument('output',type=Path)
p.add_argument('--factor',choices=['pitch-pm','pitch-fcpe','consensus-off','retrieval-off','repeat'],required=True)
p.add_argument('--stems',type=Path,required=True)
p.add_argument('--device',choices=['auto','cpu'],default='auto')
p.add_argument('--window-index',type=int,help='One original context window; no full-song or mix claim')
a=p.parse_args();a.reference=a.reference.resolve();a.output=a.output.resolve()
a.output.mkdir(parents=True,exist_ok=True)
site=Path(__file__).resolve().parents[1]
os.environ.update(RVC_OFFICIAL_ROOT=r'D:\数据\rvc-runtime\official-rvc',
    RVC_MODELS_DIR=r'E:\大肥鱼\rvc-local\models',RVC_RUNTIME_CACHE=r'D:\rvc-cache',
    RVC_CUDA_GRAPH='0',CUBLAS_WORKSPACE_CONFIG=':4096:8',
    RVC_WORK_ROOT=str(a.output/'work'),RVC_OUTPUT_ROOT=str(a.output/'outputs'))
sys.path.insert(0,str(site/'rvc-service'))
from app import main as service
if a.device=='cpu':
    import torch
    from app import official_runtime
    torch.set_num_threads(4)
    official_runtime._select_device=lambda: ('cpu',False)
from app.analysis_timeline import AnalysisTimeline,frame_spans,prepare_priors,PAD_FRAMES,HOP
from app.timeline_rendering import render_window,finish
from scipy.signal import filtfilt

sha=lambda path:hashlib.sha256(Path(path).read_bytes()).hexdigest()
original=json.loads((a.reference/'report.json').read_text(encoding='utf8'))
model_path=service.find_model_path(original['characterId'])
assert sha(model_path)==original['checkpointSha256']
assert sha(service.find_index_path(model_path))==original['indexSha256']
stem_stamp=json.loads((a.stems/'source.json').read_text(encoding='utf8'))
assert stem_stamp['sha256']==original['sourceSha256']
for name,key in [('vocals.wav','vocalsSha256'),('instrumental.wav','instrumentalSha256')]:
    assert sha(a.stems/name)==stem_stamp[key]
model=service.acquire_model(model_path)
from infer.vc.pipeline import bh,ah
raw,sr=sf.read(a.reference/'model-input-16k.wav',dtype='float64')
assert sr==16000 and raw.ndim==1
stages=a.output/'diagnostic-stages';stages.mkdir(exist_ok=True)
work=a.output/'chunks';work.mkdir(exist_ok=True)
source=a.reference/'diagnostic-stages/timeline'
z=np.load(source/'f0.npz');features=np.load(source/'features.npy')
selected={'pitch-pm':'independent','pitch-fcpe':'candidate','consensus-off':'raw'}.get(a.factor,'corrected')
f0=z[selected].copy()
spans=frame_spans(len(raw));frames=spans[-1][1]
gain=json.loads((source/'analysis.json').read_text(encoding='utf8'))['inputGain']
audio=filtfilt(bh,ah,raw*gain)
audio=np.pad(audio,(PAD_FRAMES*HOP,(frames+PAD_FRAMES+2)*HOP-len(raw)),mode='reflect')
method={'pitch-pm':'pm','pitch-fcpe':'fcpe'}.get(a.factor,original['actualF0Method'])
timeline=AnalysisTimeline(audio,features,f0,spans,len(raw),a.reference/'model-input-16k.wav',method,{})
first,_=timeline.window(0,model._vc.tgt_sr,0)
recorded,recorded_sr=sf.read(a.reference/'diagnostic-stages/chunk-000/003-model-input.wav')
assert recorded_sr==16000 and np.max(abs(first-recorded))<2e-7,'Input reconstruction mismatch'
np.savez_compressed(stages/'condition.npz',f0=f0,source=selected,time_origin_seconds=-3.,
    difference_frames=np.flatnonzero(f0!=z['corrected']))
index_rate=0 if a.factor=='retrieval-off' else original['indexRate']
prepare_priors(model,timeline,index_rate,original['protect'],original['pitch'])
started=time.monotonic()
chunks=[]
if a.window_index is not None:
    index=a.window_index
    if not 0<=index<len(spans):
        raise ValueError('Window index outside the fixed source timeline')
    output=render_window(model,timeline,index,work,0,index_rate,original['protect'],0,stages)
    shutil.copyfile(output,a.output/'raw-context-window.wav')
    report=dict(reference=str(a.reference),factor=a.factor,windowIndex=index,
        startSeconds=spans[index][0]/100,endSeconds=min(spans[index][1]/100,len(raw)/16000),
        fullSourceConverted=False,device=model.info.device,runtime=model.last_run_metadata,
        sourceSha256=original['sourceSha256'],modelSha256=sha(model_path),
        indexSha256=original['indexSha256'],featuresSha256=sha(source/'features.npy'),
        f0EvidenceSha256=sha(source/'f0.npz'),qualityListening='unverified')
    (a.output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps(report,ensure_ascii=False),flush=True)
    sys.exit(0)
for i in range(len(spans)):
    chunks.append(render_window(model,timeline,i,work,0,index_rate,original['protect'],0,stages))
vocals=a.output/'converted-vocals.wav'
finish(chunks,timeline,vocals,model._vc.tgt_sr,0,stages)
service.suppress_silent_synthesis(vocals,a.reference/'model-input-16k.wav')
service.apply_dynamics(vocals,a.reference/'model-input-16k.wav',.5)
auto=service.calibrate_song_vocals(a.stems/'vocals.wav',vocals)
mix=a.output/'完整翻唱.wav';solo=a.output/'完整角色人声.wav'
service.remix_song(a.stems/'instrumental.wav',vocals,mix,original['sourceDurationSeconds'],sf.info(a.stems/'vocals.wav').samplerate)
shutil.copyfile(vocals,solo)
peaks={}
for path in (mix,solo):
    service.finalize_true_peak_safe(path)
    peaks[path.name]=service.transcode_mp3_true_peak_safe(path,path.with_suffix('.mp3'))
report=dict(reference=str(a.reference),factor=a.factor,changedPitchFrames=int(np.count_nonzero(f0!=z['corrected'])),
    indexRate=index_rate,sourceSha256=original['sourceSha256'],modelSha256=sha(model_path),
    indexSha256=original['indexSha256'],featuresSha256=sha(source/'features.npy'),
    f0EvidenceSha256=sha(source/'f0.npz'),pipelineRevision=service.PIPELINE_REVISION,
    sampleRate=sf.info(mix).samplerate,frames=sf.info(mix).frames,fullSourceConverted=True,
    elapsedSeconds=time.monotonic()-started,truePeak=peaks,automaticGain=auto,
    qualityListening='unverified',runtime=model.last_run_metadata)
assert report['frames']==original['sourceDecodedFrames']
(a.output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(report,ensure_ascii=False),flush=True)
