import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('label switching preserves form values and separate attribute originals',async()=>{
  const source=await readFile(new URL('../assets/rvc-language.js',import.meta.url),'utf8');
  const label={textContent:'伴奏音量',dataset:{rvcLabel:'Backing gain'}};
  const input={value:'-3',checked:true,dataset:{rvcLabelAria:'Search characters',rvcLabelPlaceholder:'Search…'},
    attributes:{'aria-label':'搜索角色','placeholder':'搜索…'},getAttribute(k){return this.attributes[k];},setAttribute(k,v){this.attributes[k]=v;}};
  const events={};
  const document={readyState:'complete',documentElement:{lang:'zh-CN'},addEventListener:(k,fn)=>events[k]=fn,
    querySelectorAll:k=>k==='[data-rvc-label]'?[label]:k==='[data-rvc-label-aria]'||k==='[data-rvc-label-placeholder]'?[input]:[]};
  const context={document};vm.runInNewContext(source,context);
  document.documentElement.lang='en';events['postprep:languagechange']();
  assert.equal(label.textContent,'Backing gain');assert.equal(input.attributes['aria-label'],'Search characters');
  assert.equal(input.attributes.placeholder,'Search…');assert.equal(context.PostPrepRvcLanguage.voiceName({name:'橘光',nameEn:'Tachibana Hikari'}),'Tachibana Hikari');
  document.documentElement.lang='zh-CN';events['postprep:languagechange']();
  assert.equal(input.attributes['aria-label'],'搜索角色');assert.equal(input.attributes.placeholder,'搜索…');
  assert.equal(label.textContent,'伴奏音量');assert.equal(input.value,'-3');assert.equal(input.checked,true);
});
