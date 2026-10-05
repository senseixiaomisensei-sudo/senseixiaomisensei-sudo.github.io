import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const source = await readFile(new URL('../assets/rvc.js', import.meta.url), 'utf8');
const catalog = JSON.parse(await readFile(new URL('../assets/rvc-models.json', import.meta.url), 'utf8')).models;
function extract(name) {
  const start = source.indexOf(`function ${name}(`), body = source.indexOf(') {', start) + 2;
  let depth = 0;
  for (let i = body; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && !--depth) return source.slice(start, i + 1);
  }
  throw new Error(name);
}
test('reference speech selects only verified roles in cloud voice mode', () => {
  const state = { inferenceMode: 'official', audioMode: 'voice' };
  const selector = { value: 'auto' }, pitch = {value:'0'}, document = { getElementById: id => id==='rvc-pitch'?pitch:id==='rvc-voice-engine'?selector:null };
  const selected = () => catalog.find(m => m.id === 'hoshino');
  const use = Function('state', 'document', 'getSelectedModel', `return (${extract('useNewSpeechEngine')})`)(state, document, selected);
  assert.equal(use(), true);
  assert.equal(use(catalog.find(m => m.id === 'sukuna')), false);
  selector.value = 'rvc'; assert.equal(use(), false);
  selector.value = 'auto'; pitch.value='6'; assert.equal(use(),false); pitch.value='0';
  selector.value = 'auto'; state.audioMode = 'song'; assert.equal(use(), false);
  state.audioMode = 'voice'; state.inferenceMode = 'local'; assert.equal(use(), false);
});
test('dry vocals and TTS controls stay editable; RVC tuning selects an engine that applies them', () => {
  const state={inferenceMode:'official',audioMode:'voice',speechControlsActive:true};
  const nodes=new Map(['rvc-voice-engine','rvc-pitch','rvc-index-rate','rvc-protect','rvc-f0-method','rvc-filter-radius','rvc-preset-male-female','rvc-preset-same','rvc-preset-female-male','rvc-speech-engine-hint'].map(id=>[id,{value:id==='rvc-voice-engine'?'auto':'0',disabled:true}]));
  const document={getElementById:id=>nodes.get(id)}, getSelectedModel=()=>catalog.find(m=>m.id==='hoshino');
  const use=Function('state','document','getSelectedModel',`return (${extract('useNewSpeechEngine')})`)(state,document,getSelectedModel);
  const sync=Function('state','document','useNewSpeechEngine','l',`return (${extract('syncSpeechControls')})`)(state,document,use,zh=>zh);
  const tune=Function('state','document','getSelectedModel','syncSpeechControls',`return (${extract('enableSpeechTuning')})`)(state,document,getSelectedModel,sync);
  sync(); for(const [id,node] of nodes)if(id!=='rvc-speech-engine-hint')assert.equal(node.disabled,false,id);
  nodes.get('rvc-pitch').value='6';tune();assert.equal(nodes.get('rvc-voice-engine').value,'rvc');assert.equal(nodes.get('rvc-pitch').value,'6');
  state.audioMode='song';nodes.get('rvc-voice-engine').value='auto';tune();assert.equal(nodes.get('rvc-voice-engine').value,'auto');
});
test('enabled character references are distinct and have actual revisions', () => {
  const refs = catalog.filter(m => m.speechProfile.enabled);
  assert.equal(refs.length, 47);
  assert.equal(new Set(refs.map(m => m.speechProfile.referenceSha256)).size, refs.length);
  for (const m of refs) {
    assert.match(m.speechProfile.referenceSha256, /^[a-f0-9]{64}$/u);
    assert.match(m.speechProfile.resourceRevision, /^[a-f0-9]{64}$/u);
  }
});
test('new speech preserves original upload and never silently falls back to old device synthesis', () => {
  const run = extract('runOfficialRvcInference');
  assert.match(run, /modernSpeech \? \{ file: state\.audio\.file \}/u);
  assert.match(run, /allowDeviceFallback && !modernSpeech/u);
  assert.match(run, /body\.set\("voice_engine", voiceEngine\)/u);
});
