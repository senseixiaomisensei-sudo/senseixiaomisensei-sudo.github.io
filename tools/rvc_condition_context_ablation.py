"""Real synthesis changing one analysis context while freezing F0 and RNG."""
import argparse,hashlib,json,os,sys,time
from pathlib import Path
import numpy as np,soundfile as sf

p=argparse.ArgumentParser();p.add_argument('reference',type=Path);p.add_argument('output',type=Path)
p.add_argument('--factor',choices=['prior-context','content-context'],required=True)
p.add_argument('--maximum-frames',type=int,default=4000)
a=p.parse_args();a.reference=a.reference.resolve();a.output.mkdir(parents=True,exist_ok=True)
site=Path(__file__).resolve().parents[1]
os.environ.update(RVC_OFFICIAL_ROOT=r'D:\数据\rvc-runtime\official-rvc',RVC_MODELS_DIR=r'E:\大肥鱼\rvc-local\models',
    RVC_CUDA_GRAPH='0',CUBLAS_WORKSPACE_CONFIG=':4096:8',RVC_WORK_ROOT=str(a.output/'work'),RVC_OUTPUT_ROOT=str(a.output/'outputs'))
sys.path.insert(0,str(site/'rvc-service'))
from app import main as service
from app.analysis_timeline import AnalysisTimeline,frame_spans,prepare_priors,condition_seam_metrics
from app.timeline_rendering import render_window
from app.analysis_timeline import join_timeline
from scipy.signal import filtfilt

stamp=json.loads((a.reference/'report.json').read_text(encoding='utf8'))
model_path=service.find_model_path(stamp['characterId'])
sha=lambda path:hashlib.sha256(Path(path).read_bytes()).hexdigest()
assert sha(model_path)==stamp['checkpointSha256']
assert sha(service.find_index_path(model_path))==stamp['indexSha256']
model=service.acquire_model(model_path)
from infer.vc.pipeline import bh,ah
from infer.hubert import extract_hubert_features
from app.content_encoder import load_content_encoder
import torch
source=a.reference/'diagnostic-stages/timeline'
raw,sr=sf.read(a.reference/'model-input-16k.wav',dtype='float64');assert sr==16000 and raw.ndim==1
z=np.load(source/'f0.npz');f0=z['corrected'].copy();features=np.load(source/'features.npy')
spans=frame_spans(len(raw));frames=len(f0)-600
gain=json.loads((source/'analysis.json').read_text())['inputGain']
audio=np.pad(filtfilt(bh,ah,raw*gain),(48000,(frames+302)*160-len(raw)),mode='reflect')
analysis_spans=frame_spans(len(raw),maximum=a.maximum_frames)
if a.factor=='content-context':
    if model._vc.hubert_model is None:
        model._vc.hubert_model,model.encoder_metadata=load_content_encoder(model.encoder_contract,model._vc.config,model.model_path)
    candidate=np.zeros_like(features)
    cuts=[2*round((analysis_spans[i][0]+analysis_spans[i-1][1])/4) for i in range(1,len(analysis_spans))]
    with torch.no_grad():
        for i,(start,end) in enumerate(analysis_spans):
            waveform=audio[start*160:(end+602)*160]
            tensor=torch.as_tensor(waveform[None],device=model._vc.pipeline.device,
                dtype=torch.float16 if model.info.is_half else torch.float32)
            part=extract_hubert_features(model._vc.hubert_model,tensor,model._vc.version)[0].float().cpu().numpy()
            first=(cuts[i-1] if i else -300)+300
            last=(cuts[i] if i+1<len(analysis_spans) else frames+300)+300
            candidate[first//2:last//2]=part[(first-start)//2:(last-start)//2]
    features=candidate
timeline=AnalysisTimeline(audio,features,f0,spans,len(raw),a.reference/'model-input-16k.wav',stamp['actualF0Method'],{})
stage=a.output/'diagnostic-stages';(stage/'timeline').mkdir(parents=True,exist_ok=True)
np.save(stage/'timeline/features.npy',features);np.savez_compressed(stage/'timeline/f0.npz',corrected=f0)
prepare_priors(model,timeline,stamp['indexRate'],stamp['protect'],stamp['pitch'],stage,
    analysis_spans=analysis_spans if a.factor=='prior-context' else None)
chunks=[];started=time.monotonic();work=a.output/'chunks';work.mkdir(exist_ok=True)
for i in range(len(spans)):chunks.append(render_window(model,timeline,i,work,stamp['pitch'],stamp['indexRate'],stamp['protect'],0,stage))
result=a.output/'原始合成人声.wav'
join_timeline(chunks,timeline,result,model._vc.tgt_sr,stage)
reference_prior=np.load(source/'priors.npz')
cuts=[int(row['cutFrame']) for row in json.loads((source/'prior.json').read_text())['overlaps']]
rows=[dict(timeSeconds=cut/100-3,baseline=condition_seam_metrics(reference_prior['mean'],cut),
    candidate=condition_seam_metrics(timeline.prior_mean,cut)) for cut in cuts]
report=dict(factor=a.factor,analysisMaximumFrames=a.maximum_frames,analysisSpans=analysis_spans,synthesisSpans=spans,
    checkpointSha256=sha(model_path),indexSha256=sha(service.find_index_path(model_path)),
    sourceSha256=stamp['sourceSha256'],reference=str(a.reference),
    f0FrozenSha256=hashlib.sha256(f0.tobytes()).hexdigest(),changedF0Frames=0,
    referenceFeaturesSha256=sha(source/'features.npy'),candidateFeaturesSha256=sha(stage/'timeline/features.npy'),
    seed=20260823,noiseScale=model.noise_scale,runtime=model.last_run_metadata,
    originalOwnershipCuts=rows,outputSha256=sha(result),fullSourceConverted=True,
    listening='unverified',elapsedSeconds=time.monotonic()-started)
(a.output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(output=str(result),factor=a.factor,changedF0Frames=0,fullSourceConverted=True)),flush=True)
