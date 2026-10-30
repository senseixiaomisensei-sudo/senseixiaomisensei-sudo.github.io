// PostPrep v3 · Liquid Glass renderer
// One fixed WebGL canvas paints the living background (aurora, waveform ribbons,
// dot lattice) and every registered glass surface as a refractive lens over it:
// smooth-union SDF shapes (surfaces melt together when close), bezel refraction,
// RGB dispersion, frost, pointer-lit specular rims and a contact shadow.
// The DOM keeps text, borders and hit-testing; this canvas only adds optics.
//
// Performance contract:
//  - one draw call per frame, no readbacks, no layout reads inside the frame
//    (lens rects are cached document coordinates; scroll offset is applied here)
//  - lenses that scroll with the page fade out while the page is scrolling and
//    rendering pauses entirely once they are gone; viewport-fixed lenses keep going
//  - dynamic resolution: the backing store shrinks when frames run long
//  - idle (nothing moving, no pointer) drops the aurora to 30 fps; hidden tab stops

const MAX_LENS = 12;

const VERT = `attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}`;

const FRAG = `
precision highp float;
uniform vec2 uRes;      // css px
uniform float uPx;      // device px per css px of the backing store
uniform float uTime;
uniform vec2 uPointer;  // css px
uniform float uScrollY; // css px (parallax)
uniform int uCount;
uniform vec4 uL0[${MAX_LENS}]; // center.xy, half.wh (css px, viewport space)
uniform vec4 uL1[${MAX_LENS}]; // radius, angle, alpha, strength
uniform vec4 uBlob[4];          // x,y,r,intensity
uniform vec3 uBlobC[4];
uniform float uAudio[8];
uniform float uWave;    // waveform ribbon visibility
uniform float uMotion;  // 0 when reduced motion

float sdRound(vec2 p, vec2 b, float r){
  r = min(r, min(b.x, b.y));
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r;
}
float smin(float a, float b, float k){
  float h = clamp(.5 + .5 * (b - a) / k, 0., 1.);
  return mix(b, a, h) - k * h * (1. - h);
}
// union of every lens; also returns the alpha/strength of the dominant lens
vec3 field(vec2 p){
  float d = 1e5; float al = 0.; float st = 0.;
  for (int i = 0; i < ${MAX_LENS}; i++){
    if (i >= uCount) break;
    vec4 a = uL0[i]; vec4 b = uL1[i];
    vec2 q = p - a.xy;
    float c = cos(b.y), s = sin(b.y);
    q = vec2(c * q.x + s * q.y, -s * q.x + c * q.y);
    float di = sdRound(q, a.zw, b.x);
    // fading lenses shrink slightly into their surface instead of popping
    di += (1. - b.z) * 18.;
    float k = 22.;
    float h = clamp(.5 + .5 * (d - di) / k, 0., 1.);
    al = mix(al, b.z, h); st = mix(st, b.w, h);
    d = smin(d, di, k);
  }
  return vec3(d, al, st);
}
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

vec3 scene(vec2 p, float blur){
  vec2 uv = p / uRes;
  vec3 col = mix(vec3(.018, .027, .055), vec3(.028, .045, .085), uv.y);
  // no scroll parallax: rendering pauses while scrolling, so the backdrop must not depend on it
  vec2 pp = p;
  for (int i = 0; i < 4; i++){
    vec4 b = uBlob[i];
    vec2 dv = (pp - b.xy) / b.z;
    col += uBlobC[i] * exp(-dot(dv, dv) * 1.6) * b.w;
  }
  // waveform ribbons (an audio trace that runs behind the glass)
  if (uWave > .001){
    float y0 = uRes.y * .84;
    for (int k = 0; k < 3; k++){
      float fk = float(k);
      float amp = 0.;
      for (int j = 0; j < 8; j++){
        float fj = float(j);
        amp += uAudio[j] * sin(p.x * (.004 + fj * .0021) + uTime * (.6 + fj * .23) * uMotion + fk * 1.7 + fj);
      }
      float y = y0 + fk * 22. + amp * (26. + fk * 8.) * exp(-pow((p.x / uRes.x - .5) * 1.8, 2.));
      float w = 1.1 + blur * 1.5 + fk * .4;
      float line = smoothstep(w + 1.2, 0., abs(p.y - y));
      float glow = exp(-abs(p.y - y) / (10. + blur * 4.)) * .22;
      vec3 c = k == 0 ? vec3(.45, 1., .9) : (k == 1 ? vec3(.62, .55, 1.) : vec3(1., .55, .45));
      col += c * (line * .55 + glow) * uWave * (1. - fk * .25);
    }
  }
  // dot lattice; frost softens it analytically
  vec2 g = fract((pp + vec2(13.)) / 28.) - .5;
  float dd = length(g) * 28.;
  float lum = dot(col, vec3(.33));
  col += vec3(.75, .85, 1.) * smoothstep(1.3 + blur, .3, dd) * (.05 + lum * .55) / (1. + blur * .6);
  return col;
}

void main(){
  vec2 p = vec2(gl_FragCoord.x, uRes.y * uPx - gl_FragCoord.y) / uPx;
  vec3 f = field(p);
  float d = f.x;
  vec3 col;
  if (d > 46. || f.y < .002){
    col = scene(p, 0.);
  } else {
    vec3 bg = scene(p, 0.);
    // outward normal of the union surface
    float e = 1.;
    vec2 n = vec2(field(p + vec2(e, 0.)).x - field(p - vec2(e, 0.)).x,
                  field(p + vec2(0., e)).x - field(p - vec2(0., e)).x);
    n = n / max(length(n), 1e-4);
    // contact shadow below the slab
    float ds = field(p - vec2(0., 10.)).x;
    vec3 outside = bg * (1. - .42 * f.y * smoothstep(30., -6., ds) * step(0., d));
    if (d < 0.){
      float bez = 26.;
      float t = clamp(-d / bez, 0., 1.);
      float m = pow(1. - t, 2.4) * f.z;           // bezel refraction
      vec2 lensOff = -n * m;
      vec2 mag = (p - uRes * .5) * .0; // flat centre
      float disp = .16 + .5 * (1. - t);
      vec3 r;
      r.r = scene(p + lensOff * (1. + disp), 1.6).r;
      r.g = scene(p + lensOff, 1.6).g;
      r.b = scene(p + lensOff * (1. - disp), 1.6).b;
      r = r * 1.07 + .028;                          // glass lift
      r += vec3(.9, .97, 1.) * .05 * (1. - p.y / uRes.y); // sky reflection
      // specular rim lit from the pointer
      vec2 L = normalize(uPointer - p + vec2(1e-3));
      float facing = dot(n, L);
      float rim = smoothstep(2.2, 0., abs(d + 1.1));
      float inner = exp(d / 7.) * .5;
      r += vec3(1.) * rim * (.22 + .78 * max(facing, 0.)) * .85;
      r += vec3(1.) * rim * max(-facing, 0.) * .22;  // back-face rim
      r += vec3(.8, .95, 1.) * inner * max(facing, 0.) * .18;
      col = mix(outside, r, f.y);
    } else {
      // outer halo where the slab meets the backdrop
      float halo = exp(-d / 3.) * .1 * f.y;
      col = outside + halo;
    }
  }
  // grain + vignette (outside refraction so it stays crisp)
  vec2 uv = p / uRes;
  col *= 1. - .35 * pow(length(uv - .5) * 1.15, 2.4);
  col += (hash(p + fract(uTime) * 91.) - .5) * .018;
  gl_FragColor = vec4(pow(max(col, 0.), vec3(.95)), 1.);
}`;

