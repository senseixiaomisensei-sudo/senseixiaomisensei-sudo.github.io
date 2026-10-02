import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const source = await readFile(new URL('../assets/rvc.js', import.meta.url), 'utf8');
const catalog = JSON.parse(await readFile(new URL('../assets/rvc-models.json', import.meta.url), 'utf8')).models;
function extract(name) {
  const start = source.indexOf(`function ${name}(`), body = source.indexOf('{', start);
  let depth = 0;
  for (let i = body; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && !--depth) return source.slice(start, i + 1);
  }
  throw new Error(name);
}
test('reference speech selects only verified roles in cloud voice mode', () => {
  const state = { inferenceMode: 'official', audioMode: 'voice' };
  const selector = { value: 'auto' }, document = { getElementById: () => selector };
  const selected = () => catalog.find(m => m.id === 'hoshino');
  const use = Function('state', 'document', 'getSelectedModel', `return (${extract('useNewSpeechEngine')})`)(state, document, selected);
  assert.equal(use(), true);
  assert.equal(use(catalog.find(m => m.id === 'sukuna')), false);
  selector.value = 'rvc'; assert.equal(use(), false);
  selector.value = 'auto'; state.audioMode = 'song'; assert.equal(use(), false);
  state.audioMode = 'voice'; state.inferenceMode = 'local'; assert.equal(use(), false);
});
test('enabled character references are distinct and have actual revisions', () => {
  const refs = catalog.filter(m => m.speechProfile.enabled);
  assert.equal(refs.length, 28);
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
