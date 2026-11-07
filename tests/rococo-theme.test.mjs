// Rococo theme pack (Apple-skeleton edition) — guards: injected once per page, scoped CSS, local-only assets, no hook changes, no decoration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';

const PAGES = ['index.html', 'caption-formatter.html', 'hashtag-cleaner.html', 'idea-generator.html', 'length-checker.html',
  'publish-trust.html', 'skills.html', 'skill-passport.html', 'rvc.html', 'privacy.html', '404.html'];
const css = readFileSync('assets/rococo/rococo.css', 'utf8');
const js = readFileSync('assets/rococo/rococo.js', 'utf8');

test('every page carries the rococo head block exactly once, after liquid-ui.js', () => {
  for (const page of PAGES) {
    const html = readFileSync(page, 'utf8');
    assert.equal((html.match(/<!-- rococo:head -->/g) || []).length, 1, page);
    assert.ok(html.indexOf('assets/rococo/rococo.js') > html.indexOf('liquid-ui.js'), `${page}: rococo.js must load after liquid-ui.js`);
  }
});

test('all rococo rules are scoped to html[data-ui="rococo"]', () => {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@font-face\s*{[^}]*}/g, '').replace(/@keyframes[^{]+{(?:[^{}]*{[^}]*})*[^}]*}/g, '');
  const selectors = [];
  const re = /([^{}@]+){[^{}]*}/g; let m;
  const split = sel => { const out = []; let depth = 0, cur = '';
    for (const ch of sel) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && !depth) { out.push(cur); cur = ''; } else cur += ch; }
    out.push(cur); return out.map(x => x.trim()).filter(Boolean); };
  while ((m = re.exec(body))) selectors.push(...split(m[1]));
  const allowed = s => s.startsWith('html[data-ui="rococo"]');
  const bad = selectors.filter(s => !allowed(s) && !/^(from|to|\d+%)$/.test(s));
  assert.deepEqual(bad, []);
});

test('assets are local, fonts only, and within budget', () => {
  assert.doesNotMatch(css, /url\((["']?)https?:/);
  assert.doesNotMatch(js, /https?:\/\/(?!www\.w3\.org)/);
  for (const m of css.matchAll(/url\((?!["']?data:)["']?([^)"']+)/g)) assert.ok(existsSync('assets/rococo/' + m[1]), 'missing ' + m[1]);
  // the Apple pass ships no raster or sticker art: ornament is CSS / inline SVG hairline only
  assert.ok(!existsSync('assets/rococo/img') || readdirSync('assets/rococo/img').length === 0, 'assets/rococo/img should be gone');
  const fonts = readdirSync('assets/rococo/fonts').filter(f => f.endsWith('.woff2'));
  for (const f of fonts) assert.ok(css.includes('fonts/' + f), 'unused font ' + f);
  const total = fonts.map(f => statSync(`assets/rococo/fonts/${f}`).size).reduce((a, b) => a + b, 0);
  assert.ok(total < 1.2 * 1024 * 1024, `pack fonts ${total} bytes`);
});

test('runtime never rewrites ids, data hooks or listeners of the app, and adds no decoration', () => {
  assert.doesNotMatch(js, /\.id\s*=|removeAttribute\("(id|name|for|data-(?!rc-))/);
  // Apple pass: no decorative layers, no node insertion or removal, no timers or animation loops
  assert.doesNotMatch(js, /createElement|appendChild|insertBefore|\.remove\(\)|innerHTML/);
  assert.doesNotMatch(js, /setInterval|requestAnimationFrame|pointermove|deviceorientation/);
  assert.doesNotMatch(js, /stopImmediatePropagation|\.style-toggle/);
  assert.doesNotMatch(js, /\beval\(|new Function/);
});
