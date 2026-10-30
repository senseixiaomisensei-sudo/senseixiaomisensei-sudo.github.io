// PostPrep v3 · WebGL lens for one glass control (the studio transport bar).
// The canvas is exactly the control's box (DPR ≤ 2, ≤ 1.5 on touch), it samples only the
// strip of the source canvas under the control, renders only while something moves
// (playback, A/B drag, pointer over the scope) and stops when off screen or hidden.
// Loaded on first interaction; falls back silently to the CSS glass.
import { addTask } from './motion.js';

const VS = 'attribute vec2 a;varying vec2 v;void main(){v=a*.5+.5;v.y=1.-v.y;gl_Position=vec4(a,0.,1.);}';
const FS = `precision mediump float;
uniform sampler2D T;uniform vec2 R;uniform vec2 M;uniform vec2 P;uniform float RAD;uniform float TH;varying vec2 v;
float sd(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
vec4 tap(vec2 q){vec2 uv=(q+M)/(R+2.*M);return texture2D(T,uv);}
void main(){
  vec2 p=v*R,c=R*.5;float d=sd(p-c,c,RAD);
  float aa=clamp(.5-d,0.,1.);if(aa<=0.)discard;
  vec2 n=normalize(vec2(sd(p-c+vec2(1,0),c,RAD)-sd(p-c-vec2(1,0),c,RAD),sd(p-c+vec2(0,1),c,RAD)-sd(p-c-vec2(0,1),c,RAD))+1e-5);
  float k=pow(clamp(1.+d/TH,0.,1.),2.2);
  vec2 q=c+(p-c)*.9-n*k*TH*.85;
  vec2 ca=n*k*1.4;
  vec4 s=vec4(0.);
  s+=tap(q)*.4;s+=tap(q+vec2(1.6,0.))*.15;s+=tap(q-vec2(1.6,0.))*.15;s+=tap(q+vec2(0.,1.6))*.15;s+=tap(q-vec2(0.,1.6))*.15;
  float r=tap(q+ca).r,b=tap(q-ca).b;
  vec3 well=vec3(.078,.078,.09);
  vec3 col=mix(well,vec3(mix(s.r,r,.6),s.g,mix(s.b,b,.6)),clamp(s.a,0.,1.));
  col=col*.82+vec3(.17,.17,.19)*.32;
  float rim=smoothstep(-1.6,0.,d)*(.22+.5*max(0.,dot(n,normalize(vec2(-.35,-1.)))));
  float glow=P.x<0.?0.:exp(-length(p-P)/70.)*.07;
  gl_FragColor=vec4((col+rim+glow)*aa,aa);
}`;

export function attachLens(bar, source, active) {
  if (bar.querySelector('canvas.v3-lens-cv')) return null;
  const forced = document.documentElement.dataset.gfxForced === '1';
  const cv = document.createElement('canvas'); cv.className = 'v3-lens-cv'; cv.setAttribute('aria-hidden', 'true');
  const gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power' });
  if (!gl) return null;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '';
  if (!forced && /SwiftShader|llvmpipe|software|Basic Render/i.test(name)) return null;
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
  gl.useProgram(pr);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v);
  const U = n => gl.getUniformLocation(pr, n);
  const uR = U('R'), uM = U('M'), uP = U('P'), uRad = U('RAD'), uTh = U('TH');
  const strip = document.createElement('canvas'), sg = strip.getContext('2d');
  const touch = matchMedia('(pointer: coarse)').matches;
  const dprCap = () => Math.min(touch ? 1.5 : 2, devicePixelRatio || 1);
  const MARGIN = 24;
  let visible = true, until = 0, ptr = [-1, -1], lost = false;
  bar.prepend(cv); bar.classList.add('has-gl');
  cv.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; cv.remove(); bar.classList.remove('has-gl'); });

  function frame() {
    if (lost) return false;
    const br = bar.getBoundingClientRect(), sr = source.getBoundingClientRect();
    const k = dprCap(), w = Math.max(1, Math.round(br.width * k)), h = Math.max(1, Math.round(br.height * k));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    // copy only the strip of the source under the bar (+ margin for the bent rim)
    const sx = source.width / Math.max(1, sr.width), sy = source.height / Math.max(1, sr.height);
    const sw = Math.round((br.width + 2 * MARGIN) * k), shh = Math.round((br.height + 2 * MARGIN) * k);
    if (strip.width !== sw || strip.height !== shh) { strip.width = sw; strip.height = shh; }
    sg.clearRect(0, 0, sw, shh);
    sg.drawImage(source, (br.left - sr.left - MARGIN) * sx, (br.top - sr.top - MARGIN) * sy, (br.width + 2 * MARGIN) * sx, (br.height + 2 * MARGIN) * sy, 0, 0, sw, shh);
    gl.viewport(0, 0, w, h);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, strip);
    gl.uniform2f(uR, br.width, br.height); gl.uniform2f(uM, MARGIN, MARGIN); gl.uniform2f(uP, ptr[0], ptr[1]);
    gl.uniform1f(uRad, Math.min(br.height / 2, parseFloat(getComputedStyle(bar).borderTopLeftRadius) || 22)); gl.uniform1f(uTh, Math.min(br.height * .45, 16));
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return visible && !document.hidden && (active() || performance.now() < until);
  }
  const kick = (ms = 400) => { until = Math.max(until, performance.now() + ms); addTask(frame); };
  const host = source.parentElement;
  host.addEventListener('pointermove', e => { const r = bar.getBoundingClientRect(); ptr = [e.clientX - r.left, e.clientY - r.top]; kick(250); }, { passive: true });
  host.addEventListener('pointerleave', () => { ptr = [-1, -1]; kick(100); });
  document.addEventListener('play', () => kick(), true);
  source.addEventListener('v3-drawn', () => { if (!active()) kick(40); });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(100); }).observe(bar);
  new ResizeObserver(() => kick(100)).observe(host);
  kick(600);
  return { frame, kick };
}
