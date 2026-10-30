// Builds assets/v3/v3.css = a neutral remap of every Tailwind colour utility the pages use
// (light "paper" by default, OLED black under prefers-color-scheme: dark)
// + the hand-written sources (assets/v3/src/*.css, in name order).
// Runs as part of `npm run build:styles`, after Tailwind, so the remap tracks new utilities.
//
// Colour policy (docs/frontend-v3-direction.md §3): one accent only. Neutral colours become
// the paper/ink tokens; the brand teal becomes the accent; status hues (red / amber / green)
// survive because they describe content, everything else is desaturated toward neutral.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tw = readFileSync(join(root, 'assets/postprep-tailwind.css'), 'utf8');
// v3 skin applies in the default UI; the home and 404 pages exist only in v3,
// so they keep the skin even when the visitor chose the paper (classic) UI elsewhere.
const P = 'html.v3s.v3s'; // .v3s is kept in sync by the inline boot script (see tools/v3-inject.mjs)

function parseColor(v) {
  let m = v.match(/rgb\((\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+|var\([^)]*\)))?\)/);
  if (m) { const a = m[4] && !m[4].startsWith('var') ? +m[4] : 1; return [+m[1], +m[2], +m[3], a]; }
  m = v.match(/#([0-9a-f]{3,8})\b/i);
  if (m) { let h = m[1]; if (h.length <= 4) h = [...h].map(c => c + c).join(''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1]; }
  return null;
}
function hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return { h, s, l };
}
// hue families
const family = h => (h >= 150 && h < 200) ? 'accent' : (h < 20 || h >= 335) ? 'bad' : (h >= 20 && h < 55) ? 'warn' : (h >= 80 && h < 150) ? 'ok' : (h >= 200 && h < 260) ? 'accent' : 'neutral';
const tint = (fam, a) => fam === 'neutral' ? `rgb(var(--v3-ink-rgb) / ${a})` : `rgb(var(--v3-${fam}-rgb) / ${a})`;

function mapColor(prop, c, dark) {
  const { h, s, l } = hsl(c); const a = c[3]; const chroma = s > .18 && l > .06 && l < .97; const fam = chroma ? family(h) : 'neutral';
  if (prop === 'background-color' || prop.startsWith('--tw-gradient')) {
    if (!chroma) {
      if (l > .9) return a < 1 ? `rgb(var(--v3-paper-rgb) / ${a})` : 'var(--v3-paper)';
      if (l > .8) return 'var(--v3-well)';
      if (l < .3) return a < 1 ? `rgb(var(--v3-ink-rgb) / ${a})` : 'var(--v3-ink)';
      return 'var(--v3-well)';
    }
    if (l > .8) return tint(fam, dark ? .16 : .09); // soft status / brand washes
    if (fam === 'neutral') return 'var(--v3-ink)';
    return `var(--v3-${fam})`; // solid fills (buttons, bars)
  }
  if (prop === 'color' || prop === 'fill' || prop === 'stroke' || prop === '--tw-text-opacity') {
    if (!chroma) { if (l > .85) return dark ? null : null; return l < .3 ? 'var(--v3-ink)' : 'var(--v3-ink-2)'; }
    if (l > .85) return null; // light text on solid fills stays light
    return fam === 'neutral' ? 'var(--v3-ink-2)' : `var(--v3-${fam}-ink)`;
  }
  if (prop.includes('border') || prop === 'outline-color' || prop === '--tw-ring-color' || prop === 'text-decoration-color' || prop === 'caret-color' || prop === 'accent-color') {
    if (!chroma) return 'var(--v3-line)';
    if (prop === 'caret-color' || prop === 'accent-color') return 'var(--v3-accent)';
    return tint(fam, .4);
  }
  return null;
}

function remap(dark) {
  const out = [];
  const ruleRe = /([^{}@]+)\{([^{}]*)\}/g;
  // flatten @media wrappers: Tailwind minified nests responsive variants in @media
  const flat = tw.replace(/@media[^{]+\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g, (m, inner) => inner);
  let m;
  while ((m = ruleRe.exec(flat))) {
    const sel = m[1].trim(); const body = m[2];
    if (!sel.startsWith('.') || sel.includes('::-webkit') || sel.includes(',')) continue;
    if (/^\.(group|peer)/.test(sel)) continue;
    const decls = [];
    for (const d of body.split(';')) {
      const i = d.indexOf(':'); if (i < 0) continue;
      const prop = d.slice(0, i).trim(), val = d.slice(i + 1).trim();
      if (!/^(color|background-color|border(-[a-z]+)?-color|outline-color|fill|stroke|--tw-ring-color|text-decoration-color|caret-color|accent-color|--tw-gradient-(from|to|stops))$/.test(prop)) continue;
      if (prop === '--tw-gradient-stops') continue;
      const c = parseColor(val); if (!c) continue;
      const mapped = mapColor(prop, c, dark); if (!mapped) continue;
      // gradients collapse to a flat fill: no decorative gradients in v3
      if (prop === '--tw-gradient-from') decls.push(`--tw-gradient-from:${mapped} var(--tw-gradient-from-position);--tw-gradient-to:${mapped} var(--tw-gradient-to-position);--tw-gradient-stops:var(--tw-gradient-from),var(--tw-gradient-to)`);
      else if (prop === '--tw-gradient-to') decls.push(`--tw-gradient-to:${mapped} var(--tw-gradient-to-position)`);
      else decls.push(`${prop}:${mapped}`);
    }
    if (decls.length) out.push(`${P} ${sel}{${decls.join(';')}}`);
  }
  return out;
}
// Token-based mapping means the light and dark remaps are identical selectors resolving
// different custom properties; only washes differ, so emit the light set plus dark overrides.
const light = remap(false), dark = remap(true);
const darkOnly = dark.filter((r, i) => r !== light[i]);

const srcDir = join(root, 'assets/v3/src');
const parts = readdirSync(srcDir).filter(n => n.endsWith('.css')).sort().map(n => `/* ${n} */\n` + readFileSync(join(srcDir, n), 'utf8').replaceAll('$G', P));
// remap first so hand-written component rules (same specificity, later) win
const css = `/* PostPrep v3 · generated by tools/v3-build.mjs — edit the sources in assets/v3/src */\n${light.join('\n')}\n@media (prefers-color-scheme: dark){\n${darkOnly.join('\n')}\n}\n${parts.join('\n')}`;
const min = css.replace(/\/\*(?!\s*PostPrep)[\s\S]*?\*\//g, '').replace(/\n\s*\n/g, '\n').replace(/^\s+/gm, '');
writeFileSync(join(root, 'assets/v3/v3.css'), min);
console.log(`v3.css: ${light.length} remap rules (+${darkOnly.length} dark), ${parts.length} sources, ${(min.length / 1024).toFixed(1)} KB`);