export class GlassRenderer {
  constructor({ reducedMotion = false, onLost, force = false } = {}) {
    this.reduced = reducedMotion; this.force = force;
    this.onLost = onLost;
    this.lenses = new Set();
    this.pointer = { x: innerWidth * .72, y: innerHeight * .22, tx: innerWidth * .72, ty: innerHeight * .22, active: false };
    this.scale = Math.min(devicePixelRatio || 1, 2) * .62;
    this.minScale = .38;
    this.maxScale = Math.min(devicePixelRatio || 1, 2) * .8;
    this.time = Math.random() * 40;
    this.audio = new Float32Array(8);
    this.wave = 1;
    this.scrolling = false;
    this.dirty = true;
    this.frameTimes = [];
    this.lastFrame = 0;
    this.skip = 0;
    this.blobs = [
      { x: .18, y: .2, r: .55, i: .55, c: [.05, .55, .5], sx: .11, sy: .07, ph: 0 },
      { x: .82, y: .18, r: .5, i: .5, c: [.38, .22, .85], sx: .08, sy: .1, ph: 1.7 },
      { x: .7, y: .85, r: .6, i: .38, c: [.85, .32, .26], sx: .09, sy: .06, ph: 3.1 },
      { x: .25, y: .9, r: .5, i: .32, c: [.1, .35, .9], sx: .07, sy: .09, ph: 4.4 },
    ];
  }

