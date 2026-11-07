// PostPrep · Rococo theme pack — head injector.
//   node tools/rococo-inject.mjs            add / refresh the <!-- rococo:head --> block (idempotent)
//   node tools/rococo-inject.mjs --remove   remove the block from every page
//   node tools/rococo-inject.mjs --check    exit 1 if any page is missing the block
// Only the 11 top-level pages are touched; hoshino/ and community/ are never modified.
// The block goes right before </head>, i.e. after liquid-ui.js and the v3 block,
// so rococo.js can restore data-ui="rococo" before first paint.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VER = '20261107-apple1';
const PAGES = ['index.html', 'caption-formatter.html', 'hashtag-cleaner.html', 'idea-generator.html',
  'length-checker.html', 'publish-trust.html', 'skills.html', 'skill-passport.html', 'rvc.html',
  'privacy.html', '404.html'];
const mode = process.argv.includes('--remove') ? 'remove' : process.argv.includes('--check') ? 'check' : 'add';
const RE = /\n?[ \t]*<!-- rococo:head -->[\s\S]*?<!-- \/rococo:head -->/g;
const blockFor = pre => `  <!-- rococo:head -->
  <link rel="stylesheet" href="${pre}assets/rococo/rococo.css?v=${VER}">
  <script src="${pre}assets/rococo/rococo.js?v=${VER}"></script>
  <!-- /rococo:head -->`;

let missing = 0;
for (const name of PAGES) {
  const file = join(root, name);
  if (!existsSync(file)) { console.warn('missing page:', name); if (mode === 'check') missing++; continue; }
  const before = readFileSync(file, 'utf8');
  if (mode === 'check') {
    const blocks = before.match(RE) || [];
    const v3 = before.indexOf('<!-- /v3:head -->');
    if (blocks.length !== 1 || (v3 !== -1 && before.indexOf('<!-- rococo:head -->') < v3)) { missing++; console.log('missing, duplicate, or incorrectly ordered →', name); }
    continue;
  }
  let src = before.replace(RE, '');
  if (mode === 'add') {
    if (!src.includes('</head>')) { console.warn('no </head> in', name); continue; }
    src = src.includes('<!-- ba:head -->')
      ? src.replace(/(?=\s*<!-- ba:head -->)/, `\n${blockFor(name === '404.html' ? '/' : '')}`)
      : src.replace('</head>', `${blockFor(name === '404.html' ? '/' : '')}\n</head>`);
  }
  if (src !== before) writeFileSync(file, src);
  console.log(`rococo ${mode === 'add' ? 'head →' : 'removed ←'}`, name, src === before ? '(unchanged)' : '');
}
if (mode === 'check') { console.log(missing ? `${missing} page(s) missing` : 'all pages carry the rococo block'); process.exit(missing ? 1 : 0); }
