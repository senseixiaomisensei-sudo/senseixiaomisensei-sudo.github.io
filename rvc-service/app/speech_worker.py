"""Real V2 timbre path: fp32, content CFG 0, character CFG .7, 100 steps.

No AR, auto-tune, source vocal blend or cosmetic DSP. Raw BigVGAN floats are
captured before the upstream hard clamp; shared output protection runs later.
"""
from pathlib import Path
import argparse,functools,hashlib,importlib,json,os,sys,time
import numpy as np,soundfile as sf,torch,yaml

def instantiate(node):
    if not isinstance(node,dict):return node
    if '_target_' not in node:return {k:instantiate(v) for k,v in node.items()}
    module,attr=node['_target_'].rsplit('.',1)
    try:fn=getattr(importlib.import_module(module),attr)
    except ModuleNotFoundError:
        package,cls=module.rsplit('.',1);fn=getattr(getattr(importlib.import_module(package),cls),attr)
    kw={k:instantiate(v) for k,v in node.items() if not k.startswith('_')}
    return functools.partial(fn,**kw) if node.get('_partial_') else fn(**kw)

def checked_load(module,state,label,preloaded=()):
    state={k.removeprefix('module.'):v for k,v in state.items()}
    if label=='speaker':state={k.replace('xvector.stats','stats').replace('xvector.dense','dense'):v for k,v in state.items()}
    required=module.state_dict();accepted={k:v for k,v in state.items() if k in required and v.shape==required[k].shape}
    missing=[k for k in dict(module.named_parameters()) if k not in accepted and not k.startswith(preloaded)]
    if missing:raise RuntimeError(f'Incomplete {label} checkpoint: {missing}')
    torch.nn.Module.load_state_dict(module,accepted,strict=False)
    return dict(loadedKeys=len(accepted),unexpectedKeys=sorted(set(state)-set(accepted)))

