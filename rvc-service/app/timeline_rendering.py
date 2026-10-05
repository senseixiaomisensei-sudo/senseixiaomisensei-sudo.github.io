"""Service orchestration for the opt-in shared-analysis inference chain."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import numpy as np
import soundfile as sf

from app.analysis_timeline import prepare_analysis, prepare_priors, join_timeline, PAD_FRAMES, HOP


def prepare(model,input_wav,work_root,requested_method,diagnostic_dir,pitch=0,index_rate=.45,protect=.33,filter_radius=0,
            register_strength=0.,register_pitch=0.):
    method='rmvpe' if requested_method=='auto' else requested_method
    consensus=os.getenv('RVC_TIMELINE_CONSENSUS','1')=='1'
    timeline=prepare_analysis(model,input_wav,method,diagnostic_dir,consensus=consensus,filter_radius=filter_radius)
    prepare_priors(model,timeline,index_rate,protect,pitch,diagnostic_dir,
                   register_strength=register_strength,register_pitch=register_pitch)
    source=Path(work_root)/'source';source.mkdir(parents=True,exist_ok=True)
    manifest=dict(sourceDurationSeconds=timeline.input_samples/16000,
        mode='absolute-analysis-v1',crossfadeSeconds=.5,
        contextSeconds=3.,tailPaddingSamples=0,f0MethodRequested=requested_method,
        f0MethodPreferred=method,f0MethodsUsed=[method]*len(timeline.spans),
        consensus=consensus and method=='rmvpe',registerControls=timeline.register_controls,chunks=[],overlaps=[])
    for i,(start,end) in enumerate(timeline.spans):
        stop=min(end*HOP,timeline.input_samples)
        wave=timeline.audio[(start+PAD_FRAMES)*HOP:PAD_FRAMES*HOP+stop]
        sf.write(source/f'source-{i:03d}.wav',wave,16000,subtype='FLOAT')
        manifest['chunks'].append(dict(index=i,startSeconds=start/100,
            durationSeconds=len(wave)/16000,sampleRate=16000,file=f'source-{i:03d}.wav',
            frameStart=start,frameEnd=end))
        if i:
            manifest['overlaps'].append(dict(startSeconds=start/100,
                endSeconds=timeline.spans[i-1][1]/100))
    (source/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
    return timeline


def render_window(model,timeline,index,work_root,pitch,index_rate,protect,filter_radius,diagnostic_dir):
    if timeline.model_revision is not None and timeline.model_revision != getattr(model,'resource_revision',None):
        raise ValueError('Model resources changed during this conversion; retry with one fixed revision')
    root=Path(work_root)
    rate=model._vc.tgt_sr
    wave,context=timeline.window(index,rate,pitch)
    input_path=root/f'context-{index:03d}.wav'
    output=root/f'converted-{index:03d}.wav'
    sf.write(input_path,wave,16000,subtype='FLOAT')
    evidence=Path(diagnostic_dir)/f'chunk-{index:03d}' if diagnostic_dir else None
    try:
        model.infer(input_path,output,pitch=pitch,f0_method=timeline.method,index_rate=index_rate,
            resample_rate=0,rms_mix_rate=1.,protect=protect,filter_radius=filter_radius,
            diagnostic_f0_dir=evidence/'f0' if evidence else None,
            time_origin_seconds=timeline.spans[index][0]/100,analysis_context=context)
        if evidence:
            evidence.mkdir(parents=True,exist_ok=True)
            for name in (f'raw-{timeline.method}.wav','aligned.wav'):
                shutil.copyfile(output,evidence/name)
            (evidence/'alignment.json').write_text(json.dumps(dict(
                sourceDuration=context.output_samples/rate,generatedDuration=sf.info(output).duration,
                tailCompensationSeconds=0,realContext=True,timeOriginSeconds=timeline.spans[index][0]/100),
                indent=2),encoding='utf8')
    finally:
        input_path.unlink(missing_ok=True)
    return output


def finish(chunks,timeline,output_wav,rate,resample_rate,diagnostic_dir):
    from app.audio_repair import repair_vocal_file
    join_timeline(chunks,timeline,output_wav,rate,diagnostic_dir)
    if diagnostic_dir:
        shutil.copyfile(output_wav,Path(diagnostic_dir)/'joined-before-repair.wav')
    repair_vocal_file(output_wav)
    if resample_rate>=16000 and resample_rate!=rate:
        converted=Path(output_wav).with_name('timeline-resampled.wav')
        try:
            subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-i',str(output_wav),
                '-ar',str(resample_rate),'-c:a','pcm_f32le',str(converted)],check=True,timeout=180)
            converted.replace(output_wav)
        finally:
            converted.unlink(missing_ok=True)
    return timeline.method
