/* Shared labels. Language changes never recreate controls or media elements. */
(() => {
  'use strict';
  const language = () => String(document.documentElement?.lang || 'zh').startsWith('en') ? 'en' : 'zh';
  const text = (zh,en) => language()==='en' ? en : zh;
  const tags = {'女声':'Female voice','男声':'Male voice','蔚蓝档案':'Blue Archive','咒术回战':'Jujutsu Kaisen',
    '日语':'Japanese','阿拜多斯':'Abydos','千年':'Millennium','格黑娜':'Gehenna','三一':'Trinity',
    '圣三一':'Trinity','什亭之匣':'Shittim Chest','高地人':'Railroad','铁道':'Railroad'};
  const voiceName = model => language()==='en'
    ? model?.nameEn || model?.name?.match(/\(([^)]+)\)/u)?.[1] || model?.name || model?.id || ''
    : model?.name || model?.id || '';
  const voiceDescription = model => language()==='en' ? model?.descriptionEn || model?.description || '' : model?.description || '';
  const voiceTag = tag => language()==='en' ? tags[tag] || tag : tag;
  const originals = new WeakMap();
  function original(node,key,value){
    let saved=originals.get(node);
    if(!saved){saved={};originals.set(node,saved);}
    if(!(key in saved))saved[key]=value;
    return saved[key];
  }
  function setText(node,zh,en){
    if(node.dataset){node.dataset.rvcTextZh=zh;node.dataset.rvcTextEn=en;}
    node.textContent=text(zh,en);
  }
  function localizeDeclared() {
    document.querySelectorAll('[data-rvc-label]').forEach(node => {
      node.textContent = text(original(node,'text',node.textContent),node.dataset.rvcLabel);
    });
    document.querySelectorAll('[data-rvc-label-aria]').forEach(node => {
      node.setAttribute('aria-label',text(original(node,'aria',node.getAttribute('aria-label')),node.dataset.rvcLabelAria));
    });
    document.querySelectorAll('[data-rvc-label-placeholder]').forEach(node => {
      node.setAttribute('placeholder',text(original(node,'placeholder',node.getAttribute('placeholder')),node.dataset.rvcLabelPlaceholder));
    });
    document.querySelectorAll('[data-rvc-text-en]').forEach(node=>{
      node.textContent=text(node.dataset.rvcTextZh,node.dataset.rvcTextEn);
    });
  }
  globalThis.PostPrepRvcLanguage=Object.freeze({language,text,voiceName,voiceDescription,voiceTag,localizeDeclared,setText});
  document.addEventListener('postprep:languagechange',localizeDeclared);
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',localizeDeclared,{once:true});
  else localizeDeclared();
})();
