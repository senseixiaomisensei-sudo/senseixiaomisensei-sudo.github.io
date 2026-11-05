import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../assets/ba/ba.js', import.meta.url), 'utf8');
function fixture({ ui = 'ba', character = 'koyuki', query = '', gallery = false } = {}) {
  const values = new Map([['postprep-ui-style', ui], ['postprep-ba', character]]);
  const documentEvents = new Map(), windowEvents = new Map(), timers = [];
  const attrs = new Map(), meta = { attrs: new Map([['content', '#fff'], ['data-postprep-original', '#fff']]), getAttribute(k) { return this.attrs.get(k) || null; }, setAttribute(k, v) { this.attrs.set(k, v); } };
  const root = { dataset: { ui }, lang: 'zh-CN', classList: { add() {}, remove() {}, toggle() {} }, setAttribute(k,v) { attrs.set(k,v); }, removeAttribute(k) { attrs.delete(k); } };
  let card = null, clicks = 0;
  const document = { documentElement: root, readyState: 'loading', hidden: false, body: null,
    querySelector(sel) { if (sel === 'meta[name="theme-color"]') return meta; if (sel.startsWith('#rvc-model-gallery [data-model-id=')) return card; return null; },
    getElementById(id) { return gallery && id === 'rvc-model-gallery' ? {} : null; },
    addEventListener(type, fn) { const list = documentEvents.get(type) || []; list.push(fn); documentEvents.set(type,list); }, dispatchEvent() {} };
  const window = { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener(type, fn) { windowEvents.set(type,fn); } };
  const localStorage = { getItem(k) { return values.get(k) ?? null; }, setItem(k,v) { values.set(k,v); } };
  const schedule = (fn, ms) => { timers.push({fn,ms}); };
  vm.runInNewContext(source, { window, document, localStorage, location: { search: query }, matchMedia: window.matchMedia,
    setTimeout: schedule, clearTimeout() {}, setInterval() {}, Date, MutationObserver: class { observe() {} }, CustomEvent: class {} });
  return { root, values, meta, window, windowEvents, documentEvents, timers,
    showCard() { card = { getAttribute: () => 'false', click() { clicks++; } }; }, get clicks() { return clicks; } };
}

test('character choice and time overrides persist and synchronize independently of the main theme', () => {
  const f = fixture({ character: 'hoshino', query: '?ba=momoi&ba-time=day' });
  assert.equal(f.root.dataset.ba, 'momoi');
  assert.equal(f.values.get('postprep-ba'), 'momoi');
  assert.equal(f.window.PostPrepBA.set('KEI'), true);
  assert.equal(f.values.get('postprep-ba'), 'kei');
  assert.equal(f.window.PostPrepBA.set('unknown'), false);
  f.windowEvents.get('storage')({ key: 'postprep-ba', newValue: 'hoshino' });
  assert.equal(f.root.dataset.ba, 'hoshino');
  assert.equal(f.values.get('postprep-ba'), 'kei');
  f.windowEvents.get('storage')({ key: 'postprep-ba', newValue: null });
  assert.equal(f.root.dataset.ba, 'koyuki');
  assert.equal(f.root.dataset.ui, 'ba');
});

test('a manual model selection cancels a pending automatic selection', () => {
  const f = fixture({ gallery: true });
  f.window.PostPrepBA.set('hoshino');
  assert.ok(f.timers.some(t => t.ms === 250));
  const manual = { closest: () => ({}) };
  for (const handler of f.documentEvents.get('click') || []) handler({ target: manual, isTrusted: true });
  f.showCard();
  for (const timer of f.timers.filter(t => t.ms === 250)) timer.fn();
  assert.equal(f.clicks, 0);
});

test('leaving BA cancels pending automatic model selection', () => {
  const f = fixture({ gallery: true });
  f.window.PostPrepBA.set('momoi');
  f.root.dataset.ui = 'glass';
  f.showCard();
  for (const timer of f.timers.filter(t => t.ms === 250)) timer.fn();
  assert.equal(f.clicks, 0);
});

test('cross-tab character changes never alter this tab’s selected model', () => {
  const f = fixture({ gallery: true });
  f.showCard();
  f.windowEvents.get('storage')({ key: 'postprep-ba', newValue: 'kei' });
  assert.equal(f.root.dataset.ba, 'kei');
  assert.equal(f.clicks, 0);
});