def run(args):
    started=time.monotonic();cfg=json.loads(Path(args.config).read_text(encoding='utf8'))
    for item in cfg['files']:
        p=Path(item['path'])
        if p.stat().st_size!=item['size'] or hashlib.sha256(p.read_bytes()).hexdigest()!=item['sha256']:
            raise RuntimeError('Pinned speech resource hash mismatch')
    sys.path.insert(0,cfg['codeRoot'])
    import librosa,torchaudio
    torch.set_num_threads(4);torch.manual_seed(20260823);np.random.seed(20260823)
    torch.backends.cuda.matmul.allow_tf32=False
    device=torch.device('cuda')
    config=yaml.safe_load(Path(cfg['codeRoot'],'configs/v2/vc_wrapper.yaml').read_text(encoding='utf8'))
    config['content_extractor_wide']['ssl_model_name']=cfg['hubert']
    config['content_extractor_wide']['tokenizer_name']=cfg['tokenizer']
    config['vocoder']['pretrained_model_name_or_path']=cfg['vocoder']
    cfm=instantiate(config['cfm']);regulator=instantiate(config['cfm_length_regulator'])
    content=instantiate(config['content_extractor_wide']);speaker=instantiate(config['style_encoder'])
    vocoder=instantiate(config['vocoder']);vocoder.remove_weight_norm();mel_fn=instantiate(config['mel_fn'])
    net=torch.load(cfg['cfm'],map_location='cpu',weights_only=True)['net']
    loaded={'cfm':checked_load(cfm,net['cfm'],'cfm'),
            'regulator':checked_load(regulator,net['length_regulator'],'regulator'),
            'content':checked_load(content,torch.load(cfg['quantizer'],map_location='cpu',weights_only=True),'content',('ssl_model.',)),
            'speaker':checked_load(speaker,torch.load(cfg['speaker'],map_location='cpu',weights_only=True),'speaker')}
    for module in [cfm,regulator,content,speaker,vocoder]:module.eval().to(device)
    source=librosa.load(args.source,sr=22050)[0];reference=librosa.load(args.reference,sr=22050)[0]
    if not np.isfinite(source).all() or not np.isfinite(reference).all():raise ValueError('Non-finite input')
    if not 3<=len(reference)/22050<=12:raise ValueError('Reference duration outside validated contract')
    diag=Path(args.diagnostics);diag.mkdir(parents=True,exist_ok=True)
    chunks=[];raw_capture=[];vocoder.conv_post.register_forward_hook(lambda m,x,y:raw_capture.append(y))
    with torch.inference_mode():
        src16=librosa.resample(source,orig_sr=22050,target_sr=16000)
        ref16=librosa.resample(reference,orig_sr=22050,target_sr=16000)
        source_mel=mel_fn(torch.from_numpy(source).unsqueeze(0).to(device))
        ref_mel=mel_fn(torch.from_numpy(reference).unsqueeze(0).to(device))
        # Native 30 s / 5 s left-context semantic extraction, on one timeline.
        indices=[];position=0;previous=None
        while position<len(src16):
            take=30*16000 if previous is None else 25*16000
            piece=src16[position:position+take]
            if previous is not None:piece=np.concatenate([previous,piece])
            _,tokens,_=content(torch.from_numpy(piece.copy()).unsqueeze(0).to(device),[len(piece)])
            indices.append(tokens if previous is None else tokens[:,250:])
            previous=piece[-5*16000:];position+=take
        source_indices=torch.cat(indices,dim=1)
        _,ref_indices,_=content(torch.from_numpy(ref16).unsqueeze(0).to(device),[len(ref16)])
        content.cpu();torch.cuda.empty_cache()
        feat=torchaudio.compliance.kaldi.fbank(torch.from_numpy(ref16).unsqueeze(0).to(device),num_mel_bins=80,dither=0,sample_frequency=16000)
        feat=feat-feat.mean(dim=0,keepdim=True)
        style=speaker(feat.unsqueeze(0),torch.tensor([feat.shape[0]],dtype=torch.int32,device=device)//2)
        cond,_=regulator(source_indices,ylens=torch.tensor([source_mel.shape[-1]],device=device))
        prompt,_=regulator(ref_indices,ylens=torch.tensor([ref_mel.shape[-1]],device=device))
        np.save(diag/'source-content.npy',source_indices.cpu().numpy())
        np.save(diag/'character-embedding.npy',style.cpu().numpy())
        # Native context budget and frame-domain overlap, with complementary
        # linear weights (no equal-power gain bump on correlated waveforms).
        window=22050//256*30-ref_mel.shape[-1];overlap=16
        assembled=[];tail=None;position=0;clamp_count=0
        while position<cond.shape[1]:
            end=min(position+window,cond.shape[1]);cat=torch.cat([prompt,cond[:,position:end]],dim=1)
            mel=cfm.inference(cat,torch.tensor([cat.shape[1]],device=device),ref_mel,style,100,inference_cfg_rate=[0,.7],random_voice=False)
            mel=mel[:,:,ref_mel.shape[-1]:cat.shape[1]]
            bounded=vocoder(mel.float());raw=raw_capture.pop().squeeze().cpu().numpy()
            np.save(diag/f'mel-{len(chunks):03d}.npy',mel.cpu().numpy())
            sf.write(diag/f'raw-{len(chunks):03d}.wav',raw,22050,subtype='FLOAT')
            if not np.isfinite(raw).all():raise RuntimeError('Non-finite synthesis')
            clamp_count+=int(torch.count_nonzero(bounded.squeeze().cpu()!=torch.from_numpy(raw)))
            if tail is not None:
                n=len(tail);weights=np.linspace(0,1,n,dtype='float32')
                raw[:n]=tail*(1-weights)+raw[:n]*weights
            last=end==cond.shape[1]
            chunks.append(dict(startFrame=position,endFrame=end,rawFrames=len(raw)))
            if last:assembled.append(raw);break
            n=overlap*256;assembled.append(raw[:-n]);tail=raw[-n:].copy();position=end-overlap
        values=np.concatenate(assembled)
    if abs(len(values)-len(source))>=256:raise RuntimeError('Speech timeline drift exceeds one native hop')
    sf.write(args.output,values,22050,subtype='FLOAT')
    report=dict(engine='seed-vc-v2-speech',codeCommit=cfg['codeCommit'],engineRevision=cfg['revision'],
        parameters=dict(diffusionSteps=100,contentCfg=0,similarityCfg=.7,seed=20260823,precision='fp32',convertStyle=False,arInvoked=False,retrieval=False,f0Method=None),
        sourceFrames=len(source),outputFrames=len(values),sampleRate=22050,rawPeak=float(np.max(abs(values))),
        bypassedHardClampSamples=clamp_count,nonFinite=0,chunks=chunks,checkpointLoad=loaded,
        elapsedSeconds=time.monotonic()-started,hearing='未听评')
    (diag/'inference.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps(dict(frames=len(values),seconds=report['elapsedSeconds'])),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    for key in ['config','source','reference','output','diagnostics']:parser.add_argument('--'+key,required=True)
    run(parser.parse_args())
