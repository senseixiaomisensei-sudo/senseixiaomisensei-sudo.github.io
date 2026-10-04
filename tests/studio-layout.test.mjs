import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../assets/studio-layout.js', import.meta.url), 'utf8');
function fixture() {
  const root = { lang: 'zh-CN' };
  const context = vm.createContext({
    document: { documentElement: root, readyState: 'loading', addEventListener() {} },
    window: {},
  });
  vm.runInContext(source, context);
  const outer = { tagName: 'DETAILS', open: false, parentElement: null, querySelector: () => 'outer summary' };
  const inner = { tagName: 'DETAILS', open: false, parentElement: outer, querySelector: () => 'inner summary' };
  const input = { tagName: 'INPUT', parentElement: inner, value: '-3', id: 'rvc-pitch' };
  return { api: context.window.PostPrepStudio, outer, inner, input };
}
test('shortcuts reveal all collapsed ancestors without replacing controls or their values', () => {
  const { api, outer, inner, input } = fixture();
  assert.equal(api.revealTarget(input), input);
  assert.equal(outer.open, true);
  assert.equal(inner.open, true);
  assert.equal(input.value, '-3');
  assert.equal(input.parentElement, inner);
  assert.equal(api.revealTarget(null), null);
});
test('dock scroll tracking uses the visible summary rather than the zero rectangle of a closed range', () => {
  const { api, outer, inner, input } = fixture();
  assert.equal(api.visibleAnchor(input), 'outer summary');
  outer.open = true;
  assert.equal(api.visibleAnchor(input), 'inner summary');
  inner.open = true;
  assert.equal(api.visibleAnchor(input), input);
  assert.equal(api.visibleAnchor(null), null);
});
