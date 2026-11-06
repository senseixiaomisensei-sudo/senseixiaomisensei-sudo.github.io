import {suggestVoiceParameters} from './rvc-auto-parameters.js?v=20261005-auto-4';
import {chorusBase,fetchChorusJson,submitChorusJob} from './rvc-chorus.js?v=20261106-cloud-speed1';

export function initRegularAutoParameters({state,getEndpoint,getModel,prepareFile,setBusy,isModernSpeech,createRequestId,
  request=fetchChorusJson,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  const button=document.getElementById('rvc-auto-parameters'),label=document.getElementById('rvc-auto-parameters-status');
  if(!button)return {refresh(){}};
  let cache=null,pending=null,active=false,signature='',applying=false,profiles={};
  const text=(zh,en)=>globalThis.PostPrepRvcLanguage?.setText(label,zh,en) || (label.textContent=state.lang==='en'?en:zh);
  const references=request('./assets/rvc-voice-ranges.json?v=20261004-search-1',{},globalThis.fetch,8000)
    .then(data=>{profiles=data.profiles||{};}).catch(()=>{});
  function apply(){
    if(!cache || cache.file!==state.audio?.file || cache.mode!==state.audioMode)return;
    const model=getModel();if(!model)return;
    const settings=suggestVoiceParameters(cache.range,model,profiles[model.id]||{},{audioMode:state.audioMode});
    applying=true;
    // Input events select the compatible tuning engine before these RVC
    // parameters are used. Never leave suggested pitch displayed but ignored.
    const controls={pitch:'rvc-pitch',indexRate:'rvc-index-rate',protect:'rvc-protect',rmsMixRate:'rvc-rms-mix',f0Method:'rvc-f0-method',filterRadius:'rvc-filter-radius',registerAdaptation:'rvc-register-adaptation',registerPitch:'rvc-register-pitch'};
    for(const [key,id] of Object.entries(controls)){
      const node=document.getElementById(id);if(!node)continue;
      node.value=String(settings[key]);node.dispatchEvent(new Event(key==='f0Method'?'change':'input',{bubbles:true}));
    }
    applying=false;signature=`${model.id}:${state.audioMode}:${isModernSpeech()}`;
    const range=cache.range,Hz=Number.isFinite(range.medianHz)?range.medianHz.toFixed(0):'?';
    const guarded=settings.pitchPolicy!=='register-match';
    text(`已按 ${Hz} Hz 声区匹配：${settings.pitch>0?'+':''}${settings.pitch} 半音 · ${settings.f0Method.toUpperCase()} · 辅音保护 ${settings.protect}。${guarded?'高低音保护：不按中位音高强行跨八度移调。':settings.targetEvidence==='register-estimate'?'角色参考不足，使用声区估计。':settings.targetEvidence==='uncertain'?'证据不足，保持原调。':''}可手动修改。`,
      `Matched ${Hz} Hz register: ${settings.pitch>0?'+':''}${settings.pitch} semitones · ${settings.f0Method.toUpperCase()} · protection ${settings.protect}. ${guarded?'Wide-register protection: no forced octave shift based on the median. ':settings.targetEvidence==='register-estimate'?'Estimated target register. ':settings.targetEvidence==='uncertain'?'Uncertain evidence; pitch preserved. ':''}You can edit manually.`);
  }
  function refresh(){
    button.disabled=state.busy || !state.audio?.file;
    if(active && cache?.file===state.audio?.file && cache.mode===state.audioMode && signature!==`${getModel()?.id}:${state.audioMode}:${isModernSpeech()}`)apply();
  }
  for(const id of ['rvc-pitch','rvc-index-rate','rvc-protect','rvc-rms-mix','rvc-f0-method','rvc-filter-radius','rvc-preset-male-female','rvc-preset-same','rvc-preset-female-male']){
    const node=document.getElementById(id);if(!node)continue;
    for(const event of ['input','change','click'])node.addEventListener(event,()=>{if(!applying){active=false;text('已切换为手动参数。点击自动调参可重新匹配。','Manual settings active. Select auto settings to match again.');}});
  }
  button.addEventListener('click',async()=>{
    if(state.busy || !state.audio?.file)return;
    const file=state.audio.file,mode=state.audioMode;
    setBusy(true);refresh();
    try{
      if(cache?.file!==file || cache.mode!==mode){
        if(!pending || pending.file!==file || pending.mode!==mode){
          text('正在分析人声声区；歌曲使用代表片段估计。','Analyzing vocal register using representative excerpts for songs.');
          const upload=await prepareFile(file),body=new FormData();body.set('audio',upload,upload.name);
          body.set('input_kind',mode==='song'?'mix':'vocals');body.set('analysis_only','true');body.set('request_id',createRequestId());
          const base=chorusBase(getEndpoint());pending={base,file,mode,url:`${base}/analyze`,options:{method:'POST',body}};
        }
        pending.job ??= await submitChorusJob(pending,request,wait);
        const until=Date.now()+3600000;let job=pending.job;
        let interruptions=0;
        while(job.state!=='completed'){
          if(job.state==='failed')throw Object.assign(new Error(job.code||'RVC_ANALYSIS_FAILED'),{retryable:false});
          if(Date.now()>until)throw new Error('RVC_ANALYSIS_TIMEOUT');
          try {
            job=await request(`${pending.base}/${job.jobId}?token=${encodeURIComponent(job.downloadToken)}`,{},globalThis.fetch,15000);
            interruptions=0;
          }catch(error){
            if(error.retryable!==true || ++interruptions>4)throw error;
            await wait(Math.min(12000,interruptions*2500));
            continue;
          }
          if(job.state!=='completed' && job.state!=='failed')await wait(1000);
        }
        if(job.analysisOnly!==true || job.tracks?.length!==1)throw Object.assign(new Error('RVC_ANALYSIS_INVALID'),{retryable:false});
        cache={file,mode,range:job.tracks[0].voiceRange||{}};pending=null;
      }
      await references;
      if(state.audio?.file===file && state.audioMode===mode){active=true;apply();}
    }catch(error){
      if(error.retryable===false)pending=null;
      text(pending?'分析未完成。可点击自动调参继续原任务；现有参数保持不变。':'分析失败，可点击自动调参重新分析；现有参数保持不变。',
        pending?'Analysis incomplete. Select auto settings to resume; current parameters are unchanged.':'Analysis failed. Select auto settings to analyze again; current parameters are unchanged.');
    }
    finally{setBusy(false);refresh();}
  });
  refresh();return {refresh};
}
