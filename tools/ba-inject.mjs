// PostPrep · Blue Archive theme pack — head injector.
//   node tools/ba-inject.mjs            add / refresh the <!-- ba:head --> block (idempotent)
//   node tools/ba-inject.mjs --remove   remove the block from every page (and undo the rococo label patch)
//   node tools/ba-inject.mjs --check    exit 1 if any page is missing the block
// Only the 11 top-level pages are touched; hoshino/ and community/ are never modified.
// The block goes right before </head>, i.e. after liquid-ui.js, the v3 block and the rococo block.
// Theme labels and cycling are handled by assets/liquid-ui.js.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VER = '20261106-ba2';
const PAGES = ['index.html', 'caption-formatter.html', 'hashtag-cleaner.html', 'idea-generator.html',
  'length-checker.html', 'publish-trust.html', 'skills.html', 'skill-passport.html', 'rvc.html',
  'privacy.html', '404.html'];
const mode = process.argv.includes('--remove') ? 'remove' : process.argv.includes('--check') ? 'check' : 'add';
const RE = /\n?[ \t]*<!-- ba:head -->[\s\S]*?<!-- \/ba:head -->/g;
const blockFor = pre => `  <!-- ba:head -->
  <link rel="stylesheet" href="${pre}assets/ba/ba.css?v=${VER}">
  <script src="${pre}assets/ba/ba.js?v=${VER}"></script>
  <!-- /ba:head -->`;

let missing = 0;
for (const name of PAGES) {
  const file = join(root, name);
  if (!existsSync(file)) { console.warn('missing page:', name); if (mode === 'check') missing++; continue; }
  const before = readFileSync(file, 'utf8');
  if (mode === 'check') {
    const blocks = before.match(RE) || [];
    const rococo = before.indexOf('<!-- /rococo:head -->');
    if (blocks.length !== 1 || (rococo !== -1 && before.indexOf('<!-- ba:head -->') < rococo)) { missing++; console.log('missing, duplicate, or incorrectly ordered →', name); }
    continue;
  }
  let src = before.replace(RE, '');
  if (mode === 'add') {
    if (!src.includes('</head>')) { console.warn('no </head> in', name); continue; }
    src = src.replace('</head>', `${blockFor(name === '404.html' ? '/' : '')}\n</head>`);
  }
  if (src !== before) writeFileSync(file, src);
  console.log(`ba ${mode === 'add' ? 'head →' : 'removed ←'}`, name, src === before ? '(unchanged)' : '');
}

if (mode === 'check') {
  console.log(missing ? `${missing} page(s) missing` : 'all pages carry the ba block');
  process.exit(missing ? 1 : 0);
}