  init(canvas) {
    this.canvas = canvas;
    const opts = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance', desynchronized: true };
    const gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
    if (!gl) return false;
    // software rasterisers cannot afford a full-screen shader: use the CSS tier
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const name = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    this.gpu = name;
    if (!this.force && /swiftshader|llvmpipe|software|basic render/i.test(name)) return false;
    this.gl = gl;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('[v3 glass]', gl.getShaderInfoLog(s)); return null; } return s; };
    const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return false;
    gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = n => gl.getUniformLocation(pr, n);
    this.u = { res: u('uRes'), px: u('uPx'), time: u('uTime'), pointer: u('uPointer'), scroll: u('uScrollY'), count: u('uCount'), l0: u('uL0'), l1: u('uL1'), blob: u('uBlob'), blobC: u('uBlobC'), audio: u('uAudio'), wave: u('uWave'), motion: u('uMotion') };
    this.l0 = new Float32Array(MAX_LENS * 4); this.l1 = new Float32Array(MAX_LENS * 4);
    this.blobBuf = new Float32Array(16); this.blobCBuf = new Float32Array(12);
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; this.onLost?.(); });
    this.resize();
    return true;
  }

  resize() {
    if (!this.gl) return;
    this.vw = innerWidth; this.vh = innerHeight;
    const w = Math.max(1, Math.round(this.vw * this.scale)), h = Math.max(1, Math.round(this.vh * this.scale));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    // size the element to the same viewport the shader uses (mobile URL bars change innerHeight)
    this.canvas.style.width = this.vw + 'px'; this.canvas.style.height = this.vh + 'px';
    this.gl.viewport(0, 0, w, h);
    this.dirty = true;
  }

  add(lens) { this.lenses.add(lens); this.dirty = true; }
  remove(lens) { this.lenses.delete(lens); this.dirty = true; }

  setScrolling(on) { if (this.scrolling !== on) { this.scrolling = on; this.dirty = true; } }

  // Returns true if another frame is wanted.
  frame(now, dt, scrollY) {
    if (!this.gl || this.lost) return false;
    // adaptive resolution from frame pacing
    if (this.lastFrame) {
      const ft = now - this.lastFrame;
      this.frameTimes.push(ft);
      if (this.frameTimes.length >= 40) {
        const s = this.frameTimes.slice().sort((a, b) => a - b), p80 = s[Math.floor(s.length * .8)];
        const budget = (this.refresh || 16.7) * 1.25;
        if (p80 > budget && this.scale > this.minScale) { this.scale = Math.max(this.minScale, this.scale * .85); this.resize(); }
        else if (p80 < (this.refresh || 16.7) * 1.05 && this.scale < this.maxScale) { this.scale = Math.min(this.maxScale, this.scale * 1.05); this.resize(); }
        this.frameTimes.length = 0;
      }
    }
    this.lastFrame = now;
    const k = 1 - Math.exp(-dt / 70);
    // pointer easing (light direction)
    const P = this.pointer;
    P.x += (P.tx - P.x) * (1 - Math.exp(-dt / 90)); P.y += (P.ty - P.y) * (1 - Math.exp(-dt / 90));
    let moving = Math.abs(P.tx - P.x) + Math.abs(P.ty - P.y) > .5;
    // lens state
    let n = 0, wantScrollRender = false;
    for (const L of this.lenses) {
      const target = (!L.fixed && this.scrolling) ? 0 : (L.visible ? L.targetAlpha : 0);
      const speed = target < L.alpha && this.scrolling ? 1 - Math.exp(-dt / 28) : k;
      L.alpha += (target - L.alpha) * speed;
      if (Math.abs(target - L.alpha) < .004) L.alpha = target; else moving = true;
      if (L.fixed && L.visible) wantScrollRender = true;
      if (L.alpha <= 0.001 || n >= MAX_LENS) continue;
      const r = L.rect(scrollY);
      if (!r || r.y + r.h < -60 || r.y > this.vh + 60 || r.w < 2) continue;
      const o = n * 4;
      this.l0[o] = r.x + r.w / 2; this.l0[o + 1] = r.y + r.h / 2; this.l0[o + 2] = r.w / 2; this.l0[o + 3] = r.h / 2;
      this.l1[o] = r.radius; this.l1[o + 1] = r.angle || 0; this.l1[o + 2] = L.alpha; this.l1[o + 3] = L.strength;
      if (L.animating) moving = true;
      n++;
    }
    // while the page scrolls and only scrolling lenses exist, stop painting once they have faded
    const fadingDone = this.scrolling && !moving && !wantScrollRender;
    if (fadingDone && !this.dirty) return false;
    const animateBg = !this.reduced;
    const idle = !moving && !P.active && !this.dirty;
    if (idle && animateBg && (this.skip++ & 1)) return true; // 30 fps idle aurora
    if (animateBg) this.time += dt / 1000;
    const gl = this.gl, u = this.u;
    gl.uniform2f(u.res, this.vw, this.vh);
    gl.uniform1f(u.px, this.canvas.width / this.vw);
    gl.uniform1f(u.time, this.time);
    gl.uniform2f(u.pointer, P.x, P.y);
    gl.uniform1f(u.scroll, scrollY);
    gl.uniform1i(u.count, n);
    gl.uniform4fv(u.l0, this.l0); gl.uniform4fv(u.l1, this.l1);
    const t = this.time;
    this.blobs.forEach((b, i) => {
      this.blobBuf[i * 4] = (b.x + Math.sin(t * b.sx + b.ph) * .12) * this.vw;
      this.blobBuf[i * 4 + 1] = (b.y + Math.cos(t * b.sy + b.ph) * .1) * this.vh;
      this.blobBuf[i * 4 + 2] = b.r * Math.max(this.vw, this.vh) * .75;
      this.blobBuf[i * 4 + 3] = b.i;
      this.blobCBuf.set(b.c, i * 3);
    });
    gl.uniform4fv(u.blob, this.blobBuf); gl.uniform3fv(u.blobC, this.blobCBuf);
    gl.uniform1fv(u.audio, this.audio);
    gl.uniform1f(u.wave, this.wave);
    gl.uniform1f(u.motion, this.reduced ? 0 : 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.dirty = false;
    if (this.reduced) return moving;
    return true;
  }
}

