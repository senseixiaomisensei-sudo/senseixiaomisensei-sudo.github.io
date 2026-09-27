"""One feature/pitch clock, real context, and exact crops for complete recordings."""
from dataclasses import dataclass
from pathlib import Path
import json
import math
import numpy as np
import soundfile as sf

HOP = 160
PAD_FRAMES = 300


@dataclass
class WindowContext:
    features: np.ndarray
    f0: np.ndarray
    first_frame: int
    phase_cycles: float
    crop_left: int
    output_samples: int
    seed: int = 20260823
    prior_mean: np.ndarray | None = None
    prior_logs: np.ndarray | None = None


@dataclass
class AnalysisTimeline:
    audio: np.ndarray
    features: np.ndarray
    f0: np.ndarray
    spans: list
    input_samples: int
    source_path: Path
    method: str
    evidence: dict
    prior_mean: np.ndarray | None = None
    prior_logs: np.ndarray | None = None
    model_revision: str | None = None

    def window(self, index, rate, shift):
        start, end = self.spans[index]
        left, right = start, end+PAD_FRAMES*2
        scale = 2**(shift/12)
        # Accumulate from the single padded timeline, never from this window.
        # Match the actual float32 NSF condition before integrating its phase.
        shifted = (self.f0[:left]*scale).astype(np.float32).astype(np.float64)
        phase = float(np.sum(shifted, dtype=np.float64)/100)
        valid_input = min(self.input_samples, end*HOP)-start*HOP
        count = round(valid_input*rate/16000)
        context = WindowContext(self.features[left//2:right//2], self.f0[left:right],
            start-PAD_FRAMES, phase, PAD_FRAMES*rate//100, count)
        if self.prior_mean is not None:
            context.prior_mean=self.prior_mean[:,left:right]
            context.prior_logs=self.prior_logs[:,left:right]
        return self.audio[left*HOP:right*HOP], context


def frame_spans(samples, maximum=2000, overlap=50):
    frames = 2*math.ceil(samples/(HOP*2))
    count = max(1, math.ceil(max(0,frames-overlap)/(maximum-overlap)))
    starts = [2*round(i*(frames-overlap)/count/2) for i in range(count)]
    return [(start, starts[i+1]+overlap if i+1<count else frames)
            for i,start in enumerate(starts)]


def prepare_analysis(model, source, method, diagnostics=None, consensus=True, filter_radius=0):
    import torch
    from scipy.signal import filtfilt
    from infer.vc.pipeline import bh, ah
    from infer.hubert import extract_hubert_features
    from app.content_encoder import load_content_encoder
    from app.pitch_safety import extract_pitch, sanitize_pitch, median_smooth_pitch
    from app.pitch_consensus import choose_supported_pitch

    audio, rate = sf.read(source, dtype='float64')
    if rate != 16000 or audio.ndim != 1 or not np.isfinite(audio).all():
        raise ValueError('Timeline requires finite mono 16 kHz input')
    samples = len(audio)
    spans = frame_spans(samples)
    frames = spans[-1][1]
    gain = min(1., .95/max(float(np.max(np.abs(audio))),1e-12))
    audio = filtfilt(bh, ah, audio*gain)
    # Two extra frames supply HuBERT's valid-convolution lookahead. Only
    # boundaries of the original recording reflect; internal windows are real.
    audio = np.pad(audio, (PAD_FRAMES*HOP, (frames+PAD_FRAMES+2)*HOP-samples), mode='reflect')
    n = frames+2*PAD_FRAMES
    pipe = model._vc.pipeline
    if model._vc.hubert_model is None:
        model._vc.hubert_model, model.encoder_metadata = load_content_encoder(
            model.encoder_contract, model._vc.config, model.model_path)
    feats = np.zeros((n//2,model.encoder_contract.feature_dimension),dtype=np.float32)
    base = np.zeros(n); alternate = np.zeros(n); salience = np.full(n,np.nan)
    owners = np.full(n,-1,dtype=np.int32)
    use_consensus = consensus and method == 'rmvpe' and bool(model._vc.if_f0)
    # Overlap ownership is a fixed absolute frame boundary, not a crossfade of
    # phonemes or a per-window decision. Every synthesis sees identical rows.
    cuts = [2*round((spans[i][0]+spans[i-1][1])/4) for i in range(1,len(spans))]
    previous_observe = getattr(pipe,'observe_pitch_confidence',False)
    pipe.observe_pitch_confidence = True
    try:
        for i,(start,end) in enumerate(spans):
            waveform = audio[start*HOP:(end+2*PAD_FRAMES+2)*HOP]
            first = (cuts[i-1] if i else -PAD_FRAMES)+PAD_FRAMES
            last = (cuts[i] if i+1<len(spans) else frames+PAD_FRAMES)+PAD_FRAMES
            a,b = first-start,last-start
            if bool(model._vc.if_f0):
                raw = sanitize_pitch(extract_pitch(pipe,waveform,len(waveform)//HOP,method))
                base[first:last] = raw[a:b]
                confidence = getattr(pipe,'pitch_confidence',None)
                if confidence is not None:
                    salience[first:last] = confidence[a:b]
                if use_consensus:
                    other = sanitize_pitch(extract_pitch(pipe,waveform,len(waveform)//HOP,'fcpe'))
                    alternate[first:last] = other[a:b]
            with torch.no_grad():
                input_tensor = torch.as_tensor(waveform[None],device=pipe.device,
                    dtype=torch.float16 if pipe.is_half else torch.float32)
                part = extract_hubert_features(model._vc.hubert_model,input_tensor,model._vc.version)
                feats[first//2:last//2] = part[0,a//2:b//2].float().cpu().numpy()
            owners[first:last] = i
    finally:
        pipe.observe_pitch_confidence = previous_observe
    if np.any(owners<0) or not np.isfinite(feats).all():
        raise ValueError('Incomplete or non-finite analysis timeline')
    evidence = {'raw':base.copy(),'confidence':salience,'owners':owners}
    actual = base.copy()
    if use_consensus:
        independent = sanitize_pitch(extract_pitch(pipe,audio,n,'pm'))[:n]
        actual, decision = choose_supported_pitch(base,alternate,independent,audio)
        evidence.update(decision)
    if filter_radius>=5:
        actual=median_smooth_pitch(actual,1)
    evidence['corrected'] = actual
    if diagnostics is not None:
        root = Path(diagnostics)/'timeline';root.mkdir(parents=True,exist_ok=True)
        np.savez_compressed(root/'f0.npz',**evidence,time_origin_seconds=-3.,hop=HOP,
            sample_rate=16000,method=method,consensus=use_consensus)
        # Features can be compared with the reference without retaining any
        # original singer waveform in synthesized output.
        np.save(root/'features.npy',feats)
        (root/'analysis.json').write_text(json.dumps(dict(method=method,inputGain=gain,
            featureContract=model.encoder_metadata,frames=n,inputSamples=samples,
            changedFrames=int(np.count_nonzero(actual!=base)),paddingFrames=PAD_FRAMES,
            sourceSampleRate=16000,frameRate=100,consensus=use_consensus,
            explicitMedianRadius=1 if filter_radius>=5 else 0),indent=2),encoding='utf8')
    return AnalysisTimeline(audio,feats,actual,spans,samples,Path(source),method,evidence)


def prepare_priors(model,timeline,index_rate,protect,pitch,diagnostics=None):
    """Share the stochastic prior too: enc_p itself contains attention.

    Identical HuBERT rows and pitch alone do not guarantee identical means or
    variances when enc_p is evaluated with different window contexts. Assign
    each posterior-conditioning row once, then reuse it across decoder windows.
    """
    import torch
    from torch.nn import functional as F
    import faiss
    from app.pitch_safety import quantize_pitch
    from app.retrieval_safety import validate_index,stable_retrieval
    pipe=model._vc.pipeline
    dtype=torch.float16 if pipe.is_half else torch.float32
    original=torch.as_tensor(timeline.features[None],device=pipe.device,dtype=dtype)
    features=original
    retrieval={'requestedRate':index_rate,'actual':False}
    if index_rate and model._index_path:
        index=faiss.read_index(model._index_path)
        vectors=index.reconstruct_n(0,index.ntotal)
        validate_index(index,vectors,timeline.features.shape[1])
        distances,neighbors=index.search(timeline.features,8)
        retrieved,stats=stable_retrieval(distances,neighbors,vectors,timeline.features)
        features=torch.as_tensor(retrieved[None],device=pipe.device,dtype=dtype)*index_rate+(1-index_rate)*original
        retrieval.update(actual=True,**stats)
        del vectors,index,retrieved
    features=F.interpolate(features.permute(0,2,1),scale_factor=2).permute(0,2,1)
    if protect<.5:
        initial=F.interpolate(original.permute(0,2,1),scale_factor=2).permute(0,2,1)
        voiced=torch.as_tensor(np.where(timeline.f0>0,1.,protect)[None,:,None],device=pipe.device,dtype=torch.float32)
        features=(features*voiced+initial*(1-voiced)).to(dtype)
    coarse=quantize_pitch(timeline.f0*2**(pitch/12))
    cuts=[2*round((timeline.spans[i][0]+timeline.spans[i-1][1])/4) for i in range(1,len(timeline.spans))]
    frames=len(timeline.f0)
    prior_mean=prior_logs=None
    overlaps=[]
    previous_mean=previous_span=None
    with torch.no_grad():
        for i,(start,end) in enumerate(timeline.spans):
            stop=end+2*PAD_FRAMES
            mean,logs,mask=model._vc.net_g.enc_p(features[:,start:stop],
                torch.as_tensor(coarse[None,start:stop],device=pipe.device).long(),
                torch.tensor([stop-start],device=pipe.device).long())
            mean=mean[0].cpu().numpy();logs=logs[0].cpu().numpy()
            if not np.isfinite(mean).all() or not np.isfinite(logs).all():
                raise ValueError('Non-finite synthesis prior')
            if prior_mean is None:
                prior_mean=np.empty((mean.shape[0],frames),dtype=mean.dtype)
                prior_logs=np.empty_like(prior_mean)
            first=(cuts[i-1] if i else -PAD_FRAMES)+PAD_FRAMES
            last=(cuts[i] if i+1<len(timeline.spans) else frames-PAD_FRAMES)+PAD_FRAMES
            prior_mean[:,first:last]=mean[:,first-start:last-start]
            prior_logs[:,first:last]=logs[:,first-start:last-start]
            if previous_mean is not None:
                a=start+PAD_FRAMES;b=previous_span[1]+PAD_FRAMES
                left=previous_mean[:,a-previous_span[0]:b-previous_span[0]].astype(np.float64)
                right=mean[:,a-start:b-start].astype(np.float64)
                overlaps.append(dict(startSeconds=start/100,
                    independentlyEncodedPriorDifferenceRms=float(np.sqrt(np.mean((left-right)**2))),
                    sharedPriorDifferenceRms=0.))
            previous_mean,previous_span=mean,(start,end)
    timeline.prior_mean=prior_mean;timeline.prior_logs=prior_logs
    timeline.model_revision=getattr(model,'resource_revision',None)
    if diagnostics:
        root=Path(diagnostics)/'timeline'
        np.savez_compressed(root/'priors.npz',mean=prior_mean,logs=prior_logs)
        np.savez_compressed(root/'final-pitch.npz',
            continuous=(timeline.f0*2**(pitch/12)).astype(np.float32),coarse=coarse,
            voiced=timeline.f0>0,pitch_shift=pitch,time_origin_seconds=-3.,frame_rate=100)
        (root/'prior.json').write_text(json.dumps(dict(retrieval=retrieval,pitchShift=pitch,
            protect=protect,noiseScale=model.noise_scale,overlaps=overlaps),indent=2),encoding='utf8')


def join_timeline(chunks, timeline, destination, rate, diagnostics=None):
    target_samples = round(timeline.input_samples*rate/16000)
    output = np.zeros(target_samples,dtype=np.float64)
    written = 0
    rows=[]
    for i,path in enumerate(chunks):
        data,sr=sf.read(path,dtype='float64')
        if sr!=rate or data.ndim!=1 or not np.isfinite(data).all():
            raise ValueError('Invalid timeline synthesis chunk')
        start=round(timeline.spans[i][0]*rate/100)
        expected=min(target_samples,round(timeline.spans[i][1]*rate/100))-start
        if len(data)!=expected or start>written:
            raise ValueError('Timeline synthesis length or coverage mismatch')
        overlap=max(0,written-start)
        if overlap:
            old=output[start:written].copy();new=data[:overlap]
            corr=float(old@new/np.sqrt((old@old)*(new@new)+1e-30))
            weights=(np.arange(overlap)+1)/(overlap+1)
            joined=old*(1-weights)+new*weights
            center=slice(overlap*2//5,overlap*3//5)
            reference=np.mean((old[center]**2+new[center]**2)/2)
            drop=10*np.log10((np.mean(joined[center]**2)+1e-30)/(reference+1e-30))
            rows.append(dict(startSeconds=start/rate,endSeconds=written/rate,
                correlation=corr,midEnergyChangeDb=float(drop)))
            output[start:written]=joined
        output[start+overlap:start+len(data)]=data[overlap:]
        written=start+len(data)
    if written!=target_samples:
        raise ValueError('Incomplete conversion timeline')
    sf.write(destination,output,rate,subtype='FLOAT')
    if diagnostics is not None:
        root=Path(diagnostics)/'timeline';root.mkdir(parents=True,exist_ok=True)
        (root/'joins.json').write_text(json.dumps(rows,indent=2),encoding='utf8')
    return rows
