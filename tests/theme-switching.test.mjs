import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdtempSync, mkdirSync, readFileSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../assets/liquid-ui.js', import.meta.url), 'utf8');

function fixture(initial, { denyStorage = false, lang = 'zh-CN' } = {}) {
  const values = new Map(initial === undefined ? [] : [['postprep-ui-style', initial]]);
  const listeners = new Map(), nodes = [], root = { dataset: {}, lang, style: { setProperty() {} } };
  const language = { before(node) { node.isConnected = true; } };
  const header = { querySelector: () => language, getBoundingClientRect: () => ({ height: 72 }) };
  const audio = { paused: 0, pause() { this.paused++; } };
  const document = {
    documentElement: root, readyState: 'complete',
    body: { dataset: { page: 'home' }, append() {} },
    getElementById(id) { return id === 'site-header' ? header : id === 'studio-input-audio' ? audio : null; },
    addEventListener() {},
    createElement() {
      const node = { dataset: {}, attributes: {}, events: {}, setAttribute(k, v) { this.attributes[k] = v; },
        addEventListener(k, fn) { this.events[k] = fn; } };
      nodes.push(node); return node;
    },
  };
  const localStorage = {
    getItem(k) { if (denyStorage) throw Error('storage denied'); return values.get(k) ?? null; },
    setItem(k, v) { if (denyStorage) throw Error('storage denied'); values.set(k, v); },
  };
  class MutationObserver { observe() {} }
  const window = { addEventListener(type, fn) { listeners.set(type, fn); } };
  vm.runInNewContext(source, { document, window, localStorage, MutationObserver, matchMedia: () => ({ matches: false }) });
  const toggle = nodes.find(n => n.className === 'style-toggle');
  return { root, toggle, audio, values, dispatchStorage(value) { listeners.get('storage')({ key: 'postprep-ui-style', newValue: value }); } };
}

test('the shared control cycles all four themes with persistent, translated labels', () => {
  const f = fixture();
  assert.equal(f.root.dataset.ui, 'glass');
  assert.equal(f.toggle.attributes['aria-label'], '切换至纸面风格');
  f.toggle.events.click();
  assert.equal(f.root.dataset.ui, 'classic');
  assert.equal(f.values.get('postprep-ui-style'), 'classic');
  assert.equal(f.toggle.attributes['aria-label'], '切换至洛可可信笺');
  f.toggle.events.click();
  assert.equal(f.root.dataset.ui, 'rococo');
  assert.equal(f.values.get('postprep-ui-style'), 'rococo');
  assert.equal(f.toggle.attributes['aria-label'], '切换至蔚蓝档案');
  f.toggle.events.click();
  assert.equal(f.root.dataset.ui, 'ba');
  assert.equal(f.values.get('postprep-ui-style'), 'ba');
  assert.equal(f.toggle.attributes['aria-label'], '切换至液态玻璃');
  f.toggle.events.click();
  assert.equal(f.root.dataset.ui, 'glass');
  assert.equal(f.values.get('postprep-ui-style'), 'glass');
  assert.equal(f.audio.paused, 3);
  const en = fixture('classic', { lang: 'en' });
  assert.equal(en.toggle.attributes['aria-label'], 'Switch to Rococo stationery');
});

test('saved, cross-tab, unknown and unavailable storage values keep the theme coherent', () => {
  for (const value of ['glass', 'classic', 'rococo', 'ba']) assert.equal(fixture(value).root.dataset.ui, value);
  assert.equal(fixture('unexpected').root.dataset.ui, 'glass');
  const f = fixture('glass');
  f.dispatchStorage('rococo');
  assert.equal(f.root.dataset.ui, 'rococo');
  assert.equal(f.toggle.attributes['aria-label'], '切换至蔚蓝档案');
  assert.equal(f.audio.paused, 1);
  f.dispatchStorage('ba');
  assert.equal(f.root.dataset.ui, 'ba');
  assert.equal(f.toggle.attributes['aria-label'], '切换至液态玻璃');
  f.dispatchStorage('classic');
  assert.equal(f.root.dataset.ui, 'classic');
  f.dispatchStorage(null);
  assert.equal(f.root.dataset.ui, 'glass');
  const privateWindow = fixture(undefined, { denyStorage: true });
  privateWindow.toggle.events.click();
  privateWindow.toggle.events.click();
  assert.equal(privateWindow.root.dataset.ui, 'rococo');
});

test('running the v3 injector preserves the theme order and avoids duplicates', () => {
  const root = mkdtempSync(join(tmpdir(), 'postprep-head-order-'));
  try {
    mkdirSync(join(root, 'tools'));
    for (const name of ['v3-inject.mjs', 'rococo-inject.mjs', 'ba-inject.mjs']) copyFileSync(new URL(`../tools/${name}`, import.meta.url), join(root, 'tools', name));
    writeFileSync(join(root, 'index.html'), '<!doctype html><html><head><meta name="theme-color" content="#fff"></head><body></body></html>');
    const run = file => execFileSync(process.execPath, [join(root, 'tools', file)], { stdio: 'ignore' });
    run('v3-inject.mjs'); run('rococo-inject.mjs'); run('ba-inject.mjs'); run('rococo-inject.mjs'); run('v3-inject.mjs'); run('ba-inject.mjs');
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert.equal((html.match(/<!-- rococo:head -->/g) || []).length, 1);
    assert.equal((html.match(/<!-- v3:head -->/g) || []).length, 1);
    assert.equal((html.match(/<!-- ba:head -->/g) || []).length, 1);
    assert.ok(html.indexOf('<!-- /rococo:head -->') < html.indexOf('<!-- ba:head -->'));
    assert.ok(html.indexOf('<!-- /v3:head -->') < html.indexOf('<!-- rococo:head -->'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

const rococoSource = await readFile(new URL('../assets/rococo/rococo.js', import.meta.url), 'utf8');
function skyFixture({ query = '', stored = null, dark = false } = {}) {
  const attributes = new Map(), root = { dataset: {}, setAttribute(k, v) { attributes.set(k, v); }, removeAttribute(k) { attributes.delete(k); } };
  const meta = { getAttribute: () => '#ffffff', setAttribute(k, value) { this[k] = value; } };
  const localStorage = { getItem(key) { return key === 'postprep-ui-style' ? 'rococo' : stored; } };
  const media = q => ({ matches: q.includes('color-scheme') && dark, addEventListener() {} });
  const document = { documentElement: root, currentScript: { src: 'https://example.test/assets/rococo/rococo.js' }, readyState: 'loading', querySelector: () => meta, addEventListener() {} };
  vm.runInNewContext(rococoSource, { document, window: { matchMedia: media }, matchMedia: media, localStorage, location: { search: query }, setInterval() {}, Date });
  return { root, attributes, meta };
}

test('explicit sky choices override system dark mode while automatic mode follows it', () => {
  const day = skyFixture({ query: '?rococo-time=morning', dark: true });
  assert.equal(day.root.dataset.rcSky, 'morning');
  assert.equal(day.attributes.has('data-rc-night'), false);
  const night = skyFixture({ stored: 'night', dark: false });
  assert.equal(night.root.dataset.rcSky, 'night');
  assert.equal(night.attributes.has('data-rc-night'), true);
  const automatic = skyFixture({ dark: true });
  assert.equal(automatic.attributes.has('data-rc-night'), true);
});
