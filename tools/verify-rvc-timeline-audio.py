"""Measure actual complete candidate recordings and create fixed-gain A/B audio."""
import argparse
import json
import re
import subprocess
from pathlib import Path
import numpy as np
import parselmouth
import soundfile as sf

p=argparse.ArgumentParser()
p.add_argument('candidate',type=Path)
p.add_argument('baseline',type=Path)
p.add_argument('--label',choices=['A','C'],required=True)
a=p.parse_args()

def loudness(path,channels):
    result=subprocess.run(['ffmpeg','-nostdin','-hide_banner','-i',str(path),'-af',
        f'aformat=channel_layouts={channels},loudnorm=I=-23:TP=-1:LRA=20:print_format=json',
        '-f','null','-'],capture_output=True,text=True,check=True)
    match=re.findall(r'\{\s*"input_i".*?\}',result.stderr,re.S)
    return {k:float(v) for k,v in json.loads(match[-1]).items() if k.startswith('input_')}

def pitch_at(path,times):
    data,sr=sf.read(path,dtype='float64')
    if data.ndim>1:data=data.mean(axis=1)
    track=parselmouth.Sound(data,sr).to_pitch_ac(time_step=.01,
        voicing_threshold=.6,pitch_floor=40,pitch_ceiling=2000)
    return np.asarray([track.get_value_at_time(float(t)) for t in times])

report=json.loads((a.candidate/'report.json').read_text(encoding='utf8'))
timeline=a.candidate/'diagnostic-stages/timeline'
z=np.load(timeline/'f0.npz')
times=np.arange(len(z['raw']))*.01-3
windows=([(33.22,33.34),(33.33,33.43),(36.05,36.18),(36.24,36.36),
          (39.50,39.57),(39.77,39.86),(46.78,46.95)] if a.label=='A'
         else [(57.52,57.67),(85.75,85.92),(141.35,141.50),(184.90,184.97)])
raw_pitch=pitch_at(a.candidate/'diagnostic-stages/joined-before-repair.wav',times)
source_pitch=pitch_at(a.candidate/'model-input-16k.wav',times)
def median(x):
    x=x[np.isfinite(x)&(x>0)]
    return float(np.median(x)) if len(x) else None
findings=[]
for start,end in windows:
    keep=(times>=start)&(times<=end)
    findings.append(dict(startSeconds=start,endSeconds=end,
        sourcePraatHz=median(source_pitch[keep]),rawRmvpeHz=median(z['raw'][keep]),
        actualConditionHz=median(z['corrected'][keep]),rawSynthPraatHz=median(raw_pitch[keep]),
        totalFrames=int(np.count_nonzero(keep)),
        sourceVoicedFrames=int(np.count_nonzero(np.isfinite(source_pitch[keep])&(source_pitch[keep]>0))),
        synthVoicedFrames=int(np.count_nonzero(np.isfinite(raw_pitch[keep])&(raw_pitch[keep]>0))),
        changedFrames=int(np.count_nonzero(z['accepted'][keep])),
        subjectiveSeverity='未听评；这是条件和合成音高测量，不是金属音评分'))

comparisons=[]
destination=a.candidate/'等响度对照';destination.mkdir(exist_ok=True)
for file_name,layout in [('完整翻唱','stereo'),('完整角色人声','mono')]:
    pairs=[('修复前',a.baseline/(file_name+'.wav')),('本轮候选',a.candidate/(file_name+'.wav'))]
    measured=[loudness(path,layout) for _,path in pairs]
    target=min(row['input_i'] for row in measured)-.5
    for (label,path),stats in zip(pairs,measured):
        gain=target-stats['input_i'];output=destination/f'{file_name}-{label}.mp3'
        subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-i',str(path),'-af',
            f'aformat=channel_layouts={layout},volume={gain:.8f}dB',
            '-c:a','libmp3lame','-b:a','192k',str(output)],check=True)
        decoded=loudness(output,layout)
        assert decoded['input_tp']<=-1.,'Matched comparison encoded peak too high'
        comparisons.append(dict(kind=file_name,label=label,channelLayout=layout,
            inputLufs=stats['input_i'],constantGainDb=gain,outputLufs=decoded['input_i'],
            outputTruePeakDbtp=decoded['input_tp'],output=str(output)))

joins=json.loads((timeline/'joins.json').read_text(encoding='utf8'))
np.savez_compressed(a.candidate/'measured-pitch.npz',times=times,source=source_pitch,raw=raw_pitch)
result=dict(label=a.label,completeSourceFrames=report['sourceDecodedFrames'],
    outputFrames=report['outputFrames'],changedPitchFrames=int(np.count_nonzero(z['accepted'])),
    joins=joins,pitchWindows=findings,comparisons=comparisons,
    subjectiveDistortion='未验证',naturalExpression='未验证',characterIdentity='未验证')
(a.candidate/'对照测量.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(label=a.label,pitchWindows=findings,joins=joins),ensure_ascii=False),flush=True)
