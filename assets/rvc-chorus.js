import {createChorusRolePicker,chorusText as ct} from './rvc-chorus-picker.js?v=20261004-chorus-2';
import {suggestVoiceParameters} from './rvc-auto-parameters.js?v=20261005-auto-1';

export function chorusBase(endpoint) {
  const base=String(endpoint).replace(/\/+$/u,'');
  if (/\/api\/rvc$/u.test(base)) return base.replace(/\/rvc$/u,'/rvc-chorus');
  if (/\/(rvc|rvc-api)$/u.test(base)) return `${base}/chorus`;
  if (/\/v1\/convert$/u.test(base)) return base.replace(/\/convert$/u,'/chorus');
  return `${base}/v1/chorus`;
}

export function chorusOutputUrl(base, job) {
  const token=encodeURIComponent(job.downloadToken);
  if (/\/api\/rvc-chorus$/u.test(base)) return `${base.replace(/\/rvc-chorus$/u,'/rvc-output')}?job=${encodeURIComponent(job.jobId)}&token=${token}`;
  return `${base.replace(/\/chorus$/u,'')}/output/${job.jobId}?token=${token}`;
}

// Older Safari builds do not provide AbortSignal.timeout. Keep the timer alive
// through JSON parsing and always release it, including non-JSON gateway errors.
export async function fetchChorusJson(url,options={},fetcher=globalThis.fetch,timeout=210000) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try {
    const response=await fetcher(url,{...options,cache:'no-store',signal:controller.signal});
    let data;
    try { data=await response.json(); } catch { throw Object.assign(new Error(ct(`服务未返回任务状态（HTTP ${response.status}）`,`The service returned no job status (HTTP ${response.status})`)),{retryable:true}); }
    if(!response.ok)throw Object.assign(new Error(data.message || data.code || `HTTP ${response.status}`),
      {retryable:[408,429,500,502,503,504,520,521,522,523,524].includes(response.status)});
    return data;
  } finally { clearTimeout(timer); }
}

export function readChorusTracks(job) {
  const tracks=job?.tracks;
  if(!Array.isArray(tracks)||tracks.length<1||tracks.length>4||
    tracks.some((track,i)=>track?.trackId!==i+1))
    throw Object.assign(new Error(ct('分离任务没有返回有效声部，请重新提取；本次不能作为成功结果。','No valid separated voices were returned. Extract again; this is not a successful result.')),{retryable:false});
  const hashes=tracks.map(track=>track.sourceSha256).filter(Boolean);
  if(new Set(hashes).size!==hashes.length)throw Object.assign(new Error(ct('返回了重复声部，本次不能作为成功分离。','Duplicate voices were returned. This is not a successful separation.')),{retryable:false});
  return tracks;
}

export function chorusSuggestedParams(track,model={},reference={}) {
  const {pitch,indexRate,protect,rmsMixRate,f0Method}=suggestVoiceParameters(track.voiceRange,model,reference);
  return {trackId:track.trackId,modelId:model.id,pitch,indexRate,protect,rmsMixRate,f0Method,gainDb:0,mute:false};
}

export async function publishChorusResult({audio,result,download,meta},next,job,attachAudio) {
  if(download){download.href=next;download.download=`postprep-chorus-${job.jobId}.${job.format==='mp3'?'mp3':'wav'}`;}
  if(result){result.hidden=false;result.classList.remove('hidden');result.scrollIntoView({block:'start',behavior:'auto'});}
  if(meta){
    const zh=`${job.estimatedCount} 路角色合唱 · 独立转换后混音`,en=`${job.estimatedCount} character voices · independently converted and mixed`;
    if(globalThis.PostPrepRvcLanguage?.setText)globalThis.PostPrepRvcLanguage.setText(meta,zh,en);
    else meta.textContent=ct(zh,en);
  }
  if(audio){audio.hidden=false;
    try{await attachAudio(audio,next,true);}catch{
      if(meta)meta.textContent+=ct(' · 播放器加载暂未完成，可直接下载结果或点击播放重试。',' · Player loading is incomplete. Download the result or retry playback.');
    }
  }
}

