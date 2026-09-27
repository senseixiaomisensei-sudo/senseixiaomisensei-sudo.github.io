"""Signal-only incident ledger. Never turns detected candidates into listening verdicts."""
import argparse
import json
from pathlib import Path
import sys

import numpy as np
import soundfile as sf

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'rvc-service'))
from app.pitch_safety import repair_octave_glitches


def analyze(root):
    metadata=json.loads((root/'diagnostic.json').read_text(encoding='utf-8'))
    work=root/'work'
    manifest_path=next(work.rglob('manifest.json'))
    manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
    chunk_rows=[]
    raw_chunks=[]
    tracks=[]
    policy_changes=[]
    for span in manifest['chunks']:
        folder=work/'diagnostic-stages'/f"chunk-{span['index']:03d}"
        info=json.loads((folder/'inference.json').read_text(encoding='utf-8'))
        raw=next(s for s in info['stages'] if s['stage']=='generator-float')
        wave,rate=sf.read(folder/raw['file'])
        cropped=wave[raw['cropLeftSamples']:len(wave)-raw['cropRightSamples']]
        raw_chunks.append((cropped,rate))
        f0=np.load(next((folder/'f0').glob('*.npz')))
        numeric=f0['numeric'] if 'numeric' in f0 else f0['raw'][:len(f0['shifted'])]
        origin=float(f0['time_origin_seconds']) if 'time_origin_seconds' in f0 else span['startSeconds']
        pad=float(f0['padding_samples'])/float(f0['sample_rate']) if 'padding_samples' in f0 else 3.
        times=origin-pad+np.arange(len(numeric))*float(f0['hop'])/float(f0['sample_rate'])
        tracks.append((times,f0['shifted']))
        legacy=repair_octave_glitches(numeric)
        changed=(numeric>0)&(legacy>0)&(abs(12*np.log2(np.maximum(legacy,1)/np.maximum(numeric,1)))>6)
        changed&=(times>=origin)&(times<span['startSeconds']+span['durationSeconds'])
        for frame in np.flatnonzero(changed):
            policy_changes.append({'chunk':span['index'],'timeSeconds':round(float(times[frame]),6),
                'rawHz':float(numeric[frame]),'legacyCorrectionHz':float(legacy[frame]),
                'currentHz':float(f0['corrected'][frame]),'verdict':'unsupported automatic correction removed; source note truth not listened'})
        search=next((s for s in info['stages'] if s['stage']=='retrieval-search'),{})
        row={'chunk':span['index'],'timeOriginSeconds':origin,'nativeRate':rate,
             'generatorFloatFrames':len(wave),'generatorNonFinite':int((~np.isfinite(wave)).sum()),
             'rawPeak':float(abs(wave).max()),'retrieval':search,
             'modelVersion':info['modelVersion'],'featureDimension':info['featureDimension'],
             'precision':info['precision'],'noiseScale':info['noiseScale'],
             'executionBackend':info['executionBackend'],
             'rawToCorrectedChanges':int(np.count_nonzero(numeric!=f0['corrected']))}
        repaired=folder/'repaired.wav'
        raw_file=folder/'raw-rmvpe.wav'
        if repaired.is_file() and raw_file.is_file():
            a,_=sf.read(raw_file);b,_=sf.read(repaired)
            row['repairChangedSamples']=int(np.count_nonzero(a!=b))
        chunk_rows.append(row)
    boundaries=[]
    for i,overlap in enumerate(manifest['overlaps']):
        start,end=overlap['startSeconds'],overlap['endSeconds']
        a,ar=raw_chunks[i];b,br=raw_chunks[i+1]
        n=min(round((end-start)*ar),len(a),len(b))
        if ar!=br:raise ValueError('Different native rates between chunks')
        left=a[-n:];right=b[:n]
        correlation=float(np.dot(left,right)/(np.linalg.norm(left)*np.linalg.norm(right)+1e-20))
        ta,pa=tracks[i];tb,pb=tracks[i+1]
        mask=(ta>=start)&(ta<end)
        target=np.clip(np.rint((ta[mask]-tb[0])/.01).astype(int),0,len(pb)-1)
        first=pa[mask];second=pb[target]
        voiced=(first>0)&(second>0)
        delta=abs(12*np.log2(np.maximum(first,1)/np.maximum(second,1)))
        boundaries.append({'startSeconds':start,'endSeconds':end,
            'rawOverlapCorrelation':correlation,'uvDisagreementFrames':int(np.count_nonzero((first>0)!=(second>0))),
            'f0DisagreementOver6Semitones':int(np.count_nonzero(voiced&(delta>6))),
            'listening':'unverified; correlation alone is not an artifact verdict'})
    result={'jobId':metadata['jobId'],'modelId':metadata['modelId'],
        'pipelineRevision':metadata['pipelineRevision'],'modelSha256':metadata['modelSha256'],
        'indexSha256':metadata['indexSha256'],'durationSeconds':metadata['sourceDurationSeconds'],
        'chunks':chunk_rows,'boundaries':boundaries,'legacyContourChanges':policy_changes,
        'historicalBParameters':'unknown','subjectiveListening':'unverified'}
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('diagnostics',type=Path)
    parser.add_argument('output',type=Path)
    args=parser.parse_args()
    report=analyze(args.diagnostics)
    args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'jobId':report['jobId'],'chunks':len(report['chunks']),
        'boundaries':len(report['boundaries']),'legacyContourChanges':len(report['legacyContourChanges']),
        'nonFinite':sum(r['generatorNonFinite'] for r in report['chunks'])}))
