"""Real-checkpoint parity against the installed classic RVC/fairseq chain.

Run the reference in its compatible environment; compare in the current one.
These are component checks, not ratings of naturalness or character identity.
"""
import argparse
from contextlib import nullcontext
import hashlib
import json
import math
import os
from pathlib import Path
import sys
from types import SimpleNamespace

import numpy as np
import soundfile as sf
import torch
import torch.nn.functional as F

p=argparse.ArgumentParser()
p.add_argument('operation',choices=['feature-reference','feature-current','generator-reference','generator-current'])
p.add_argument('source',type=Path)
p.add_argument('model',type=Path)
p.add_argument('timeline',type=Path)
p.add_argument('output',type=Path)
args=p.parse_args()
args.output.mkdir(parents=True,exist_ok=True)
torch.set_num_threads(4)
os.environ['RVC_CUDA_GRAPH']='0'
site=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(site/'rvc-service'))
runtime=Path(r'D:\数据\rvc-runtime\official-rvc')
legacy=Path(r'E:\大肥鱼\rvc-local\.venv\Lib\site-packages\rvc_python')
sha=lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
metadata=dict(operation=args.operation,torch=torch.__version__,device='cpu',precision='float32',
    modelSha256=sha(args.model),sourceSha256=sha(args.source),listening='unverified')

if args.operation.startswith('feature'):
    data,rate=sf.read(args.source,dtype='float32')
    assert rate==16000 and data.ndim==1
    source=torch.from_numpy(data[None])
    if args.operation.endswith('reference'):
        from fairseq.models.wav2vec import wav2vec2,utils
        def safe_pad(x,multiple,dim=-1,value=0):
            if x is None:return None,0
            remainder=math.ceil(x.size(dim)/multiple)*multiple-x.size(dim)
            return (F.pad(x,(*(0,)*(-1-dim)*2,0,int(remainder)),value=value),remainder) if remainder else (x,0)
        wav2vec2.pad_to_multiple=utils.pad_to_multiple=safe_pad
        from rvc_python.modules.vc.utils import load_hubert
        config=SimpleNamespace(device='cpu',is_half=False)
        model=load_hubert(config,str(legacy)).float().eval()
        with torch.no_grad():
            hidden=model.extract_features(source=source,padding_mask=torch.zeros_like(source,dtype=torch.bool),
                output_layer=9)[0]
            feature=model.final_proj(hidden).numpy()
        metadata['encoderSha256']=sha(legacy/'base_model/hubert_base.pt')
    else:
        sys.path.insert(0,str(runtime))
        from infer.hubert import load_hubert_model,extract_hubert_features,HUBERT_MODEL_PATH
        model=load_hubert_model('cpu',False)
        with torch.no_grad():feature=extract_hubert_features(model,source,'v1').numpy()
        metadata['encoderSha256']=sha(HUBERT_MODEL_PATH/'pytorch_model.bin')
    np.save(args.output/(args.operation+'.npy'),feature)
    metadata['shape']=list(feature.shape)
    if args.operation.endswith('current'):
        reference=np.load(args.output/'feature-reference.npy')
        metadata.update(meanAbsoluteError=float(np.mean(abs(feature-reference))),
            maxAbsoluteError=float(np.max(abs(feature-reference))),
            cosine=float(np.sum(feature*reference)/np.sqrt(np.sum(feature**2)*np.sum(reference**2))))
else:
    import typing
    allow=(torch.serialization.safe_globals([typing.OrderedDict])
           if hasattr(torch.serialization,'safe_globals') else nullcontext())
    with allow:
        checkpoint=torch.load(args.model,map_location='cpu',weights_only=True)
    assert checkpoint.get('version','v1')=='v1'
    if args.operation.endswith('reference'):
        from rvc_python.lib.infer_pack.models import SynthesizerTrnMs256NSFsid
    else:
        sys.path.insert(0,str(runtime))
        from infer.module.models import SynthesizerTrnMs256NSFsid
    from app.pitch_safety import quantize_pitch
    from app.timeline_synthesis import counter_gaussian,source_excitation,infer_with_timeline
    net=SynthesizerTrnMs256NSFsid(*checkpoint['config'],is_half=False)
    del net.enc_q
    loaded=net.load_state_dict(checkpoint['weight'],strict=False)
    assert not loaded.missing_keys and not [k for k in loaded.unexpected_keys if not k.startswith('enc_q.')]
    net=net.float().eval()
    net.enc_p.register_forward_hook(lambda m,a,r:(r[0],r[1]+math.log(.35/.66666),r[2]))
    # Real A latter-half conditions, eight seconds; no synthetic test voice.
    z=np.load(args.timeline/'f0.npz')
    left=2900;count=800;first=left-300
    f0=z['corrected'][left:left+count].astype(np.float32)
    feature=np.load(args.timeline/'features.npy')[left//2:(left+count)//2]
    phones=F.interpolate(torch.from_numpy(feature[None]).permute(0,2,1),scale_factor=2).permute(0,2,1)
    lengths=torch.tensor([count]);coarse=torch.from_numpy(quantize_pitch(f0)[None]).long()
    continuous=torch.from_numpy(f0[None]);speaker=torch.tensor([0])
    phase=float(np.sum(z['corrected'][:left].astype(np.float32),dtype=np.float64)/100)
    context=SimpleNamespace(first_frame=first,seed=20260823,phase_cycles=phase)
    with torch.no_grad():
        if args.operation.endswith('reference'):
            mean,logs,mask=net.enc_p(phones,coarse,lengths)
            noise=counter_gaussian(context.seed,first+np.arange(count)[None,:],np.arange(mean.shape[1])[:,None])
            prior=mean+torch.exp(logs)*torch.from_numpy(noise[None])*.66666
            source=source_excitation(f0,40000,first,phase,context.seed)
            harmonic=net.dec.m_source.l_tanh(net.dec.m_source.l_linear(torch.from_numpy(source.astype(np.float32)[None,:,None])))
            # Only the reference test controls these draws. Native reference
            # encoder, flow and decoder operations remain in charge.
            net.enc_p.register_forward_hook(lambda m,a,r:(prior,torch.full_like(logs,-float('inf')),mask))
            net.dec.m_source.register_forward_hook(lambda m,a,r:(harmonic,None,None))
            output=net.infer(phones,lengths,coarse,continuous,speaker)[0][0,0].numpy()
        else:
            output=infer_with_timeline(net,phones,lengths,coarse,continuous,speaker,context)[0,0].numpy()
    sf.write(args.output/(args.operation+'.wav'),output,40000,subtype='FLOAT')
    metadata.update(frames=len(output),sampleRate=40000,
        conditions='same actual A features/F0, latent random draw and NSF excitation; native classic infer versus timeline adapter')
    if args.operation.endswith('current'):
        reference,_=sf.read(args.output/'generator-reference.wav',dtype='float32')
        metadata.update(meanAbsoluteError=float(np.mean(abs(output-reference))),
            maxAbsoluteError=float(np.max(abs(output-reference))),
            differenceRms=float(np.sqrt(np.mean((output-reference)**2))))
(args.output/(args.operation+'.json')).write_text(json.dumps(metadata,indent=2),encoding='utf8')
print(json.dumps(metadata),flush=True)
if args.operation.endswith('current'):
    assert metadata['maxAbsoluteError'] < 1e-4, 'Reference component parity failed'