// A DOM element that the renderer paints as glass.
export class Lens {
  constructor(el, { fixed = false, strength = 22, radius } = {}) {
    this.el = el; this.fixed = fixed; this.strength = strength; this.radiusOverride = radius;
    this.alpha = 0; this.targetAlpha = 1; this.visible = true; this.animating = false;
    this.doc = null; this.transform = null; // {x,y,angle,sx,sy}
    this.measure();
  }
  measure() {
    const r = this.el.getBoundingClientRect();
    const sy = this.fixed ? 0 : scrollY;
    const cs = getComputedStyle(this.el);
    this.radius = this.radiusOverride ?? (parseFloat(cs.borderTopLeftRadius) || 0);
    // JS-driven (transformed) surfaces report their untransformed box via setLayout.
    if (this.managed) return;
    if (this.canMeasure && !this.canMeasure()) return;
    this.doc = { x: r.left, y: r.top + sy, w: r.width, h: r.height };
  }
  setLayout(x, y, w, h) { this.doc = { x, y: y + (this.fixed ? 0 : scrollY), w, h }; this.baseW = w; this.baseH = h; }
  rect(scrollY) {
    const d = this.doc; if (!d) return null;
    const t = this.transform;
    let x = d.x, y = d.y - (this.fixed ? 0 : scrollY), w = d.w, h = d.h, angle = 0, radius = this.radius;
    if (t) {
      const cx = x + w / 2 + t.x, cy = y + h / 2 + t.y;
      w *= t.sx ?? 1; h *= t.sy ?? 1; radius *= Math.min(t.sx ?? 1, t.sy ?? 1);
      x = cx - w / 2; y = cy - h / 2; angle = t.angle || 0;
    }
    return { x, y, w, h, radius, angle };
  }
}
