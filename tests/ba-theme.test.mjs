// Blue Archive theme pack — guards: injected once per page, scoped CSS, local-only assets,
// complete per-student art set, no hook changes, accessible switcher, motion governance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';

const PAGES = ['index.html', 'caption-formatter.html', 'hashtag-cleaner.html', 'idea-generator.html', 'length-checker.html',
  'publish-trust.html', 'skills.html', 'skill-passport.html', 'rvc.html', 'privacy.html', '404.html'];
const NAMES = ['koyuki', 'hoshino', 'momoi', 'kei', 'shiroko'];
const css = readFileSync('assets/ba/ba.css', 'utf8');
const js = readFileSync('assets/ba/ba.js', 'utf8');

test('every page carries the ba head block exactly once, after liquid-ui.js and the rococo block', () => {
  for (const page of PAGES) {
    const html = readFileSync(page, 'utf8');
    assert.equal((html.match(/<!-- ba:head -->/g) || []).length, 1, page);
    const at = html.indexOf('assets/ba/ba.js');
    assert.ok(at > html.indexOf('liquid-ui.js'), `${page}: ba.js must load after liquid-ui.js`);
    if (html.includes('assets/rococo/rococo.js')) assert.ok(at > html.indexOf('assets/rococo/rococo.js'), `${page}: ba.js should load after rococo.js`);
  }
});

test('all ba rules are scoped to html[data-ui="ba"]', () => {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@font-face\s*{[^}]*}/g, '').replace(/@keyframes[^{]+{(?:[^{}]*{[^}]*})*[^}]*}/g, '');
  const selectors = [];
  const re = /([^{}@]+){[^{}]*}/g; let m;
  const split = sel => { const out = []; let depth = 0, cur = '';
    for (const ch of sel) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && !depth) { out.push(cur); cur = ''; } else cur += ch; }
    out.push(cur); return out.map(x => x.trim()).filter(Boolean); };
  while ((m = re.exec(body))) selectors.push(...split(m[1]));
  const allowed = s => s.startsWith('html[data-ui="ba"]') || /^\.ba-(deco|switch|chibi-wrap|tap)$/.test(s) || s.startsWith('html.ba-hidden[data-ui="ba"]');
  const bad = selectors.filter(s => !allowed(s) && !/^(from|to|\d+%)$/.test(s));
  assert.deepEqual(bad, []);
  assert.match(css, /\.ba-deco, \.ba-switch, \.ba-chibi-wrap, \.ba-tap \{ display: none; \}/, 'pack nodes must be inert outside data-ui="ba"');
});

test('assets are local, complete for all five students, and within budget', () => {
  assert.doesNotMatch(css, /url\((["']?)https?:/);
  assert.doesNotMatch(js, /https?:\/\/(?!www\.w3\.org)/);
  for (const m of css.matchAll(/url\((?!["']?data:)["']?([^)"'?]+)/g)) assert.ok(existsSync('assets/ba/' + m[1]), 'missing ' + m[1]);
  for (const n of NAMES) {
    for (const f of ['portrait.webp', 'chibi.webp', 'avatar.webp', 'halo.svg']) {
      assert.ok(existsSync(`assets/ba/img/${n}/${f}`), `missing img/${n}/${f}`);
      assert.match(css, new RegExp(`img/${n}/${f.replace('.', '\\.')}`), `${n}/${f} not referenced`);
    }
    assert.match(css, new RegExp(`html\\[data-ui="ba"\\]\\[data-ba="${n}"\\][^{]*\\{[^}]*--ba-p:`), `${n} palette tokens missing`);
    assert.match(css, new RegExp(`data-ba="${n}"\\]\\[data-ba-night\\]`), `${n} night tokens missing`);
  }
  const files = d => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(`${d}/${e.name}`) : [`${d}/${e.name}`]);
  const total = ['assets/ba/img', 'assets/ba/fonts'].flatMap(files).map(f => statSync(f).size).reduce((a, b) => a + b, 0);
  assert.ok(total < 4.5 * 1024 * 1024, `pack assets ${total} bytes`);
  assert.ok(existsSync('assets/ba/fonts/LICENSE-OFL.txt'));
});

test('runtime never rewrites ids, data hooks or listeners of the app', () => {
  assert.doesNotMatch(js, /\.id\s*=|removeAttribute\("(id|name|for|data-(?!ba-))/);
  assert.doesNotMatch(js, /\.remove\(\)/, 'the runtime only removes its own tap sparks, via removeChild');
  assert.doesNotMatch(js, /\binnerHTML\s*=\s*[^"'\n]*\b(t|text|label|line)\b/, 'user-facing strings go through textContent');
  assert.match(js, /aria-hidden/);
  assert.doesNotMatch(js, /\beval\(|new Function|setTimeout\(\s*["']/);
});

test('second-level switch: radiogroup, keyboard, persistence and public API', () => {
  assert.match(js, /role", "radiogroup"/);
  assert.match(js, /ArrowRight[\s\S]*ArrowLeft[\s\S]*Home[\s\S]*End/);
  assert.match(js, /"postprep-ba"/);
  assert.match(js, /window\.PostPrepBA\s*=/);
  assert.match(js, /set:\s*function/);
  for (const n of NAMES) assert.match(css, new RegExp(`\\[data-ba="${n}"\\](\\.v3s\\.v3s)? \\.ba-set\\[data-set="${n}"\\]`), `${n} decor set`);
  for (const n of NAMES) assert.match(css, new RegExp(`\\[data-ba="${n}"\\]\\.v3s\\.v3s #v3-studio \\{`), `${n} RVC console`);
});

test('decor is inert and motion is governed', () => {
  assert.match(css, /\.ba-deco\.v3s\.v3s|\.v3s\.v3s \.ba-deco \{ display: block; pointer-events: none; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /html\.ba-hidden\[data-ui="ba"\] \*/);
  assert.match(js, /prefers-reduced-motion/);
});
