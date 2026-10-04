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
    try { data=await response.json(); } catch { throw Object.assign(new Error(`服务未返回任务状态（HTTP ${response.status}）`),{retryable:true}); }
    if(!response.ok)throw Object.assign(new Error(data.message || data.code || `HTTP ${response.status}`),
      {retryable:[408,429,500,502,503,504,520,521,522,523,524].includes(response.status)});
    return data;
  } finally { clearTimeout(timer); }
}

export function readChorusTracks(job) {
  const tracks=job?.tracks;
  if(!Array.isArray(tracks)||tracks.length<1||tracks.length>4||
    tracks.some((track,i)=>track?.trackId!==i+1))
    throw Object.assign(new Error('分离任务没有返回有效声部，请重新提取；本次不能作为成功结果。'),{retryable:false});
  return tracks;
}

export function initChorus({state,getEndpoint,prepareFile=async file=>file,setMode,setBusy,onResult,
  createRequestId=()=>`${Date.now()}-${Math.random().toString(36).slice(2)}`,
  request=fetchChorusJson,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  const panel=document.getElementById('rvc-chorus');
  if(!panel)return null;
  const enable=panel.querySelector('[data-enable]'), analyzeButton=panel.querySelector('[data-analyze]');
  const updateButton=panel.querySelector('[data-update]');
  const convertButton=panel.querySelector('[data-convert]'),resumeButton=panel.querySelector('[data-resume]');
  const status=panel.querySelector('[data-status]'), tracks=panel.querySelector('[data-tracks]');
  let session=null, sourceFile=null, params=[], busy=false, switchingMode=false, pending=null;
  const message=text=>{status.textContent=text;};
  function reset(){session=null;pending=null;params=[];updateButton.hidden=true;resumeButton.hidden=true;tracks.querySelectorAll('audio').forEach(a=>{a.pause();a.removeAttribute('src');a.load();});tracks.replaceChildren();}
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
        message('网络暂时中断，正在继续查看同一个任务；不会重新分离或变声。');
        await wait(Math.min(15000,interruptions*2500));continue;
      }
      if(v.state==='completed')return {...v,downloadToken:job.downloadToken};
      if(v.state==='failed')throw Object.assign(new Error(v.code || '合唱处理失败'),{retryable:false});
      const names={queued:'排队中',separating:'提取人声与伴奏','identifying-singers':'识别并分离歌手',mixing:'合成混音'};
      message(names[v.stage] || (/^converting-singer-\d$/u.test(v.stage)?`正在转换声部 ${v.stage.slice(-1)}`:'正在处理…'));
      await wait(4000);
    }
    throw new Error('等待超时，可点击「继续查看任务」；已接受的任务仍在服务端运行。');
  }
  function setProcessing(value){busy=value;panel.setAttribute('aria-busy',String(value));setBusy(value);refresh();}
  function render(base,job,converted=false){
    tracks.querySelectorAll('audio').forEach(a=>{a.pause();a.removeAttribute('src');a.load();});
    tracks.replaceChildren();
    const returnedTracks=readChorusTracks(job);
    if(!converted)params=returnedTracks.map(t=>({trackId:t.trackId,modelId:state.selectedModelId,pitch:12,indexRate:.3,protect:.25,rmsMixRate:1,f0Method:'rmvpe',gainDb:0,mute:false}));
    for(const [i,t] of returnedTracks.entries()){
      const card=document.createElement('article');card.className='chorus-track';
      const title=document.createElement('h4');
      const updatePitchLabel=()=>{title.textContent=`声部 ${t.trackId} · ${params[i].pitch>0?'+':''}${params[i].pitch} 半音`;};
      updatePitchLabel();
      function audition(source,label){
        const heading=document.createElement('p');heading.className='chorus-audition-label';heading.textContent=label;
        const audio=document.createElement('audio');audio.controls=true;audio.preload='none';audio.crossOrigin='anonymous';
        audio.setAttribute('aria-label',`声部 ${t.trackId} ${label}`);
        audio.src=`${base}/${source.jobId}/stem/${t.trackId}?token=${encodeURIComponent(source.downloadToken)}`;
        audio.addEventListener('play',()=>document.querySelectorAll('audio').forEach(a=>{if(a!==audio)a.pause();}));
        audio.addEventListener('error',()=>{heading.textContent=`${label} · 暂时无法载入，请重试；超过有效期需重新提取。`;});
        card.append(heading,audio);
      }
      card.append(title);
      audition(session,'分离原声 · 先确认是哪位歌手');
      if(converted)audition(job,'转换后 · 所选角色人声');
      const role=document.createElement('select');role.setAttribute('aria-label',`声部 ${t.trackId} 对应角色`);
      state.catalog.filter(m=>!String(m.id).startsWith('own:')).forEach(m=>{const o=document.createElement('option');o.value=m.id;o.textContent=m.name || m.displayName || m.id;role.append(o);});
      role.value=params[i].modelId;role.addEventListener('change',()=>{params[i].modelId=role.value;});
      const details=document.createElement('details'), summary=document.createElement('summary');summary.textContent='独立调音';details.append(summary);
      for(const [key,label,min,max,step] of [['pitch','音高（半音）',-24,24,1],['indexRate','检索强度',0,1,.01],['protect','辅音保护',0,.5,.01],['rmsMixRate','动态保留',0,1,.01],['gainDb','人声音量（dB）',-24,6,.5]]){
        const wrap=document.createElement('label');wrap.className='chorus-control';const name=document.createElement('span');name.textContent=label;
        const control=document.createElement('input');Object.assign(control,{type:'range',min,max,step,value:params[i][key]});
        const out=document.createElement('output');out.textContent=control.value;
        control.addEventListener('input',()=>{params[i][key]=Number(control.value);out.textContent=control.value;if(key==='pitch')updatePitchLabel();});
        wrap.append(name,control,out);details.append(wrap);
      }
      const muteLabel=document.createElement('label');muteLabel.className='chorus-control';muteLabel.textContent='单独静音';const mute=document.createElement('input');mute.type='checkbox';mute.checked=params[i].mute;
      mute.addEventListener('change',()=>{params[i].mute=mute.checked;});muteLabel.append(mute);details.append(muteLabel);
      const f0=document.createElement('select');f0.setAttribute('aria-label',`声部 ${t.trackId} 音高算法`);
      for(const method of ['rmvpe','fcpe','auto','pm']){const o=document.createElement('option');o.value=method;o.textContent=method.toUpperCase();f0.append(o);}
      f0.value=params[i].f0Method;f0.addEventListener('change',()=>{params[i].f0Method=f0.value;});details.append(f0);
      card.append(role,details);tracks.append(card);
    }
  }
  async function finishPending(){
    const current=pending,job=await poll(current.base,current.job);
    if(current.kind==='analysis'){
      readChorusTracks(job);session={...job,base:current.base};render(current.base,session);
      const count=job.tracks.length;
      const warning=job.requestedCount!=='auto' && Number(job.requestedCount)!==count ? `未能可靠提取请求的 ${job.requestedCount} 路。` : '';
      message(`${warning}分离完成，已显示 ${count} 张声部卡片。请逐路试听原声、确认歌手并选择角色，再开始合唱。${job.experimentalRecursive?'三／四路为实验分离，请检查串音。':''} 有效至 ${new Date(job.expiresAt).toLocaleString()}。`);
      tracks.scrollIntoView?.({block:'nearest'});
    }else{
      readChorusTracks(job);render(current.base,job,true);
      // Native media streaming avoids holding another complete song Blob in
      // mobile memory; preview and download point to the same protected file.
      await onResult(chorusOutputUrl(current.base,job),job);
      updateButton.hidden=false;
      message(`${job.reusedConversion?'已复用转换人声更新混音。':'合唱转换已生成。'}每张卡片保留分离原声与转换后试听；下方可播放并下载同一份混音。`);
    }
    pending=null;resumeButton.hidden=true;
  }
  function failure(error,label){
    if(error.retryable===false)pending=null;
    resumeButton.hidden=!pending;
    message(`${label}：${error.message}${pending?' 点击「继续查看任务」恢复；无需重新上传。':''}`);
  }
  async function analyze(){
    if(state.busy || !state.audio?.file)return;
    reset();setProcessing(true);
    try{
      sourceFile=state.audio.file;
      const upload=await prepareFile(sourceFile);
      const body=new FormData();body.set('audio',upload,upload.name);
      body.set('singer_count',panel.querySelector('[data-count]').value);body.set('input_kind',panel.querySelector('[data-kind]').value);body.set('request_id',`chorus-${createRequestId()}`);
      const base=chorusBase(getEndpoint());message('上传并识别歌手…');
      pending={base,kind:'analysis',job:await request(`${base}/analyze`,{method:'POST',body})};
      await finishPending();
    }catch(e){failure(e,'识别未完成');}finally{setProcessing(false);}
  }
  async function convert(){
    if(state.busy)return;
    if(pending){message('已存在待查看的任务，请点击「继续查看任务」。');return;}
    if(!session || sourceFile!==state.audio?.file){message('请先识别歌手并为每路选择角色。');return;}
    setProcessing(true);
    try{
      const base=session.base;
      pending={base,kind:'conversion',job:await request(`${base}/${session.jobId}/convert?token=${encodeURIComponent(session.downloadToken)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tracks:params,accompanimentGainDb:Number(document.getElementById('rvc-accompaniment-gain')?.value || 0),accompanimentMute:Boolean(document.getElementById('rvc-accompaniment-mute')?.checked),requestId:`chorus-${createRequestId()}`})})};
      await finishPending();
    }catch(e){failure(e,'转换未完成');}finally{setProcessing(false);}
  }
  enable.addEventListener('change',()=>{if(enable.checked){switchingMode=true;try{setMode();}finally{switchingMode=false;}}refresh();});
  analyzeButton.addEventListener('click',analyze);
  convertButton.addEventListener('click',convert);
  resumeButton.addEventListener('click',async()=>{if(state.busy||!pending)return;setProcessing(true);try{await finishPending();}catch(e){failure(e,'任务未完成');}finally{setProcessing(false);}});
  updateButton.addEventListener('click',convert);
  document.getElementById('rvc-audio-file')?.addEventListener('change',()=>{if(!busy)reset();refresh();});
  refresh();return {isEnabled:()=>enable.checked,refresh,convert};
}
