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

export function initChorus({state,getEndpoint,prepareFile=async file=>file,setMode,setBusy,onResult}) {
  const panel=document.getElementById('rvc-chorus');
  if(!panel)return null;
  const enable=panel.querySelector('[data-enable]'), analyzeButton=panel.querySelector('[data-analyze]');
  const updateButton=panel.querySelector('[data-update]');
  const status=panel.querySelector('[data-status]'), tracks=panel.querySelector('[data-tracks]');
  let session=null, sourceFile=null, params=[], busy=false;
  const message=text=>{status.textContent=text;};
  function reset(){session=null;params=[];updateButton.hidden=true;tracks.querySelectorAll('audio').forEach(a=>{a.pause();a.removeAttribute('src');a.load();});tracks.replaceChildren();}
  function refresh(){
    if(enable.checked && (state.inferenceMode!=='official' || state.audioMode!=='song'))enable.checked=false;
    panel.querySelector('[data-workspace]').hidden=!enable.checked;
    panel.querySelectorAll('input,button,select').forEach(c=>{c.disabled=state.busy;});
    analyzeButton.disabled=state.busy || !state.audio?.file;
    if(sourceFile && state.audio?.file!==sourceFile && !busy)reset();
  }
  async function request(url,options={}){
    const r=await fetch(url,{...options,signal:AbortSignal.timeout(210000)});
    const data=await r.json();
    if(!r.ok)throw new Error(data.code || `HTTP ${r.status}`);
    return data;
  }
  async function poll(base,job){
    const until=Date.now()+3600000;
    while(Date.now()<until){
      const v=await request(`${base}/${job.jobId}?token=${encodeURIComponent(job.downloadToken)}`);
      if(v.state==='completed')return {...v,downloadToken:job.downloadToken};
      if(v.state==='failed')throw new Error(v.code || '合唱处理失败');
      const names={queued:'排队中',separating:'提取人声与伴奏','identifying-singers':'识别并分离歌手',mixing:'合成混音'};
      message(names[v.stage] || (/^converting-singer-\d$/u.test(v.stage)?`正在转换声部 ${v.stage.slice(-1)}`:'正在处理…'));
      await new Promise(resolve=>setTimeout(resolve,4000));
    }
    throw new Error('等待超时，请保留页面稍后查看');
  }
  function setProcessing(value){busy=value;setBusy(value);refresh();}
  function render(base,job,converted=false){
    tracks.querySelectorAll('audio').forEach(a=>{a.pause();a.removeAttribute('src');a.load();});
    tracks.replaceChildren();
    if(!converted)params=job.tracks.map(t=>({trackId:t.trackId,modelId:state.selectedModelId,pitch:0,indexRate:.3,protect:.25,rmsMixRate:1,f0Method:'rmvpe',gainDb:0,mute:false}));
    for(const [i,t] of job.tracks.entries()){
      const card=document.createElement('article');card.className='chorus-track';
      const title=document.createElement('h4');title.textContent=`声部 ${t.trackId}`;
      const audio=document.createElement('audio');audio.controls=true;audio.preload='none';audio.crossOrigin='anonymous';
      audio.setAttribute('aria-label',`${converted?'转换后':'分离后'}声部 ${t.trackId} 预听`);
      audio.src=`${base}/${job.jobId}/stem/${t.trackId}?token=${encodeURIComponent(job.downloadToken)}`;
      audio.addEventListener('play',()=>tracks.querySelectorAll('audio').forEach(a=>{if(a!==audio)a.pause();}));
      const role=document.createElement('select');role.setAttribute('aria-label',`声部 ${t.trackId} 对应角色`);
      state.catalog.filter(m=>!String(m.id).startsWith('own:')).forEach(m=>{const o=document.createElement('option');o.value=m.id;o.textContent=m.name || m.displayName || m.id;role.append(o);});
      role.value=params[i].modelId;role.addEventListener('change',()=>{params[i].modelId=role.value;});
      const details=document.createElement('details'), summary=document.createElement('summary');summary.textContent='独立调音';details.append(summary);
      for(const [key,label,min,max,step] of [['pitch','音高（半音）',-24,24,1],['indexRate','检索强度',0,1,.01],['protect','辅音保护',0,.5,.01],['rmsMixRate','动态保留',0,1,.01],['gainDb','人声音量（dB）',-24,6,.5]]){
        const wrap=document.createElement('label');wrap.className='chorus-control';const name=document.createElement('span');name.textContent=label;
        const control=document.createElement('input');Object.assign(control,{type:'range',min,max,step,value:params[i][key]});
        const out=document.createElement('output');out.textContent=control.value;
        control.addEventListener('input',()=>{params[i][key]=Number(control.value);out.textContent=control.value;});
        wrap.append(name,control,out);details.append(wrap);
      }
      const muteLabel=document.createElement('label');muteLabel.className='chorus-control';muteLabel.textContent='单独静音';const mute=document.createElement('input');mute.type='checkbox';mute.checked=params[i].mute;
      mute.addEventListener('change',()=>{params[i].mute=mute.checked;});muteLabel.append(mute);details.append(muteLabel);
      const f0=document.createElement('select');f0.setAttribute('aria-label',`声部 ${t.trackId} 音高算法`);
      for(const method of ['rmvpe','fcpe','auto','pm']){const o=document.createElement('option');o.value=method;o.textContent=method.toUpperCase();f0.append(o);}
      f0.value=params[i].f0Method;f0.addEventListener('change',()=>{params[i].f0Method=f0.value;});details.append(f0);
      card.append(title,audio,role,details);tracks.append(card);
    }
  }
  async function analyze(){
    if(state.busy || !state.audio?.file)return;
    reset();setProcessing(true);
    try{
      sourceFile=state.audio.file;
      const upload=await prepareFile(sourceFile);
      const body=new FormData();body.set('audio',upload,upload.name);
      body.set('singer_count',panel.querySelector('[data-count]').value);body.set('input_kind',panel.querySelector('[data-kind]').value);body.set('request_id',`chorus-${crypto.randomUUID()}`);
      const base=chorusBase(getEndpoint());message('上传并识别歌手…');
      session=await poll(base,await request(`${base}/analyze`,{method:'POST',body}));session.base=base;render(base,session);
      const countWarning=session.requestedCount!=='auto' && Number(session.requestedCount)!==session.estimatedCount ? `未能可靠提取请求的 ${session.requestedCount} 路。` : '';
      message(`${countWarning}已提取 ${session.estimatedCount} 路候选人声。请逐路预听、确认人数和分配角色；自动人数是估计。${session.experimentalRecursive?'三／四路使用递归分离，请重点检查串音和声线连续性。':''} 音轨有效至 ${new Date(session.expiresAt).toLocaleString()}。`);
    }catch(e){reset();message(`识别失败：${e.message}`);}finally{setProcessing(false);}
  }
  async function convert(){
    if(state.busy)return;
    if(!session || sourceFile!==state.audio?.file){message('请先识别歌手并为每路选择角色。');return;}
    setProcessing(true);
    try{
      const base=session.base;
      const job=await poll(base,await request(`${base}/${session.jobId}/convert?token=${encodeURIComponent(session.downloadToken)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tracks:params,accompanimentGainDb:Number(document.getElementById('rvc-accompaniment-gain')?.value || 0),accompanimentMute:Boolean(document.getElementById('rvc-accompaniment-mute')?.checked),requestId:`chorus-${crypto.randomUUID()}`})}));
      const url=chorusOutputUrl(base,job);
      const r=await fetch(url,{signal:AbortSignal.timeout(210000)});
      if(!r.ok || !r.headers.get('Content-Type')?.startsWith('audio/'))throw new Error('混音下载失败');
      await onResult(await r.blob(),job);render(base,job,true);
      updateButton.hidden=false;
      message(`${job.reusedConversion?'已复用转换人声更新混音。':'合唱转换已生成。'}上方可逐路试听，下方播放器和下载使用同一份混音。调整设置后点击「应用设置并更新合唱」；仅调整音量／静音会复用临时音轨。`);
    }catch(e){message(`转换失败：${e.message}`);}finally{setProcessing(false);}
  }
  enable.addEventListener('change',()=>{if(enable.checked)setMode();refresh();});
  analyzeButton.addEventListener('click',analyze);
  updateButton.addEventListener('click',convert);
  document.getElementById('rvc-audio-file')?.addEventListener('change',()=>{if(!busy)reset();refresh();});
  refresh();return {isEnabled:()=>enable.checked,refresh,convert};
}