export function initChorus({state,getEndpoint,prepareFile=async file=>file,setMode,setBusy,onResult,
  createRequestId=()=>`${Date.now()}-${Math.random().toString(36).slice(2)}`,
  request=fetchChorusJson,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
  loadVoiceRanges=()=>fetchChorusJson('./assets/rvc-voice-ranges.json?v=20261004-search-1',{},globalThis.fetch,8000)}) {
  const panel=document.getElementById('rvc-chorus');
  if(!panel)return null;
  const enable=panel.querySelector('[data-enable]'), analyzeButton=panel.querySelector('[data-analyze]');
  const updateButton=panel.querySelector('[data-update]');
  const convertButton=panel.querySelector('[data-convert]'),resumeButton=panel.querySelector('[data-resume]');
  const status=panel.querySelector('[data-status]'), tracks=panel.querySelector('[data-tracks]');
  let session=null, sourceFile=null, params=[], busy=false, switchingMode=false, pending=null;
  const autoTracks=new Set();
  let localizers=[],lastMessage=null;
  let voiceRanges={};
  const rangesReady=Promise.resolve().then(loadVoiceRanges).then(value=>{voiceRanges=value?.profiles||{};}).catch(()=>{});
  const suggest=(track,model)=>chorusSuggestedParams(track,model,voiceRanges[model.id]);
  const resolve=value=>typeof value==='function'?value():value;
  const message=(zh,en=zh)=>{lastMessage=[zh,en];status.textContent=ct(resolve(zh),resolve(en));};
  const bind=(node,zh,en,attribute)=>{const update=()=>{const value=ct(resolve(zh),resolve(en));if(attribute)node.setAttribute(attribute,value);else node.textContent=value;};localizers.push(update);update();return node;};
  function reset(){session=null;pending=null;params=[];localizers=[];lastMessage=null;autoTracks.clear();updateButton.hidden=true;resumeButton.hidden=true;tracks.querySelectorAll('audio').forEach(a=>{a.pause();a.removeAttribute('src');a.load();});tracks.replaceChildren();}
  function refresh(){
    if(!switchingMode && enable.checked && (state.inferenceMode!=='official' || state.audioMode!=='song'))enable.checked=false;
    panel.querySelector('[data-workspace]').hidden=!enable.checked;
    panel.querySelectorAll('input,button,select').forEach(c=>{c.disabled=state.busy;});
    analyzeButton.disabled=state.busy || !state.audio?.file;
    convertButton.disabled=state.busy || Boolean(pending) || !session || !params.length;
    if(sourceFile && state.audio?.file!==sourceFile && !busy)reset();
  }
  async function poll(base,job){
    const until=Date.now()+3600000;
    let interruptions=0;
    while(Date.now()<until){
      let v;
      try { v=await request(`${base}/${job.jobId}?token=${encodeURIComponent(job.downloadToken)}`);interruptions=0; }
      catch(error){
        if(error.retryable===false || ++interruptions>6)throw error;
        message('网络暂时中断，正在继续查看同一个任务；不会重新分离或变声。','Network interrupted. Checking the same job again; separation and conversion will not restart.');
        await wait(Math.min(15000,interruptions*2500));continue;
      }
      if(v.state==='completed')return {...v,downloadToken:job.downloadToken};
      if(v.state==='failed')throw Object.assign(new Error(v.code || '合唱处理失败'),{retryable:false});
      const names={queued:['排队中','Queued'],separating:['提取人声与伴奏','Extracting vocals and accompaniment'],'identifying-singers':['识别并分离歌手','Identifying and separating singers'],mixing:['合成混音','Mixing']};
      message(...(names[v.stage]||(/^converting-singer-\d$/u.test(v.stage)?[`正在转换声部 ${v.stage.slice(-1)}`,`Converting voice ${v.stage.slice(-1)}`]:['正在处理…','Processing…'])));
      await wait(4000);
    }
    throw new Error(ct('等待超时，可点击「继续查看任务」；已接受的任务仍在服务端运行。','Wait timed out. Select “Resume job”; the accepted job is still running on the server.'));
  }
  function setProcessing(value){busy=value;panel.setAttribute('aria-busy',String(value));convertButton.textContent=value?ct('正在处理…','Processing…'):ct('确认声部并开始合唱','Confirm voices and convert');setBusy(value);refresh();}
  function render(base,job,converted=false){
    tracks.querySelectorAll('audio').forEach(a=>{a.pause();a.removeAttribute('src');a.load();});
    tracks.replaceChildren();
    localizers=[];
    const returnedTracks=readChorusTracks(job);
    if(!converted){params=returnedTracks.map(t=>suggest(t,state.catalog.find(m=>m.id===state.selectedModelId)||{id:state.selectedModelId}));
      returnedTracks.forEach((_,i)=>autoTracks.add(i));}
    for(const [i,t] of returnedTracks.entries()){
      const card=document.createElement('article');card.className='chorus-track';
      const header=document.createElement('div');header.className='chorus-track-heading';
      const number=document.createElement('span');number.className='chorus-track-number';number.textContent=String(t.trackId).padStart(2,'0');
      const title=bind(document.createElement('h4'),`声部 ${t.trackId}`,`Voice ${t.trackId}`);
      const pitchLabel=document.createElement('span');pitchLabel.className='chorus-pitch-badge';
      header.append(number,title,pitchLabel);
      const updatePitchLabel=()=>{pitchLabel.textContent=ct(`${params[i].pitch>0?'+':''}${params[i].pitch} 半音`,`${params[i].pitch>0?'+':''}${params[i].pitch} semitones`);};
      localizers.push(updatePitchLabel);
      updatePitchLabel();
      function audition(source,zh,en){
        let failed=false;
        const heading=bind(document.createElement('p'),()=>zh+(failed?' · 暂时无法载入，请重试；超过有效期需重新提取。':''),()=>en+(failed?' · Unable to load. Retry; extract again if expired.':''));heading.className='chorus-audition-label';
        const audio=document.createElement('audio');audio.controls=true;audio.preload='none';audio.crossOrigin='anonymous';
        bind(audio,`声部 ${t.trackId} ${zh}`,`Voice ${t.trackId}: ${en}`,'aria-label');
        audio.src=`${base}/${source.jobId}/stem/${t.trackId}?token=${encodeURIComponent(source.downloadToken)}`;
        audio.addEventListener('play',()=>document.querySelectorAll('audio').forEach(a=>{if(a!==audio)a.pause();}));
        audio.addEventListener('error',()=>{failed=true;heading.textContent=ct(zh+' · 暂时无法载入，请重试；超过有效期需重新提取。',en+' · Unable to load. Retry; extract again if expired.');});
        const block=document.createElement('div');block.className='chorus-audition';block.append(heading,audio);card.append(block);
      }
      card.append(header);
      if(job.separationStatus==='needs-review'||job.separationStatus==='single-or-unresolved'){
        const notice=bind(document.createElement('p'),'候选声部 · 存在串音或人数不确定，请先试听','Candidate voice · possible cross-talk or uncertain count; audition first');
        notice.className='chorus-range-label';card.append(notice);
      }
      const range=t.voiceRange||{},rangeLabel=document.createElement('p');
      const rangeNames={low:['低声区','Low register'],high:['高声区','High register'],middle:['中声区','Middle register']};
      bind(rangeLabel,...(rangeNames[range.classification]||['声区不确定 · 保持原调','Uncertain register · preserve pitch']));rangeLabel.className='chorus-range-label';card.append(rangeLabel);
      audition(session,'分离原声 · 先确认是哪位歌手','Separated original · confirm the singer');
      if(converted)audition(job,'转换后 · 所选角色人声','Converted · selected character voice');
      const role=createChorusRolePicker({catalog:state.catalog,modelId:params[i].modelId,trackId:t.trackId,
        schools:globalThis.PostPrepSchools?.schools||[],onChange:id=>{params[i].modelId=id;if(autoTracks.has(i))tune();}});
      localizers.push(role.refreshLanguage);
      const controls=[];
      function tune(){
        const current=params[i],suggested=suggest(t,state.catalog.find(m=>m.id===role.value)||{id:role.value});
        Object.assign(current,{pitch:suggested.pitch,indexRate:suggested.indexRate,protect:suggested.protect,rmsMixRate:suggested.rmsMixRate,f0Method:suggested.f0Method});
        controls.forEach(({key,control,out})=>{control.value=current[key];out.textContent=control.value;});f0.value=current.f0Method;updatePitchLabel();autoTracks.add(i);
      }
      const autoButton=bind(document.createElement('button'),'按声区自动调参','Match parameters to register');autoButton.type='button';autoButton.className='chorus-auto-tune';autoButton.addEventListener('click',tune);
      const details=document.createElement('details'), summary=bind(document.createElement('summary'),'独立调音','Individual settings');details.append(summary);
      for(const [key,zh,en,min,max,step] of [['pitch','音高（半音）','Pitch (semitones)',-24,24,1],['indexRate','检索强度','Retrieval strength',0,1,.01],['protect','辅音保护','Consonant protection',0,.5,.01],['rmsMixRate','动态保留','Preserve dynamics',0,1,.01],['gainDb','人声音量（dB）','Vocal gain (dB)',-24,6,.5]]){
        const wrap=document.createElement('label');wrap.className='chorus-control';const name=bind(document.createElement('span'),zh,en);
        const control=document.createElement('input');Object.assign(control,{type:'range',min,max,step,value:params[i][key]});
        bind(control,`声部 ${t.trackId} ${zh}`,`Voice ${t.trackId}: ${en}`,'aria-label');
        const out=document.createElement('output');out.textContent=control.value;
        controls.push({key,control,out});
        control.addEventListener('input',()=>{params[i][key]=Number(control.value);out.textContent=control.value;if(key!=='gainDb')autoTracks.delete(i);if(key==='pitch')updatePitchLabel();});
        wrap.append(name,control,out);details.append(wrap);
      }
      const muteLabel=document.createElement('label');muteLabel.className='chorus-control';muteLabel.append(bind(document.createElement('span'),'单独静音','Mute this voice'));const mute=document.createElement('input');mute.type='checkbox';mute.checked=params[i].mute;
      mute.addEventListener('change',()=>{params[i].mute=mute.checked;});muteLabel.append(mute);details.append(muteLabel);
      const f0=document.createElement('select');bind(f0,`声部 ${t.trackId} 音高算法`,`Voice ${t.trackId}: pitch algorithm`,'aria-label');
      for(const method of ['rmvpe','fcpe','auto','pm']){const o=document.createElement('option');o.value=method;bind(o,method==='auto'?'自动':method.toUpperCase(),method==='auto'?'Auto':method.toUpperCase());f0.append(o);}
      f0.value=params[i].f0Method;f0.addEventListener('change',()=>{params[i].f0Method=f0.value;autoTracks.delete(i);});details.append(f0);
      card.append(role.element,autoButton,details);tracks.append(card);
    }
  }
  async function finishPending(){
    const current=pending,job=await poll(current.base,current.job);
    if(current.kind==='analysis'){
      await rangesReady;
      readChorusTracks(job);session={...job,base:current.base};render(current.base,session);
      const count=job.tracks.length;
      const warning=job.requestedCount!=='auto' && Number(job.requestedCount)!==count ? `未能可靠提取请求的 ${job.requestedCount} 路。` : '';
      const warningEn=warning?`Could not reliably extract the requested ${job.requestedCount} voices. `:'';
      const review=job.separationStatus==='needs-review'||job.separationStatus==='single-or-unresolved';
      message(()=>`${warning}${review?'已生成候选，尚未确认成功分开歌手':'分离完成'}，已显示 ${count} 张声部卡片，并按声区匹配初始参数。${review?'检测到串音或人数证据不足；一路结果不代表原曲只有一人。':''}${job.duplicateMerges?.length?'重复声部已合并，保留全部时长。':''}请逐路试听原声、选择角色，再开始合唱。${job.experimentalRecursive?'三／四路为实验分离，请检查串音。':''} 有效至 ${new Date(job.expiresAt).toLocaleString('zh-CN')}。`,
        ()=>`${warningEn}${review?'Candidates generated; singers are not confirmed as separated':'Separation complete'}. ${count} voice cards with register-matched parameters. ${review?'Possible cross-talk or insufficient count evidence; a single result does not prove there is only one singer. ':''}${job.duplicateMerges?.length?'Duplicate sources merged; full duration preserved. ':''}Audition each original and assign a character before converting. ${job.experimentalRecursive?'Three/four-way separation is experimental; check cross-talk. ':''}Expires ${new Date(job.expiresAt).toLocaleString('en-US')}.`);
      tracks.scrollIntoView?.({block:'nearest'});
    }else{
      readChorusTracks(job);render(current.base,job,true);
      // Native media streaming avoids holding another complete song Blob in
      // mobile memory; preview and download point to the same protected file.
      await onResult(chorusOutputUrl(current.base,job),job);
      updateButton.hidden=false;
      message(`${job.reusedConversion?'已复用转换人声更新混音。':'合唱转换已生成。'}每张卡片保留分离原声与转换后试听；下方可播放并下载同一份混音。`,
        `${job.reusedConversion?'Updated mix using cached converted vocals.':'Chorus conversion generated.'} Each card retains original and converted auditions. Play or download the same mix below.`);
    }
    pending=null;resumeButton.hidden=true;
  }
  function failure(error,label,labelEn=label){
    if(error.retryable===false)pending=null;
    resumeButton.hidden=!pending;
    message(`${label}：${error.message}${pending?' 点击「继续查看任务」恢复；无需重新上传。':''}`,`${labelEn}: ${error.message}${pending?' Select “Resume job”; no upload is needed.':''}`);
  }
  async function analyze(){
    if(state.busy || !state.audio?.file)return;
    reset();setProcessing(true);
    try{
      sourceFile=state.audio.file;
      const upload=await prepareFile(sourceFile);
      const body=new FormData();body.set('audio',upload,upload.name);
      body.set('singer_count',panel.querySelector('[data-count]').value);body.set('input_kind',panel.querySelector('[data-kind]').value);body.set('request_id',`chorus-${createRequestId()}`);
      const base=chorusBase(getEndpoint());message('上传并识别歌手…','Uploading and identifying singers…');
      pending={base,kind:'analysis',job:await request(`${base}/analyze`,{method:'POST',body})};
      await finishPending();
    }catch(e){failure(e,'识别未完成','Analysis incomplete');}finally{setProcessing(false);}
  }
  async function convert(){
    if(state.busy)return;
    if(pending){message('已存在待查看的任务，请点击「继续查看任务」。','A job is pending. Select “Resume job”.');return;}
    if(!session || sourceFile!==state.audio?.file){message('请先识别歌手并为每路选择角色。','Extract singers and assign a character to each voice first.');return;}
    setProcessing(true);
    try{
      const base=session.base;
      message('正在提交合唱任务，随后会显示转换进度；完成后直接打开播放与下载结果。','Submitting chorus conversion. Progress will appear, followed by playback and download.');
      pending={base,kind:'conversion',job:await request(`${base}/${session.jobId}/convert?token=${encodeURIComponent(session.downloadToken)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tracks:params,accompanimentGainDb:Number(document.getElementById('rvc-accompaniment-gain')?.value || 0),accompanimentMute:Boolean(document.getElementById('rvc-accompaniment-mute')?.checked),requestId:`chorus-${createRequestId()}`})})};
      await finishPending();
    }catch(e){failure(e,'转换未完成','Conversion incomplete');}finally{setProcessing(false);}
  }
  enable.addEventListener('change',()=>{if(enable.checked){switchingMode=true;try{setMode();}finally{switchingMode=false;}}refresh();});
  analyzeButton.addEventListener('click',analyze);
  convertButton.addEventListener('click',convert);
  resumeButton.addEventListener('click',async()=>{if(state.busy||!pending)return;setProcessing(true);try{await finishPending();}catch(e){failure(e,'任务未完成','Job incomplete');}finally{setProcessing(false);}});
  updateButton.addEventListener('click',convert);
  document.getElementById('rvc-audio-file')?.addEventListener('change',()=>{if(!busy)reset();refresh();});
  function refreshLanguage(){
    localizers.forEach(update=>update());
    convertButton.textContent=busy?ct('正在处理…','Processing…'):ct('确认声部并开始合唱','Confirm voices and convert');
    if(lastMessage)message(...lastMessage);
  }
  document.addEventListener?.('postprep:languagechange',refreshLanguage);
  refresh();return {isEnabled:()=>enable.checked,refresh,convert,refreshLanguage};
}
