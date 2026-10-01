"""One feature/pitch clock, real context, and exact crops for complete recordings."""
from dataclasses import dataclass
from pathlib import Path
import json
import math
import os
import numpy as np
import soundfile as sf

HOP = 160
PAD_FRAMES = 300


def condition_seam_metrics(values, cut, radius=20):
    """Measure the shared array itself, independently of waveform overlap.

    Values are [channels, absolute frames]. A large step is evidence for
    investigation, not proof of an audible artifact or permission to smooth.
    """
    values=np.asarray(values,dtype=np.float64)
    if not 0<cut<values.shape[-1]:
        raise ValueError('Condition cut outside timeline')
    first=max(0,cut-radius);last=min(values.shape[-1],cut+radius)
    differences=np.sqrt(np.mean(np.diff(values[:,first:last],axis=-1)**2,axis=0))
    step=float(np.sqrt(np.mean((values[:,cut]-values[:,cut-1])**2)))
    neighbors=np.delete(differences,cut-first-1)
    reference=float(np.median(neighbors)) if len(neighbors) else 0.
    return dict(cutFrame=int(cut),cutStepRms=step,neighborMedianStepRms=reference,
                stepToNeighborRatio=step/max(reference,1e-12),
                interpretation='condition discontinuity measurement; listening not inferred')


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
    conditioning_features: np.ndarray | None = None
    retrieval: dict | None = None


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
    conditioning_features: np.ndarray | None = None
    retrieval: dict | None = None
    cut_frames: list | None = None

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
            context.conditioning_features=self.conditioning_features[left:right] if self.conditioning_features is not None else None
            context.retrieval=self.retrieval
        return self.audio[left*HOP:right*HOP], context


def frame_spans(samples, maximum=2000, overlap=50):
    frames = 2*math.ceil(samples/(HOP*2))
    count = max(1, math.ceil(max(0,frames-overlap)/(maximum-overlap)))
    starts = [2*round(i*(frames-overlap)/count/2) for i in range(count)]
    return [(start, starts[i+1]+overlap if i+1<count else frames)
            for i,start in enumerate(starts)]


def choose_cut_positions(audio, spans, pad_frames=PAD_FRAMES, margin=10, probe=5):
    """Place each ownership cut at the calmest frame of its overlap region.

    Two encodings of the same absolute frame never agree exactly, so the
    handover between windows belongs where the recording cannot expose it:
    the lowest-energy frame inside the overlap. The move happens only when a
    candidate is measurably calmer than the midpoint, so steady loud passages
    keep the predictable midpoint. The cut only decides which window owns
    each shared row - window geometry, F0 and synthesis spans are untouched.
    Candidates stay at least `margin` frames from either window's unsupported
    edge and on the even 50 Hz frame grid.
    """
    cuts = []
    for previous, current in zip(spans, spans[1:]):
        midpoint = 2*round((current[0]+previous[1])/4)
        low, high = current[0]+margin, previous[1]-margin

        def energy(frame):
            a = (frame - probe + pad_frames)*HOP
            b = (frame + probe + pad_frames)*HOP
            return float(np.dot(audio[a:b], audio[a:b]))

        if high <= low:
            cuts.append(midpoint)
            continue
        baseline = energy(midpoint)
        best, best_energy = midpoint, baseline
        for frame in range(low + (low % 2), high + 1, 2):
            candidate = energy(frame)
            if candidate < best_energy:
                best, best_energy = frame, candidate
        cuts.append(best if best_energy < baseline * .98 else midpoint)
    return cuts


