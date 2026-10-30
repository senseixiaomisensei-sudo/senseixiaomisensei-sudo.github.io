// Inserts / refreshes the PostPrep v3 head block in every top-level page.
// node tools/v3-inject.mjs   (idempotent; community/ and hoshino/ are never touched)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VER = '20261031-v3';
// Cheap capability guess only (no WebGL context here, so first paint is never blocked).
// v3.js verifies the GPU before turning the refraction canvas on.
const boot = `(function(){var d=document.documentElement,g='webgl';d.classList.add('v3');try{var f=(location.search.match(/[?&]gfx=(webgl|css|lite)/)||[])[1];if(f){sessionStorage.setItem('v3-gfx',f)}else{f=sessionStorage.getItem('v3-gfx')}var n=navigator,c=n.connection;if(f){g=f;d.dataset.gfxForced='1'}else if(matchMedia('(prefers-reduced-transparency: reduce)').matches||(c&&c.saveData)){g='lite'}else if((n.deviceMemory&&n.deviceMemory<4)||(n.hardwareConcurrency&&n.hardwareConcurrency<4)||!window.WebGLRenderingContext){g='css'}}catch(e){g='css'}d.dataset.gfx=g;if(matchMedia('(prefers-reduced-motion: reduce)').matches)d.dataset.motion='reduced'})();`;
const block = `<!-- v3:head -->
  <link rel="stylesheet" href="assets/v3/v3.css?v=${VER}">
  <link rel="modulepreload" href="assets/v3/motion.js">
  <link rel="modulepreload" href="assets/v3/glass.js">
  <script>${boot}</script>
  <script type="module" src="assets/v3/v3.js?v=${VER}"></script>
  <!-- /v3:head -->`;

for (const name of readdirSync(root).filter(n => n.endsWith('.html'))) {
  const file = join(root, name);
  let src = readFileSync(file, 'utf8');
  src = src.replace(/\s*<!-- v3:head -->[\s\S]*?<!-- \/v3:head -->/, '');
  src = src.replace(/<meta name="theme-color" content="[^"]*">/, '<meta name="theme-color" content="#070a14">');
  if (!/<meta name="color-scheme"/.test(src)) src = src.replace(/(<meta name="theme-color"[^>]*>)/, '$1\n  <meta name="color-scheme" content="dark">');
  src = src.replace('</head>', `  ${block}\n</head>`);
  writeFileSync(file, src);
  console.log('v3 head →', name);
}
