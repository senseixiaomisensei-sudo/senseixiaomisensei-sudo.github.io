"""Real mounted-model cold/warm and retrieval ablations; no quality-rating claims."""
import argparse
import gc
import hashlib
import json
import os
from pathlib import Path
import sys

import numpy as np
import soundfile as sf

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'rvc-service'))


def main(args):
    os.environ.setdefault('RVC_OFFICIAL_ROOT',r'D:\数据\rvc-runtime\official-rvc')
    os.environ.setdefault('RVC_RUNTIME_CACHE',r'D:\rvc-cache')
    os.environ.setdefault('CUBLAS_WORKSPACE_CONFIG',':4096:8')
    if args.synthesis_backend:
        os.environ['RVC_SYNTHESIS_BACKEND']=args.synthesis_backend
    from app.official_runtime import OfficialRvcModel, _sha256
    from app.audio_repair import protect_true_peak
    import torch
    args.output.mkdir(parents=True,exist_ok=True)
    source,rate=sf.read(args.source,dtype='float32')
    if rate!=16000 or source.ndim!=1:
        raise ValueError('Provide an explicitly prepared 16 kHz mono float source')
    source=source[:round(args.seconds*rate)]
    short=args.output/'source-16k.wav'
    sf.write(short,source,rate,subtype='FLOAT')
    report=[]
    for role in args.roles:
        folder=args.models/role
        model_path=next(folder.glob('*.pth'))
        index_path=next(folder.glob('*.index'),None)
        model=OfficialRvcModel(model_path,str(index_path) if index_path else '')
        previous=None
        for run,index_rate in enumerate([.45,.45,0.] if role==args.roles[0] else [.45,.45]):
            target=args.output/f'{role}-run{run+1}.wav'
            model.infer(short,target,pitch=0,f0_method='rmvpe',index_rate=index_rate,
                        resample_rate=0,rms_mix_rate=1.,protect=.33,filter_radius=0,
                        diagnostic_f0_dir=args.output/f'{role}-run{run+1}'/'f0')
            audio,sr=sf.read(target)
            row=dict(role=role,run=run+1,indexRate=index_rate,sampleRate=sr,frames=len(audio),
                     sourceSha256=_sha256(short),modelSha256=_sha256(model_path),
                     indexSha256=_sha256(index_path) if index_path else '',
                     dtype=sf.info(target).subtype,nonFinite=int((~np.isfinite(audio)).sum()),
                     runtime=model.last_run_metadata,qualityListening='unverified')
            if run==1 and previous is not None:
                row['repeatDifferenceRms']=float(np.sqrt(np.mean((previous-audio)**2)))
                row['repeatMaxDifference']=float(abs(previous-audio).max())
                row['repeatCorrelation']=float(np.corrcoef(previous,audio)[0,1])
            previous=audio.copy()
            assert row['nonFinite']==0 and row['dtype']=='FLOAT'
            assert abs(len(audio)/sr-len(source)/rate)<=.03
            protect_true_peak(target)
            report.append(row)
            (args.output/'regression.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
            print(json.dumps({k:row[k] for k in ('role','run','sampleRate','nonFinite')}) ,flush=True)
        del model
        gc.collect()
        if torch.cuda.is_available():torch.cuda.empty_cache()


if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('source',type=Path)
    p.add_argument('output',type=Path)
    p.add_argument('--models',type=Path,default=Path(r'E:\大肥鱼\rvc-local\models'))
    p.add_argument('--roles',nargs='+',default=['hoshino','mika','maki','koyuki'])
    p.add_argument('--seconds',type=float,default=8.)
    p.add_argument('--synthesis-backend',choices=['eager','cuda-graph'])
    main(p.parse_args())