def prepare_analysis(model, source, method, diagnostics=None, consensus=True, filter_radius=0):
    import torch
    from scipy.signal import filtfilt
    from infer.vc.pipeline import bh, ah
    from infer.hubert import extract_hubert_features
    from app.content_encoder import load_content_encoder
    from app.pitch_safety import extract_pitch, sanitize_pitch, median_smooth_pitch, independent_high_register_pitch
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
    # Overlap ownership is an absolute frame boundary placed at the calmest
    # frame of each overlap, not a crossfade of phonemes or a per-window
    # decision. Every synthesis sees identical rows.
    cuts = choose_cut_positions(audio, spans)
    evidence = {'cut_frames': cuts}
    feature_cuts={};previous_part=previous_start=None;feature_overlaps=[]
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
                part=part[0].float().cpu().numpy()
                feats[first//2:last//2] = part[a//2:b//2]
                if diagnostics is not None and previous_part is not None:
                    cut=first//2;lo=max(cut-10,start//2);hi=min(cut+10,(previous_start//2)+len(previous_part))
                    left=previous_part[lo-previous_start//2:hi-previous_start//2]
                    right=part[lo-start//2:hi-start//2]
                    feature_cuts[f'left_{i:03d}']=left
                    feature_cuts[f'right_{i:03d}']=right
                    midpoint=2*round((spans[i][0]+spans[i-1][1])/4)
                    feature_overlaps.append(dict(cutFrame100Hz=first,timeSeconds=first/100-3,
                        midpointFrame100Hz=midpoint,midpointTimeSeconds=midpoint/100-3,
                        firstAbsoluteFrame50Hz=lo,independentContextDifferenceRms=float(np.sqrt(np.mean((left-right)**2)))))
                previous_part,previous_start=part,start
            owners[first:last] = i
    finally:
        pipe.observe_pitch_confidence = previous_observe
    if np.any(owners<0) or not np.isfinite(feats).all():
        raise ValueError('Incomplete or non-finite analysis timeline')
    evidence = {'raw':base.copy(),'confidence':salience,'owners':owners}
    actual = base.copy()
    if use_consensus:
        independent = sanitize_pitch(extract_pitch(pipe,audio,n,'pm'))[:n]
        # High-register AC/CC consensus remains an opt-in experiment: on the
        # full stress input, correcting the condition alone did not make the
        # current checkpoint synthesize a stable matching high note.
        high_register = os.getenv('RVC_TIMELINE_HIGH_REGISTER','0') == '1'
        independent_cc = (independent_high_register_pitch(audio,16000,n,HOP)
                          if high_register else None)
        actual, decision = choose_supported_pitch(base,alternate,independent,audio,
            independent_cc=independent_cc,confidence=salience,time_origin_seconds=-3.)
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
        np.savez_compressed(root/'feature-cuts.npz',**feature_cuts)
        for row in feature_overlaps:
            row.update(condition_seam_metrics(feats.T,row['cutFrame100Hz']//2,10))
        (root/'feature-cuts.json').write_text(json.dumps(feature_overlaps,indent=2),encoding='utf8')
        (root/'analysis.json').write_text(json.dumps(dict(method=method,inputGain=gain,
            featureContract=model.encoder_metadata,frames=n,inputSamples=samples,
            changedFrames=int(np.count_nonzero(actual!=base)),paddingFrames=PAD_FRAMES,
            sourceSampleRate=16000,frameRate=100,consensus=use_consensus,
            highRegisterExperiment=bool(use_consensus and os.getenv('RVC_TIMELINE_HIGH_REGISTER','0')=='1'),
            explicitMedianRadius=1 if filter_radius>=5 else 0),indent=2),encoding='utf8')
    return AnalysisTimeline(audio,feats,actual,spans,samples,Path(source),method,evidence,
                            cut_frames=cuts)


def prepare_priors(model,timeline,index_rate,protect,pitch,diagnostics=None,analysis_spans=None):
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
    analysis_spans=timeline.spans if analysis_spans is None else analysis_spans
    if not analysis_spans or analysis_spans[0][0]!=0 or analysis_spans[-1][1]!=len(timeline.f0)-2*PAD_FRAMES:
        raise ValueError('Prior analysis must cover the original absolute timeline')
    if any(a%2 or b%2 or b<=a for a,b in analysis_spans):
        raise ValueError('Prior analysis must follow the content encoder frame grid')
    if any(a<0 or b>len(timeline.f0)-2*PAD_FRAMES for a,b in analysis_spans) or any(
        current[0]<=previous[0] or current[1]<=previous[1] or current[0]>previous[1]
        for previous,current in zip(analysis_spans,analysis_spans[1:])):
        raise ValueError('Prior analysis has gaps, reversed coverage or out-of-range spans')
    cuts = timeline.cut_frames if (
        analysis_spans is timeline.spans or analysis_spans == timeline.spans
    ) and timeline.cut_frames else [
        2*round((analysis_spans[i][0]+analysis_spans[i-1][1])/4) for i in range(1,len(analysis_spans))
    ]
    frames=len(timeline.f0)
    prior_mean=prior_logs=None
    overlaps=[]
    previous_mean=previous_span=None
    previous_logs=None;prior_cuts={}
    with torch.no_grad():
        for i,(start,end) in enumerate(analysis_spans):
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
            last=(cuts[i] if i+1<len(analysis_spans) else frames-PAD_FRAMES)+PAD_FRAMES
            prior_mean[:,first:last]=mean[:,first-start:last-start]
            prior_logs[:,first:last]=logs[:,first-start:last-start]
            if previous_mean is not None:
                a=start+PAD_FRAMES;b=previous_span[1]+PAD_FRAMES
                left=previous_mean[:,a-previous_span[0]:b-previous_span[0]].astype(np.float64)
                right=mean[:,a-start:b-start].astype(np.float64)
                overlaps.append(dict(startSeconds=start/100,
                    independentlyEncodedPriorDifferenceRms=float(np.sqrt(np.mean((left-right)**2))),
                    sharedArraysReused=True))
                cut=first;lo=max(start,cut-20);hi=min(previous_span[1]+2*PAD_FRAMES,cut+20)
                for name,current,previous in [('mean',mean,previous_mean),('logs',logs,previous_logs)]:
                    prior_cuts[f'{name}_left_{i:03d}']=previous[:,lo-previous_span[0]:hi-previous_span[0]]
                    prior_cuts[f'{name}_right_{i:03d}']=current[:,lo-start:hi-start]
                overlaps[-1].update(cutFrame=cut,cutTimeSeconds=cut/100-3)
            previous_mean,previous_logs,previous_span=mean,logs,(start,end)
    timeline.prior_mean=prior_mean;timeline.prior_logs=prior_logs
    timeline.conditioning_features=features[0].float().cpu().numpy()
    timeline.retrieval=retrieval
    timeline.model_revision=getattr(model,'resource_revision',None)
    if diagnostics:
        root=Path(diagnostics)/'timeline'
        np.savez_compressed(root/'priors.npz',mean=prior_mean,logs=prior_logs)
        np.save(root/'conditioning-features.npy',timeline.conditioning_features)
        np.savez_compressed(root/'prior-cuts.npz',**prior_cuts)
        for row in overlaps:
            row['meanSharedSeam']=condition_seam_metrics(prior_mean,row['cutFrame'])
            row['logsSharedSeam']=condition_seam_metrics(prior_logs,row['cutFrame'])
        np.savez_compressed(root/'final-pitch.npz',
            continuous=(timeline.f0*2**(pitch/12)).astype(np.float32),coarse=coarse,
            voiced=timeline.f0>0,pitch_shift=pitch,time_origin_seconds=-3.,frame_rate=100)
        (root/'prior.json').write_text(json.dumps(dict(retrieval=retrieval,pitchShift=pitch,
            protect=protect,noiseScale=model.noise_scale,overlaps=overlaps,
            analysisSpans=analysis_spans,synthesisSpans=timeline.spans,
            actualSynthesisCondition='shared enc_p mean/logs, not per-window retrieval recomputation'),indent=2),encoding='utf8')


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
