import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const client=await readFile(new URL('../assets/rvc.js',import.meta.url),'utf8');
const catalog=JSON.parse(await readFile(new URL('../assets/rvc-models.json',import.meta.url),'utf8')).models;
function extract(name) {
  const start=client.indexOf(`function ${name}(`);
  assert.ok(start>=0);
  const body=client.indexOf('{',start);let depth=0;
  for(let i=body;i<client.length;i++) {
    if(client[i]==='{')depth++;
    if(client[i]==='}'&&!--depth)return client.slice(start,i+1);
  }
  throw new Error(`Unterminated ${name}`);
}
function harness(model) {
  const ids=['rvc-preset-male-female','rvc-preset-same','rvc-preset-female-male',
    'rvc-pitch','rvc-pitch-value','rvc-pitch-tip'];
  const elements=new Map(ids.map(id=>[id,{value:'0',textContent:'',className:'',attributes:{},events:{},
    label:{textContent:''},querySelector(){return this.label;},
    setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,fn){this.events[k]=fn;}}]));
  const document={getElementById:id=>elements.get(id)||null};
  const maleToFemalePresetPitch=Function(`return (${extract('maleToFemalePresetPitch')})`)();
  const setup=Function('document','window','renderAudioMode','setInferenceMode','syncMixControls','setupRecording','setupModelTraining','getSelectedModel',
    'maleToFemalePresetPitch',`return (${extract('setupEventListeners')})`)(
    document,{localStorage:{getItem:()=>null}},()=>{},()=>{},()=>{},()=>{},()=>{},()=>model,maleToFemalePresetPitch);
  setup();
  const select=Function('document','maleToFemalePresetPitch',`return (${extract('applyCharacterPitch')})`)(
    document,maleToFemalePresetPitch);
  return {elements,select,click:id=>elements.get(id).events.click()};
}

test('explicit cross-range action remains +12 with every neutral public role',()=>{
  for(const model of catalog) {
    const h=harness(model);
    h.select(model);
    assert.equal(h.elements.get('rvc-pitch').value,'0','selection must preserve neutral pitch');
    assert.match(h.elements.get('rvc-preset-male-female').label.textContent,/\(\+12\)/u);
    h.click('rvc-preset-male-female');
    assert.equal(h.elements.get('rvc-pitch').value,'12',`${model.id}: cross-range must not read defaultPitch=0`);
    assert.equal(h.elements.get('rvc-preset-male-female').attributes['aria-pressed'],'true');
  }
});
test('neutral and downward presets remain explicit, reversible actions',()=>{
  const h=harness(catalog[0]);
  h.click('rvc-preset-male-female');
  h.click('rvc-preset-same');
  assert.equal(h.elements.get('rvc-pitch').value,'0');
  h.click('rvc-preset-female-male');
  assert.equal(h.elements.get('rvc-pitch').value,'-12');
  assert.equal(h.elements.get('rvc-preset-same').attributes['aria-pressed'],'false');
});
test('role selection retains a custom or already chosen song transposition',()=>{
  const h=harness(catalog[0]);
  h.elements.get('rvc-pitch').value='7';
  h.select(catalog[3]);
  assert.equal(h.elements.get('rvc-pitch').value,'7');
  h.click('rvc-preset-male-female');
  h.select(catalog[1]);
  assert.equal(h.elements.get('rvc-pitch').value,'12');
});
