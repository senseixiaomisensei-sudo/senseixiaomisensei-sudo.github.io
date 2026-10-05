// Shared register matching; a recommendation, never a promise of clean synthesis.
export const AUTO_PARAMETER_REVISION = 'register-match-v3-wide-song';
export function suggestVoiceParameters(range={},model={},reference={},options={}) {
  const reliable=Number(range.confidence)>=.6 && Number.isFinite(range.medianHz) && range.medianHz>0;
  const matched=reference.characterId===model.id && reference.checkpointSha256===model.checkpointSha256 &&
    /^[a-f0-9]{64}$/u.test(reference.checkpointSha256||'') && /^[a-f0-9]{64}$/u.test(reference.referenceSha256||'') &&
    Number(reference.confidence)>=.6 && Number.isFinite(reference.medianHz) && reference.medianHz>0;
  const tags=model.tags||[];
  let pitch=0,targetHz=null;
  if(reliable && matched)targetHz=reference.medianHz;
  else if(reliable && range.classification==='low' && tags.includes('女声'))targetHz=250;
  else if(reliable && range.classification==='high' && tags.includes('男声'))targetHz=150;
  if(targetHz)pitch=Math.max(-12,Math.min(12,Math.round(12*Math.log2(targetHz/range.medianHz))));
  const width=Number(range.p90Hz)>0 && Number(range.p10Hz)>0 ? 12*Math.log2(range.p90Hz/range.p10Hz) : 0;
  const complex=width>18 || Number(range.p90Hz)>600;
  let pitchPolicy='register-match';
  if(options.audioMode==='song' && reliable){
    // A median from the low verse must not transpose an already high chorus
    // by an octave. Preserve broad song contours; never retune frame by frame.
    if(width>18){pitch=0;pitchPolicy='wide-song-original-pitch';}
    else if(Number(range.p90Hz)>0 && pitch>0){
      const ceiling=Math.max(0,Math.floor(12*Math.log2(1000/range.p90Hz)));
      if(pitch>ceiling){pitch=ceiling;pitchPolicy='song-high-register-headroom';}
    }else if(Number(range.p10Hz)>0 && pitch<0){
      const floor=Math.min(0,Math.ceil(12*Math.log2(50/range.p10Hz)));
      if(pitch<floor){pitch=floor;pitchPolicy='song-low-register-headroom';}
    }
  }
  const index=Number(model.defaultIndexRate);
  return {pitch,indexRate:model.indexAvailable===false ? 0 : Math.round(Math.max(0,Math.min(complex?.25:.45,Number.isFinite(index)?index:.3))*100)/100,
    protect:reliable?.12:.18,rmsMixRate:1,f0Method:complex?'auto':'rmvpe',filterRadius:0,
    registerAdaptation:options.audioMode==='song'&&complex?.6:0,registerPitch:0,
    revision:AUTO_PARAMETER_REVISION,pitchPolicy,confidence:reliable?Number(range.confidence):0,
    targetEvidence:matched?'verified-reference':targetHz?'register-estimate':'uncertain'};
}
