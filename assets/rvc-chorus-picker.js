// Each voice keeps its own selection; filtering never changes a task parameter.
const normalized=value=>String(value||'').normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu,'');
export const chorusText=(zh,en)=>String(globalThis.document?.documentElement?.lang||'zh').startsWith('en')?en:zh;
const voiceName=model=>globalThis.PostPrepRvcLanguage?.voiceName(model)||chorusText(model?.name||model?.displayName||model?.id||'',model?.nameEn||model?.name?.match(/\(([^)]+)\)/u)?.[1]||model?.name||model?.id||'');
export function chorusRoleMatches(model,query,aliases=[]) {
  const words=String(query||'').trim().split(/\s+/u).filter(Boolean).map(normalized);
  const text=normalized([model.id,model.name,model.nameEn,model.displayName,model.avatarText,...(model.tags||[]),...(model.aliases||[]),...aliases].join(' '));
  return words.every(word=>text.includes(word));
}

export function createChorusRolePicker({catalog,modelId,trackId,onChange,schools=[]}) {
  const models=catalog.filter(model=>!String(model.id).startsWith('own:'));
  const root=document.createElement('div');root.className='chorus-role-picker';
  const trigger=document.createElement('button');trigger.type='button';trigger.className='chorus-role-trigger';
  trigger.setAttribute('aria-label',`声部 ${trackId} 选择角色`);trigger.setAttribute('aria-expanded','false');
  const avatar=document.createElement('span');avatar.className='chorus-role-avatar';avatar.setAttribute('aria-hidden','true');
  const text=document.createElement('span');text.className='chorus-role-identity';
  const name=document.createElement('strong'),school=document.createElement('small');text.append(name,school);
  const arrow=document.createElement('span');arrow.className='chorus-role-arrow';arrow.textContent='⌄';arrow.setAttribute('aria-hidden','true');
  trigger.append(avatar,text,arrow);
  const panel=document.createElement('div');panel.className='chorus-role-panel';panel.hidden=true;
  const search=document.createElement('input');search.type='search';search.className='chorus-role-search';search.placeholder='搜索角色名 / 学校';
  search.autocomplete='off';search.spellcheck=false;
  search.setAttribute('aria-label',`搜索声部 ${trackId} 的角色`);search.setAttribute('role','combobox');search.setAttribute('aria-autocomplete','list');
  const list=document.createElement('div');list.className='chorus-role-list';list.id=`chorus-role-list-${trackId}`;list.setAttribute('role','listbox');list.setAttribute('aria-label',`声部 ${trackId} 可选角色`);
  search.setAttribute('aria-controls',list.id);trigger.setAttribute('aria-controls',list.id);
  const empty=document.createElement('p');empty.className='chorus-role-empty';empty.textContent='没有匹配的角色，试试简称或英文名。';empty.setAttribute('role','status');
  const count=document.createElement('p');count.className='chorus-role-count';count.setAttribute('aria-live','polite');
  panel.append(search,count,list,empty);root.append(trigger,panel);
  const info=model=>schools.find(item=>(item.students||[]).some(student=>student[0]===model.id)||(model.tags||[]).some(tag=>tag===item.tag||tag===item.alias));
  const aliases=model=>{const matched=info(model);return [...(matched?.students?.find(student=>student[0]===model.id)||[]),matched?.name,matched?.alias,matched?.en].filter(Boolean);};
  let selected=modelId,visible=[],options=[],active=-1;
  function identity(){
    const current=models.find(model=>model.id===selected);
    name.textContent=voiceName(current)||selected;
    avatar.textContent=current?.avatarText||name.textContent.slice(0,2);
    const matched=info(current||{});
    school.textContent=matched?chorusText(matched.name,matched.en):(current?.tags||[]).filter(tag=>!['男声','女声'].includes(tag)).map(tag=>globalThis.PostPrepRvcLanguage?.voiceTag(tag)||tag).join(' · ')||chorusText('角色音色','Character voice');
  }
  function highlight(index){
    active=index;options.forEach((button,i)=>button.setAttribute('data-active',String(i===active)));
    if(options[active]){
      const option=options[active];search.setAttribute('aria-activedescendant',option.id);
      // Keep navigation inside the list; scrollIntoView could move the whole
      // workbench just because a previously selected option is far down.
      const top=option.offsetTop,bottom=top+option.offsetHeight;
      if(Number.isFinite(bottom)&&list.clientHeight){
        if(top<list.scrollTop)list.scrollTop=top;
        else if(bottom>list.scrollTop+list.clientHeight)list.scrollTop=bottom-list.clientHeight;
      }
    }
    else search.removeAttribute('aria-activedescendant');
  }
  function close(focus=false){panel.hidden=true;trigger.setAttribute('aria-expanded','false');search.setAttribute('aria-expanded','false');search.removeAttribute('aria-activedescendant');if(focus)trigger.focus?.();}
  function choose(model){selected=model.id;identity();close(true);onChange(selected);}
  function filter(){
    visible=models.filter(model=>chorusRoleMatches(model,search.value,aliases(model)));list.replaceChildren();options=[];
    visible.forEach(model=>{
      const button=document.createElement('button');button.type='button';button.tabIndex=-1;button.className='chorus-role-option';button.id=`chorus-role-${trackId}-${model.id}`;
      button.setAttribute('role','option');button.setAttribute('aria-selected',String(model.id===selected));button.setAttribute('data-model-id',model.id);
      const label=document.createElement('span');label.textContent=voiceName(model);
      const matched=info(model),hint=document.createElement('small');hint.textContent=matched?chorusText(matched.tag,matched.en):model.collectionId||'';
      button.append(label,hint);button.addEventListener('click',()=>choose(model));list.append(button);options.push(button);
    });
    empty.hidden=visible.length>0;count.textContent=chorusText(`${visible.length} 个可选音色`,`${visible.length} available voices`);
    const chosen=visible.findIndex(model=>model.id===selected);highlight(chosen>=0?chosen:visible.length?0:-1);
  }
  function open(){if(trigger.disabled)return;search.value='';panel.hidden=false;trigger.setAttribute('aria-expanded','true');search.setAttribute('aria-expanded','true');filter();search.focus?.({preventScroll:true});}
  trigger.addEventListener('click',()=>panel.hidden?open():close());
  search.addEventListener('input',filter);
  search.addEventListener('keydown',event=>{
    if(event.isComposing)return;
    if(event.key==='Escape'){event.preventDefault();close(true);}
    else if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();if(visible.length)highlight((active+(event.key==='ArrowDown'?1:-1)+visible.length)%visible.length);
    }else if(event.key==='Enter'){event.preventDefault();if(visible[active])choose(visible[active]);}
  });
  root.addEventListener('focusout',event=>{if(event.relatedTarget&&!root.contains(event.relatedTarget))close();});
  root.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){event.preventDefault();close(true);}});
  function refreshLanguage(){
    trigger.setAttribute('aria-label',chorusText(`声部 ${trackId} 选择角色`,`Choose a character for voice ${trackId}`));
    search.placeholder=chorusText('搜索角色名 / 学校','Search character / school');
    search.setAttribute('aria-label',chorusText(`搜索声部 ${trackId} 的角色`,`Search characters for voice ${trackId}`));
    list.setAttribute('aria-label',chorusText(`声部 ${trackId} 可选角色`,`Available characters for voice ${trackId}`));
    empty.textContent=chorusText('没有匹配的角色，试试简称或英文名。','No matching character. Try a short or English name.');
    identity();if(!panel.hidden)filter();
  }
  refreshLanguage();search.setAttribute('aria-expanded','false');
  return {element:root,get value(){return selected;},close,refreshLanguage};
}
