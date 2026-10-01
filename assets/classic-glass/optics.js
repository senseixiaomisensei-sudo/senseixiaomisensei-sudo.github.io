/* Adapted from the user-provided QQ page. Edge refraction only; UI2 is untouched. */
(() => {
/* MIT License

Copyright (c) 2026 ccl125

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.



MIT License

Copyright (c) 2026 Mohammadreza Khosravivala

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

 */
/* Edge-only displacement map; neutral center. Adapted for ccl125/liquid-glass (MIT). */
const liquidGlassMap =
  "data:image/png;base64,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";


/** Default SVG filter id referenced by liquid-glass.css. */
const DEFAULT_FILTER_ID = 'liquid-glass';

const CHANNEL_MATRIX = {
  r: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
  g: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
  b: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',
};

function buildFilterSvg({ id, scales, saturate }) {
  const [sr, sg, sb] = scales;
  return (
    `<svg aria-hidden="true" style="position:absolute;width:0;height:0;pointer-events:none">` +
    `<defs>` +
    `<filter id="${id}" colorInterpolationFilters="sRGB" x="-20%" y="-80%" width="140%" height="260%">` +
    `<feImage result="map" preserveAspectRatio="none" href="${liquidGlassMap}"/>` +
    // Chromatic dispersion: displace the same map 3 times with slightly
    // different scales, isolate one RGB channel each, then screen-blend.
    `<feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="B" result="dispRed" scale="${sr}"/>` +
    `<feColorMatrix in="dispRed" type="matrix" values="${CHANNEL_MATRIX.r}" result="red"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="B" result="dispGreen" scale="${sg}"/>` +
    `<feColorMatrix in="dispGreen" type="matrix" values="${CHANNEL_MATRIX.g}" result="green"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="B" result="dispBlue" scale="${sb}"/>` +
    `<feColorMatrix in="dispBlue" type="matrix" values="${CHANNEL_MATRIX.b}" result="blue"/>` +
    `<feBlend in="red" in2="green" mode="screen" result="rg"/>` +
    `<feBlend in="rg" in2="blue" mode="screen"/>` +
    `<feColorMatrix type="saturate" values="${saturate}"/>` +
    `</filter>` +
    `</defs>` +
    `</svg>`
  );
}

/**
 * Inject the hidden SVG that defines the liquid glass displacement filter
 * into document.body. Idempotent: if an element with the same id already
 * exists, nothing is added.
 *
 * DOM access happens inside this function only, so importing this module
 * is safe in non-browser environments (SSR, Node).
 *
 * @param {object} [options]
 * @param {string} [options.id='liquid-glass'] Filter id. Must match the id
 *   referenced by your CSS `backdrop-filter: url("#...")`.
 * @param {[number, number, number]} [options.scales=[-127,-124,-121]]
 *   feDisplacementMap scales for the R/G/B passes. Larger absolute values
 *   refract more; the spread between them controls chromatic dispersion.
 *   The default spread (6) keeps text legible; raise it for a stronger
 *   prism look at the cost of RGB ghosting on text.
 * @param {number} [options.saturate=1.35] Final saturation boost.
 * @returns {() => void} cleanup function that removes the injected SVG.
 *   If the filter already existed (injected elsewhere), cleanup is a no-op.
 */
function injectLiquidGlassFilter({
  id = DEFAULT_FILTER_ID,
  scales = [-127, -124, -121],
  saturate = 1.35,
} = {}) {
  if (typeof document === 'undefined' || !document.body) {
    return () => {};
  }
  if (document.getElementById(id)) {
    return () => {};
  }
  const host = document.createElement('div');
  host.style.display = 'contents';
  host.innerHTML = buildFilterSvg({ id, scales, saturate });
  document.body.appendChild(host);
  return () => {
    host.remove();
  };
}

/**
 * Update an already-injected liquid glass filter in place — useful for live
 * controls. Only the options you pass are updated.
 *
 * DOM access happens inside this function only.
 *
 * @param {object} [options]
 * @param {string} [options.id='liquid-glass'] Filter id to look up.
 * @param {[number, number, number]} [options.scales] New R/G/B displacement
 *   scales, applied to the three feDisplacementMap primitives in order.
 * @param {number} [options.saturate] New value for the trailing
 *   feColorMatrix[type="saturate"] primitive.
 * @returns {boolean} false if no filter with that id exists, true on success.
 */
function updateLiquidGlassFilter({ id = DEFAULT_FILTER_ID, scales, saturate } = {}) {
  if (typeof document === 'undefined') {
    return false;
  }
  const filter = document.getElementById(id);
  if (!filter) {
    return false;
  }
  if (scales) {
    const primitives = filter.querySelectorAll('feDisplacementMap');
    primitives.forEach((el, i) => {
      if (i < scales.length) el.setAttribute('scale', String(scales[i]));
    });
  }
  if (saturate !== undefined) {
    const el = filter.querySelector('feColorMatrix[type="saturate"]');
    if (el) el.setAttribute('values', String(saturate));
  }
  return true;
}



injectLiquidGlassFilter({id:'classic-refraction', scales:[-42,-40,-38], saturate:1.15});
})();
