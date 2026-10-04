"""Pinned inference-only MedleyVox candidate for correlated singing estimates."""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import torch

REVISION = '5c9e4e0d909e5a006c992b3422901ed416f4e57f'
ROOT = Path(os.getenv('RVC_CHORUS_CANDIDATE_ROOT',
    'E:/大肥鱼/rvc-local/合唱候选分离器')).resolve()

def candidate_available():
    return (ROOT/'固定资源.json').is_file() and (ROOT/'model.ts').is_file()

class CandidateAdapter:
    def __init__(self, model):
        self.model = model

    def __call__(self, audio, istest=True):
        return (self.model(audio),)

def load_candidate():
    manifest = json.loads((ROOT/'固定资源.json').read_text(encoding='utf8'))
    if manifest['revision'] != REVISION or manifest['sampleRate'] != 24000:
        raise ValueError('CHORUS_CANDIDATE_REVISION')
    path = ROOT/'model.ts'
    with path.open('rb') as stream:
        if hashlib.file_digest(stream,'sha256').hexdigest() != manifest['modelSha256']:
            raise ValueError('CHORUS_CANDIDATE_HASH')
    # This TorchScript was exported locally from weights_only=True checkpoints,
    # with dynamic-length parity checks. No hub code or pickle is executed here.
    with path.open('rb') as stream:
        model = torch.jit.load(stream,map_location='cuda').eval()
    return CandidateAdapter(model), manifest

def prefer_candidate(before, after, assignment_uncertain=False):
    """Only replace a leaking estimate with a substantial, distinct improvement."""
    score = lambda x: x['highCoherenceRatio']+.25*x['sharedCoherenceMedian']+.25*x['waveformCorrelation']
    return bool(before['crossTalkRisk'] and not assignment_uncertain
        and after['distinctCandidate'] and not after['crossTalkRisk']
        and not after['duplicateCandidate'] and after['secondaryEnergyRatio']>=.08
        and score(after)<score(before)-.15)
