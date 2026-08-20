var $n = Object.defineProperty;
var Nu = Object.getOwnPropertyDescriptor;
var Lu = Object.getOwnPropertyNames;
var Wu = Object.prototype.hasOwnProperty;
var vn = ((e) => typeof require < "u" ? require : typeof Proxy < "u" ? new Proxy(e, { get: (t, n) => (typeof require < "u" ? require : t)[n] }) : e)(function(e) {
  if (typeof require < "u") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + e + '" is not supported');
});
var k = (e, t) => () => (e && (t = e(e = 0)), t);
var lt = (e, t) => {
  for (var n in t) $n(e, n, { get: t[n], enumerable: true });
}, Gu = (e, t, n, r) => {
  if (t && typeof t == "object" || typeof t == "function") for (let o of Lu(t)) !Wu.call(e, o) && o !== n && $n(e, o, { get: () => t[o], enumerable: !(r = Nu(t, o)) || r.enumerable });
  return e;
};
var xt = (e) => Gu($n({}, "__esModule", { value: true }), e);
var St, je, Ze, Hu, br, xn = k(() => {
  St = /* @__PURE__ */ new Map(), je = [], Ze = (e, t, n) => {
    if (t && typeof t.init == "function" && typeof t.createInferenceSessionHandler == "function") {
      let r = St.get(e);
      if (r === void 0) St.set(e, { backend: t, priority: n });
      else {
        if (r.priority > n) return;
        if (r.priority === n && r.backend !== t) throw new Error(`cannot register backend "${e}" using priority ${n}`);
      }
      if (n >= 0) {
        let o = je.indexOf(e);
        o !== -1 && je.splice(o, 1);
        for (let i = 0; i < je.length; i++) if (St.get(je[i]).priority <= n) {
          je.splice(i, 0, e);
          return;
        }
        je.push(e);
      }
      return;
    }
    throw new TypeError("not a valid backend");
  }, Hu = async (e) => {
    let t = St.get(e);
    if (!t) return "backend not found.";
    if (t.initialized) return t.backend;
    if (t.aborted) return t.error;
    {
      let n = !!t.initPromise;
      try {
        return n || (t.initPromise = t.backend.init(e)), await t.initPromise, t.initialized = true, t.backend;
      } catch (r) {
        return n || (t.error = `${r}`, t.aborted = true), t.error;
      } finally {
        delete t.initPromise;
      }
    }
  }, br = async (e) => {
    let t = e.executionProviders || [], n = t.map((u) => typeof u == "string" ? u : u.name), r = n.length === 0 ? je : n, o, i = [], s = /* @__PURE__ */ new Set();
    for (let u of r) {
      let d = await Hu(u);
      typeof d == "string" ? i.push({ name: u, err: d }) : (o || (o = d), o === d && s.add(u));
    }
    if (!o) throw new Error(`no available backend found. ERR: ${i.map((u) => `[${u.name}] ${u.err}`).join(", ")}`);
    for (let { name: u, err: d } of i) n.includes(u) && console.warn(`removing requested execution provider "${u}" from session options because it is not available: ${d}`);
    let a = t.filter((u) => s.has(typeof u == "string" ? u : u.name));
    return [o, new Proxy(e, { get: (u, d) => d === "executionProviders" ? a : Reflect.get(u, d) })];
  };
});
var _r = k(() => {
  xn();
});
var wr, $r = k(() => {
  wr = "1.26.0";
});
var vr, ce, Sn = k(() => {
  $r();
  vr = "warning", ce = { wasm: {}, webgl: {}, webgpu: {}, versions: { common: wr }, set logLevel(e) {
    if (e !== void 0) {
      if (typeof e != "string" || ["verbose", "info", "warning", "error", "fatal"].indexOf(e) === -1) throw new Error(`Unsupported logging level: ${e}`);
      vr = e;
    }
  }, get logLevel() {
    return vr;
  } };
  Object.defineProperty(ce, "logLevel", { enumerable: true });
});
var ne, xr = k(() => {
  Sn();
  ne = ce;
});
var Sr, Tr, Ir = k(() => {
  Sr = (e, t) => {
    let n = typeof document < "u" ? document.createElement("canvas") : new OffscreenCanvas(1, 1);
    n.width = e.dims[3], n.height = e.dims[2];
    let r = n.getContext("2d");
    if (r != null) {
      let o, i;
      t?.tensorLayout !== void 0 && t.tensorLayout === "NHWC" ? (o = e.dims[2], i = e.dims[3]) : (o = e.dims[3], i = e.dims[2]);
      let s = t?.format !== void 0 ? t.format : "RGB", a = t?.norm, u, d;
      a === void 0 || a.mean === void 0 ? u = [255, 255, 255, 255] : typeof a.mean == "number" ? u = [a.mean, a.mean, a.mean, a.mean] : (u = [a.mean[0], a.mean[1], a.mean[2], 0], a.mean[3] !== void 0 && (u[3] = a.mean[3])), a === void 0 || a.bias === void 0 ? d = [0, 0, 0, 0] : typeof a.bias == "number" ? d = [a.bias, a.bias, a.bias, a.bias] : (d = [a.bias[0], a.bias[1], a.bias[2], 0], a.bias[3] !== void 0 && (d[3] = a.bias[3]));
      let l = i * o, c = 0, p = l, f = l * 2, m = -1;
      s === "RGBA" ? (c = 0, p = l, f = l * 2, m = l * 3) : s === "RGB" ? (c = 0, p = l, f = l * 2) : s === "RBG" && (c = 0, f = l, p = l * 2);
      for (let h = 0; h < i; h++) for (let _ = 0; _ < o; _++) {
        let y = (e.data[c++] - d[0]) * u[0], g = (e.data[p++] - d[1]) * u[1], b = (e.data[f++] - d[2]) * u[2], w = m === -1 ? 255 : (e.data[m++] - d[3]) * u[3];
        r.fillStyle = "rgba(" + y + "," + g + "," + b + "," + w + ")", r.fillRect(_, h, 1, 1);
      }
      if ("toDataURL" in n) return n.toDataURL();
      throw new Error("toDataURL is not supported");
    } else throw new Error("Can not access image data");
  }, Tr = (e, t) => {
    let n = typeof document < "u" ? document.createElement("canvas").getContext("2d") : new OffscreenCanvas(1, 1).getContext("2d"), r;
    if (n != null) {
      let o, i, s;
      t?.tensorLayout !== void 0 && t.tensorLayout === "NHWC" ? (o = e.dims[2], i = e.dims[1], s = e.dims[3]) : (o = e.dims[3], i = e.dims[2], s = e.dims[1]);
      let a = t !== void 0 && t.format !== void 0 ? t.format : "RGB", u = t?.norm, d, l;
      u === void 0 || u.mean === void 0 ? d = [255, 255, 255, 255] : typeof u.mean == "number" ? d = [u.mean, u.mean, u.mean, u.mean] : (d = [u.mean[0], u.mean[1], u.mean[2], 255], u.mean[3] !== void 0 && (d[3] = u.mean[3])), u === void 0 || u.bias === void 0 ? l = [0, 0, 0, 0] : typeof u.bias == "number" ? l = [u.bias, u.bias, u.bias, u.bias] : (l = [u.bias[0], u.bias[1], u.bias[2], 0], u.bias[3] !== void 0 && (l[3] = u.bias[3]));
      let c = i * o;
      if (t !== void 0 && (t.format !== void 0 && s === 4 && t.format !== "RGBA" || s === 3 && t.format !== "RGB" && t.format !== "BGR")) throw new Error("Tensor format doesn't match input tensor dims");
      let p = 4, f = 0, m = 1, h = 2, _ = 3, y = 0, g = c, b = c * 2, w = -1;
      a === "RGBA" ? (y = 0, g = c, b = c * 2, w = c * 3) : a === "RGB" ? (y = 0, g = c, b = c * 2) : a === "RBG" && (y = 0, b = c, g = c * 2), r = n.createImageData(o, i);
      for (let v = 0; v < i * o; f += p, m += p, h += p, _ += p, v++) r.data[f] = (e.data[y++] - l[0]) * d[0], r.data[m] = (e.data[g++] - l[1]) * d[1], r.data[h] = (e.data[b++] - l[2]) * d[2], r.data[_] = w === -1 ? 255 : (e.data[w++] - l[3]) * d[3];
    } else throw new Error("Can not access image data");
    return r;
  };
});
var Tn, Cr, Ar, Er, kr, Pr, zr = k(() => {
  Tt();
  Tn = (e, t) => {
    if (e === void 0) throw new Error("Image buffer must be defined");
    if (t.height === void 0 || t.width === void 0) throw new Error("Image height and width must be defined");
    if (t.tensorLayout === "NHWC") throw new Error("NHWC Tensor layout is not supported yet");
    let { height: n, width: r } = t, o = t.norm ?? { mean: 255, bias: 0 }, i, s;
    typeof o.mean == "number" ? i = [o.mean, o.mean, o.mean, o.mean] : i = [o.mean[0], o.mean[1], o.mean[2], o.mean[3] ?? 255], typeof o.bias == "number" ? s = [o.bias, o.bias, o.bias, o.bias] : s = [o.bias[0], o.bias[1], o.bias[2], o.bias[3] ?? 0];
    let a = t.format !== void 0 ? t.format : "RGBA", u = t.tensorFormat !== void 0 && t.tensorFormat !== void 0 ? t.tensorFormat : "RGB", d = n * r, l = u === "RGBA" ? new Float32Array(d * 4) : new Float32Array(d * 3), c = 4, p = 0, f = 1, m = 2, h = 3, _ = 0, y = d, g = d * 2, b = -1;
    a === "RGB" && (c = 3, p = 0, f = 1, m = 2, h = -1), u === "RGBA" ? b = d * 3 : u === "RBG" ? (_ = 0, g = d, y = d * 2) : u === "BGR" && (g = 0, y = d, _ = d * 2);
    for (let v = 0; v < d; v++, p += c, m += c, f += c, h += c) l[_++] = (e[p] + s[0]) / i[0], l[y++] = (e[f] + s[1]) / i[1], l[g++] = (e[m] + s[2]) / i[2], b !== -1 && h !== -1 && (l[b++] = (e[h] + s[3]) / i[3]);
    return u === "RGBA" ? new fe("float32", l, [1, 4, n, r]) : new fe("float32", l, [1, 3, n, r]);
  }, Cr = async (e, t) => {
    let n = typeof HTMLImageElement < "u" && e instanceof HTMLImageElement, r = typeof ImageData < "u" && e instanceof ImageData, o = typeof ImageBitmap < "u" && e instanceof ImageBitmap, i = typeof e == "string", s, a = t ?? {}, u = () => {
      if (typeof document < "u") return document.createElement("canvas");
      if (typeof OffscreenCanvas < "u") return new OffscreenCanvas(1, 1);
      throw new Error("Canvas is not supported");
    }, d = (l) => typeof HTMLCanvasElement < "u" && l instanceof HTMLCanvasElement || l instanceof OffscreenCanvas ? l.getContext("2d") : null;
    if (n) {
      let l = u();
      l.width = e.width, l.height = e.height;
      let c = d(l);
      if (c != null) {
        let p = e.height, f = e.width;
        if (t !== void 0 && t.resizedHeight !== void 0 && t.resizedWidth !== void 0 && (p = t.resizedHeight, f = t.resizedWidth), t !== void 0) {
          if (a = t, t.tensorFormat !== void 0) throw new Error("Image input config format must be RGBA for HTMLImageElement");
          a.tensorFormat = "RGBA", a.height = p, a.width = f;
        } else a.tensorFormat = "RGBA", a.height = p, a.width = f;
        c.drawImage(e, 0, 0), s = c.getImageData(0, 0, f, p).data;
      } else throw new Error("Can not access image data");
    } else if (r) {
      let l, c;
      if (t !== void 0 && t.resizedWidth !== void 0 && t.resizedHeight !== void 0 ? (l = t.resizedHeight, c = t.resizedWidth) : (l = e.height, c = e.width), t !== void 0 && (a = t), a.format = "RGBA", a.height = l, a.width = c, t !== void 0) {
        let p = u();
        p.width = c, p.height = l;
        let f = d(p);
        if (f != null) f.putImageData(e, 0, 0), s = f.getImageData(0, 0, c, l).data;
        else throw new Error("Can not access image data");
      } else s = e.data;
    } else if (o) {
      if (t === void 0) throw new Error("Please provide image config with format for Imagebitmap");
      let l = u();
      l.width = e.width, l.height = e.height;
      let c = d(l);
      if (c != null) {
        let p = e.height, f = e.width;
        return c.drawImage(e, 0, 0, f, p), s = c.getImageData(0, 0, f, p).data, a.height = p, a.width = f, Tn(s, a);
      } else throw new Error("Can not access image data");
    } else {
      if (i) return new Promise((l, c) => {
        let p = u(), f = d(p);
        if (!e || !f) return c();
        let m = new Image();
        m.crossOrigin = "Anonymous", m.src = e, m.onload = () => {
          p.width = m.width, p.height = m.height, f.drawImage(m, 0, 0, p.width, p.height);
          let h = f.getImageData(0, 0, p.width, p.height);
          a.height = p.height, a.width = p.width, l(Tn(h.data, a));
        };
      });
      throw new Error("Input data provided is not supported - aborted tensor creation");
    }
    if (s !== void 0) return Tn(s, a);
    throw new Error("Input data provided is not supported - aborted tensor creation");
  }, Ar = (e, t) => {
    let { width: n, height: r, download: o, dispose: i } = t, s = [1, r, n, 4];
    return new fe({ location: "texture", type: "float32", texture: e, dims: s, download: o, dispose: i });
  }, Er = (e, t) => {
    let { dataType: n, dims: r, download: o, dispose: i } = t;
    return new fe({ location: "gpu-buffer", type: n ?? "float32", gpuBuffer: e, dims: r, download: o, dispose: i });
  }, kr = (e, t) => {
    let { dataType: n, dims: r, download: o, dispose: i } = t;
    return new fe({ location: "ml-tensor", type: n ?? "float32", mlTensor: e, dims: r, download: o, dispose: i });
  }, Pr = (e, t, n) => new fe({ location: "cpu-pinned", type: e, data: t, dims: n ?? [t.length] });
});
var Qe, ct, Br, Dr, Or = k(() => {
  Qe = /* @__PURE__ */ new Map([["float32", Float32Array], ["uint8", Uint8Array], ["int8", Int8Array], ["uint16", Uint16Array], ["int16", Int16Array], ["int32", Int32Array], ["bool", Uint8Array], ["float64", Float64Array], ["uint32", Uint32Array], ["int4", Uint8Array], ["uint4", Uint8Array]]), ct = /* @__PURE__ */ new Map([[Float32Array, "float32"], [Uint8Array, "uint8"], [Int8Array, "int8"], [Uint16Array, "uint16"], [Int16Array, "int16"], [Int32Array, "int32"], [Float64Array, "float64"], [Uint32Array, "uint32"]]), Br = false, Dr = () => {
    if (!Br) {
      Br = true;
      let e = typeof BigInt64Array < "u" && BigInt64Array.from, t = typeof BigUint64Array < "u" && BigUint64Array.from, n = globalThis.Float16Array, r = typeof n < "u" && n.from;
      e && (Qe.set("int64", BigInt64Array), ct.set(BigInt64Array, "int64")), t && (Qe.set("uint64", BigUint64Array), ct.set(BigUint64Array, "uint64")), r ? (Qe.set("float16", n), ct.set(n, "float16")) : Qe.set("float16", Uint16Array);
    }
  };
});
var Mr, Ur, Rr = k(() => {
  Tt();
  Mr = (e) => {
    let t = 1;
    for (let n = 0; n < e.length; n++) {
      let r = e[n];
      if (typeof r != "number" || !Number.isSafeInteger(r)) throw new TypeError(`dims[${n}] must be an integer, got: ${r}`);
      if (r < 0) throw new RangeError(`dims[${n}] must be a non-negative integer, got: ${r}`);
      t *= r;
    }
    return t;
  }, Ur = (e, t) => {
    switch (e.location) {
      case "cpu":
        return new fe(e.type, e.data, t);
      case "cpu-pinned":
        return new fe({ location: "cpu-pinned", data: e.data, type: e.type, dims: t });
      case "texture":
        return new fe({ location: "texture", texture: e.texture, type: e.type, dims: t });
      case "gpu-buffer":
        return new fe({ location: "gpu-buffer", gpuBuffer: e.gpuBuffer, type: e.type, dims: t });
      case "ml-tensor":
        return new fe({ location: "ml-tensor", mlTensor: e.mlTensor, type: e.type, dims: t });
      default:
        throw new Error(`tensorReshape: tensor location ${e.location} is not supported`);
    }
  };
});
var fe, Tt = k(() => {
  Ir();
  zr();
  Or();
  Rr();
  fe = class {
    constructor(t, n, r) {
      Dr();
      let o, i;
      if (typeof t == "object" && "location" in t) switch (this.dataLocation = t.location, o = t.type, i = t.dims, t.location) {
        case "cpu-pinned": {
          let a = Qe.get(o);
          if (!a) throw new TypeError(`unsupported type "${o}" to create tensor from pinned buffer`);
          if (!(t.data instanceof a)) throw new TypeError(`buffer should be of type ${a.name}`);
          this.cpuData = t.data;
          break;
        }
        case "texture": {
          if (o !== "float32") throw new TypeError(`unsupported type "${o}" to create tensor from texture`);
          this.gpuTextureData = t.texture, this.downloader = t.download, this.disposer = t.dispose;
          break;
        }
        case "gpu-buffer": {
          if (o !== "float32" && o !== "float16" && o !== "int32" && o !== "int64" && o !== "uint32" && o !== "uint8" && o !== "bool" && o !== "uint4" && o !== "int4") throw new TypeError(`unsupported type "${o}" to create tensor from gpu buffer`);
          this.gpuBufferData = t.gpuBuffer, this.downloader = t.download, this.disposer = t.dispose;
          break;
        }
        case "ml-tensor": {
          if (o !== "float32" && o !== "float16" && o !== "int32" && o !== "int64" && o !== "uint32" && o !== "uint64" && o !== "int8" && o !== "uint8" && o !== "bool" && o !== "uint4" && o !== "int4") throw new TypeError(`unsupported type "${o}" to create tensor from MLTensor`);
          this.mlTensorData = t.mlTensor, this.downloader = t.download, this.disposer = t.dispose;
          break;
        }
        default:
          throw new Error(`Tensor constructor: unsupported location '${this.dataLocation}'`);
      }
      else {
        let a, u;
        if (typeof t == "string") if (o = t, u = r, t === "string") {
          if (!Array.isArray(n)) throw new TypeError("A string tensor's data must be a string array.");
          a = n;
        } else {
          let d = Qe.get(t);
          if (d === void 0) throw new TypeError(`Unsupported tensor type: ${t}.`);
          if (Array.isArray(n)) {
            if (t === "float16" && d === Uint16Array || t === "uint4" || t === "int4") throw new TypeError(`Creating a ${t} tensor from number array is not supported. Please use ${d.name} as data.`);
            t === "uint64" || t === "int64" ? a = d.from(n, BigInt) : a = d.from(n);
          } else if (n instanceof d) a = n;
          else if (n instanceof Uint8ClampedArray) if (t === "uint8") a = Uint8Array.from(n);
          else throw new TypeError("A Uint8ClampedArray tensor's data must be type of uint8");
          else if (t === "float16" && n instanceof Uint16Array && d !== Uint16Array) a = new globalThis.Float16Array(n.buffer, n.byteOffset, n.length);
          else throw new TypeError(`A ${o} tensor's data must be type of ${d}`);
        }
        else if (u = n, Array.isArray(t)) {
          if (t.length === 0) throw new TypeError("Tensor type cannot be inferred from an empty array.");
          let d = typeof t[0];
          if (d === "string") o = "string", a = t;
          else if (d === "boolean") o = "bool", a = Uint8Array.from(t);
          else throw new TypeError(`Invalid element type of data array: ${d}.`);
        } else if (t instanceof Uint8ClampedArray) o = "uint8", a = Uint8Array.from(t);
        else {
          let d = ct.get(t.constructor);
          if (d === void 0) throw new TypeError(`Unsupported type for tensor data: ${t.constructor}.`);
          o = d, a = t;
        }
        if (u === void 0) u = [a.length];
        else if (!Array.isArray(u)) throw new TypeError("A tensor's dims must be a number array");
        i = u, this.cpuData = a, this.dataLocation = "cpu";
      }
      let s = Mr(i);
      if (this.cpuData && s !== this.cpuData.length && !((o === "uint4" || o === "int4") && Math.ceil(s / 2) === this.cpuData.length)) throw new Error(`Tensor's size(${s}) does not match data length(${this.cpuData.length}).`);
      this.type = o, this.dims = i, this.size = s;
    }
    static async fromImage(t, n) {
      return Cr(t, n);
    }
    static fromTexture(t, n) {
      return Ar(t, n);
    }
    static fromGpuBuffer(t, n) {
      return Er(t, n);
    }
    static fromMLTensor(t, n) {
      return kr(t, n);
    }
    static fromPinnedBuffer(t, n, r) {
      return Pr(t, n, r);
    }
    toDataURL(t) {
      return Sr(this, t);
    }
    toImageData(t) {
      return Tr(this, t);
    }
    get data() {
      if (this.ensureValid(), !this.cpuData) throw new Error("The data is not on CPU. Use `getData()` to download GPU data to CPU, or use `texture` or `gpuBuffer` property to access the GPU data directly.");
      return this.cpuData;
    }
    get location() {
      return this.dataLocation;
    }
    get texture() {
      if (this.ensureValid(), !this.gpuTextureData) throw new Error("The data is not stored as a WebGL texture.");
      return this.gpuTextureData;
    }
    get gpuBuffer() {
      if (this.ensureValid(), !this.gpuBufferData) throw new Error("The data is not stored as a WebGPU buffer.");
      return this.gpuBufferData;
    }
    get mlTensor() {
      if (this.ensureValid(), !this.mlTensorData) throw new Error("The data is not stored as a WebNN MLTensor.");
      return this.mlTensorData;
    }
    async getData(t) {
      switch (this.ensureValid(), this.dataLocation) {
        case "cpu":
        case "cpu-pinned":
          return this.data;
        case "texture":
        case "gpu-buffer":
        case "ml-tensor": {
          if (!this.downloader) throw new Error("The current tensor is not created with a specified data downloader.");
          if (this.isDownloading) throw new Error("The current tensor is being downloaded.");
          try {
            this.isDownloading = true;
            let n = await this.downloader();
            return this.downloader = void 0, this.dataLocation = "cpu", this.cpuData = n, t && this.disposer && (this.disposer(), this.disposer = void 0), n;
          } finally {
            this.isDownloading = false;
          }
        }
        default:
          throw new Error(`cannot get data from location: ${this.dataLocation}`);
      }
    }
    dispose() {
      if (this.isDownloading) throw new Error("The current tensor is being downloaded.");
      this.disposer && (this.disposer(), this.disposer = void 0), this.cpuData = void 0, this.gpuTextureData = void 0, this.gpuBufferData = void 0, this.mlTensorData = void 0, this.downloader = void 0, this.isDownloading = void 0, this.dataLocation = "none";
    }
    ensureValid() {
      if (this.dataLocation === "none") throw new Error("The tensor is disposed.");
    }
    reshape(t) {
      if (this.ensureValid(), this.downloader || this.disposer) throw new Error("Cannot reshape a tensor that owns GPU resource.");
      return Ur(this, t);
    }
  };
});
var Te, In = k(() => {
  Tt();
  Te = fe;
});
var It, Vr, _e, ye, Le, We, Cn = k(() => {
  Sn();
  It = (e, t) => {
    (typeof ce.trace > "u" ? !ce.wasm.trace : !ce.trace) || console.timeStamp(`${e}::ORT::${t}`);
  }, Vr = (e, t) => {
    let n = new Error().stack?.split(/\r\n|\r|\n/g) || [], r = false;
    for (let o = 0; o < n.length; o++) {
      if (r && !n[o].includes("TRACE_FUNC")) {
        let i = `FUNC_${e}::${n[o].trim().split(" ")[1]}`;
        t && (i += `::${t}`), It("CPU", i);
        return;
      }
      n[o].includes("TRACE_FUNC") && (r = true);
    }
  }, _e = (e) => {
    (typeof ce.trace > "u" ? !ce.wasm.trace : !ce.trace) || Vr("BEGIN", e);
  }, ye = (e) => {
    (typeof ce.trace > "u" ? !ce.wasm.trace : !ce.trace) || Vr("END", e);
  }, Le = (e) => {
    (typeof ce.trace > "u" ? !ce.wasm.trace : !ce.trace) || console.time(`ORT::${e}`);
  }, We = (e) => {
    (typeof ce.trace > "u" ? !ce.wasm.trace : !ce.trace) || console.timeEnd(`ORT::${e}`);
  };
});
var Ct, Nr = k(() => {
  xn();
  In();
  Cn();
  Ct = class e {
    constructor(t) {
      this.handler = t;
    }
    async run(t, n, r) {
      _e(), Le("InferenceSession.run");
      let o = {}, i = {};
      if (typeof t != "object" || t === null || t instanceof Te || Array.isArray(t)) throw new TypeError("'feeds' must be an object that use input names as keys and OnnxValue as corresponding values.");
      let s = true;
      if (typeof n == "object") {
        if (n === null) throw new TypeError("Unexpected argument[1]: cannot be null.");
        if (n instanceof Te) throw new TypeError("'fetches' cannot be a Tensor");
        if (Array.isArray(n)) {
          if (n.length === 0) throw new TypeError("'fetches' cannot be an empty array.");
          s = false;
          for (let d of n) {
            if (typeof d != "string") throw new TypeError("'fetches' must be a string array or an object.");
            if (this.outputNames.indexOf(d) === -1) throw new RangeError(`'fetches' contains invalid output name: ${d}.`);
            o[d] = null;
          }
          if (typeof r == "object" && r !== null) i = r;
          else if (typeof r < "u") throw new TypeError("'options' must be an object.");
        } else {
          let d = false, l = Object.getOwnPropertyNames(n);
          for (let c of this.outputNames) if (l.indexOf(c) !== -1) {
            let p = n[c];
            (p === null || p instanceof Te) && (d = true, s = false, o[c] = p);
          }
          if (d) {
            if (typeof r == "object" && r !== null) i = r;
            else if (typeof r < "u") throw new TypeError("'options' must be an object.");
          } else i = n;
        }
      } else if (typeof n < "u") throw new TypeError("Unexpected argument[1]: must be 'fetches' or 'options'.");
      for (let d of this.inputNames) if (typeof t[d] > "u") throw new Error(`input '${d}' is missing in 'feeds'.`);
      if (s) for (let d of this.outputNames) o[d] = null;
      let a = await this.handler.run(t, o, i), u = {};
      for (let d in a) if (Object.hasOwnProperty.call(a, d)) {
        let l = a[d];
        l instanceof Te ? u[d] = l : u[d] = new Te(l.type, l.data, l.dims);
      }
      return We("InferenceSession.run"), ye(), u;
    }
    async release() {
      return this.handler.dispose();
    }
    static async create(t, n, r, o) {
      _e(), Le("InferenceSession.create");
      let i, s = {};
      if (typeof t == "string") {
        if (i = t, typeof n == "object" && n !== null) s = n;
        else if (typeof n < "u") throw new TypeError("'options' must be an object.");
      } else if (t instanceof Uint8Array) {
        if (i = t, typeof n == "object" && n !== null) s = n;
        else if (typeof n < "u") throw new TypeError("'options' must be an object.");
      } else if (t instanceof ArrayBuffer || typeof SharedArrayBuffer < "u" && t instanceof SharedArrayBuffer) {
        let l = t, c = 0, p = t.byteLength;
        if (typeof n == "object" && n !== null) s = n;
        else if (typeof n == "number") {
          if (c = n, !Number.isSafeInteger(c)) throw new RangeError("'byteOffset' must be an integer.");
          if (c < 0 || c >= l.byteLength) throw new RangeError(`'byteOffset' is out of range [0, ${l.byteLength}).`);
          if (p = t.byteLength - c, typeof r == "number") {
            if (p = r, !Number.isSafeInteger(p)) throw new RangeError("'byteLength' must be an integer.");
            if (p <= 0 || c + p > l.byteLength) throw new RangeError(`'byteLength' is out of range (0, ${l.byteLength - c}].`);
            if (typeof o == "object" && o !== null) s = o;
            else if (typeof o < "u") throw new TypeError("'options' must be an object.");
          } else if (typeof r < "u") throw new TypeError("'byteLength' must be a number.");
        } else if (typeof n < "u") throw new TypeError("'options' must be an object.");
        i = new Uint8Array(l, c, p);
      } else throw new TypeError("Unexpected argument[0]: must be 'path' or 'buffer'.");
      let [a, u] = await br(s), d = await a.createInferenceSessionHandler(i, u);
      return We("InferenceSession.create"), ye(), new e(d);
    }
    startProfiling() {
      this.handler.startProfiling();
    }
    endProfiling() {
      this.handler.endProfiling();
    }
    get inputNames() {
      return this.handler.inputNames;
    }
    get outputNames() {
      return this.handler.outputNames;
    }
    get inputMetadata() {
      return this.handler.inputMetadata;
    }
    get outputMetadata() {
      return this.handler.outputMetadata;
    }
  };
});
var qu, Lr = k(() => {
  Nr();
  qu = Ct;
});
var Wr = k(() => {
});
var Gr = k(() => {
});
var Hr = k(() => {
});
var qr = k(() => {
});
var An = {};
lt(An, { InferenceSession: () => qu, TRACE: () => It, TRACE_EVENT_BEGIN: () => Le, TRACE_EVENT_END: () => We, TRACE_FUNC_BEGIN: () => _e, TRACE_FUNC_END: () => ye, Tensor: () => Te, env: () => ne, registerBackend: () => Ze });
var we = k(() => {
  _r();
  xr();
  Lr();
  In();
  Wr();
  Gr();
  Cn();
  Hr();
  qr();
});
var At = k(() => {
});
var Zr = {};
lt(Zr, { default: () => Fu });
var Kr, jr, Fu, Qr = k(() => {
  En();
  Ge();
  Et();
  Kr = "ort-wasm-proxy-worker", jr = globalThis.self?.name === Kr;
  jr && (self.onmessage = (e) => {
    let { type: t, in: n } = e.data;
    try {
      switch (t) {
        case "init-wasm":
          kt(n.wasm).then(() => {
            Pt(n).then(() => {
              postMessage({ type: t });
            }, (r) => {
              postMessage({ type: t, err: r });
            });
          }, (r) => {
            postMessage({ type: t, err: r });
          });
          break;
        case "init-ep": {
          let { epName: r, env: o } = n;
          zt(o, r).then(() => {
            postMessage({ type: t });
          }, (i) => {
            postMessage({ type: t, err: i });
          });
          break;
        }
        case "copy-from": {
          let { buffer: r } = n, o = pt(r);
          postMessage({ type: t, out: o });
          break;
        }
        case "create": {
          let { model: r, options: o } = n;
          Bt(r, o).then((i) => {
            postMessage({ type: t, out: i });
          }, (i) => {
            postMessage({ type: t, err: i });
          });
          break;
        }
        case "release":
          Dt(n), postMessage({ type: t });
          break;
        case "run": {
          let { sessionId: r, inputIndices: o, inputs: i, outputIndices: s, options: a } = n;
          Ot(r, o, i, s, new Array(s.length).fill(null), a).then((u) => {
            u.some((d) => d[3] !== "cpu") ? postMessage({ type: t, err: "Proxy does not support non-cpu tensor location." }) : postMessage({ type: t, out: u }, Ut([...i, ...u]));
          }, (u) => {
            postMessage({ type: t, err: u });
          });
          break;
        }
        case "end-profiling":
          Mt(n), postMessage({ type: t });
          break;
        default:
      }
    } catch (r) {
      postMessage({ type: t, err: r });
    }
  });
  Fu = jr ? null : (e) => new Worker(e ?? $e, { type: "module", name: Kr });
});
var Jr, Ku, ju, $e, Rt, kn, Zu, Qu, eo, Xu, Xr, to, Yr, no, Et = k(() => {
  At();
  Jr = typeof location > "u" ? void 0 : location.origin, Ku = import.meta.url > "file:" && import.meta.url < "file;", ju = () => {
    {
      if (Ku) {
        let e = URL;
        return new URL(new e("ort.min.mjs", import.meta.url).href, Jr).href;
      }
      return import.meta.url;
    }
  }, $e = ju(), Rt = () => {
    if ($e && !$e.startsWith("blob:")) return $e.substring(0, $e.lastIndexOf("/") + 1);
  }, kn = (e, t) => {
    try {
      let n = t ?? $e;
      return (n ? new URL(e, n) : new URL(e)).origin === Jr;
    } catch {
      return false;
    }
  }, Zu = (e, t) => {
    let n = t ?? $e;
    try {
      return (n ? new URL(e, n) : new URL(e)).href;
    } catch {
      return;
    }
  }, Qu = (e, t) => `${t ?? "./"}${e}`, eo = async (e) => {
    let n = await (await fetch(e, { credentials: "same-origin" })).blob();
    return URL.createObjectURL(n);
  }, Xu = async (e) => (await import(
    /*webpackIgnore:true*/
    /*@vite-ignore*/
    e
  )).default, Xr = (Qr(), xt(Zr)).default, to = async () => {
    if (!$e) throw new Error("Failed to load proxy worker: cannot determine the script source URL.");
    if (kn($e)) return [void 0, Xr()];
    let e = await eo($e);
    return [e, Xr(e)];
  }, Yr = void 0, no = async (e, t, n, r) => {
    let o = Yr && !(e || t);
    if (o) if ($e) o = kn($e) || r && !n;
    else if (r && !n) o = true;
    else throw new Error("cannot determine the script source URL.");
    if (o) return [void 0, Yr];
    {
      let i = "ort-wasm-simd-threaded.jsep.mjs", s = e ?? Zu(i, t), a = n && s && !kn(s, t), u = a ? await eo(s) : s ?? Qu(i, t);
      return [a ? u : void 0, await Xu(u)];
    }
  };
});
var Pn, zn, Vt, ro, Yu, Ju, ed, kt, te, Ge = k(() => {
  Et();
  zn = false, Vt = false, ro = false, Yu = () => {
    if (typeof SharedArrayBuffer > "u") return false;
    try {
      return typeof MessageChannel < "u" && new MessageChannel().port1.postMessage(new SharedArrayBuffer(1)), WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 5, 4, 1, 3, 1, 1, 10, 11, 1, 9, 0, 65, 0, 254, 16, 2, 0, 26, 11]));
    } catch {
      return false;
    }
  }, Ju = () => {
    try {
      return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10, 30, 1, 28, 0, 65, 0, 253, 15, 253, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 253, 186, 1, 26, 11]));
    } catch {
      return false;
    }
  }, ed = () => {
    try {
      return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 19, 1, 17, 0, 65, 1, 253, 15, 65, 2, 253, 15, 65, 3, 253, 15, 253, 147, 2, 11]));
    } catch {
      return false;
    }
  }, kt = async (e) => {
    if (zn) return Promise.resolve();
    if (Vt) throw new Error("multiple calls to 'initializeWebAssembly()' detected.");
    if (ro) throw new Error("previous call to 'initializeWebAssembly()' failed.");
    Vt = true;
    let t = e.initTimeout, n = e.numThreads;
    if (e.simd !== false) {
      if (e.simd === "relaxed") {
        if (!ed()) throw new Error("Relaxed WebAssembly SIMD is not supported in the current environment.");
      } else if (!Ju()) throw new Error("WebAssembly SIMD is not supported in the current environment.");
    }
    let r = Yu();
    n > 1 && !r && (typeof self < "u" && !self.crossOriginIsolated && console.warn("env.wasm.numThreads is set to " + n + ", but this will not work unless you enable crossOriginIsolated mode. See https://web.dev/cross-origin-isolation-guide/ for more info."), console.warn("WebAssembly multi-threading is not supported in the current environment. Falling back to single-threading."), e.numThreads = n = 1);
    let o = e.wasmPaths, i = typeof o == "string" ? o : void 0, s = o?.mjs, a = s?.href ?? s, u = o?.wasm, d = u?.href ?? u, l = e.wasmBinary, [c, p] = await no(a, i, n > 1, !!l || !!d), f = false, m = [];
    if (t > 0 && m.push(new Promise((h) => {
      setTimeout(() => {
        f = true, h();
      }, t);
    })), m.push(new Promise((h, _) => {
      let y = { numThreads: n };
      if (l) y.wasmBinary = l, y.locateFile = (g) => g;
      else if (d || i) y.locateFile = (g) => d ?? i + g;
      else if (a && a.indexOf("blob:") !== 0) y.locateFile = (g) => new URL(g, a).href;
      else if (c) {
        let g = Rt();
        g && (y.locateFile = (b) => g + b);
      }
      p(y).then((g) => {
        Vt = false, zn = true, Pn = g, h(), c && URL.revokeObjectURL(c);
      }, (g) => {
        Vt = false, ro = true, _(g);
      });
    })), await Promise.race(m), f) throw new Error(`WebAssembly backend initializing failed due to timeout: ${t}ms`);
  }, te = () => {
    if (zn && Pn) return Pn;
    throw new Error("WebAssembly is not initialized yet.");
  };
});
var ve, mt, Y, Nt = k(() => {
  Ge();
  ve = (e, t) => {
    let n = te(), r = n.lengthBytesUTF8(e) + 1, o = n._malloc(r);
    return n.stringToUTF8(e, o, r), t.push(o), o;
  }, mt = (e, t, n, r) => {
    if (typeof e == "object" && e !== null) {
      if (n.has(e)) throw new Error("Circular reference in options");
      n.add(e);
    }
    Object.entries(e).forEach(([o, i]) => {
      let s = t ? t + o : o;
      if (typeof i == "object") mt(i, s + ".", n, r);
      else if (typeof i == "string" || typeof i == "number") r(s, i.toString());
      else if (typeof i == "boolean") r(s, i ? "1" : "0");
      else throw new Error(`Can't handle extra config type: ${typeof i}`);
    });
  }, Y = (e) => {
    let t = te(), n = t.stackSave();
    try {
      let r = t.PTR_SIZE, o = t.stackAlloc(2 * r);
      t._OrtGetLastError(o, o + r);
      let i = Number(t.getValue(o, r === 4 ? "i32" : "i64")), s = t.getValue(o + r, "*"), a = s ? t.UTF8ToString(s) : "";
      throw new Error(`${e} ERROR_CODE: ${i}, ERROR_MESSAGE: ${a}`);
    } finally {
      t.stackRestore(n);
    }
  };
});
var oo, io = k(() => {
  Ge();
  Nt();
  oo = (e) => {
    let t = te(), n = 0, r = [], o = e || {};
    try {
      if (e?.logSeverityLevel === void 0) o.logSeverityLevel = 2;
      else if (typeof e.logSeverityLevel != "number" || !Number.isInteger(e.logSeverityLevel) || e.logSeverityLevel < 0 || e.logSeverityLevel > 4) throw new Error(`log severity level is not valid: ${e.logSeverityLevel}`);
      if (e?.logVerbosityLevel === void 0) o.logVerbosityLevel = 0;
      else if (typeof e.logVerbosityLevel != "number" || !Number.isInteger(e.logVerbosityLevel)) throw new Error(`log verbosity level is not valid: ${e.logVerbosityLevel}`);
      e?.terminate === void 0 && (o.terminate = false);
      let i = 0;
      return e?.tag !== void 0 && (i = ve(e.tag, r)), n = t._OrtCreateRunOptions(o.logSeverityLevel, o.logVerbosityLevel, !!o.terminate, i), n === 0 && Y("Can't create run options."), e?.extra !== void 0 && mt(e.extra, "", /* @__PURE__ */ new WeakSet(), (s, a) => {
        let u = ve(s, r), d = ve(a, r);
        t._OrtAddRunConfigEntry(n, u, d) !== 0 && Y(`Can't set a run config entry: ${s} - ${a}.`);
      }), [n, r];
    } catch (i) {
      throw n !== 0 && t._OrtReleaseRunOptions(n), r.forEach((s) => t._free(s)), i;
    }
  };
});
var td$1, nd, rd, rt, od, so, ao = k(() => {
  Ge();
  Nt();
  td$1 = (e) => {
    switch (e) {
      case "disabled":
        return 0;
      case "basic":
        return 1;
      case "extended":
        return 2;
      case "layout":
        return 3;
      case "all":
        return 99;
      default:
        throw new Error(`unsupported graph optimization level: ${e}`);
    }
  }, nd = (e) => {
    switch (e) {
      case "sequential":
        return 0;
      case "parallel":
        return 1;
      default:
        throw new Error(`unsupported execution mode: ${e}`);
    }
  }, rd = (e) => {
    e.extra || (e.extra = {}), e.extra.session || (e.extra.session = {});
    let t = e.extra.session;
    t.use_ort_model_bytes_directly || (t.use_ort_model_bytes_directly = "1"), e.executionProviders && e.executionProviders.some((n) => (typeof n == "string" ? n : n.name) === "webgpu") && (e.enableMemPattern = false);
  }, rt = (e, t, n, r) => {
    let o = ve(t, r), i = ve(n, r);
    te()._OrtAddSessionConfigEntry(e, o, i) !== 0 && Y(`Can't set a session config entry: ${t} - ${n}.`);
  }, od = async (e, t, n) => {
    let r = t.executionProviders;
    for (let o of r) {
      let i = typeof o == "string" ? o : o.name, s = [];
      switch (i) {
        case "webnn":
          if (i = "WEBNN", rt(e, "session.disable_quant_qdq", "1", n), rt(e, "session.disable_qdq_constant_folding", "1", n), typeof o != "string") {
            let p = o?.deviceType;
            p && rt(e, "deviceType", p, n);
          }
          break;
        case "webgpu":
          if (i = "JS", typeof o != "string") {
            let c = o;
            if (c?.preferredLayout) {
              if (c.preferredLayout !== "NCHW" && c.preferredLayout !== "NHWC") throw new Error(`preferredLayout must be either 'NCHW' or 'NHWC': ${c.preferredLayout}`);
              rt(e, "preferredLayout", c.preferredLayout, n);
            }
          }
          break;
        case "wasm":
        case "cpu":
          continue;
        default:
          throw new Error(`not supported execution provider: ${i}`);
      }
      let a = ve(i, n), u = s.length, d = 0, l = 0;
      if (u > 0) {
        d = te()._malloc(u * te().PTR_SIZE), n.push(d), l = te()._malloc(u * te().PTR_SIZE), n.push(l);
        for (let c = 0; c < u; c++) te().setValue(d + c * te().PTR_SIZE, s[c][0], "*"), te().setValue(l + c * te().PTR_SIZE, s[c][1], "*");
      }
      await te()._OrtAppendExecutionProvider(e, a, d, l, u) !== 0 && Y(`Can't append execution provider: ${i}.`);
    }
  }, so = async (e) => {
    let t = te(), n = 0, r = [], o = e || {};
    rd(o);
    try {
      let i = td$1(o.graphOptimizationLevel ?? "all"), s = nd(o.executionMode ?? "sequential"), a = typeof o.logId == "string" ? ve(o.logId, r) : 0, u = o.logSeverityLevel ?? 2;
      if (!Number.isInteger(u) || u < 0 || u > 4) throw new Error(`log severity level is not valid: ${u}`);
      let d = o.logVerbosityLevel ?? 0;
      if (!Number.isInteger(d) || d < 0 || d > 4) throw new Error(`log verbosity level is not valid: ${d}`);
      let l = typeof o.optimizedModelFilePath == "string" ? ve(o.optimizedModelFilePath, r) : 0;
      if (n = t._OrtCreateSessionOptions(i, !!o.enableCpuMemArena, !!o.enableMemPattern, s, !!o.enableProfiling, 0, a, u, d, l), n === 0 && Y("Can't create session options."), o.executionProviders && await od(n, o, r), o.enableGraphCapture !== void 0) {
        if (typeof o.enableGraphCapture != "boolean") throw new Error(`enableGraphCapture must be a boolean value: ${o.enableGraphCapture}`);
        rt(n, "enableGraphCapture", o.enableGraphCapture.toString(), r);
      }
      if (o.freeDimensionOverrides) for (let [c, p] of Object.entries(o.freeDimensionOverrides)) {
        if (typeof c != "string") throw new Error(`free dimension override name must be a string: ${c}`);
        if (typeof p != "number" || !Number.isInteger(p) || p < 0) throw new Error(`free dimension override value must be a non-negative integer: ${p}`);
        let f = ve(c, r);
        t._OrtAddFreeDimensionOverride(n, f, p) !== 0 && Y(`Can't set a free dimension override: ${c} - ${p}.`);
      }
      return o.extra !== void 0 && mt(o.extra, "", /* @__PURE__ */ new WeakSet(), (c, p) => {
        rt(n, c, p, r);
      }), [n, r];
    } catch (i) {
      throw n !== 0 && t._OrtReleaseSessionOptions(n) !== 0 && Y("Can't release session options."), r.forEach((s) => t._free(s)), i;
    }
  };
});
var He, ke, qe, ot, ft, Lt, Wt, Bn, N = k(() => {
  He = (e) => {
    switch (e) {
      case "int8":
        return 3;
      case "uint8":
        return 2;
      case "bool":
        return 9;
      case "int16":
        return 5;
      case "uint16":
        return 4;
      case "int32":
        return 6;
      case "uint32":
        return 12;
      case "float16":
        return 10;
      case "float32":
        return 1;
      case "float64":
        return 11;
      case "string":
        return 8;
      case "int64":
        return 7;
      case "uint64":
        return 13;
      case "int4":
        return 22;
      case "uint4":
        return 21;
      default:
        throw new Error(`unsupported data type: ${e}`);
    }
  }, ke = (e) => {
    switch (e) {
      case 3:
        return "int8";
      case 2:
        return "uint8";
      case 9:
        return "bool";
      case 5:
        return "int16";
      case 4:
        return "uint16";
      case 6:
        return "int32";
      case 12:
        return "uint32";
      case 10:
        return "float16";
      case 1:
        return "float32";
      case 11:
        return "float64";
      case 8:
        return "string";
      case 7:
        return "int64";
      case 13:
        return "uint64";
      case 22:
        return "int4";
      case 21:
        return "uint4";
      default:
        throw new Error(`unsupported data type: ${e}`);
    }
  }, qe = (e, t) => {
    let n = [-1, 4, 1, 1, 2, 2, 4, 8, -1, 1, 2, 8, 4, 8, -1, -1, -1, -1, -1, -1, -1, 0.5, 0.5][e], r = typeof t == "number" ? t : t.reduce((o, i) => o * i, 1);
    return n > 0 ? Math.ceil(r * n) : void 0;
  }, ot = (e) => {
    switch (e) {
      case "float16":
        return typeof Float16Array < "u" && Float16Array.from ? Float16Array : Uint16Array;
      case "float32":
        return Float32Array;
      case "uint8":
        return Uint8Array;
      case "int8":
        return Int8Array;
      case "uint16":
        return Uint16Array;
      case "int16":
        return Int16Array;
      case "int32":
        return Int32Array;
      case "bool":
        return Uint8Array;
      case "float64":
        return Float64Array;
      case "uint32":
        return Uint32Array;
      case "int64":
        return BigInt64Array;
      case "uint64":
        return BigUint64Array;
      default:
        throw new Error(`unsupported type: ${e}`);
    }
  }, ft = (e) => {
    switch (e) {
      case "verbose":
        return 0;
      case "info":
        return 1;
      case "warning":
        return 2;
      case "error":
        return 3;
      case "fatal":
        return 4;
      default:
        throw new Error(`unsupported logging level: ${e}`);
    }
  }, Lt = (e) => e === "float32" || e === "float16" || e === "int32" || e === "int64" || e === "uint32" || e === "uint8" || e === "bool" || e === "uint4" || e === "int4", Wt = (e) => e === "float32" || e === "float16" || e === "int32" || e === "int64" || e === "uint32" || e === "uint64" || e === "int8" || e === "uint8" || e === "bool" || e === "uint4" || e === "int4", Bn = (e) => {
    switch (e) {
      case "none":
        return 0;
      case "cpu":
        return 1;
      case "cpu-pinned":
        return 2;
      case "texture":
        return 3;
      case "gpu-buffer":
        return 4;
      case "ml-tensor":
        return 5;
      default:
        throw new Error(`unsupported data location: ${e}`);
    }
  };
});
var ht, Dn = k(() => {
  At();
  ht = async (e) => {
    if (typeof e == "string") {
      let t = await fetch(e);
      if (!t.ok) throw new Error(`failed to load external data file: ${e}`);
      let n = t.headers.get("Content-Length"), r = n ? parseInt(n, 10) : 0;
      if (r < 1073741824) return new Uint8Array(await t.arrayBuffer());
      {
        if (!t.body) throw new Error(`failed to load external data file: ${e}, no response body.`);
        let o = t.body.getReader(), i;
        try {
          i = new ArrayBuffer(r);
        } catch (a) {
          if (a instanceof RangeError) {
            let u = Math.ceil(r / 65536);
            i = new WebAssembly.Memory({ initial: u, maximum: u }).buffer;
          } else throw a;
        }
        let s = 0;
        for (; ; ) {
          let { done: a, value: u } = await o.read();
          if (a) break;
          let d = u.byteLength;
          new Uint8Array(i, s, d).set(u), s += d;
        }
        return new Uint8Array(i, 0, r);
      }
    } else return e instanceof Blob ? new Uint8Array(await e.arrayBuffer()) : e instanceof Uint8Array ? e : new Uint8Array(e);
  };
});
var id, sd, uo, lo, Gt, ad, Z, Pe = k(() => {
  N();
  id = ["V", "I", "W", "E", "F"], sd = (e, t) => {
    console.log(`[${id[e]},${(/* @__PURE__ */ new Date()).toISOString()}]${t}`);
  }, Gt = (e, t) => {
    uo = e, lo = t;
  }, ad = (e, t) => {
    let n = ft(e), r = ft(uo);
    n >= r && sd(n, typeof t == "function" ? t() : t);
  }, Z = (...e) => {
    lo && ad(...e);
  };
});
var On, ze, x$1, Ye, Ht, co, po, H = k(() => {
  On = class {
    static calcMatMulShape(t, n) {
      return t[1] !== n[0] ? void 0 : [t[0], n[1]];
    }
  }, ze = class {
    static calcShape(t, n, r = false) {
      let o = t.length, i = n.length;
      if (o === 0) return n;
      if (i === 0) return t;
      let s = Math.max(t.length, n.length), a = new Array(s);
      if (r) {
        if (o < 2 || i < 2) return;
        let u = On.calcMatMulShape([t[o - 2], t[o - 1]], [n[i - 2], n[i - 1]]);
        if (u === void 0) return;
        [a[s - 2], a[s - 1]] = u;
      }
      for (let u = r ? 3 : 1; u <= s; u++) {
        let d = o - u < 0 ? 1 : t[o - u], l = i - u < 0 ? 1 : n[i - u];
        if (d !== l && d > 1 && l > 1) return;
        let c = Math.max(d, l);
        if (d && l) a[s - u] = Math.max(d, l);
        else {
          if (c > 1) return;
          a[s - u] = 0;
        }
      }
      return a;
    }
    static isValidBroadcast(t, n) {
      let r = t.length, o = n.length;
      if (r > o) return false;
      for (let i = 1; i <= r; i++) if (t[r - i] !== 1 && t[r - i] !== n[o - i]) return false;
      return true;
    }
  }, x$1 = class e {
    static size(t) {
      return e.getSizeFromDimensionRange(t, 0, t.length);
    }
    static convertShape(t, n = 4) {
      let r = t.length;
      if (r === 0) return [];
      let o = new Array(r), i = r - 1;
      for (; i >= 0; ) {
        if (t[i] % n === 0) {
          o[i] = t[i] / n;
          break;
        }
        if (n % t[i] !== 0) throw new Error("cannot convert shape");
        o[i] = 1, n /= t[i], i--;
      }
      for (i--; i >= 0; i--) o[i] = t[i];
      return o;
    }
    static sizeFromDimension(t, n) {
      if (n < 0 || n > t.length) throw new Error(`invalid dimension of ${n} for sizeFromDimension as Tensor has ${t.length} dimensions.`);
      return e.getSizeFromDimensionRange(t, n, t.length);
    }
    static sizeToDimension(t, n) {
      if (n < 0 || n > t.length) throw new Error(`invalid dimension of ${n} for sizeToDimension as Tensor has ${t.length} dimensions.`);
      return e.getSizeFromDimensionRange(t, 0, n);
    }
    static getSizeFromDimensionRange(t, n, r) {
      let o = 1;
      for (let i = n; i < r; i++) {
        if (t[i] < 0) throw new Error("cannot get valid size from specified dimension range. Most likely the range contains negative values in them.");
        o *= Number(t[i]);
      }
      return o;
    }
    static computeStrides(t) {
      let n = t.length;
      if (n === 0) return [];
      if (n === 1) return [1];
      let r = new Array(n);
      r[n - 1] = 1, r[n - 2] = t[n - 1];
      for (let o = n - 3; o >= 0; --o) r[o] = r[o + 1] * t[o + 1];
      return r;
    }
    static normalizeAxis(t, n) {
      if (t < -n && t >= n) throw new Error("unsupported axis for this operation.");
      return t < 0 ? t + n : t;
    }
    static normalizeAxes(t, n) {
      return t.map((r) => this.normalizeAxis(r, n ?? t.length));
    }
    static sortBasedOnPerm(t, n) {
      return n ? n.map((r) => t[r]) : t.slice().reverse();
    }
    static padShape(t, n) {
      let r = t.length;
      return t.map((o, i) => o + n[i] + n[i + r]);
    }
    static areEqual(t, n) {
      return t.length !== n.length ? false : t.every((r, o) => r === n[o]);
    }
  }, Ye = class e {
    static adjustPoolAttributes(t, n, r, o, i, s) {
      if (!t && r.length !== n.length - 2) throw new Error("length of specified kernel shapes should be 2 less than length of input dimensions");
      if (t) for (let a = 0; a < n.length - 2; a++) a >= r.length ? r.push(n[a + 2]) : r[a] = n[a + 2];
      for (let a = 0; a < r.length; a++) if (a < o.length) {
        if (o[a] < 0) throw new Error("strides should be greater than or equal to 1");
      } else o.push(1);
      for (let a = 0; a < r.length; a++) if (a < i.length) {
        if (i[a] < 0) throw new Error("dilations should be greater than or equal to 1");
      } else i.push(1);
      for (let a = 0; a < r.length * 2; a++) if (a < s.length) {
        if (s[a] < 0) throw new Error("pad should be greater than or equal to 1");
      } else s.push(0);
      for (let a = 0; a < r.length; a++) {
        if (r[a] <= 0) throw new Error("kernel shapes need to be greater than 0");
        if (s[a] >= r[a] || s[a + r.length] >= r[a]) throw new Error("pads should be smaller than kernel");
      }
    }
    static adjustPadsBasedOnAutoPad(t, n, r, o, i, s, a) {
      if (a) {
        if (i.length !== 2 * (t.length - 2)) throw new Error("length of pads should be twice the length of data dimensions");
        if (n.length !== t.length - 2) throw new Error("length of strides should be the length of data dimensions");
        if (o.length !== t.length - 2) throw new Error("length of kernel shapes should be the length of data dimensions");
        for (let u = 0; u < t.length - 2; u++) e.adjustPadAndReturnShape(t[u + (s ? 1 : 2)], n[u], r[u], o[u], i, u, u + t.length - 2, a);
      }
    }
    static computePoolOutputShape(t, n, r, o, i, s, a) {
      if (n.length <= 0) throw new Error("input shape must be of size greater than 0");
      let u = [n[0], n[1]];
      return e.computeShapeHelper(t, n, u, r, o, i, s, a), u;
    }
    static computeConvOutputShape(t, n, r, o, i, s, a) {
      if (t.length <= 0 || n.length <= 0) throw new Error("invalid input tensor dims or invalid filter tensor dims");
      let u = [t[0], n[0]];
      return e.computeShapeHelper(false, t, u, r, o, i, s, a), u;
    }
    static computeShapeHelper(t, n, r, o, i, s, a, u) {
      if (t) for (let d = 0; d < n.length - 2; d++) r.push(1);
      else for (let d = 0; d < n.length - 2; d++) r.push(e.adjustPadAndReturnShape(n[d + 2], o[d], i[d], s[d], a, d, d + n.length - 2, u));
    }
    static adjustPadAndReturnShape(t, n, r, o, i, s, a, u) {
      let d = r * (o - 1) + 1;
      if (u && u !== "NOTSET") switch (u) {
        case "VALID":
          return i[s] = 0, i[a] = 0, Math.floor((t - d) / n + 1);
        case "SAME_LOWER":
        case "SAME_UPPER":
          if (r !== 1) throw new Error("Dilation not supported for SAME_UPPER or SAME_LOWER");
          {
            let c = ((t + n - 1) / n - 1) * n + o - t;
            return i[s] = Math.floor(u === "SAME_LOWER" ? (c + 1) / 2 : c / 2), i[a] = c - i[s], Math.floor((t + c - o) / n + 1);
          }
        default:
          throw new Error("Unsupported AutoPad type");
      }
      else return Math.floor((t + i[s] + i[a] - d) / n + 1);
    }
  }, Ht = class {
    static getShapeOfGemmResult(t, n, r, o, i) {
      if (t.length !== 2 || r.length !== 2) throw new Error("shape need to be of size 2");
      let s, a, u;
      n ? (s = t[1], a = t[0]) : (s = t[0], a = t[1]);
      let d = -1;
      if (o ? (u = r[0], d = 1) : (u = r[1], d = 0), r[d] !== a) throw new Error("dimension mismatch");
      if (s <= 0 || u <= 0 || a <= 0) throw new Error("invalid shape specified");
      if (i && !ze.isValidBroadcast(i, [s, u])) throw new Error("gemm: invalid bias shape for broadcast");
      return [s, u, a];
    }
  }, co = -34028234663852886e22, po = 34028234663852886e22;
});
var qt, Mn = k(() => {
  N();
  qt = (e, t) => new (ot(t))(e);
});
var fo, Rn, ho, ud, mo, dd, go, Ft, Kt, Un, yo, bo = k(() => {
  N();
  Pe();
  fo = /* @__PURE__ */ new Map([["float32", 32], ["float16", 16], ["int32", 32], ["uint32", 32], ["int64", 64], ["uint64", 64], ["int8", 8], ["uint8", 8], ["int4", 4], ["uint4", 4]]), Rn = (e, t) => {
    if (t === "int32") return e;
    let n = fo.get(t);
    if (!n) throw new Error(`WebNN backend does not support data type: ${t}`);
    let r = n / 8;
    if (e.byteLength % r !== 0) throw new Error(`Invalid Uint8Array length - must be a multiple of ${r}.`);
    let o = e.byteLength / r, i = new (ot(t))(e.buffer, e.byteOffset, o);
    switch (t) {
      case "int64":
      case "uint64": {
        let s = new Int32Array(o);
        for (let a = 0; a < o; a++) {
          let u = i[a];
          if (u > 2147483647n || u < -2147483648n) throw new Error("Can not convert int64 data to int32 - value out of range.");
          s[a] = Number(u);
        }
        return new Uint8Array(s.buffer);
      }
      case "int8":
      case "uint8":
      case "uint32": {
        if (t === "uint32" && i.some((a) => a > 2147483647)) throw new Error("Can not convert uint32 data to int32 - value out of range.");
        let s = Int32Array.from(i, Number);
        return new Uint8Array(s.buffer);
      }
      default:
        throw new Error(`Unsupported data conversion from ${t} to 'int32'`);
    }
  }, ho = (e, t) => {
    if (t === "int32") return e;
    if (e.byteLength % 4 !== 0) throw new Error("Invalid Uint8Array length - must be a multiple of 4 (int32).");
    let n = e.byteLength / 4, r = new Int32Array(e.buffer, e.byteOffset, n);
    switch (t) {
      case "int64": {
        let o = BigInt64Array.from(r, BigInt);
        return new Uint8Array(o.buffer);
      }
      case "uint64": {
        if (r.some((i) => i < 0)) throw new Error("Can not convert int32 data to uin64 - negative value found.");
        let o = BigUint64Array.from(r, BigInt);
        return new Uint8Array(o.buffer);
      }
      case "int8": {
        if (r.some((i) => i < -128 || i > 127)) throw new Error("Can not convert int32 data to int8 - value out of range.");
        let o = Int8Array.from(r, Number);
        return new Uint8Array(o.buffer);
      }
      case "uint8": {
        if (r.some((o) => o < 0 || o > 255)) throw new Error("Can not convert int32 data to uint8 - value out of range.");
        return Uint8Array.from(r, Number);
      }
      case "uint32": {
        if (r.some((i) => i < 0)) throw new Error("Can not convert int32 data to uint32 - negative value found.");
        let o = Uint32Array.from(r, Number);
        return new Uint8Array(o.buffer);
      }
      default:
        throw new Error(`Unsupported data conversion from 'int32' to ${t}`);
    }
  }, ud = 1, mo = () => ud++, dd = /* @__PURE__ */ new Map([["int8", "int32"], ["uint8", "int32"], ["uint32", "int32"], ["int64", "int32"]]), go = (e, t) => {
    let n = fo.get(e);
    if (!n) throw new Error(`WebNN backend does not support data type: ${e}`);
    return t.length > 0 ? Math.ceil(t.reduce((r, o) => r * o) * n / 8) : 0;
  }, Ft = class {
    constructor(t) {
      this.isDataConverted = false;
      let { sessionId: n, context: r, tensor: o, dataType: i, shape: s, fallbackDataType: a } = t;
      this.sessionId = n, this.mlContext = r, this.mlTensor = o, this.dataType = i, this.tensorShape = s, this.fallbackDataType = a;
    }
    get tensor() {
      return this.mlTensor;
    }
    get type() {
      return this.dataType;
    }
    get fallbackType() {
      return this.fallbackDataType;
    }
    get shape() {
      return this.tensorShape;
    }
    get byteLength() {
      return go(this.dataType, this.tensorShape);
    }
    destroy() {
      Z("verbose", () => "[WebNN] TensorWrapper.destroy"), this.mlTensor.destroy();
    }
    write(t) {
      this.mlContext.writeTensor(this.mlTensor, t);
    }
    async read(t) {
      if (this.fallbackDataType) {
        let n = await this.mlContext.readTensor(this.mlTensor), r = ho(new Uint8Array(n), this.dataType);
        if (t) {
          (t instanceof ArrayBuffer ? new Uint8Array(t) : new Uint8Array(t.buffer, t.byteOffset, t.byteLength)).set(r);
          return;
        } else return r.buffer;
      } else return t ? this.mlContext.readTensor(this.mlTensor, t) : this.mlContext.readTensor(this.mlTensor);
    }
    canReuseTensor(t, n, r) {
      return this.mlContext === t && this.dataType === n && this.tensorShape.length === r.length && this.tensorShape.every((o, i) => o === r[i]);
    }
    setIsDataConverted(t) {
      this.isDataConverted = t;
    }
  }, Kt = class {
    constructor(t, n) {
      this.tensorManager = t;
      this.wrapper = n;
    }
    get tensorWrapper() {
      return this.wrapper;
    }
    releaseTensor() {
      this.tensorWrapper && (this.tensorManager.releaseTensor(this.tensorWrapper), this.wrapper = void 0);
    }
    async ensureTensor(t, n, r, o) {
      let i = this.tensorManager.getMLContext(t), s = this.tensorManager.getMLOpSupportLimits(t), a;
      if (!s?.input.dataTypes.includes(n)) {
        if (a = dd.get(n), !a || s?.input.dataTypes.includes(a)) throw new Error(`WebNN backend does not support data type: ${n}`);
        Z("verbose", () => `[WebNN] TensorIdTracker.ensureTensor: fallback dataType from ${n} to ${a}`);
      }
      if (this.wrapper) {
        if (this.wrapper.canReuseTensor(i, n, r)) return this.wrapper.tensor;
        if (o) {
          if (this.wrapper.byteLength !== go(n, r)) throw new Error("Unable to copy data to tensor with different size.");
          this.activeUpload = new Uint8Array(await this.wrapper.read());
        }
        this.tensorManager.releaseTensor(this.wrapper);
      }
      let u = typeof MLTensorUsage > "u" ? void 0 : MLTensorUsage.READ | MLTensorUsage.WRITE;
      return this.wrapper = await this.tensorManager.getCachedTensor(t, n, r, u, true, true, a), o && this.activeUpload && (this.wrapper.write(this.activeUpload), this.activeUpload = void 0), this.wrapper.tensor;
    }
    upload(t) {
      let n = t;
      if (this.wrapper) {
        if (this.wrapper.fallbackType) if (this.wrapper.fallbackType === "int32") n = Rn(t, this.wrapper.type), this.wrapper.setIsDataConverted(true);
        else throw new Error(`Unsupported fallback data type: ${this.wrapper.fallbackType}`);
        if (t.byteLength === this.wrapper.byteLength) {
          this.wrapper.write(n);
          return;
        } else Z("verbose", () => "Data size does not match tensor size. Releasing tensor."), this.releaseTensor();
      }
      this.activeUpload ? this.activeUpload.set(n) : this.activeUpload = new Uint8Array(n);
    }
    async download(t) {
      if (this.activeUpload) {
        let n = this.wrapper?.isDataConverted ? ho(this.activeUpload, this.wrapper?.type) : this.activeUpload;
        if (t) {
          t instanceof ArrayBuffer ? new Uint8Array(t).set(n) : new Uint8Array(t.buffer, t.byteOffset, t.byteLength).set(n);
          return;
        } else return n.buffer;
      }
      if (!this.wrapper) throw new Error("Tensor has not been created.");
      return t ? this.wrapper.read(t) : this.wrapper.read();
    }
  }, Un = class {
    constructor(t) {
      this.backend = t;
      this.tensorTrackersById = /* @__PURE__ */ new Map();
      this.freeTensors = [];
      this.externalTensors = /* @__PURE__ */ new Set();
    }
    getMLContext(t) {
      let n = this.backend.getMLContext(t);
      if (!n) throw new Error("MLContext not found for session.");
      return n;
    }
    getMLOpSupportLimits(t) {
      return this.backend.getMLOpSupportLimits(t);
    }
    reserveTensorId() {
      let t = mo();
      return this.tensorTrackersById.set(t, new Kt(this)), t;
    }
    releaseTensorId(t) {
      let n = this.tensorTrackersById.get(t);
      n && (this.tensorTrackersById.delete(t), n.tensorWrapper && this.releaseTensor(n.tensorWrapper));
    }
    async ensureTensor(t, n, r, o, i) {
      Z("verbose", () => `[WebNN] TensorManager.ensureTensor {tensorId: ${n}, dataType: ${r}, shape: ${o}, copyOld: ${i}}`);
      let s = this.tensorTrackersById.get(n);
      if (!s) throw new Error("Tensor not found.");
      return s.ensureTensor(t, r, o, i);
    }
    upload(t, n) {
      let r = this.tensorTrackersById.get(t);
      if (!r) throw new Error("Tensor not found.");
      r.upload(n);
    }
    async download(t, n) {
      Z("verbose", () => `[WebNN] TensorManager.download {tensorId: ${t}, dstBuffer: ${n?.byteLength}}`);
      let r = this.tensorTrackersById.get(t);
      if (!r) throw new Error("Tensor not found.");
      return r.download(n);
    }
    releaseTensorsForSession(t) {
      for (let n of this.freeTensors) n.sessionId === t && n.destroy();
      this.freeTensors = this.freeTensors.filter((n) => n.sessionId !== t);
    }
    registerTensor(t, n, r, o) {
      let i = this.getMLContext(t), s = mo(), a = new Ft({ sessionId: t, context: i, tensor: n, dataType: r, shape: o });
      return this.tensorTrackersById.set(s, new Kt(this, a)), this.externalTensors.add(a), s;
    }
    async getCachedTensor(t, n, r, o, i, s, a) {
      let u = this.getMLContext(t);
      for (let [l, c] of this.freeTensors.entries()) if (c.canReuseTensor(u, n, r)) {
        Z("verbose", () => `[WebNN] Reusing tensor {dataType: ${n}, ${a ? `fallbackDataType: ${a},` : ""} shape: ${r}`);
        let p = this.freeTensors.splice(l, 1)[0];
        return p.sessionId = t, p;
      }
      Z("verbose", () => `[WebNN] MLContext.createTensor {dataType: ${n}, ${a ? `fallbackDataType: ${a},` : ""} shape: ${r}}`);
      let d = await u.createTensor({ dataType: a ?? n, shape: r, dimensions: r, usage: o, writable: i, readable: s });
      return new Ft({ sessionId: t, context: u, tensor: d, dataType: n, shape: r, fallbackDataType: a });
    }
    releaseTensor(t) {
      this.externalTensors.has(t) && this.externalTensors.delete(t), this.freeTensors.push(t);
    }
  }, yo = (...e) => new Un(...e);
});
var jt, ld, Zt, _o = k(() => {
  N();
  Ge();
  Mn();
  bo();
  Pe();
  jt = /* @__PURE__ */ new Map([[1, "float32"], [10, "float16"], [6, "int32"], [12, "uint32"], [7, "int64"], [13, "uint64"], [22, "int4"], [21, "uint4"], [3, "int8"], [2, "uint8"], [9, "uint8"]]), ld = (e, t) => {
    if (e === t) return true;
    if (e === void 0 || t === void 0) return false;
    let n = Object.keys(e).sort(), r = Object.keys(t).sort();
    return n.length === r.length && n.every((o, i) => o === r[i] && e[o] === t[o]);
  }, Zt = class {
    constructor(t) {
      this.tensorManager = yo(this);
      this.mlContextBySessionId = /* @__PURE__ */ new Map();
      this.sessionIdsByMLContext = /* @__PURE__ */ new Map();
      this.mlContextCache = [];
      this.sessionGraphInputs = /* @__PURE__ */ new Map();
      this.sessionGraphOutputs = /* @__PURE__ */ new Map();
      this.temporaryGraphInputs = [];
      this.temporaryGraphOutputs = [];
      this.temporarySessionTensorIds = /* @__PURE__ */ new Map();
      this.mlOpSupportLimitsBySessionId = /* @__PURE__ */ new Map();
      Gt(t.logLevel, !!t.debug);
    }
    get currentSessionId() {
      if (this.activeSessionId === void 0) throw new Error("No active session");
      return this.activeSessionId;
    }
    onRunStart(t) {
      Z("verbose", () => `[WebNN] onRunStart {sessionId: ${t}}`), this.activeSessionId = t;
    }
    onRunEnd(t) {
      Z("verbose", () => `[WebNN] onRunEnd {sessionId: ${t}}`);
      let n = this.temporarySessionTensorIds.get(t);
      if (n) {
        for (let r of n) Z("verbose", () => `[WebNN] releasing temporary tensor {tensorId: ${r}}`), this.tensorManager.releaseTensorId(r);
        this.temporarySessionTensorIds.delete(t), this.activeSessionId = void 0;
      }
    }
    async createMLContext(t) {
      if (t instanceof GPUDevice) {
        let r = this.mlContextCache.findIndex((o) => o.gpuDevice === t);
        if (r !== -1) return this.mlContextCache[r].mlContext;
        {
          let o = await navigator.ml.createContext(t);
          return this.mlContextCache.push({ gpuDevice: t, mlContext: o }), o;
        }
      } else if (t === void 0) {
        let r = this.mlContextCache.findIndex((o) => o.options === void 0 && o.gpuDevice === void 0);
        if (r !== -1) return this.mlContextCache[r].mlContext;
        {
          let o = await navigator.ml.createContext();
          return this.mlContextCache.push({ mlContext: o }), o;
        }
      }
      let n = this.mlContextCache.findIndex((r) => ld(r.options, t));
      if (n !== -1) return this.mlContextCache[n].mlContext;
      {
        let r = await navigator.ml.createContext(t);
        return this.mlContextCache.push({ options: t, mlContext: r }), r;
      }
    }
    registerMLContext(t, n) {
      this.mlContextBySessionId.set(t, n);
      let r = this.sessionIdsByMLContext.get(n);
      r || (r = /* @__PURE__ */ new Set(), this.sessionIdsByMLContext.set(n, r)), r.add(t), this.mlOpSupportLimitsBySessionId.has(t) || this.mlOpSupportLimitsBySessionId.set(t, n.opSupportLimits()), this.temporaryGraphInputs.length > 0 && (this.sessionGraphInputs.set(t, this.temporaryGraphInputs), this.temporaryGraphInputs = []), this.temporaryGraphOutputs.length > 0 && (this.sessionGraphOutputs.set(t, this.temporaryGraphOutputs), this.temporaryGraphOutputs = []);
    }
    onReleaseSession(t) {
      this.sessionGraphInputs.delete(t), this.sessionGraphOutputs.delete(t);
      let n = this.mlContextBySessionId.get(t);
      if (!n) return;
      this.tensorManager.releaseTensorsForSession(t), this.mlContextBySessionId.delete(t), this.mlOpSupportLimitsBySessionId.delete(t);
      let r = this.sessionIdsByMLContext.get(n);
      if (r.delete(t), r.size === 0) {
        this.sessionIdsByMLContext.delete(n);
        let o = this.mlContextCache.findIndex((i) => i.mlContext === n);
        o !== -1 && this.mlContextCache.splice(o, 1);
      }
    }
    getMLContext(t) {
      return this.mlContextBySessionId.get(t);
    }
    getMLOpSupportLimits(t) {
      return this.mlOpSupportLimitsBySessionId.get(t);
    }
    reserveTensorId() {
      return this.tensorManager.reserveTensorId();
    }
    releaseTensorId(t) {
      Z("verbose", () => `[WebNN] releaseTensorId {tensorId: ${t}}`), this.tensorManager.releaseTensorId(t);
    }
    async ensureTensor(t, n, r, o, i) {
      let s = jt.get(r);
      if (!s) throw new Error(`Unsupported ONNX data type: ${r}`);
      return this.tensorManager.ensureTensor(t ?? this.currentSessionId, n, s, o, i);
    }
    async createTemporaryTensor(t, n, r) {
      Z("verbose", () => `[WebNN] createTemporaryTensor {onnxDataType: ${n}, shape: ${r}}`);
      let o = jt.get(n);
      if (!o) throw new Error(`Unsupported ONNX data type: ${n}`);
      let i = this.tensorManager.reserveTensorId();
      await this.tensorManager.ensureTensor(t, i, o, r, false);
      let s = this.temporarySessionTensorIds.get(t);
      return s ? s.push(i) : this.temporarySessionTensorIds.set(t, [i]), i;
    }
    uploadTensor(t, n) {
      if (!te().shouldTransferToMLTensor) throw new Error("Trying to upload to a MLTensor while shouldTransferToMLTensor is false");
      Z("verbose", () => `[WebNN] uploadTensor {tensorId: ${t}, data: ${n.byteLength}}`), this.tensorManager.upload(t, n);
    }
    async downloadTensor(t, n) {
      return this.tensorManager.download(t, n);
    }
    createMLTensorDownloader(t, n) {
      return async () => {
        let r = await this.tensorManager.download(t);
        return qt(r, n);
      };
    }
    registerMLTensor(t, n, r, o) {
      let i = jt.get(r);
      if (!i) throw new Error(`Unsupported ONNX data type: ${r}`);
      let s = this.tensorManager.registerTensor(t, n, i, o);
      return Z("verbose", () => `[WebNN] registerMLTensor {tensor: ${n}, dataType: ${i}, dimensions: ${o}} -> {tensorId: ${s}}`), s;
    }
    registerMLConstant(t, n, r, o, i, s, a = false) {
      if (!s) throw new Error("External mounted files are not available.");
      let u = t;
      t.startsWith("./") && (u = t.substring(2));
      let d = s.get(u);
      if (!d) throw new Error(`File with name ${u} not found in preloaded files.`);
      if (n + r > d.byteLength) throw new Error("Out of bounds: data offset and length exceed the external file data size.");
      let l = d.slice(n, n + r).buffer, c;
      switch (i.dataType) {
        case "float32":
          c = new Float32Array(l);
          break;
        case "float16":
          c = typeof Float16Array < "u" && Float16Array.from ? new Float16Array(l) : new Uint16Array(l);
          break;
        case "int32":
          c = new Int32Array(l);
          break;
        case "uint32":
          c = new Uint32Array(l);
          break;
        case "int64":
          if (a) {
            let p = Rn(new Uint8Array(l), "int64");
            c = new Int32Array(p.buffer), i.dataType = "int32";
          } else c = new BigInt64Array(l);
          break;
        case "uint64":
          c = new BigUint64Array(l);
          break;
        case "int8":
          c = new Int8Array(l);
          break;
        case "int4":
        case "uint4":
        case "uint8":
          c = new Uint8Array(l);
          break;
        default:
          throw new Error(`Unsupported data type: ${i.dataType} in creating WebNN Constant from external data.`);
      }
      return Z("verbose", () => `[WebNN] registerMLConstant {dataType: ${i.dataType}, shape: ${i.shape}}} ${a ? "(Note: it was int64 data type and registered to int32 as workaround)" : ""}`), o.constant(i, c);
    }
    registerGraphInput(t) {
      this.temporaryGraphInputs.push(t);
    }
    registerGraphOutput(t) {
      this.temporaryGraphOutputs.push(t);
    }
    isGraphInput(t, n) {
      let r = this.sessionGraphInputs.get(t);
      return r ? r.includes(n) : false;
    }
    isGraphOutput(t, n) {
      let r = this.sessionGraphOutputs.get(t);
      return r ? r.includes(n) : false;
    }
    isGraphInputOutputTypeSupported(t, n, r = true) {
      let o = jt.get(He(n)), i = this.mlOpSupportLimitsBySessionId.get(t);
      return typeof o > "u" ? false : r ? !!i?.input.dataTypes.includes(o) : !!i?.output.dataTypes.includes(o);
    }
    flush() {
    }
  };
});
var Qt = k(() => {
});
var wo, Vn, Nn, cd, pd, $o, Wn, Ln, xo, So = k(() => {
  Pe();
  Qt();
  wo = /* @__PURE__ */ new Map([[64, 250], [128, 200], [256, 200], [512, 200], [2048, 230], [4096, 200], [8192, 50], [16384, 50], [32768, 50], [65536, 50], [131072, 50], [262144, 50], [524288, 50], [1048576, 50], [2097152, 30], [4194304, 20], [8388608, 10], [12582912, 10], [16777216, 10], [26214400, 15], [33554432, 22], [44236800, 2], [58982400, 6], [67108864, 6], [134217728, 6], [167772160, 6]]), Vn = [], Nn = (e) => Math.ceil(Number(e) / 16) * 16, cd = (e) => {
    for (let t = 0; t < Vn.length; t++) {
      let n = Vn[t];
      if (e <= n) return n;
    }
    return Math.ceil(e / 16) * 16;
  }, pd = 1, $o = () => pd++, Wn = async (e, t, n, r) => {
    let o = Nn(n), i = e.device.createBuffer({ size: o, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    try {
      let s = e.getCommandEncoder();
      e.endComputePass(), s.copyBufferToBuffer(t, 0, i, 0, o), e.flush(), await i.mapAsync(GPUMapMode.READ);
      let a = i.getMappedRange();
      if (r) {
        let u = r();
        return u.set(new Uint8Array(a, 0, n)), u;
      } else return new Uint8Array(a.slice(0, n));
    } finally {
      i.destroy();
    }
  }, Ln = class {
    constructor(t) {
      this.backend = t;
      this.storageCache = /* @__PURE__ */ new Map(), this.freeBuffers = /* @__PURE__ */ new Map(), this.freeUniformBuffers = /* @__PURE__ */ new Map(), this.buffersPending = [], this.capturedPendingBuffers = /* @__PURE__ */ new Map();
      for (let [n] of wo) Vn.push(n), this.freeBuffers.set(n, []), this.freeUniformBuffers.set(n, []);
      this.sessionCount = 0;
    }
    upload(t, n) {
      let r = n.buffer, o = n.byteOffset, i = n.byteLength, s = Nn(i), a = this.storageCache.get(t);
      if (!a) throw new Error("gpu data for uploading does not exist");
      if (Number(a.originalSize) !== i) throw new Error(`inconsistent data size. gpu data size=${a.originalSize}, data size=${i}`);
      let u = this.backend.device.createBuffer({ mappedAtCreation: true, size: s, usage: GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_SRC }), d = u.getMappedRange();
      new Uint8Array(d).set(new Uint8Array(r, o, i)), u.unmap();
      let l = this.backend.device.createCommandEncoder();
      l.copyBufferToBuffer(u, 0, a.gpuData.buffer, 0, s), this.backend.device.queue.submit([l.finish()]), u.destroy(), Z("verbose", () => `[WebGPU] GpuDataManager.upload(id=${t})`);
    }
    memcpy(t, n) {
      let r = this.storageCache.get(t);
      if (!r) throw new Error("source gpu data for memcpy does not exist");
      let o = this.storageCache.get(n);
      if (!o) throw new Error("destination gpu data for memcpy does not exist");
      if (r.originalSize !== o.originalSize) throw new Error("inconsistent source and destination gpu data size");
      let i = Nn(r.originalSize), s = this.backend.getCommandEncoder();
      this.backend.endComputePass(), s.copyBufferToBuffer(r.gpuData.buffer, 0, o.gpuData.buffer, 0, i);
    }
    registerExternalBuffer(t, n, r) {
      let o;
      if (r) {
        if (o = r[0], t === r[1]) return Z("verbose", () => `[WebGPU] GpuDataManager.registerExternalBuffer(size=${n}) => id=${o}, buffer is the same, skip.`), o;
        if (this.backend.capturedCommandList.has(this.backend.currentSessionId)) throw new Error(`Registering a different external buffer under graph capture mode is not supported yet.
             Please use the previous external buffer!`);
      } else o = $o();
      return this.storageCache.set(o, { gpuData: { id: o, type: 0, buffer: t }, originalSize: n }), Z("verbose", () => `[WebGPU] GpuDataManager.registerExternalBuffer(size=${n}) => id=${o}, registered.`), o;
    }
    unregisterExternalBuffer(t) {
      t !== void 0 && (this.storageCache.delete(t), Z("verbose", () => `[WebGPU] GpuDataManager.unregisterExternalBuffer() => id=${t}`));
    }
    create(t, n = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST) {
      let r = cd(t), o, i = (n & GPUBufferUsage.STORAGE) === GPUBufferUsage.STORAGE, s = (n & GPUBufferUsage.UNIFORM) === GPUBufferUsage.UNIFORM;
      if (i || s) {
        let d = (i ? this.freeBuffers : this.freeUniformBuffers).get(r);
        d ? d.length > 0 ? o = d.pop() : o = this.backend.device.createBuffer({ size: r, usage: n }) : o = this.backend.device.createBuffer({ size: r, usage: n });
      } else o = this.backend.device.createBuffer({ size: r, usage: n });
      let a = { id: $o(), type: 0, buffer: o };
      return this.storageCache.set(a.id, { gpuData: a, originalSize: Number(t) }), Z("verbose", () => `[WebGPU] GpuDataManager.create(size=${t}) => id=${a.id}`), a;
    }
    get(t) {
      return this.storageCache.get(t)?.gpuData;
    }
    release(t) {
      let n = typeof t == "bigint" ? Number(t) : t, r = this.storageCache.get(n);
      if (!r) {
        if (this.storageCache.size === 0) return 0;
        throw new Error("releasing data does not exist");
      }
      return Z("verbose", () => `[WebGPU] GpuDataManager.release(id=${n}), gpuDataId=${r.gpuData.id}`), this.storageCache.delete(n), this.buffersPending.push(r.gpuData.buffer), r.originalSize;
    }
    async download(t, n) {
      let r = this.storageCache.get(Number(t));
      if (!r) throw new Error("data does not exist");
      await Wn(this.backend, r.gpuData.buffer, r.originalSize, n);
    }
    refreshPendingBuffers() {
      if (this.buffersPending.length !== 0) if (this.backend.sessionStatus === "default") {
        for (let t of this.buffersPending) {
          let n = wo.get(t.size);
          if ((t.usage & GPUBufferUsage.STORAGE) === GPUBufferUsage.STORAGE) {
            let r = this.freeBuffers.get(t.size) || [];
            n === void 0 || r.length >= n ? t.destroy() : r.push(t);
          } else if ((t.usage & GPUBufferUsage.UNIFORM) === GPUBufferUsage.UNIFORM) {
            let r = this.freeUniformBuffers.get(t.size) || [];
            n === void 0 || r.length >= n ? t.destroy() : r.push(t);
          } else t.destroy();
        }
        this.buffersPending = [];
      } else {
        let t = this.capturedPendingBuffers.get(this.backend.currentSessionId);
        t || (t = [], this.capturedPendingBuffers.set(this.backend.currentSessionId, t));
        for (let n of this.buffersPending) t.push(n);
        this.buffersPending = [];
      }
    }
    dispose() {
      this.freeBuffers.forEach((t) => {
        t.forEach((n) => {
          n.destroy();
        });
      }), this.freeUniformBuffers.forEach((t) => {
        t.forEach((n) => {
          n.destroy();
        });
      }), this.storageCache.forEach((t) => {
        t.gpuData.buffer.destroy();
      }), this.capturedPendingBuffers.forEach((t) => {
        t.forEach((n) => {
          n.destroy();
        });
      }), this.storageCache = /* @__PURE__ */ new Map(), this.freeBuffers = /* @__PURE__ */ new Map(), this.freeUniformBuffers = /* @__PURE__ */ new Map(), this.capturedPendingBuffers = /* @__PURE__ */ new Map();
    }
    onCreateSession() {
      this.sessionCount += 1;
    }
    onReleaseSession(t) {
      let n = this.capturedPendingBuffers.get(t);
      n && (n.forEach((r) => {
        r.destroy();
      }), this.capturedPendingBuffers.delete(t)), this.sessionCount -= 1, this.sessionCount === 0 && (Z("warning", () => "[WebGPU] Clearing webgpu buffer cache"), this.storageCache.forEach((r) => {
        r.gpuData.buffer.destroy();
      }), this.storageCache = /* @__PURE__ */ new Map());
    }
  }, xo = (...e) => new Ln(...e);
});
var Gn, L, ue = k(() => {
  Gn = class {
    constructor(t) {
      Object.assign(this, t);
    }
    get cacheKey() {
      return this.key || (this.key = Object.getOwnPropertyNames(this).sort().map((t) => `${this[t]}`).join(";")), this.key;
    }
  }, L = (e) => new Gn(e);
});
var Je, qn, re, pe, P, J, Fn, et$1, Ie, D, Xt, S, C, To, Yt, Hn, Io, F = k(() => {
  N();
  H();
  Je = 64, qn = (e, t) => {
    if (t === 3) throw new Error("vec3 has same alignment as vec4, use vec4 instead");
    switch (Number(e)) {
      case 10:
        return t > 1 ? `vec${t}<f16>` : "f16";
      case 1:
        return t > 1 ? `vec${t}<f32>` : "f32";
      case 6:
        return t > 1 ? `vec${t}<i32>` : "i32";
      case 12:
        return t > 1 ? `vec${t}<u32>` : "u32";
      case 7:
        if (t > 1) throw new Error("currently not supported vecX of uint64 yet");
        return ["vec2<u32>", "i32"];
      case 13:
        if (t > 1) throw new Error("currently not supported vecX of uint64 yet");
        return ["vec2<u32>", "u32"];
      case 9:
        if (t !== 4) throw new Error("bool must be vec4");
        return ["u32", "vec4<bool>"];
      case 22:
        return "i32";
      case 21:
        return "u32";
      default:
        throw new Error(`Unknown data type: ${e}`);
    }
  }, re = (e, t = 1) => {
    let n = qn(e, t);
    return typeof n == "string" ? n : n[0];
  }, pe = (e, t = 1) => {
    let n = qn(e, t);
    return typeof n == "string" ? n : n[1];
  }, P = (...e) => {
    let t = [];
    return e.forEach((n) => {
      n.length !== 0 && t.push({ type: 12, data: n }, { type: 12, data: x$1.computeStrides(n) });
    }), t;
  }, J = (e) => e % 4 === 0 ? 4 : e % 2 === 0 ? 2 : 1, Fn = (e = "f32", t, n = "0") => !t || t === 1 ? `${e}(${n})` : `vec${t}<${e}>(${n})`, et$1 = (e, t, n) => e === "f32" ? n : t === 1 ? `f32(${n})` : `vec${t}<f32>(${n})`, Ie = (e, t) => t === 4 ? `(${e}.x + ${e}.y + ${e}.z + ${e}.w)` : t === 2 ? `(${e}.x + ${e}.y)` : t === 3 ? `(${e}.x + ${e}.y + ${e}.z)` : e, D = (e, t, n, r) => e.startsWith("uniforms.") && n > 4 ? typeof t == "string" ? r === "f16" ? `${e}[(${t}) / 8][(${t}) % 8 / 4][(${t}) % 8 % 4]` : `${e}[(${t}) / 4][(${t}) % 4]` : r === "f16" ? `${e}[${Math.floor(t / 8)}][${Math.floor(t % 8 / 4)}][${t % 8 % 4}]` : `${e}[${Math.floor(t / 4)}][${t % 4}]` : n > 1 ? `${e}[${t}]` : e, Xt = (e, t, n, r, o) => {
    let i = typeof n == "number", s = i ? n : n.length, a = [...new Array(s).keys()], u = s < 2 ? "u32" : s <= 4 ? `vec${s}<u32>` : `array<u32, ${s}>`, d = qn(t, o), l = typeof d == "string" ? d : d[1], c = typeof d == "string" ? d : d[0], p = { indices: u, value: l, storage: c, tensor: t }, f = (A) => typeof A == "string" ? A : `${A}u`, m = { offsetToIndices: false, indicesToOffset: false, broadcastedIndicesToOffset: false, set: false, setByIndices: false, get: false, getByIndices: false }, h = i ? "uniforms." : "", _ = `${h}${e}_shape`, y = `${h}${e}_strides`, g = "";
    for (let A = 0; A < s - 1; A++) g += `
    let dim${A} = current / ${D(y, A, s)};
    let rest${A} = current % ${D(y, A, s)};
    indices[${A}] = dim${A};
    current = rest${A};
    `;
    g += `indices[${s - 1}] = current;`;
    let b = s < 2 ? "" : `
  fn o2i_${e}(offset: u32) -> ${p.indices} {
    var indices: ${p.indices};
    var current = offset;
    ${g}
    return indices;
  }`, w = (A) => (m.offsetToIndices = true, s < 2 ? A : `o2i_${e}(${A})`), v = [];
    if (s >= 2) for (let A = s - 1; A >= 0; A--) v.push(`${D(y, A, s)} * (indices[${A}])`);
    let $ = s < 2 ? "" : `
  fn i2o_${e}(indices: ${p.indices}) -> u32 {
    return ${v.join("+")};
  }`, T = (A) => (m.indicesToOffset = true, s < 2 ? A : `i2o_${e}(${A})`), I = (...A) => s === 0 ? "0u" : `${p.indices}(${A.map(f).join(",")})`, E = (A, B) => s < 2 ? `${A}` : `${D(A, B, s)}`, z = (A, B, oe) => s < 2 ? `${A}=${oe};` : `${D(A, B, s)}=${oe};`, M = {}, O = (A, B) => {
      m.broadcastedIndicesToOffset = true;
      let oe = `${B.name}broadcastedIndicesTo${e}Offset`;
      if (oe in M) return `${oe}(${A})`;
      let he = [];
      for (let ae = s - 1; ae >= 0; ae--) {
        let ge = B.indicesGet("outputIndices", ae + B.rank - s);
        he.push(`${E(y, ae)} * (${ge} % ${E(_, ae)})`);
      }
      return M[oe] = `fn ${oe}(outputIndices: ${B.type.indices}) -> u32 {
             return ${he.length > 0 ? he.join("+") : "0u"};
           }`, `${oe}(${A})`;
    }, W = (A, B) => (() => {
      if (p.storage === p.value) return `${e}[${A}]=${B};`;
      if (p.storage === "vec2<u32>" && p.value === "i32") return `${e}[${A}]=vec2<u32>(u32(${B}), select(0u, 0xFFFFFFFFu, ${B} < 0));`;
      if (p.storage === "vec2<u32>" && p.value === "u32") return `${e}[${A}]=vec2<u32>(u32(${B}), 0u);`;
      if (p.storage === "u32" && p.value === "vec4<bool>") return `${e}[${A}]=dot(vec4<u32>(0x1, 0x100, 0x10000, 0x1000000), vec4<u32>(${B}));`;
      throw new Error(`not supported combination of storage type ${p.storage} and value type ${p.value} yet`);
    })(), K = (A) => (() => {
      if (p.storage === p.value) return `${e}[${A}]`;
      if (p.storage === "vec2<u32>" && p.value === "i32") return `i32(${e}[${A}].x)`;
      if (p.storage === "vec2<u32>" && p.value === "u32") return `u32(${e}[${A}].x)`;
      if (p.storage === "u32" && p.value === "vec4<bool>") return `vec4<bool>(bool(${e}[${A}] & 0xFFu), bool(${e}[${A}] & 0xFF00u), bool(${e}[${A}] & 0xFF0000u), bool(${e}[${A}] & 0xFF000000u))`;
      throw new Error(`not supported combination of storage type ${p.storage} and value type ${p.value} yet`);
    })(), U = s < 2 ? "" : `
  fn get_${e}ByIndices(indices: ${p.indices}) -> ${l} {
    return ${K(`i2o_${e}(indices)`)};
  }`, R = s < 2 ? "" : (() => {
      let A = a.map((oe) => `d${oe}: u32`).join(", "), B = a.map((oe) => `d${oe}`).join(", ");
      return `
  fn get_${e}(${A}) -> ${l} {
    return get_${e}ByIndices(${I(B)});
  }`;
    })(), G = (...A) => {
      if (A.length !== s) throw new Error(`indices length must be ${s}`);
      let B = A.map(f).join(",");
      return s === 0 ? K("0u") : s === 1 ? K(B[0]) : (m.get = true, m.getByIndices = true, m.indicesToOffset = true, `get_${e}(${B})`);
    }, V = (A) => s < 2 ? K(A) : (m.getByIndices = true, m.indicesToOffset = true, `get_${e}ByIndices(${A})`), j = s < 2 ? "" : `
  fn set_${e}ByIndices(indices: ${p.indices}, value: ${l}) {
    ${W(`i2o_${e}(indices)`, "value")}
  }`, Q = s < 2 ? "" : (() => {
      let A = a.map((oe) => `d${oe}: u32`).join(", "), B = a.map((oe) => `d${oe}`).join(", ");
      return `
  fn set_${e}(${A}, value: ${l}) {
    set_${e}ByIndices(${I(B)}, value);
  }`;
    })();
    return { impl: () => {
      let A = [], B = false;
      return m.offsetToIndices && (A.push(b), B = true), m.indicesToOffset && (A.push($), B = true), m.broadcastedIndicesToOffset && (Object.values(M).forEach((oe) => A.push(oe)), B = true), m.set && (A.push(Q), B = true), m.setByIndices && (A.push(j), B = true), m.get && (A.push(R), B = true), m.getByIndices && (A.push(U), B = true), !i && B && A.unshift(`const ${_} = ${p.indices}(${n.join(",")});`, `const ${y} = ${p.indices}(${x$1.computeStrides(n).join(",")});`), A.join(`
`);
    }, type: p, offsetToIndices: w, indicesToOffset: T, broadcastedIndicesToOffset: O, indices: I, indicesGet: E, indicesSet: z, set: (...A) => {
      if (A.length !== s + 1) throw new Error(`indices length must be ${s}`);
      let B = A[s];
      if (typeof B != "string") throw new Error("value must be string");
      let oe = A.slice(0, s).map(f).join(",");
      return s === 0 ? W("0u", B) : s === 1 ? W(oe[0], B) : (m.set = true, m.setByIndices = true, m.indicesToOffset = true, `set_${e}(${oe}, ${B})`);
    }, setByOffset: W, setByIndices: (A, B) => s < 2 ? W(A, B) : (m.setByIndices = true, m.indicesToOffset = true, `set_${e}ByIndices(${A}, ${B});`), get: G, getByOffset: K, getByIndices: V, usage: r, name: e, strides: y, shape: _, rank: s };
  }, S = (e, t, n, r = 1) => Xt(e, t, n, "input", r), C = (e, t, n, r = 1) => Xt(e, t, n, "output", r), To = (e, t, n) => Xt(e, t, n, "atomicOutput", 1), Yt = (e, t, n, r = 1) => Xt(e, t, n, "internal", r), Hn = class {
    constructor(t, n) {
      this.normalizedDispatchGroup = t;
      this.limits = n;
      this.internalVariables = [];
      this.variables = [];
      this.uniforms = [];
      this.variableIndex = 0;
    }
    guardAgainstOutOfBoundsWorkgroupSizes(t) {
      return `if (global_idx >= ${typeof t == "number" ? `${t}u` : t}) { return; }`;
    }
    mainStart(t = Je) {
      let n = typeof t == "number" ? t : t[0], r = typeof t == "number" ? 1 : t[1], o = typeof t == "number" ? 1 : t[2];
      if (n > this.limits.maxComputeWorkgroupSizeX || r > this.limits.maxComputeWorkgroupSizeY || o > this.limits.maxComputeWorkgroupSizeZ) throw new Error(`workgroup size [${n}, ${r}, ${o}] exceeds the maximum workgroup size [${this.limits.maxComputeWorkgroupSizeX}, ${this.limits.maxComputeWorkgroupSizeY}, ${this.limits.maxComputeWorkgroupSizeZ}].`);
      if (n * r * o > this.limits.maxComputeInvocationsPerWorkgroup) throw new Error(`workgroup size [${n}, ${r}, ${o}] exceeds the maximum workgroup invocations ${this.limits.maxComputeInvocationsPerWorkgroup}.`);
      let i = this.normalizedDispatchGroup[1] === 1 && this.normalizedDispatchGroup[2] === 1, s = i ? `@builtin(global_invocation_id) global_id : vec3<u32>,
    @builtin(workgroup_id) workgroup_id : vec3<u32>,
    @builtin(local_invocation_index) local_idx : u32,
    @builtin(local_invocation_id) local_id : vec3<u32>` : `@builtin(global_invocation_id) global_id : vec3<u32>,
                                             @builtin(local_invocation_id) local_id : vec3<u32>,
    @builtin(local_invocation_index) local_idx : u32,
    @builtin(workgroup_id) workgroup_id : vec3<u32>,
    @builtin(num_workgroups) num_workgroups : vec3<u32>`, a = i ? `let global_idx = global_id.x;
         let workgroup_index = workgroup_id.x;` : `let workgroup_index = workgroup_id.z * num_workgroups[0] * num_workgroups[1] +
             workgroup_id.y * num_workgroups[0] + workgroup_id.x;
         let global_idx = workgroup_index * ${n * r * o}u + local_idx;`;
      return `@compute @workgroup_size(${n}, ${r}, ${o})
  fn main(${s}) {
    ${a}
  `;
    }
    appendVariableUniforms(t) {
      t.rank !== 0 && (t.shape.startsWith("uniforms.") && this.uniforms.push({ name: t.shape.replace("uniforms.", ""), type: "u32", length: t.rank }), t.strides.startsWith("uniforms.") && this.uniforms.push({ name: t.strides.replace("uniforms.", ""), type: "u32", length: t.rank }));
    }
    declareVariable(t, n) {
      if (t.usage === "internal") throw new Error("cannot use internal variable with declareVariable(). use registerInternalVariables() instead.");
      this.variables.push(t), this.appendVariableUniforms(t);
      let r = t.usage === "input" ? "read" : "read_write", o = t.usage === "atomicOutput" ? "atomic<i32>" : t.type.storage;
      return `@group(0) @binding(${n}) var<storage, ${r}> ${t.name}: array<${o}>;`;
    }
    declareVariables(...t) {
      return t.map((n) => this.declareVariable(n, this.variableIndex++)).join(`
`);
    }
    registerInternalVariable(t) {
      if (t.usage !== "internal") throw new Error("cannot use input or output variable with registerInternalVariable(). use declareVariables() instead.");
      this.internalVariables.push(t), this.appendVariableUniforms(t);
    }
    registerInternalVariables(...t) {
      return t.forEach((n) => this.registerInternalVariable(n)), this;
    }
    registerUniform(t, n, r = 1) {
      return this.uniforms.push({ name: t, type: n, length: r }), this;
    }
    registerUniforms(t) {
      return this.uniforms = this.uniforms.concat(t), this;
    }
    uniformDeclaration() {
      if (this.uniforms.length === 0) return "";
      let t = [];
      for (let { name: n, type: r, length: o } of this.uniforms) if (o && o > 4) r === "f16" ? t.push(`@align(16) ${n}:array<mat2x4<${r}>, ${Math.ceil(o / 8)}>`) : t.push(`${n}:array<vec4<${r}>, ${Math.ceil(o / 4)}>`);
      else {
        let i = o == null || o === 1 ? r : `vec${o}<${r}>`;
        t.push(`${n}:${i}`);
      }
      return `
      struct Uniforms { ${t.join(", ")} };
      @group(0) @binding(${this.variableIndex}) var<uniform> uniforms: Uniforms;`;
    }
    get additionalImplementations() {
      return this.uniformDeclaration() + this.variables.map((t) => t.impl()).join(`
`) + this.internalVariables.map((t) => t.impl()).join(`
`);
    }
    get variablesInfo() {
      if (this.uniforms.length === 0) return;
      let t = (n) => [12, 10, 1, 6][["u32", "f16", "f32", "i32"].indexOf(n)];
      return this.uniforms.map((n) => [t(n.type), n.length ?? 1]);
    }
  }, Io = (e, t) => new Hn(e, t);
});
var md, Co, fd$1, hd, gd, yd, me, Ao, Eo, Re = k(() => {
  N();
  H();
  ue();
  F();
  md = (e, t) => {
    if (!e || e.length !== 1) throw new Error("Transpose requires 1 input.");
    if (t.length !== 0 && t.length !== e[0].dims.length) throw new Error(`perm size ${t.length} does not match input rank ${e[0].dims.length}`);
  }, Co = (e, t) => t.length !== 0 ? t : [...new Array(e).keys()].reverse(), fd$1 = (e, t) => x$1.sortBasedOnPerm(e, Co(e.length, t)), hd = (e, t, n, r) => {
    let o = `fn perm(i: ${r.type.indices}) -> ${n.type.indices} {
    var a: ${n.type.indices};`;
    for (let i = 0; i < t; ++i) o += `a[${e[i]}]=i[${i}];`;
    return o += "return a;}";
  }, gd = (e, t) => {
    let n = [], r = [];
    for (let o = 0; o < e.length; ++o) e[o] !== 1 && n.push(e[o]), e[t[o]] !== 1 && r.push(t[o]);
    return { newShape: n, newPerm: r };
  }, yd = (e, t) => {
    let n = 0;
    for (let r = 0; r < e.length; ++r) if (t[e[r]] !== 1) {
      if (e[r] < n) return false;
      n = e[r];
    }
    return true;
  }, me = (e, t) => {
    let n = e.dataType, r = e.dims.length, o = Co(r, t), i = fd$1(e.dims, o), s = e.dims, a = i, u = r < 2 || yd(o, e.dims), d;
    if (u) return d = (h) => {
      let _ = S("input", n, s, 4), y = C("output", n, a, 4);
      return `
  ${h.registerUniform("output_size", "u32").declareVariables(_, y)}
  ${h.mainStart()}
    ${h.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    output[global_idx] = input[global_idx];
  }`;
    }, { name: "TransposeCopy", shaderCache: { inputDependencies: ["type"] }, getRunData: () => {
      let h = x$1.size(i);
      return { outputs: [{ dims: i, dataType: e.dataType }], dispatchGroup: { x: Math.ceil(h / 64 / 4) }, programUniforms: [{ type: 12, data: Math.ceil(h / 4) }] };
    }, getShaderSource: d };
    let { newShape: l, newPerm: c } = gd(e.dims, o), p = x$1.areEqual(c, [2, 3, 1]), f = x$1.areEqual(c, [3, 1, 2]);
    if (l.length === 2 || p || f) {
      s = p ? [l[0], l[1] * l[2]] : f ? [l[0] * l[1], l[2]] : l, a = [s[1], s[0]];
      let h = 16;
      return d = (_) => {
        let y = S("a", n, s.length), g = C("output", n, a.length);
        return `
  ${_.registerUniform("output_size", "u32").declareVariables(y, g)}
  var<workgroup> tile : array<array<${g.type.value}, ${h + 1}>, ${h}>;
  ${_.mainStart([h, h, 1])}
    let stride = (uniforms.output_shape[1] - 1) / ${h} + 1;
    let workgroup_id_x = workgroup_index % stride;
    let workgroup_id_y = workgroup_index / stride;
    let input_col = workgroup_id_y * ${h}u + local_id.x;
    let input_row = workgroup_id_x * ${h}u + local_id.y;
    if (input_row < uniforms.a_shape[0] && input_col < uniforms.a_shape[1]) {
      tile[local_id.y][local_id.x] = ${y.getByIndices(`${y.type.indices}(input_row, input_col)`)};
    }
    workgroupBarrier();

    let output_col = workgroup_id_x * ${h}u + local_id.x;
    let output_row = workgroup_id_y * ${h}u + local_id.y;
    if (output_row < uniforms.output_shape[0] && output_col < uniforms.output_shape[1]) {
      ${g.setByIndices(`${g.type.indices}(output_row, output_col)`, "tile[local_id.x][local_id.y]")}
    }
  }`;
      }, { name: "TransposeShared", shaderCache: { inputDependencies: ["type"] }, getRunData: () => {
        let _ = x$1.size(i);
        return { outputs: [{ dims: i, dataType: e.dataType }], dispatchGroup: { x: Math.ceil(a[1] / h), y: Math.ceil(a[0] / h) }, programUniforms: [{ type: 12, data: _ }, ...P(s, a)] };
      }, getShaderSource: d };
    }
    return d = (h) => {
      let _ = S("a", n, s.length), y = C("output", n, a.length);
      return `
  ${h.registerUniform("output_size", "u32").declareVariables(_, y)}

  ${hd(o, r, _, y)}

  ${h.mainStart()}
    ${h.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}

    let indices = ${y.offsetToIndices("global_idx")};
    let aIndices = perm(indices);

    ${y.setByOffset("global_idx", _.getByIndices("aIndices"))}
  }`;
    }, { name: "Transpose", shaderCache: { hint: `${t}`, inputDependencies: ["rank"] }, getRunData: () => {
      let h = x$1.size(i);
      return { outputs: [{ dims: i, dataType: e.dataType }], dispatchGroup: { x: Math.ceil(h / 64) }, programUniforms: [{ type: 12, data: h }, ...P(s, a)] };
    }, getShaderSource: d };
  }, Ao = (e, t) => {
    md(e.inputs, t.perm), e.compute(me(e.inputs[0], t.perm));
  }, Eo = (e) => L({ perm: e.perm });
});
var bd, _d, wd, $d, vd, xd, Sd, Td, Id, Cd, Be, ko, Po, zo, Bo, Do, Oo, Mo, Uo, Ro, Vo, No = k(() => {
  N();
  H();
  F();
  Jt();
  Re();
  bd = { max: "select(bestValue, candidate, candidate > bestValue)", min: "select(bestValue, candidate, candidate < bestValue)", mean: "bestValue + candidate", sum: "bestValue + candidate", prod: "bestValue * candidate", sumSquare: "bestValue + candidate * candidate", logSumExp: "bestValue + exp(candidate)", l1: "bestValue + abs(candidate)", l2: "bestValue + candidate * candidate", logSum: "bestValue + candidate" }, _d = { max: "select(bestValue, candidate, candidate > bestValue)", min: "select(bestValue, candidate, candidate < bestValue)", mean: "bestValue + candidate", sum: "bestValue + candidate", prod: "bestValue * candidate", sumSquare: "bestValue + candidate", logSumExp: "bestValue + candidate", l1: "bestValue + candidate", l2: "bestValue + candidate", logSum: "bestValue + candidate" }, wd = { max: "_A[offset]", min: "_A[offset]", mean: "0", sum: "0", prod: "1", sumSquare: "0", logSumExp: "0", l1: "0", l2: "0", logSum: "0" }, $d = { max: "bestValue", min: "bestValue", sum: "bestValue", prod: "bestValue", sumSquare: "bestValue", logSumExp: "log(bestValue)", l1: "bestValue", l2: "sqrt(bestValue)", logSum: "log(bestValue)" }, vd = (e, t) => {
    let n = [];
    for (let r = t - e; r < t; ++r) n.push(r);
    return n;
  }, xd = (e, t) => {
    let n = [], r = e.length;
    for (let i = 0; i < r; i++) t.indexOf(i) === -1 && n.push(e[i]);
    let o = t.map((i) => e[i]);
    return [n, o];
  }, Sd = (e, t) => {
    let n = e.length + t.length, r = [], o = 0;
    for (let i = 0; i < n; i++) t.indexOf(i) === -1 ? r.push(e[o++]) : r.push(1);
    return r;
  }, Td = (e, t) => {
    for (let n = 0; n < e.length; ++n) if (e[e.length - n - 1] !== t - 1 - n) return false;
    return true;
  }, Id = (e, t) => {
    let n = [];
    if (!Td(e, t)) {
      for (let r = 0; r < t; ++r) e.indexOf(r) === -1 && n.push(r);
      e.forEach((r) => n.push(r));
    }
    return n;
  }, Cd = (e, t, n, r, o, i, s) => {
    let a = n[0].dims, u = x$1.size(i), d = x$1.size(s), l = S("_A", n[0].dataType, a), c = C("output", o, i), p = 64;
    u === 1 && (p = 256);
    let f = `
          var<workgroup> aBestValues : array<f32, ${p}>;
       `, m = (h) => `
        ${h.registerUniform("reduceSize", "u32").declareVariables(l, c)}
        ${f}
        fn DIV_CEIL(a : u32, b : u32) -> u32 {
          return ((a - 1u) / b + 1u);
         }
         ${h.mainStart(p)}

          let outputIndex = global_idx / ${p};
          let offset = outputIndex * uniforms.reduceSize;

          var bestValue = f32(${wd[r]});
          let Length = uniforms.reduceSize;
          for (var k = local_idx; k < Length; k = k + ${p}) {
           let candidate = f32(${l.getByOffset("offset + k")});
           bestValue = ${bd[r]};
          }
          aBestValues[local_idx] = bestValue;
          workgroupBarrier();

         var reduceSize = min(Length, ${p}u);
         for (var currentSize = reduceSize / 2u; reduceSize > 1u;
             currentSize = reduceSize / 2u) {
           let interval = DIV_CEIL(reduceSize, 2u);
           if (local_idx < currentSize) {
            let candidate = aBestValues[local_idx + interval];
            bestValue = ${_d[r]};
            aBestValues[local_idx] = bestValue;
           }
           reduceSize = interval;
           workgroupBarrier();
         }

         if (local_idx == 0u) {
          ${c.setByOffset("outputIndex", `${r === "mean" ? `${c.type.storage}(bestValue / f32(uniforms.reduceSize))` : `${c.type.storage}(${$d[r]})`}`)};
         }
        }`;
    return { name: e, shaderCache: { hint: `${t};${p}`, inputDependencies: ["type"] }, getShaderSource: m, getRunData: () => ({ outputs: [{ dims: i, dataType: o }], dispatchGroup: { x: u }, programUniforms: [{ type: 12, data: d }] }) };
  }, Be = (e, t, n, r) => {
    let o = e.inputs.length === 1 ? n : Kn(e.inputs, n), i = o.axes;
    i.length === 0 && !o.noopWithEmptyAxes && (i = e.inputs[0].dims.map((f, m) => m));
    let s = x$1.normalizeAxes(i, e.inputs[0].dims.length), a = s, u = e.inputs[0], d = Id(a, e.inputs[0].dims.length);
    d.length > 0 && (u = e.compute(me(e.inputs[0], d), { inputs: [0], outputs: [-1] })[0], a = vd(a.length, u.dims.length));
    let [l, c] = xd(u.dims, a), p = l;
    o.keepDims && (p = Sd(l, s)), e.compute(Cd(t, o.cacheKey, [u], r, e.inputs[0].dataType, p, c), { inputs: [u] });
  }, ko = (e, t) => {
    Be(e, "ReduceMeanShared", t, "mean");
  }, Po = (e, t) => {
    Be(e, "ReduceL1Shared", t, "l1");
  }, zo = (e, t) => {
    Be(e, "ReduceL2Shared", t, "l2");
  }, Bo = (e, t) => {
    Be(e, "ReduceLogSumExpShared", t, "logSumExp");
  }, Do = (e, t) => {
    Be(e, "ReduceMaxShared", t, "max");
  }, Oo = (e, t) => {
    Be(e, "ReduceMinShared", t, "min");
  }, Mo = (e, t) => {
    Be(e, "ReduceProdShared", t, "prod");
  }, Uo = (e, t) => {
    Be(e, "ReduceSumShared", t, "sum");
  }, Ro = (e, t) => {
    Be(e, "ReduceSumSquareShared", t, "sumSquare");
  }, Vo = (e, t) => {
    Be(e, "ReduceLogSumShared", t, "logSum");
  };
});
var De, Ad, en, Kn, Oe, Ed, kd, Pd, zd, Bd, Dd, Od, Md, Ud, Rd, Me, Lo, Wo, Go, Ho, qo, Fo, Ko, jo, Zo, Qo, Jt = k(() => {
  N();
  H();
  ue();
  F();
  No();
  De = (e) => {
    if (!e || e.length === 0 || e.length > 2) throw new Error("Reduce op requires 1 or 2 inputs.");
    if (e.length === 2 && e[1].dims.length !== 1) throw new Error("Invalid axes input dims.");
  }, Ad = (e) => ["", "", `var value = ${e.getByIndices("input_indices")};`, ""], en = (e, t, n, r, o, i, s = false, a = false) => {
    let u = [], d = n[0].dims, l = d.length, c = x$1.normalizeAxes(o, l), p = !a && c.length === 0;
    d.forEach((_, y) => {
      p || c.indexOf(y) >= 0 ? s && u.push(1) : u.push(_);
    });
    let f = u.length, m = x$1.size(u);
    return { name: e, shaderCache: t, getShaderSource: (_) => {
      let y = [], g = S("_A", n[0].dataType, l), b = C("output", i, f), w = r(g, b, c), v = w[2];
      for (let $ = 0, T = 0; $ < l; $++) p || c.indexOf($) >= 0 ? (s && T++, v = `for(var j${$}: u32 = 0; j${$} < ${d[$]}; j${$}++) {
                  ${w[2].includes("last_index") ? `let last_index = j${$};` : ""}
                  ${g.indicesSet("input_indices", $, `j${$}`)}
                  ${v}
                }`) : (y.push(`${g.indicesSet("input_indices", $, b.indicesGet("output_indices", T))};`), T++);
      return `

        ${_.registerUniform("output_size", "u32").declareVariables(g, b)}

        ${_.mainStart()}
          ${_.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
          var input_indices: ${g.type.indices};
          let output_indices = ${b.offsetToIndices("global_idx")};

          ${y.join(`
`)}
          ${w[0]}       // init ops for reduce max/min
          ${w[1]}
          ${v}
          ${w[3]}
          ${w.length === 4 ? b.setByOffset("global_idx", "value") : w.slice(4).join(`
`)}
        }`;
    }, getRunData: () => ({ outputs: [{ dims: u, dataType: i }], dispatchGroup: { x: Math.ceil(m / 64) }, programUniforms: [{ type: 12, data: m }, ...P(d, u)] }) };
  }, Kn = (e, t) => {
    let n = [];
    return e[1].dims[0] > 0 && e[1].getBigInt64Array().forEach((r) => n.push(Number(r))), L({ axes: n, keepDims: t.keepDims, noopWithEmptyAxes: t.noopWithEmptyAxes });
  }, Oe = (e, t, n, r) => {
    let o = e.inputs, i = o.length === 1 ? n : Kn(o, n);
    e.compute(en(t, { hint: i.cacheKey, inputDependencies: ["rank"] }, [o[0]], i.noopWithEmptyAxes && i.axes.length === 0 ? Ad : r, i.axes, o[0].dataType, i.keepDims, i.noopWithEmptyAxes), { inputs: [0] });
  }, Ed = (e, t) => {
    De(e.inputs), Oe(e, "ReduceLogSum", t, (r, o) => [`var value = ${o.type.storage}(0);`, "", `value += ${r.getByIndices("input_indices")};`, "value = log(value);"]);
  }, kd = (e, t) => {
    De(e.inputs), Oe(e, "ReduceL1", t, (r, o) => [`var value = ${o.type.storage}(0);`, "", `value += abs(${r.getByIndices("input_indices")});`, ""]);
  }, Pd = (e, t) => {
    De(e.inputs), Oe(e, "ReduceL2", t, (r, o) => [`var t = ${o.type.value}(0); var value = ${o.type.value}(0);`, "", `t = ${r.getByIndices("input_indices")}; value += (t * t);`, "value = sqrt(value);"]);
  }, zd = (e, t) => {
    De(e.inputs), Oe(e, "ReduceLogSumExp", t, (r, o) => [`var value = ${o.type.storage}(0);`, "", `value += exp(${r.getByIndices("input_indices")});`, "value = log(value);"]);
  }, Bd = (e, t) => {
    De(e.inputs), Oe(e, "ReduceMax", t, (r, o, i) => {
      let s = [];
      for (let a = 0; a < r.rank; a++) (i.indexOf(a) >= 0 || i.length === 0) && s.push(r.indicesSet("input_indices", a, 0));
      return [`${s.join(`
`)}`, `var value = ${r.getByIndices("input_indices")};`, `value = max(value, ${r.getByIndices("input_indices")});`, ""];
    });
  }, Dd = (e, t) => {
    De(e.inputs), Oe(e, "ReduceMean", t, (r, o, i) => {
      let s = 1;
      for (let a = 0; a < r.rank; a++) (i.indexOf(a) >= 0 || i.length === 0) && (s *= e.inputs[0].dims[a]);
      return ["var sum = f32(0);", "", `sum += f32(${r.getByIndices("input_indices")});`, `let value = ${o.type.value}(sum / ${s});`];
    });
  }, Od = (e, t) => {
    De(e.inputs), Oe(e, "ReduceMin", t, (r, o, i) => {
      let s = [];
      for (let a = 0; a < r.rank; a++) (i.indexOf(a) >= 0 || i.length === 0) && s.push(`input_indices[${a}] = 0;`);
      return [`${s.join(`
`)}`, `var value = ${r.getByIndices("input_indices")};`, `value = min(value, ${r.getByIndices("input_indices")});`, ""];
    });
  }, Md = (e, t) => {
    De(e.inputs), Oe(e, "ReduceProd", t, (r, o) => [`var value = ${o.type.storage}(1);`, "", `value *= ${r.getByIndices("input_indices")};`, ""]);
  }, Ud = (e, t) => {
    De(e.inputs), Oe(e, "ReduceSum", t, (r, o) => [`var value = ${o.type.storage}(0);`, "", `value += ${r.getByIndices("input_indices")};`, ""]);
  }, Rd = (e, t) => {
    De(e.inputs), Oe(e, "ReduceSumSquare", t, (r, o) => [`var t = ${o.type.value}(0); var value = ${o.type.value}(0);`, "", `t = ${r.getByIndices("input_indices")}; value += t * t;`, ""]);
  }, Me = (e, t, n) => {
    if (t.length === 0) return n;
    let r = 1, o = 1;
    for (let i = 0; i < t.length; i++) t.indexOf(i) === -1 ? r *= e[i] : o *= e[i];
    return o < 32 && r > 1024;
  }, Lo = (e, t) => {
    Me(e.inputs[0].dims, t.axes, t.noopWithEmptyAxes) ? Dd(e, t) : ko(e, t);
  }, Wo = (e, t) => {
    Me(e.inputs[0].dims, t.axes, t.noopWithEmptyAxes) ? kd(e, t) : Po(e, t);
  }, Go = (e, t) => {
    Me(e.inputs[0].dims, t.axes, t.noopWithEmptyAxes) ? Pd(e, t) : zo(e, t);
  }, Ho = (e, t) => {
    Me(e.inputs[0].dims, t.axes, t.noopWithEmptyAxes) ? zd(e, t) : Bo(e, t);
  }, qo = (e, t) => {
    Me(e.inputs[0].dims, t.axes, t.noopWithEmptyAxes) ? Bd(e, t) : Do(e, t);
  }, Fo = (e, t) => {
    Me(e.inputs[0].dims, t.axes, t.noopWithEmptyAxes) ? Od(e, t) : Oo(e, t);
  }, Ko = (e, t) => {
    Me(e.inputs[0].dims, t.axes, t.noopWithEmptyAxes) ? Md(e, t) : Mo(e, t);
  }, jo = (e, t) => {
    Me(e.inputs[0].dims, t.axes, t.noopWithEmptyAxes) ? Ud(e, t) : Uo(e, t);
  }, Zo = (e, t) => {
    Me(e.inputs[0].dims, t.axes, t.noopWithEmptyAxes) ? Rd(e, t) : Ro(e, t);
  }, Qo = (e, t) => {
    Me(e.inputs[0].dims, t.axes, t.noopWithEmptyAxes) ? Ed(e, t) : Vo(e, t);
  };
});
var Xo, Yo, Jo, jn, ei = k(() => {
  N();
  ue();
  Jt();
  Xo = (e) => {
    if (!e || e.length === 0 || e.length > 2) throw new Error("ArgMinMaxOp op requires 1 or 2 inputs.");
    if (e[0].dataType !== 1) throw new Error("Invalid input type.");
  }, Yo = (e, t) => {
    Xo(e.inputs);
    let n = (r, o, i) => {
      let s = [];
      for (let a = 0; a < r.rank; a++) (i.indexOf(a) >= 0 || i.length === 0) && s.push(`input_indices[${a}] = 0;`);
      return [`${s.join(`
`)}`, `var value = ${r.getByIndices("input_indices")};
var best_index : i32 = 0;`, `if (${r.getByIndices("input_indices")} ${t.selectLastIndex > 0 ? "<=" : "<"} value) {
         value = ${r.getByIndices("input_indices")};
         best_index = i32(last_index);
       }`, "", o.setByOffset("global_idx", "best_index")];
    };
    e.compute(en("ArgMin", { hint: t.cacheKey, inputDependencies: ["rank"] }, [e.inputs[0]], n, [t.axis], 7, t.keepDims), { inputs: [0] });
  }, Jo = (e, t) => {
    Xo(e.inputs);
    let n = (r, o, i) => {
      let s = [];
      for (let a = 0; a < r.rank; a++) (i.indexOf(a) >= 0 || i.length === 0) && s.push(`input_indices[${a}] = 0;`);
      return [`${s.join(`
`)}`, `var value = ${r.getByIndices("input_indices")};
var best_index : i32 = 0;`, `if (${r.getByIndices("input_indices")} ${t.selectLastIndex > 0 ? ">=" : ">"} value) {
         value = ${r.getByIndices("input_indices")};
         best_index = i32(last_index);
       }`, "", o.setByOffset("global_idx", "best_index")];
    };
    e.compute(en("argMax", { hint: t.cacheKey, inputDependencies: ["rank"] }, [e.inputs[0]], n, [t.axis], 7, t.keepDims), { inputs: [0] });
  }, jn = (e) => L(e);
});
var Vd, Zn, Nd, Ld, Wd, it, Gd, ti, tn = k(() => {
  N();
  H();
  Qt();
  F();
  Vd = (e, t) => {
    let n = e[0], r = e[1], o = e[2], i = e[3], s = e[4], a = e[5];
    if (s && a) throw new Error("Attention cannot have both past and attention_bias");
    if (n.dims.length !== 3) throw new Error('Input "input" must have 3 dimensions');
    let u = n.dims[0], d = n.dims[1], l = n.dims[2];
    if (o.dims.length !== 1) throw new Error('Input "bias" is expected to have 1 dimensions');
    if (r.dims.length !== 2) throw new Error('Input "weights" is expected to have 2 dimensions');
    if (r.dims[0] !== l) throw new Error("Input 1 dimension 0 should have same length as dimension 2 of input 0");
    if (o.dims[0] !== r.dims[1]) throw new Error('Input "bias" dimension 0 should have same length as dimension 1 of input "weights"');
    let c = o.dims[0] / 3, p = c, f = p;
    if (t.qkvHiddenSizes.length > 0) {
      if (t.qkvHiddenSizes.length !== 3) throw new Error("qkv_hidden_sizes attribute should have 3 elements");
      for (let b of t.qkvHiddenSizes) if (b % t.numHeads !== 0) throw new Error("qkv_hidden_sizes should be divisible by num_heads");
      c = t.qkvHiddenSizes[0], p = t.qkvHiddenSizes[1], f = t.qkvHiddenSizes[2];
    }
    let m = d;
    if (c !== p) throw new Error("qkv_hidden_sizes first element should be same as the second");
    if (o.dims[0] !== c + p + f) throw new Error('Input "bias" dimension 0 should have same length as sum of Q/K/V hidden sizes');
    let h = 0;
    if (s) {
      if (p !== f) throw new Error('Input "past" expect k_hidden_size == v_hidden_size');
      if (s.dims.length !== 5) throw new Error('Input "past" must have 5 dimensions');
      if (s.dims[0] !== 2) throw new Error('Input "past" first dimension must be 2');
      if (s.dims[1] !== u) throw new Error('Input "past" second dimension must be batch_size');
      if (s.dims[2] !== t.numHeads) throw new Error('Input "past" third dimension must be num_heads');
      if (s.dims[4] !== p / t.numHeads) throw new Error('Input "past" fifth dimension must be k_hidden_size / num_heads');
      t.pastPresentShareBuffer || (h = s.dims[3]);
    }
    let _ = m + h, y = -1, g = 0;
    if (i) throw new Error("Mask not supported");
    if (s) throw new Error("past is not supported");
    if (a) {
      if (a.dims.length !== 4) throw new Error('Input "attention_bias" must have 4 dimensions');
      if (a.dims[0] !== u || a.dims[1] !== t.numHeads || a.dims[2] !== d || a.dims[3] !== _) throw new Error('Expect "attention_bias" shape (batch_size, num_heads, sequence_length, total_sequence_length)');
    }
    return { batchSize: u, sequenceLength: d, pastSequenceLength: h, kvSequenceLength: m, totalSequenceLength: _, maxSequenceLength: y, inputHiddenSize: l, hiddenSize: c, vHiddenSize: f, headSize: Math.floor(c / t.numHeads), vHeadSize: Math.floor(f / t.numHeads), numHeads: t.numHeads, isUnidirectional: false, pastPresentShareBuffer: false, maskFilterValue: t.maskFilterValue, maskType: g, scale: t.scale, broadcastResPosBias: false, passPastInKv: false, qkvFormat: 1 };
  }, Zn = (e, t, n) => t && e ? `
      let total_sequence_length_input = u32(${t.getByOffset("0")});
      let present_sequence_length = max(total_sequence_length_input, uniforms.past_sequence_length);
      let is_subsequent_prompt: bool = sequence_length > 1 && sequence_length != total_sequence_length_input;
      let is_first_prompt: bool = is_subsequent_prompt == false && sequence_length == total_sequence_length_input;
      total_sequence_length = u32(${e?.getByOffset("batchIdx")}) + 1;
      var past_sequence_length: u32 = 0;
      if (is_first_prompt == false) {
        past_sequence_length = total_sequence_length - sequence_length;
      }
       ` : `
    ${n ? "let past_sequence_length = uniforms.past_sequence_length" : ""};
    let present_sequence_length = total_sequence_length;
    `, Nd = (e, t, n, r, o, i, s, a) => {
    let u = J(s ? 1 : i), d = 64, l = i / u;
    l < d && (d = 32);
    let c = Math.ceil(i / u / d), p = [{ type: 12, data: t }, { type: 12, data: n }, { type: 12, data: r }, { type: 12, data: o }, { type: 12, data: l }, { type: 12, data: c }], f = re(e.dataType, u), m = pe(1, u), h = ["type"];
    s && h.push("type"), a && h.push("type");
    let _ = (y) => {
      let g = C("x", e.dataType, e.dims, u), b = [g], w = s ? S("seq_lens", s.dataType, s.dims) : void 0;
      w && b.push(w);
      let v = a ? S("total_sequence_length_input", a.dataType, a.dims) : void 0;
      v && b.push(v);
      let $ = pe(e.dataType), T = [{ name: "batch_size", type: "u32" }, { name: "num_heads", type: "u32" }, { name: "past_sequence_length", type: "u32" }, { name: "sequence_length", type: "u32" }, { name: "total_sequence_length", type: "u32" }, { name: "elements_per_thread", type: "u32" }];
      return `
  var<workgroup> thread_max: array<f32, ${d}>;
  var<workgroup> thread_sum: array<f32, ${d}>;
  ${y.registerUniforms(T).declareVariables(...b)}
  ${y.mainStart([d, 1, 1])}
    let batchIdx = workgroup_id.z / uniforms.num_heads;
    let headIdx = workgroup_id.z % uniforms.num_heads;
    let sequence_length = uniforms.sequence_length;
    var total_sequence_length = uniforms.total_sequence_length;
    ${Zn(w, v, false)}
    let local_offset = local_idx * uniforms.elements_per_thread;
    let offset = (global_idx / ${d}) * uniforms.total_sequence_length + local_offset;
    let seq_causal_length = ${s ? "u32(past_sequence_length + workgroup_id.y + 1)" : "total_sequence_length"};
    var thread_max_vector = ${m}(-3.4028234663852886e+38f);
    for (var i: u32 = 0; i < uniforms.elements_per_thread && i + local_offset < seq_causal_length; i++) {
      thread_max_vector = max(${m}(x[offset + i]), thread_max_vector);
    }
    thread_max[local_idx] = ${(() => {
        switch (u) {
          case 1:
            return "thread_max_vector";
          case 2:
            return "max(thread_max_vector.x, thread_max_vector.y)";
          case 4:
            return "max(max(thread_max_vector.x, thread_max_vector.y), max(thread_max_vector.z, thread_max_vector.w))";
          default:
            throw new Error(`Unsupported components: ${u}`);
        }
      })()};
    workgroupBarrier();

    var max_value =  f32(-3.4028234663852886e+38f);
    for (var i = 0u; i < ${d}; i++) {
      max_value = max(thread_max[i], max_value);
    }

    var sum_vector = ${m}(0);
    for (var i: u32 = 0; i < uniforms.elements_per_thread && i + local_offset < seq_causal_length; i++) {
      sum_vector += exp(${m}(x[offset + i]) - max_value);
    }
    thread_sum[local_idx] = ${(() => {
        switch (u) {
          case 1:
            return "sum_vector";
          case 2:
            return "sum_vector.x + sum_vector.y";
          case 4:
            return "sum_vector.x + sum_vector.y + sum_vector.z + sum_vector.w";
          default:
            throw new Error(`Unsupported components: ${u}`);
        }
      })()};
    workgroupBarrier();

    var sum: f32 = 0;
    for (var i = 0u; i < ${d}; i++) {
      sum += thread_sum[i];
    }

    if (sum == 0) {
      for (var i: u32 = 0; i < uniforms.elements_per_thread && i + local_offset < seq_causal_length; i++) {
        x[offset + i] = ${g.type.value}(${$}(1.0) / ${$}(seq_causal_length));
      }
    } else {
      for (var i: u32 = 0; i < uniforms.elements_per_thread && i + local_offset < seq_causal_length; i++) {
        var f32input = ${m}(x[offset + i]);
        x[offset + i] = ${g.type.value}(exp(f32input - max_value) / sum);
      }
    }
      ${s ? `
        for (var total_seq_id: u32 = seq_causal_length; total_seq_id + local_offset < uniforms.total_sequence_length; total_seq_id++) {
          x[offset + total_seq_id] = ${g.type.value}(${$}(0));
        }` : ""};
  }`;
    };
    return { name: "AttentionProbsSoftmax", shaderCache: { hint: `${d};${f};${u}`, inputDependencies: h }, getShaderSource: _, getRunData: () => ({ outputs: [], dispatchGroup: { x: 1, y: o, z: t * n }, programUniforms: p }) };
  }, Ld = (e, t, n, r, o, i, s, a, u) => {
    let d = s + i.kvSequenceLength, l = [i.batchSize, i.numHeads, i.sequenceLength, d], c = e > 1 && r, p = i.kvNumHeads ? i.kvNumHeads : i.numHeads, f = c ? [i.batchSize, p, d, i.headSize] : void 0, m = i.nReps ? i.nReps : 1, h = i.scale === 0 ? 1 / Math.sqrt(i.headSize) : i.scale, _ = J(i.headSize), y = i.headSize / _, g = 12, b = { x: Math.ceil(d / g), y: Math.ceil(i.sequenceLength / g), z: i.batchSize * i.numHeads }, w = [{ type: 12, data: i.sequenceLength }, { type: 12, data: y }, { type: 12, data: d }, { type: 12, data: i.numHeads }, { type: 12, data: i.headSize }, { type: 1, data: h }, { type: 12, data: s }, { type: 12, data: i.kvSequenceLength }, { type: 12, data: m }], v = c && r && x$1.size(r.dims) > 0, $ = ["type", "type"];
    v && $.push("type"), o && $.push("type"), a && $.push("type"), u && $.push("type");
    let T = [{ dims: l, dataType: t.dataType, gpuDataType: 0 }];
    c && T.push({ dims: f, dataType: t.dataType, gpuDataType: 0 });
    let I = (E) => {
      let z = S("q", t.dataType, t.dims, _), M = S("key", n.dataType, n.dims, _), O = [z, M];
      if (v) {
        let j = S("past_key", r.dataType, r.dims, _);
        O.push(j);
      }
      o && O.push(S("attention_bias", o.dataType, o.dims));
      let W = a ? S("seq_lens", a.dataType, a.dims) : void 0;
      W && O.push(W);
      let K = u ? S("total_sequence_length_input", u.dataType, u.dims) : void 0;
      K && O.push(K);
      let U = C("output", t.dataType, l), R = [U];
      c && R.push(C("present_key", t.dataType, f, _));
      let G = pe(1, _), V = [{ name: "M", type: "u32" }, { name: "K", type: "u32" }, { name: "N", type: "u32" }, { name: "num_heads", type: "u32" }, { name: "head_size", type: "u32" }, { name: "alpha", type: "f32" }, { name: "past_sequence_length", type: "u32" }, { name: "kv_sequence_length", type: "u32" }, { name: "n_reps", type: "u32" }];
      return `
  const TILE_SIZE = ${g}u;

  var<workgroup> tileQ: array<${z.type.storage}, ${g * g}>;
  var<workgroup> tileK: array<${z.type.storage}, ${g * g}>;
  ${E.registerUniforms(V).declareVariables(...O, ...R)}
  ${E.mainStart([g, g, 1])}
    // x holds the N and y holds the M
    let headIdx = workgroup_id.z % uniforms.num_heads;
    let kvHeadIdx = ${m === 1 ? "headIdx" : "headIdx / uniforms.n_reps"};
    let kv_num_heads = ${m === 1 ? "uniforms.num_heads" : "uniforms.num_heads / uniforms.n_reps"};
    let batchIdx = workgroup_id.z / uniforms.num_heads;
    let m = workgroup_id.y * TILE_SIZE;
    let n = workgroup_id.x * TILE_SIZE;
    let sequence_length = uniforms.M;
    var total_sequence_length = uniforms.N;
    ${Zn(W, K, true)}
    let absKvHeadIdx = batchIdx * kv_num_heads + kvHeadIdx;
    let qOffset = workgroup_id.z * uniforms.M * uniforms.K + m * uniforms.K;
    ${v && c ? "let pastKeyOffset = absKvHeadIdx * uniforms.past_sequence_length * uniforms.K;" : ""};
    let kOffset = absKvHeadIdx * uniforms.kv_sequence_length * uniforms.K;
    ${c ? "let presentKeyOffset = absKvHeadIdx * uniforms.N * uniforms.K;" : ""}
    var value = ${G}(0);
    for (var w: u32 = 0u; w < uniforms.K; w += TILE_SIZE) {
      if (global_id.y < uniforms.M && w + local_id.x < uniforms.K) {
        tileQ[TILE_SIZE * local_id.y + local_id.x] = q[qOffset + local_id.y * uniforms.K + w + local_id.x];
      }
      if (n + local_id.y < uniforms.N && w + local_id.x < uniforms.K) {
        var idx = TILE_SIZE * local_id.y + local_id.x;
      ${v && c ? `
              if (n + local_id.y < past_sequence_length) {
                tileK[idx] = past_key[pastKeyOffset + (n + local_id.y) * uniforms.K + w + local_id.x];
              } else if (n + local_id.y - past_sequence_length < uniforms.kv_sequence_length) {
                tileK[idx] = key[kOffset + (n + local_id.y - past_sequence_length) * uniforms.K + w + local_id.x];
              }` : `
          if (n + local_id.y < uniforms.kv_sequence_length) {
            tileK[idx] = key[kOffset + (n + local_id.y) * uniforms.K + w + local_id.x];
          }`}
      ${c ? `if (n + local_id.y < present_sequence_length) {
        present_key[presentKeyOffset + (n + local_id.y) * uniforms.K + w + local_id.x] = tileK[idx];
      }` : ""}
      }
      workgroupBarrier();

      for (var k: u32 = 0u; k < TILE_SIZE && w+k < uniforms.K; k++) {
          value += ${G}(tileQ[TILE_SIZE * local_id.y + k] * tileK[TILE_SIZE * local_id.x + k]);
      }

      workgroupBarrier();
    }

    if (global_id.y < uniforms.M && global_id.x < total_sequence_length) {
      let headOffset = workgroup_id.z * uniforms.M * uniforms.N;
      let outputIdx = headOffset + global_id.y * uniforms.N + global_id.x;
      var sum: f32 = ${(() => {
        switch (_) {
          case 1:
            return "value";
          case 2:
            return "value.x + value.y";
          case 4:
            return "value.x + value.y + value.z + value.w";
          default:
            throw new Error(`Unsupported components: ${_}`);
        }
      })()};
        output[outputIdx] = ${U.type.value} (sum * uniforms.alpha) + ${o ? "attention_bias[outputIdx]" : "0.0"};
    }
  }`;
    };
    return { name: "AttentionProbs", shaderCache: { hint: `${_};${o !== void 0};${r !== void 0};${e}`, inputDependencies: $ }, getRunData: () => ({ outputs: T, dispatchGroup: b, programUniforms: w }), getShaderSource: I };
  }, Wd = (e, t, n, r, o, i, s = void 0, a = void 0) => {
    let u = i + o.kvSequenceLength, d = o.nReps ? o.nReps : 1, l = o.vHiddenSize * d, c = e > 1 && r, p = o.kvNumHeads ? o.kvNumHeads : o.numHeads, f = c ? [o.batchSize, p, u, o.headSize] : void 0, m = [o.batchSize, o.sequenceLength, l], h = 12, _ = { x: Math.ceil(o.vHeadSize / h), y: Math.ceil(o.sequenceLength / h), z: o.batchSize * o.numHeads }, y = [{ type: 12, data: o.sequenceLength }, { type: 12, data: u }, { type: 12, data: o.vHeadSize }, { type: 12, data: o.numHeads }, { type: 12, data: o.headSize }, { type: 12, data: l }, { type: 12, data: i }, { type: 12, data: o.kvSequenceLength }, { type: 12, data: d }], g = c && r && x$1.size(r.dims) > 0, b = ["type", "type"];
    g && b.push("type"), s && b.push("type"), a && b.push("type");
    let w = [{ dims: m, dataType: t.dataType, gpuDataType: 0 }];
    c && w.push({ dims: f, dataType: t.dataType, gpuDataType: 0 });
    let v = ($) => {
      let T = S("probs", t.dataType, t.dims), I = S("v", n.dataType, n.dims), E = [T, I];
      g && E.push(S("past_value", r.dataType, r.dims));
      let z = s ? S("seq_lens", s.dataType, s.dims) : void 0;
      s && E.push(z);
      let M = a ? S("total_sequence_length_input", a.dataType, a.dims) : void 0;
      a && E.push(M);
      let W = [C("output", t.dataType, m)];
      c && W.push(C("present_value", t.dataType, f));
      let K = [{ name: "M", type: "u32" }, { name: "K", type: "u32" }, { name: "N", type: "u32" }, { name: "num_heads", type: "u32" }, { name: "head_size", type: "u32" }, { name: "v_hidden_size", type: "u32" }, { name: "past_sequence_length", type: "u32" }, { name: "kv_sequence_length", type: "u32" }, { name: "n_reps", type: "u32" }];
      return `
  const TILE_SIZE = ${h}u;
  var<workgroup> tileQ: array<${T.type.value}, ${h * h}>;
  var<workgroup> tileV: array<${T.type.value}, ${h * h}>;
  ${$.registerUniforms(K).declareVariables(...E, ...W)}
  ${$.mainStart([h, h, 1])}
   let headIdx = workgroup_id.z % uniforms.num_heads;
   let batchIdx = workgroup_id.z / uniforms.num_heads;
   let kvHeadIdx = ${d === 1 ? "headIdx" : "headIdx / uniforms.n_reps"};
   let kv_num_heads = ${d === 1 ? "uniforms.num_heads" : "uniforms.num_heads / uniforms.n_reps"};
   let m = global_id.y;
   let n = global_id.x;
   let sequence_length = uniforms.M;
   var total_sequence_length = uniforms.K;
   ${Zn(z, M, true)}
   let offsetA = workgroup_id.z * uniforms.M * uniforms.K + m * uniforms.K;
   let absKvHeadIdx = batchIdx * kv_num_heads + kvHeadIdx; // kvHeadIdx is relative to the batch
   ${g && c ? "let pastValueOffset = absKvHeadIdx * uniforms.N * uniforms.past_sequence_length + n;" : ""};
   let vOffset = absKvHeadIdx * uniforms.N * uniforms.kv_sequence_length + n;
   ${c ? "let presentValueOffset = absKvHeadIdx * uniforms.N * uniforms.K + n;" : ""}
   var value = ${T.type.storage}(0);
   for (var w: u32 = 0u; w < uniforms.K; w += TILE_SIZE) {
      if (m < uniforms.M && w + local_id.x < uniforms.K) {
        tileQ[TILE_SIZE * local_id.y + local_id.x] = probs[offsetA + w + local_id.x];
      }
      if (n < uniforms.N && w + local_id.y < uniforms.K) {
        var idx = TILE_SIZE * local_id.y + local_id.x;
        ${g && c ? `
        if (w + local_id.y < past_sequence_length) {
          tileV[idx] = past_value[pastValueOffset + (w + local_id.y) * uniforms.N];
        } else if (w + local_id.y - past_sequence_length < uniforms.kv_sequence_length) {
          tileV[idx] = v[vOffset + (w + local_id.y - past_sequence_length) * uniforms.N];
        }
      ` : `
            if (w + local_id.y < uniforms.kv_sequence_length) {
              tileV[idx] = v[vOffset + (w + local_id.y) * uniforms.N];
            }`}
        ${c ? `
            if (w + local_id.y < present_sequence_length) {
          present_value[presentValueOffset + (w + local_id.y) * uniforms.N] = tileV[idx];
        }` : ""}
      }
     workgroupBarrier();
     for (var k: u32 = 0u; k < TILE_SIZE && w+k < total_sequence_length; k++) {
       value += tileQ[TILE_SIZE * local_id.y + k] * tileV[TILE_SIZE * k + local_id.x];
     }
     workgroupBarrier();
   }

   // we need to transpose output from BNSH_v to BSND_v
   if (m < uniforms.M && n < uniforms.N) {
     let outputIdx = batchIdx * uniforms.M * uniforms.v_hidden_size + m * uniforms.v_hidden_size
       + headIdx * uniforms.N + n;
     output[outputIdx] = value;
   }
  }`;
    };
    return { name: "AttentionScore", shaderCache: { hint: `${r !== void 0};${e}`, inputDependencies: b }, getRunData: () => ({ outputs: w, dispatchGroup: _, programUniforms: y }), getShaderSource: v };
  }, it = (e, t, n, r, o, i, s, a, u, d, l = void 0, c = void 0) => {
    let p = Math.min(e.outputCount, 1 + (s ? 1 : 0) + (a ? 1 : 0)), f = p > 1 ? s : void 0, m = p > 1 ? a : void 0, h = p > 1 ? d.pastSequenceLength : 0, _ = h + d.kvSequenceLength, y = u && x$1.size(u.dims) > 0 ? u : void 0, g = [t, n];
    f && x$1.size(f.dims) > 0 && g.push(f), y && g.push(y), l && g.push(l), c && g.push(c);
    let b = e.compute(Ld(p, t, n, f, y, d, h, l, c), { inputs: g, outputs: p > 1 ? [-1, 1] : [-1] })[0];
    e.compute(Nd(b, d.batchSize, d.numHeads, h, d.sequenceLength, _, l, c), { inputs: l && c ? [b, l, c] : [b], outputs: [] });
    let w = [b, r];
    m && x$1.size(m.dims) > 0 && w.push(m), l && w.push(l), c && w.push(c), e.compute(Wd(p, b, r, m, d, h, l, c), { inputs: w, outputs: p > 1 ? [0, 2] : [0] });
  }, Gd = (e, t) => {
    let n = [t.batchSize, t.numHeads, t.sequenceLength, t.headSize], r = t.sequenceLength, o = t.inputHiddenSize, i = t.headSize, s = 12, a = { x: Math.ceil(t.headSize / s), y: Math.ceil(t.sequenceLength / s), z: t.batchSize * t.numHeads }, u = [e.inputs[0], e.inputs[1], e.inputs[2]], d = [{ type: 12, data: r }, { type: 12, data: o }, { type: 12, data: i }, { type: 12, data: t.numHeads }, { type: 12, data: t.headSize }, { type: 12, data: t.hiddenSize }, { type: 12, data: t.hiddenSize + t.hiddenSize + t.vHiddenSize }], l = (c) => {
      let p = C("output_q", u[0].dataType, n), f = C("output_k", u[0].dataType, n), m = C("output_v", u[0].dataType, n), h = S("input", u[0].dataType, u[0].dims), _ = S("weight", u[1].dataType, u[1].dims), y = S("bias", u[2].dataType, u[2].dims), g = h.type.storage, b = [{ name: "M", type: "u32" }, { name: "K", type: "u32" }, { name: "N", type: "u32" }, { name: "num_heads", type: "u32" }, { name: "head_size", type: "u32" }, { name: "hidden_size", type: "u32" }, { name: "ldb", type: "u32" }];
      return `
  const TILE_SIZE = ${s}u;
  var<workgroup> tileInput: array<${g}, ${s * s}>;
  var<workgroup> tileWeightQ: array<${g}, ${s * s}>;
  var<workgroup> tileWeightK: array<${g}, ${s * s}>;
  var<workgroup> tileWeightV: array<${g}, ${s * s}>;
  ${c.registerUniforms(b).declareVariables(h, _, y, p, f, m)}
  ${c.mainStart([s, s, 1])}
    let batchIndex = workgroup_id.z / uniforms.num_heads;
    let headNumber = workgroup_id.z % uniforms.num_heads;
    let m = global_id.y;
    let n = global_id.x;

    let inputOffset = batchIndex * (uniforms.M * uniforms.K) + m * uniforms.K;
    let biasOffsetQ = headNumber * uniforms.head_size;
    let biasOffsetK = uniforms.hidden_size + biasOffsetQ;
    let biasOffsetV = uniforms.hidden_size + biasOffsetK;

    var valueQ = ${g}(0);
    var valueK = ${g}(0);
    var valueV = ${g}(0);
    for (var w: u32 = 0u; w < uniforms.K; w += TILE_SIZE) {
      if (m < uniforms.M && w + local_id.x < uniforms.K) {
        tileInput[TILE_SIZE * local_id.y + local_id.x] = input[inputOffset + w + local_id.x];
      }
      if (n < uniforms.N && w + local_id.y < uniforms.K) {
        let offset = n + (w + local_id.y) * uniforms.ldb;
        tileWeightQ[TILE_SIZE * local_id.y + local_id.x] = weight[biasOffsetQ + offset];
        tileWeightK[TILE_SIZE * local_id.y + local_id.x] = weight[biasOffsetK + offset];
        tileWeightV[TILE_SIZE * local_id.y + local_id.x] = weight[biasOffsetV + offset];
      }
      workgroupBarrier();
      for (var k: u32 = 0u; k<TILE_SIZE && w+k < uniforms.K; k++) {
        let inputTileOffset = TILE_SIZE * local_id.y + k;
        let weightTileOffset = TILE_SIZE * k + local_id.x;
        valueQ += tileInput[inputTileOffset] * tileWeightQ[weightTileOffset];
        valueK += tileInput[inputTileOffset] * tileWeightK[weightTileOffset];
        valueV += tileInput[inputTileOffset] * tileWeightV[weightTileOffset];
      }

      workgroupBarrier();
    }

    let headOffset = (m * uniforms.N + n) % uniforms.head_size;
    valueQ += bias[headOffset + biasOffsetQ];
    valueK += bias[headOffset + biasOffsetK];
    valueV += bias[headOffset + biasOffsetV];

    let offset = workgroup_id.z * uniforms.M * uniforms.N;
    if (m < uniforms.M && n < uniforms.N) {
      let outputIdx = offset + m * uniforms.N + n;
      output_q[outputIdx] = valueQ;
      output_k[outputIdx] = valueK;
      output_v[outputIdx] = valueV;
    }
  }`;
    };
    return e.compute({ name: "AttentionPrepare", shaderCache: { inputDependencies: ["type", "type", "type"] }, getRunData: () => ({ outputs: [{ dims: n, dataType: e.inputs[0].dataType, gpuDataType: 0 }, { dims: n, dataType: e.inputs[0].dataType, gpuDataType: 0 }, { dims: n, dataType: e.inputs[0].dataType, gpuDataType: 0 }], dispatchGroup: a, programUniforms: d }), getShaderSource: l }, { inputs: u, outputs: [-1, -1, -1] });
  }, ti = (e, t) => {
    let n = Vd(e.inputs, t), [r, o, i] = Gd(e, n);
    return it(e, r, o, i, e.inputs[4], void 0, void 0, void 0, e.inputs[5], n);
  };
});
var Hd, qd, Fd, ni, ri = k(() => {
  we();
  N();
  H();
  ue();
  F();
  Hd = (e, t) => {
    if (!e || e.length !== 5) throw new Error("BatchNormalization requires 5 inputs");
    let n = (r, o, i) => {
      let s = o.length;
      if (s !== r.length) throw new Error(`${i}: num dimensions != ${s}`);
      o.forEach((a, u) => {
        if (a !== r[u]) throw new Error(`${i}: dim[${u}] do not match`);
      });
    };
    if (e[0].dims.length > 1) {
      let r = t.format === "NHWC" ? t.spatial ? e[0].dims.slice(-1) : e[0].dims.slice(-1).concat(e[0].dims.slice(1, e[0].dims.length - 1)) : e[0].dims.slice(1, t.spatial ? 2 : void 0);
      n(e[1].dims, r, "Invalid input scale"), n(e[2].dims, r, "Invalid input B"), n(e[3].dims, r, "Invalid input mean"), n(e[4].dims, r, "Invalid input var");
    } else n(e[1].dims, [1], "Invalid input scale"), n(e[2].dims, [1], "Invalid input B"), n(e[3].dims, [1], "Invalid input mean"), n(e[4].dims, [1], "Invalid input var");
  }, qd = (e, t) => {
    let { epsilon: n, spatial: r, format: o } = t, i = e[0].dims, s = r ? J(i[i.length - 1]) : 1, a = o === "NHWC" && i.length > 1 ? s : 1, u = x$1.size(i) / s, d = r, l = d ? i.length : i, c = S("x", e[0].dataType, e[0].dims, s), p = S("scale", e[1].dataType, e[1].dims, a), f = S("bias", e[2].dataType, e[2].dims, a), m = S("inputMean", e[3].dataType, e[3].dims, a), h = S("inputVar", e[4].dataType, e[4].dims, a), _ = C("y", e[0].dataType, l, s), y = () => {
      let b = "";
      if (r) b = `let cOffset = ${i.length === 1 ? "0u" : o === "NHWC" ? `outputIndices[${i.length - 1}] / ${s}` : "outputIndices[1]"};`;
      else if (o === "NCHW") b = `
            ${_.indicesSet("outputIndices", "0", "0")}
            let cOffset = ${_.indicesToOffset("outputIndices")};`;
      else {
        b = `var cIndices = ${p.type.indices}(0);
                       cIndices[0] = outputIndices[${i.length - 1}];`;
        for (let w = 1; w < p.rank; w++) b += `cIndices[${w}] = outputIndices[${w}];`;
        b += `let cOffset = ${p.indicesToOffset("cIndices")};`;
      }
      return b;
    }, g = (b) => `
  const epsilon = ${n};
  ${b.registerUniform("outputSize", "u32").declareVariables(c, p, f, m, h, _)}
  ${b.mainStart()}
  ${b.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
    var outputIndices = ${_.offsetToIndices(`global_idx * ${s}`)};
    ${y()}
    let scale = ${p.getByOffset("cOffset")};
    let bias = ${f.getByOffset("cOffset")};
    let inputMean = ${m.getByOffset("cOffset")};
    let inputVar = ${h.getByOffset("cOffset")};
    let x = ${c.getByOffset("global_idx")};
    let value = (x - inputMean) * inverseSqrt(inputVar + epsilon) * scale + bias;
    ${_.setByOffset("global_idx", "value")}
  }`;
    return { name: "BatchNormalization", shaderCache: { hint: `${t.epsilon}_${t.format}_${r}_${s}`, inputDependencies: d ? ["rank", "type", "type", "type", "type"] : void 0 }, getShaderSource: g, getRunData: () => ({ outputs: [{ dims: e[0].dims, dataType: e[0].dataType }], dispatchGroup: { x: Math.ceil(u / 64) }, programUniforms: d ? [{ type: 12, data: u }, ...P(i)] : [{ type: 12, data: u }] }) };
  }, Fd = (e) => L(e), ni = (e, t) => {
    let { inputs: n, outputCount: r } = e, o = Fd({ ...t, outputCount: r });
    if (ne.webgpu.validateInputContent && Hd(n, o), t.trainingMode) throw new Error("BatchNormalization trainingMode is not supported yet.");
    e.compute(qd(n, o));
  };
});
var Kd, jd, oi, ii = k(() => {
  H();
  F();
  Kd = (e) => {
    if (e[0].dims.length !== 3) throw new Error("input should have 3 dimensions");
    if (![320, 640, 1280].includes(e[0].dims[2])) throw new Error("number of channels should be 320, 640 or 1280");
    if (e[1].dims.length !== 1) throw new Error("bias is expected to have 1 dimensions");
    if (e[0].dims[2] !== e[1].dims[0]) throw new Error("last dimension of input and bias are not the same");
  }, jd = (e) => {
    let t = e[0].dims, n = e[0].dims[2], r = x$1.size(t) / 4, o = e[0].dataType, i = S("input", o, t, 4), s = S("bias", o, [n], 4), a = S("residual", o, t, 4), u = C("output", o, t, 4);
    return { name: "BiasAdd", getRunData: () => ({ outputs: [{ dims: t, dataType: e[0].dataType }], dispatchGroup: { x: Math.ceil(r / 64) } }), getShaderSource: (l) => `
  const channels = ${n}u / 4;
  ${l.declareVariables(i, s, a, u)}

  ${l.mainStart()}
    ${l.guardAgainstOutOfBoundsWorkgroupSizes(r)}
    let value = ${i.getByOffset("global_idx")}
      + ${s.getByOffset("global_idx % channels")} + ${a.getByOffset("global_idx")};
    ${u.setByOffset("global_idx", "value")}
  }` };
  }, oi = (e) => {
    Kd(e.inputs), e.compute(jd(e.inputs));
  };
});
var Zd, ee, si, ai, ui, di, li, ci, pi, mi, fi, Qd, hi, gi, yi, bi, gt, _i, nn, wi, $i, vi, xi, Si, Ti, Ii, Ci, Ai, Ei, ki, Pi, zi, Bi, Di, Oi, Mi, Ui, Qn, Xn, Ri, Vi, Ni, Xd, Yd, Li, rn = k(() => {
  N();
  H();
  ue();
  F();
  Zd = (e, t, n, r, o, i, s) => {
    let a = Math.ceil(t / 4), u = "";
    typeof o == "string" ? u = `${o}(a)` : u = o("a");
    let d = S("inputData", n, [a], 4), l = C("outputData", r, [a], 4), c = [{ name: "vec_size", type: "u32" }];
    return s && c.push(...s), `
      ${e.registerUniforms(c).declareVariables(d, l)}

  ${i ?? ""}

  ${e.mainStart()}
    ${e.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.vec_size")}

    let a = ${d.getByOffset("global_idx")};
    ${l.setByOffset("global_idx", u)}
  }`;
  }, ee = (e, t, n, r, o, i = e.dataType, s, a) => {
    let u = [{ type: 12, data: Math.ceil(x$1.size(e.dims) / 4) }];
    return s && u.push(...s), { name: t, shaderCache: { hint: o, inputDependencies: ["type"] }, getShaderSource: (d) => Zd(d, x$1.size(e.dims), e.dataType, i, n, r, a), getRunData: (d) => ({ outputs: [{ dims: e.dims, dataType: i }], dispatchGroup: { x: Math.ceil(x$1.size(d[0].dims) / 64 / 4) }, programUniforms: u }) };
  }, si = (e) => {
    e.compute(ee(e.inputs[0], "Abs", "abs"));
  }, ai = (e) => {
    e.compute(ee(e.inputs[0], "Acos", "acos"));
  }, ui = (e) => {
    e.compute(ee(e.inputs[0], "Acosh", "acosh"));
  }, di = (e) => {
    e.compute(ee(e.inputs[0], "Asin", "asin"));
  }, li = (e) => {
    e.compute(ee(e.inputs[0], "Asinh", "asinh"));
  }, ci = (e) => {
    e.compute(ee(e.inputs[0], "Atan", "atan"));
  }, pi = (e) => {
    e.compute(ee(e.inputs[0], "Atanh", "atanh"));
  }, mi = (e) => L(e), fi = (e, t) => {
    let n;
    switch (t.to) {
      case 10:
        n = "vec4<f16>";
        break;
      case 1:
        n = "vec4<f32>";
        break;
      case 12:
        n = "vec4<u32>";
        break;
      case 6:
        n = "vec4<i32>";
        break;
      case 9:
        n = "vec4<bool>";
        break;
      default:
        throw new RangeError(`not supported type (specified in attribute 'to' from 'Cast' operator): ${t.to}`);
    }
    e.compute(ee(e.inputs[0], "Cast", n, void 0, t.cacheKey, t.to));
  }, Qd = (e) => {
    let t, n, r = e.length >= 2 && e[1].data !== 0, o = e.length >= 3 && e[2].data !== 0;
    switch (e[0].dataType) {
      case 1:
        t = r ? e[1].getFloat32Array()[0] : -34028234663852886e22, n = o ? e[2].getFloat32Array()[0] : 34028234663852886e22;
        break;
      case 10:
        t = r ? e[1].getUint16Array()[0] : 64511, n = o ? e[2].getUint16Array()[0] : 31743;
        break;
      default:
        throw new Error("Unsupport data type");
    }
    return L({ min: t, max: n });
  }, hi = (e, t) => {
    let n = t || Qd(e.inputs), r = pe(e.inputs[0].dataType);
    e.compute(ee(e.inputs[0], "Clip", (o) => `clamp(${o}, vec4<${r}>(uniforms.min), vec4<${r}>(uniforms.max))`, void 0, n.cacheKey, void 0, [{ type: e.inputs[0].dataType, data: n.min }, { type: e.inputs[0].dataType, data: n.max }], [{ name: "min", type: r }, { name: "max", type: r }]), { inputs: [0] });
  }, gi = (e) => {
    e.compute(ee(e.inputs[0], "Ceil", "ceil"));
  }, yi = (e) => {
    e.compute(ee(e.inputs[0], "Cos", "cos"));
  }, bi = (e) => {
    e.compute(ee(e.inputs[0], "Cosh", "cosh"));
  }, gt = (e) => L(e), _i = (e, t) => {
    let n = pe(e.inputs[0].dataType);
    e.compute(ee(e.inputs[0], "Elu", (r) => `elu_vf32(${r})`, `
  const elu_alpha_ = ${n}(${t.alpha});

  fn elu_f32(a: ${n}) -> ${n} {
  return select((exp(a) - 1.0) * elu_alpha_, a, a >= 0.0);
  }

  fn elu_vf32(v: vec4<${n}>) -> vec4<${n}> {
  return vec4(elu_f32(v.x), elu_f32(v.y), elu_f32(v.z), elu_f32(v.w));
  }`, t.cacheKey));
  }, nn = (e = "f32") => `
const r0: ${e} = 0.3275911;
const r1: ${e} = 0.254829592;
const r2: ${e} = -0.284496736;
const r3: ${e} = 1.421413741;
const r4: ${e} = -1.453152027;
const r5: ${e} = 1.061405429;

fn erf_vf32(v: vec4<${e}>) -> vec4<${e}> {
  let absv = abs(v);
  let x = 1.0 / (1.0 + r0 * absv);
  return sign(v) * (1.0 - ((((r5 * x + r4) * x + r3) * x + r2) * x + r1) * x * exp(-absv * absv));
}`, wi = (e) => {
    let t = pe(e.inputs[0].dataType);
    e.compute(ee(e.inputs[0], "Erf", (n) => `erf_vf32(${n})`, nn(t)));
  }, $i = (e) => {
    e.compute(ee(e.inputs[0], "Exp", "exp"));
  }, vi = (e) => {
    e.compute(ee(e.inputs[0], "Floor", "floor"));
  }, xi = (e) => {
    let t = pe(e.inputs[0].dataType);
    e.compute(ee(e.inputs[0], "Gelu", (n) => `0.5 * ${n} * (1.0 + erf_vf32(${n} * 0.7071067811865475))`, nn(t)));
  }, Si = (e, t) => {
    let n = pe(e.inputs[0].dataType);
    e.compute(ee(e.inputs[0], "LeakyRelu", (r) => `select(leaky_relu_alpha_ * ${r}, ${r}, ${r} >= vec4<${n}>(0.0))`, `const leaky_relu_alpha_ = ${n}(${t.alpha});`, t.cacheKey));
  }, Ti = (e) => {
    e.compute(ee(e.inputs[0], "Not", (t) => `!${t}`));
  }, Ii = (e) => {
    e.compute(ee(e.inputs[0], "Neg", (t) => `-${t}`));
  }, Ci = (e) => {
    e.compute(ee(e.inputs[0], "Reciprocal", (t) => `1.0/${t}`));
  }, Ai = (e) => {
    let t = pe(e.inputs[0].dataType);
    e.compute(ee(e.inputs[0], "Relu", (n) => `select(vec4<${t}>(0.0), ${n}, ${n} > vec4<${t}>(0.0))`));
  }, Ei = (e) => {
    e.compute(ee(e.inputs[0], "Sigmoid", (t) => `(1.0 / (1.0 + exp(-${t})))`));
  }, ki = (e) => L(e), Pi = (e, t) => {
    let n = pe(e.inputs[0].dataType);
    e.compute(ee(e.inputs[0], "HardSigmoid", (r) => `max(vec4<${n}>(0.0), min(vec4<${n}>(1.0), ${t.alpha} * ${r} + vec4<${n}>(${t.beta})))`, void 0, t.cacheKey));
  }, zi = (e) => {
    e.compute(ee(e.inputs[0], "Sin", "sin"));
  }, Bi = (e) => {
    e.compute(ee(e.inputs[0], "Sinh", "sinh"));
  }, Di = (e) => {
    e.compute(ee(e.inputs[0], "Sqrt", "sqrt"));
  }, Oi = (e) => {
    e.compute(ee(e.inputs[0], "Tan", "tan"));
  }, Mi = (e) => `sign(${e}) * (1 - exp(-2 * abs(${e}))) / (1 + exp(-2 * abs(${e})))`, Ui = (e) => {
    e.compute(ee(e.inputs[0], "Tanh", Mi));
  }, Qn = (e = "f32") => `
const fast_gelu_a: ${e} = 0.5;
const fast_gelu_b: ${e} = 0.7978845608028654;
const fast_gelu_c: ${e} = 0.035677408136300125;

fn tanh_v(v: vec4<${e}>) -> vec4<${e}> {
  return ${Mi("v")};
}
`, Xn = (e) => `(fast_gelu_a + fast_gelu_a * tanh_v(${e} * (fast_gelu_c * ${e} * ${e} + fast_gelu_b))) * ${e}`, Ri = (e) => {
    let t = pe(e.inputs[0].dataType);
    e.compute(ee(e.inputs[0], "FastGelu", Xn, Qn(t), void 0, e.inputs[0].dataType));
  }, Vi = (e, t) => {
    let n = pe(e.inputs[0].dataType);
    return e.compute(ee(e.inputs[0], "ThresholdedRelu", (r) => `select(vec4<${n}>(0.0), ${r}, ${r} > thresholded_relu_alpha_)`, `const thresholded_relu_alpha_ = vec4<${n}>(${t.alpha});`, t.cacheKey)), 0;
  }, Ni = (e) => {
    e.compute(ee(e.inputs[0], "Log", "log"));
  }, Xd = (e, t) => `
const alpha = vec4<${e}>(${t});
const one = ${e}(1.0);
const zero = ${e}(0.0);

fn quick_gelu_impl(x: vec4<${e}>) -> vec4<${e}> {
  let v = x *alpha;
  var x1 : vec4<${e}>;
  for (var i = 0; i < 4; i = i + 1) {
    if (v[i] >= zero) {
      x1[i] = one / (one + exp(-v[i]));
    } else {
      x1[i] = one - one / (one + exp(v[i]));
    }
  }
  return x * x1;
}
`, Yd = (e) => `quick_gelu_impl(${e})`, Li = (e, t) => {
    let n = pe(e.inputs[0].dataType);
    e.compute(ee(e.inputs[0], "QuickGelu", Yd, Xd(n, t.alpha), t.cacheKey, e.inputs[0].dataType));
  };
});
var Jd, el, Gi, Hi = k(() => {
  H();
  F();
  rn();
  Jd = (e) => {
    if (e[0].dims.length !== 3) throw new Error("input should have 3 dimensions");
    if (![2560, 5120, 10240].includes(e[0].dims[2])) throw new Error("hidden state should be 2560, 5120 or 10240");
    if (e[1].dims.length !== 1) throw new Error("bias is expected to have 1 dimensions");
    if (e[0].dims[2] !== e[1].dims[0]) throw new Error("last dimension of input and bias are not the same");
  }, el = (e) => {
    let t = e[0].dims.slice();
    t[2] = t[2] / 2;
    let n = S("input", e[0].dataType, e[0].dims, 4), r = S("bias", e[0].dataType, [e[0].dims[2]], 4), o = C("output", e[0].dataType, t, 4), i = x$1.size(t) / 4, s = re(e[0].dataType);
    return { name: "BiasSplitGelu", getRunData: () => ({ outputs: [{ dims: t, dataType: e[0].dataType }], dispatchGroup: { x: Math.ceil(i / 64) } }), getShaderSource: (u) => `
  const M_SQRT2 = sqrt(2.0);
  const halfChannels = ${e[0].dims[2] / 4 / 2}u;

  ${u.declareVariables(n, r, o)}

  ${nn(s)}

  ${u.mainStart()}
    ${u.guardAgainstOutOfBoundsWorkgroupSizes(i)}
    let biasIdx = global_idx % halfChannels;
    let batchIndex = global_idx / halfChannels;
    let inputOffset = biasIdx + batchIndex * halfChannels * 2;
    let valueLeft = input[inputOffset] + bias[biasIdx];
    let valueRight = input[inputOffset + halfChannels] + bias[biasIdx + halfChannels];
    let geluRight = valueRight * 0.5 * (erf_vf32(valueRight / M_SQRT2) + 1);

    ${o.setByOffset("global_idx", "valueLeft * geluRight")}
  }` };
  }, Gi = (e) => {
    Jd(e.inputs), e.compute(el(e.inputs));
  };
});
var tl, nl, Ue, qi, Fi, Ki, ji, Zi, Qi, Xi, Yi, Ji, es, ts = k(() => {
  N();
  H();
  F();
  tl = (e, t, n, r, o, i, s, a, u, d, l, c) => {
    let p, f;
    typeof a == "string" ? p = f = (g, b) => `${a}((${g}),(${b}))` : typeof a == "function" ? p = f = a : (p = a.scalar, f = a.vector);
    let m = C("outputData", l, r.length, 4), h = S("aData", u, t.length, 4), _ = S("bData", d, n.length, 4), y;
    if (o) if (i) {
      let g = x$1.size(t) === 1, b = x$1.size(n) === 1, w = t.length > 0 && t[t.length - 1] % 4 === 0, v = n.length > 0 && n[n.length - 1] % 4 === 0;
      g || b ? y = m.setByOffset("global_idx", f(g ? `${h.type.value}(${h.getByOffset("0")}.x)` : h.getByOffset("global_idx"), b ? `${_.type.value}(${_.getByOffset("0")}.x)` : _.getByOffset("global_idx"))) : y = `
            let outputIndices = ${m.offsetToIndices("global_idx * 4u")};
            let offsetA = ${h.broadcastedIndicesToOffset("outputIndices", m)};
            let offsetB = ${_.broadcastedIndicesToOffset("outputIndices", m)};
            ${m.setByOffset("global_idx", f(s || w ? h.getByOffset("offsetA / 4u") : `${h.type.value}(${h.getByOffset("offsetA / 4u")}[offsetA % 4u])`, s || v ? _.getByOffset("offsetB / 4u") : `${_.type.value}(${_.getByOffset("offsetB / 4u")}[offsetB % 4u])`))}
          `;
    } else y = m.setByOffset("global_idx", f(h.getByOffset("global_idx"), _.getByOffset("global_idx")));
    else {
      if (!i) throw new Error("no necessary to use scalar implementation for element-wise binary op implementation.");
      let g = (b, w, v = "") => {
        let $ = `aData[indexA${w}][componentA${w}]`, T = `bData[indexB${w}][componentB${w}]`;
        return `
            let outputIndices${w} = ${m.offsetToIndices(`global_idx * 4u + ${w}u`)};
            let offsetA${w} = ${h.broadcastedIndicesToOffset(`outputIndices${w}`, m)};
            let offsetB${w} = ${_.broadcastedIndicesToOffset(`outputIndices${w}`, m)};
            let indexA${w} = offsetA${w} / 4u;
            let indexB${w} = offsetB${w} / 4u;
            let componentA${w} = offsetA${w} % 4u;
            let componentB${w} = offsetB${w} % 4u;
            ${b}[${w}] = ${v}(${p($, T)});
          `;
      };
      l === 9 ? y = `
            var data = vec4<u32>(0);
            ${g("data", 0, "u32")}
            ${g("data", 1, "u32")}
            ${g("data", 2, "u32")}
            ${g("data", 3, "u32")}
            outputData[global_idx] = dot(vec4<u32>(0x1, 0x100, 0x10000, 0x1000000), vec4<u32>(data));` : y = `
            ${g("outputData[global_idx]", 0)}
            ${g("outputData[global_idx]", 1)}
            ${g("outputData[global_idx]", 2)}
            ${g("outputData[global_idx]", 3)}
          `;
    }
    return `
        ${e.registerUniform("vec_size", "u32").declareVariables(h, _, m)}

        ${c ?? ""}

        ${e.mainStart()}
        ${e.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.vec_size")}
        ${y}
      }`;
  }, nl = (e, t, n, r, o, i, s = n.dataType) => {
    let a = n.dims.map(Number), u = r.dims.map(Number), d = !x$1.areEqual(a, u), l = a, c = x$1.size(a), p = false, f = false, m = [d];
    if (d) {
      let h = ze.calcShape(a, u, false);
      if (!h) throw new Error("Can't perform binary op on the given tensors");
      l = h.slice(), c = x$1.size(l);
      let _ = x$1.size(a) === 1, y = x$1.size(u) === 1, g = a.length > 0 && a[a.length - 1] % 4 === 0, b = u.length > 0 && u[u.length - 1] % 4 === 0;
      m.push(_), m.push(y), m.push(g), m.push(b);
      let w = 1;
      for (let v = 1; v < l.length; v++) {
        let $ = a[a.length - v], T = u[u.length - v];
        if ($ === T) w *= $;
        else break;
      }
      w % 4 === 0 ? (f = true, p = true) : (_ || y || g || b) && (p = true);
    } else p = true;
    return m.push(p), { name: e, shaderCache: { hint: t + m.map((h) => h.toString()).join("_"), inputDependencies: ["rank", "rank"] }, getShaderSource: (h) => tl(h, a, u, l, p, d, f, o, n.dataType, r.dataType, s, i), getRunData: () => ({ outputs: [{ dims: l, dataType: s }], dispatchGroup: { x: Math.ceil(c / 64 / 4) }, programUniforms: [{ type: 12, data: Math.ceil(x$1.size(l) / 4) }, ...P(a, u, l)] }) };
  }, Ue = (e, t, n, r, o, i) => {
    e.compute(nl(t, o ?? "", e.inputs[0], e.inputs[1], n, r, i));
  }, qi = (e) => {
    Ue(e, "Add", (t, n) => `${t}+${n}`);
  }, Fi = (e) => {
    Ue(e, "Div", (t, n) => `${t}/${n}`);
  }, Ki = (e) => {
    Ue(e, "Equal", { scalar: (t, n) => `u32(${t}==${n})`, vector: (t, n) => `vec4<u32>(${t}==${n})` }, void 0, void 0, 9);
  }, ji = (e) => {
    Ue(e, "Mul", (t, n) => `${t}*${n}`);
  }, Zi = (e) => {
    let t = S("input", e.inputs[0].dataType, e.inputs[0].dims).type.value;
    Ue(e, "Pow", { scalar: (r, o) => `pow_custom(${r},${o})`, vector: (r, o) => `pow_vector_custom(${r},${o})` }, `
    fn pow_custom(a : ${t}, b : ${t}) -> ${t} {
      if (b == ${t}(0.0)) {
        return ${t}(1.0);
      } else if (a < ${t}(0.0) && f32(b) != floor(f32(b))) {
        return ${t}(pow(f32(a), f32(b))); // NaN
      }
      return select(sign(a), ${t}(1.0), round(f32(abs(b) % ${t}(2.0))) != 1.0) * ${t}(${t === "i32" ? "round" : ""}(pow(f32(abs(a)), f32(b))));
    }
    fn pow_vector_custom(a : vec4<${t}>, b : vec4<${t}>) -> vec4<${t}> {
      // TODO: implement vectorized pow
      return vec4<${t}>(pow_custom(a.x, b.x), pow_custom(a.y, b.y), pow_custom(a.z, b.z), pow_custom(a.w, b.w));
    }
      `);
  }, Qi = (e) => {
    Ue(e, "Sub", (t, n) => `${t}-${n}`);
  }, Xi = (e) => {
    Ue(e, "Greater", { scalar: (t, n) => `u32(${t}>${n})`, vector: (t, n) => `vec4<u32>(${t}>${n})` }, void 0, void 0, 9);
  }, Yi = (e) => {
    Ue(e, "Less", { scalar: (t, n) => `u32(${t}<${n})`, vector: (t, n) => `vec4<u32>(${t}<${n})` }, void 0, void 0, 9);
  }, Ji = (e) => {
    Ue(e, "GreaterOrEqual", { scalar: (t, n) => `u32(${t}>=${n})`, vector: (t, n) => `vec4<u32>(${t}>=${n})` }, void 0, void 0, 9);
  }, es = (e) => {
    Ue(e, "LessOrEqual", { scalar: (t, n) => `u32(${t}<=${n})`, vector: (t, n) => `vec4<u32>(${t}<=${n})` }, void 0, void 0, 9);
  };
});
var ol, il, sl, al, ns, rs, os = k(() => {
  N();
  H();
  ue();
  F();
  ol = (e, t) => {
    if (!e || e.length < 1) throw new Error("too few inputs");
    let n = 0, r = e[n], o = r.dataType, i = r.dims.length;
    e.forEach((s, a) => {
      if (a !== n) {
        if (s.dataType !== o) throw new Error("input tensors should be one type");
        if (s.dims.length !== i) throw new Error("input tensors should have the same shape");
        s.dims.forEach((u, d) => {
          if (d !== t && u !== r.dims[d]) throw new Error("non concat dimensions must match");
        });
      }
    });
  }, il = (e, t) => `
  fn calculateInputIndex(index: u32) -> u32 {
    let sizeInConcatAxis = array<u32, ${e}u>(${t});
    for (var i: u32 = 0u; i < ${e}; i += 1u ) {
      if (index < sizeInConcatAxis[i]) {
        return i;
      }
    }
    return ${e}u;
  }`, sl = (e, t) => {
    let n = e.length, r = [];
    for (let o = 0; o < n; ++o) {
      let i = t.setByOffset("global_idx", e[o].getByIndices("indices"));
      n === 1 ? r.push(i) : o === 0 ? r.push(`if (inputIndex == ${o}u) { ${i} }`) : o === n - 1 ? r.push(`else { ${i} }`) : r.push(`else if (inputIndex == ${o}) { ${i} }`);
    }
    return r.join(`
`);
  }, al = (e, t, n, r) => {
    let o = x$1.size(n), i = new Array(e.length), s = new Array(e.length), a = 0, u = [], d = [], l = [{ type: 12, data: o }];
    for (let h = 0; h < e.length; ++h) a += e[h].dims[t], i[h] = a, d.push(e[h].dims.length), s[h] = S(`input${h}`, r, d[h]), u.push("rank"), l.push({ type: 12, data: i[h] });
    for (let h = 0; h < e.length; ++h) l.push(...P(e[h].dims));
    l.push(...P(n));
    let c = C("output", r, n.length), p = c.indicesGet("indices", t), f = Array.from(Array(i.length).keys()).map((h) => `uniforms.sizeInConcatAxis${h}`).join(","), m = (h) => `

  ${(() => {
      h.registerUniform("outputSize", "u32");
      for (let _ = 0; _ < e.length; _++) h.registerUniform(`sizeInConcatAxis${_}`, "u32");
      return h.declareVariables(...s, c);
    })()}

  ${il(i.length, f)}

  ${h.mainStart()}
    ${h.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}

    var indices = ${c.offsetToIndices("global_idx")};

    let inputIndex = calculateInputIndex(${p});
    if (inputIndex != 0u) {
      let sizeInConcatAxis = array<u32, ${i.length}u>(${f});
      ${p} -= sizeInConcatAxis[inputIndex - 1u];
    }

    ${sl(s, c)}
  }`;
    return { name: "Concat", shaderCache: { hint: `${t}`, inputDependencies: u }, getRunData: () => ({ outputs: [{ dims: n, dataType: r }], dispatchGroup: { x: Math.ceil(o / 64) }, programUniforms: l }), getShaderSource: m };
  }, ns = (e, t) => {
    let n = e.inputs, r = n[0].dims, o = x$1.normalizeAxis(t.axis, r.length);
    ol(n, o);
    let i = r.slice();
    i[o] = n.reduce((a, u) => a + (u.dims.length > o ? u.dims[o] : 0), 0);
    let s = n.filter((a) => x$1.size(a.dims) > 0);
    e.compute(al(s, o, i, n[0].dataType), { inputs: s });
  }, rs = (e) => L({ axis: e.axis });
});
var Ce, Ae, Ee, on, Fe = k(() => {
  N();
  H();
  Ce = (e, t, n = "f32") => {
    switch (e.activation) {
      case "Relu":
        return `value = max(value, ${t}(0.0));`;
      case "Sigmoid":
        return `value = (${t}(1.0) / (${t}(1.0) + exp(-value)));`;
      case "Clip":
        return `value = clamp(value, ${t}(${n}(uniforms.clip_min)), ${t}(${n}(uniforms.clip_max)));`;
      case "HardSigmoid":
        return `value = max(${t}(0.0), min(${t}(1.0), ${n}(uniforms.alpha) * value + ${n}(uniforms.beta)));`;
      case "LeakyRelu":
        return `value = select(${n}(uniforms.alpha) * value, value, value >= ${t}(0.0));`;
      case "Tanh":
        return `let e2x = exp(-2.0 * abs(value));
              value = sign(value) * (1.0 - e2x) / (1.0 + e2x);
        `;
      case "":
        return "";
      default:
        throw new Error(`Unsupported activation ${e.activation}`);
    }
  }, Ae = (e, t) => {
    e.activation === "Clip" ? t.push({ type: 1, data: e.clipMax }, { type: 1, data: e.clipMin }) : e.activation === "HardSigmoid" ? t.push({ type: 1, data: e.alpha }, { type: 1, data: e.beta }) : e.activation === "LeakyRelu" && t.push({ type: 1, data: e.alpha });
  }, Ee = (e, t) => {
    e.activation === "Clip" ? t.push({ name: "clip_max", type: "f32" }, { name: "clip_min", type: "f32" }) : e.activation === "HardSigmoid" ? t.push({ name: "alpha", type: "f32" }, { name: "beta", type: "f32" }) : e.activation === "LeakyRelu" && t.push({ name: "alpha", type: "f32" });
  }, on = (e) => {
    let t = e?.activation || "";
    if (t === "HardSigmoid") {
      let [n, r] = e?.activation_params || [0.2, 0.5];
      return { activation: t, alpha: n, beta: r };
    } else if (t === "Clip") {
      let [n, r] = e?.activation_params || [co, po];
      return { activation: t, clipMax: r, clipMin: n };
    } else if (t === "LeakyRelu") {
      let [n] = e?.activation_params || [0.01];
      return { activation: t, alpha: n };
    }
    return { activation: t };
  };
});
var le, is, sn = k(() => {
  le = (e, t) => {
    switch (e) {
      case 1:
        return t;
      case 2:
        return `vec2<${t}>`;
      case 3:
        return `vec3<${t}>`;
      case 4:
        return `vec4<${t}>`;
      default:
        throw new Error(`${e}-component is not supported.`);
    }
  }, is = (e) => `
      ${e ? "value = value + getBiasByOutputCoords(coords);" : ""}
      `;
});
var ss, as = k(() => {
  ss = (e) => `
fn getIndexFromCoords4D(coords : vec4<i32>, shape : vec4<i32>) -> i32 {
  return dot(coords, vec4<i32>(
      shape.y * shape.z * shape.w, shape.z * shape.w, shape.w, 1));
}
fn getOutputIndexFromCoords(coords : vec4<i32>) -> i32 {
  return dot(coords, vec4<i32>(
    i32(${e}.x), i32(${e}.y), i32(${e}.z), 1));
}
`;
});
var yt, an, un = k(() => {
  N();
  H();
  F();
  Fe();
  yt = (e, t, n, r, o) => {
    let i = r - n;
    return `
      ${Array.from({ length: n }).map((s, a) => `
      if (${D(t.shape, a, t.rank)} != 1) {
        ${t.indicesSet(e, a, D(o, a + i, r))}
      } else {
        ${t.indicesSet(e, a, 0)}
      }`).join("")}
`;
  }, an = (e, t, n, r, o = false, i) => {
    let s = e[0].dims, a = e[1].dims, u = s[s.length - 2], d = a[a.length - 1], l = s[s.length - 1], c = J(d), p = J(l), f = J(u), m = x$1.size(n) / c / f, h = e.length > 2, _ = r ? r.slice(0, -2) : n.slice(0, -2), g = [x$1.size(_), u, d], b = [{ type: 12, data: m }, { type: 12, data: u }, { type: 12, data: d }, { type: 12, data: l }];
    Ae(t, b), b.push(...P(_, s, a)), h && b.push(...P(e[2].dims)), b.push(...P(g));
    let w = (v) => {
      let $ = Yt("batch_dims", e[0].dataType, _.length), T = S("a", e[0].dataType, s.length, p), I = S("b", e[1].dataType, a.length, c), E = C("output", e[0].dataType, g.length, c), z = re(E.type.tensor), M = Ce(t, E.type.value, z), O = [T, I], W = "";
      if (h) {
        let R = o ? c : 1;
        O.push(S("bias", e[2].dataType, e[2].dims.length, R)), W = `${o ? `value += bias[col / ${R}];` : `value += ${E.type.value}(bias[row + i]);`}`;
      }
      let K = [{ name: "output_size", type: "u32" }, { name: "M", type: "u32" }, { name: "N", type: "u32" }, { name: "K", type: "u32" }];
      Ee(t, K);
      let U = () => {
        let R = `var a_data: ${T.type.value};`;
        for (let G = 0; G < p; G++) R += `
              let b_data${G} = b[(b_offset + (k + ${G}) * uniforms.N + col) / ${c}];`;
        for (let G = 0; G < f; G++) {
          R += `a_data = a[(a_offset + (row + ${G}) * uniforms.K + k) / ${p}];`;
          for (let V = 0; V < p; V++) R += `
            values[${G}] = fma(${I.type.value}(a_data${p === 1 ? "" : `[${V}]`}), b_data${V}, values[${G}]);
`;
        }
        return R;
      };
      return `
  ${v.registerUniforms(K).registerInternalVariables($).declareVariables(...O, E)}
  ${v.mainStart()}
    ${v.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    let col = (global_idx % (uniforms.N / ${c})) * ${c};
    var index1 = global_idx / (uniforms.N / ${c});
    let stride1 = uniforms.M / ${f};
    let row = (index1 % stride1) * ${f};
    let batch = index1 / stride1;

    ${n.length === 2 ? "" : `let batch_indices = ${$.offsetToIndices("batch")};`}

    var a_indices: ${T.type.indices};
    ${yt("a_indices", T, T.rank - 2, $.rank, "batch_indices")}
    ${T.indicesSet("a_indices", T.rank - 2, 0)}
    ${T.indicesSet("a_indices", T.rank - 1, 0)}
    let a_offset = ${T.indicesToOffset("a_indices")};

    var b_indices: ${I.type.indices};
    ${yt("b_indices", I, I.rank - 2, $.rank, "batch_indices")}
    ${I.indicesSet("b_indices", I.rank - 2, 0)}
    ${I.indicesSet("b_indices", I.rank - 1, 0)}
    let b_offset = ${I.indicesToOffset("b_indices")};
    var values: array<${E.type.value}, ${f}>;
    for (var k: u32 = 0u; k < uniforms.K; k = k + ${p}) {
      ${U()}
    }
    for (var i = 0u; i < ${f}u; i++) {
      var value = values[i];
      ${W}
      ${M}
      let cur_indices = ${E.type.indices}(batch, row + i, col);
      let offset = ${E.indicesToOffset("cur_indices")};
      ${E.setByOffset(`offset / ${c}`, "value")};
    }
  }
  `;
    };
    return { name: "MatMulNaive", shaderCache: { hint: `${t.activation};${c};${p};${f};${o}`, inputDependencies: h ? ["rank", "rank", "rank"] : ["rank", "rank"] }, getRunData: () => ({ outputs: [{ dims: i ? i(n) : n, dataType: e[0].dataType }], dispatchGroup: { x: Math.ceil(m / 64) }, programUniforms: b }), getShaderSource: w };
  };
});
var ul, dl, Yn, us, ll, Jn, cl, bt, dn = k(() => {
  N();
  H();
  F();
  Fe();
  un();
  sn();
  ul = (e, t) => e ? `
        mm_Asub[inputRow][inputCol] = mm_readA(batch,
          kStart + inputRow,
          globalRowStart / innerElementSize + inputCol${t ? ", batchIndices" : ""});
        ` : `
        mm_Asub[inputRow][inputCol] = mm_readA(batch,
          globalRow + innerRow,
          kStart / innerElementSize + inputCol${t ? ", batchIndices" : ""});
        `, dl = (e, t) => e ? `
        let ACached0 = mm_Asub[k * innerElementSize][localRow];
        let ACached1 = mm_Asub[k * innerElementSize + 1][localRow];
        let ACached2 = mm_Asub[k * innerElementSize + 2][localRow];
        ${t === 3 ? "" : "let ACached3 = mm_Asub[k * innerElementSize + 3][localRow];"}
        for (var i = 0; i < rowPerThread; i = i + 1) {
          acc[i] = BCached0 * ACached0[i] + acc[i];
          acc[i] = BCached1 * ACached1[i] + acc[i];
          acc[i] = BCached2 * ACached2[i] + acc[i];
          ${t === 3 ? "" : "acc[i] = BCached3 * ACached3[i] + acc[i];"}
        }` : `
        for (var i = 0; i < rowPerThread; i = i + 1) {
          let ACached = mm_Asub[tileRow + i][k];
          acc[i] = BCached0 * ACached.x + acc[i];
          acc[i] = BCached1 * ACached.y + acc[i];
          acc[i] = BCached2 * ACached.z + acc[i];
          ${t === 3 ? "" : "acc[i] = BCached3 * ACached.w + acc[i];"}
        }`, Yn = (e, t, n = "f32", r, o = false, i = 32, s = false, a = 32) => {
    let u = t[1] * e[1], d = t[0] * e[0], l = o ? u : i, c = o ? i : u, p = l / t[0], f = i / t[1];
    if (!((o && p === 4 && e[1] === 4 || !o && (p === 3 || p === 4)) && l % t[0] === 0 && i % t[1] === 0 && e[0] === 4)) throw new Error(`If transposeA ${o} is true, innerElementSize ${p} and workPerThread[1] ${e[1]} must be 4.
      Otherwise, innerElementSize ${p} must be 3 or 4.
  tileAWidth ${l} must be divisible by workgroupSize[0]${t[0]}. tileInner ${i} must be divisible by workgroupSize[1] ${t[1]}. colPerThread ${e[0]} must be 4.`);
    return `
var<workgroup> mm_Asub: array<array<vec${p}<${n}>, ${l / p}>, ${c}>;
var<workgroup> mm_Bsub: array<array<vec4<${n}>, ${d / e[0]}>, ${i}>;

const rowPerThread = ${e[1]};
const colPerThread = ${e[0]};
const innerElementSize = ${p};
const tileInner = ${i};

@compute @workgroup_size(${t[0]}, ${t[1]}, ${t[2]})
fn main(@builtin(local_invocation_id) localId : vec3<u32>,
        @builtin(global_invocation_id) globalId : vec3<u32>,
        @builtin(workgroup_id) workgroupId : vec3<u32>) {
  let localRow = i32(localId.y);
  let tileRow = localRow * rowPerThread;
  let tileCol = i32(localId.x);

  let globalRow =i32(globalId.y) * rowPerThread;
  let globalCol = i32(globalId.x);
  let batch = ${s ? "0" : "i32(globalId.z)"};
  ${r ? `let batchIndices = ${r.offsetToIndices("u32(batch)")};` : ""}
  let globalRowStart = i32(workgroupId.y) * ${u};

  let num_tiles = ${s ? `${Math.ceil(a / i)}` : "(uniforms.dim_inner - 1) / tileInner + 1"};
  var kStart = ${s ? `i32(globalId.z) * ${a}` : "0"};

  var acc: array<vec4<${n}>, rowPerThread>;

  // Loop over shared dimension.
  let tileRowB = localRow * ${f};
  for (var t = 0; t < num_tiles; t = t + 1) {
      // Load one tile of A into local memory.
      for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
          let inputRow = tileRow + innerRow;
          let inputCol = tileCol;
          ${ul(o, r)}
      }

      // Load one tile of B into local memory.
      for (var innerRow = 0; innerRow < ${f}; innerRow = innerRow + 1) {
          let inputRow = tileRowB + innerRow;
          let inputCol = tileCol;
          mm_Bsub[inputRow][inputCol] = mm_readB(batch, kStart + inputRow, globalCol${r ? ", batchIndices" : ""});
      }
      kStart = kStart + tileInner;
      workgroupBarrier();

      // Compute acc values for a single thread.
      for (var k = 0; k < tileInner / innerElementSize; k = k + 1) {
          let BCached0 = mm_Bsub[k * innerElementSize][tileCol];
          let BCached1 = mm_Bsub[k * innerElementSize + 1][tileCol];
          let BCached2 = mm_Bsub[k * innerElementSize + 2][tileCol];
          ${p === 3 ? "" : "let BCached3 = mm_Bsub[k * innerElementSize + 3][tileCol];"}

          ${dl(o, p)}
      }

      workgroupBarrier();
  }

  for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
      mm_write(batch, globalRow + innerRow, globalCol, acc[innerRow]);
  }
}`;
  }, us = (e, t) => e ? `
            mm_Asub[inputRow][inputCol] = mm_readA(batch,
              kStart + inputRow,
              globalRowStart + inputCol${t ? ", batchIndices" : ""});
            ` : `
            mm_Asub[inputRow][inputCol] = mm_readA(batch,
              globalRowStart + inputRow,
              kStart + inputCol${t ? ", batchIndices" : ""});
            `, ll = (e) => e ? "let ACached = mm_Asub[k][tileRow + innerRow];" : "let ACached = mm_Asub[tileRow + innerRow][k];", Jn = (e, t, n = "f32", r, o = false, i = 32, s = false, a = 32, u = false) => {
    let d = e[1] * t[1], l = e[0] * t[0], c = o ? d : i, p = o ? i : d;
    if (!(p % t[1] === 0 && c % t[0] === 0 && i % t[1] === 0)) throw new Error(`tileAHight ${p} must be divisible by workgroupSize[1]${t[1]}, tileAWidth ${c} must be divisible by workgroupSize[0]${t[0]}, tileInner ${i} must be divisible by workgroupSize[1]${t[1]}`);
    let f = p / t[1], m = c / t[0], h = i / t[1], _ = u ? `
    let localRow = i32(localId.y);
    let localCol = i32(localId.x);
    let globalRowStart = i32(workgroupId.y) * ${d};
    let globalColStart = i32(workgroupId.x) * ${l};

    // Loop over shared dimension.
    for (var t = 0; t < num_tiles; t = t + 1) {
      // Load one tile of A into local memory.
      for (var inputRow = localRow; inputRow < ${p}; inputRow = inputRow + ${t[1]}) {
        for (var inputCol = localCol; inputCol < ${c}; inputCol = inputCol + ${t[0]}) {
          ${us(o, r)}
        }
      }
      // Load one tile of B into local memory.
      for (var inputRow = localRow; inputRow < ${i}; inputRow = inputRow + ${t[1]}) {
            for (var inputCol = localCol; inputCol < ${l}; inputCol = inputCol + ${t[0]}) {
          mm_Bsub[inputRow][inputCol] = mm_readB(batch,
            kStart + inputRow,
            globalColStart + inputCol${r ? ", batchIndices" : ""});
        }
      }
      kStart = kStart + tileInner;
      workgroupBarrier();

      // Compute acc values for a single thread.
      var BCached : array<${n}, colPerThread>;
      for (var k = 0; k < tileInner; k = k + 1) {
        for (var inner = 0; inner < colPerThread; inner = inner + 1) {
          BCached[inner] = mm_Bsub[k][localCol + inner * ${t[0]}];
        }
        for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
          let ACached = ${o ? `mm_Asub[k][localRow + innerRow * ${t[1]}];` : `mm_Asub[localRow + innerRow * ${t[1]}][k];`}
          for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
            acc[innerRow][innerCol] = acc[innerRow][innerCol] +
                ACached * BCached[innerCol];
          }
        }
      }
      workgroupBarrier();
    }
    for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
      let gRow = globalRowStart + localRow + innerRow * ${t[1]};
      for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
        let gCol = globalColStart + localCol + innerCol * ${t[0]};
        mm_write(batch, gRow, gCol, acc[innerRow][innerCol]);
      }
    }
    ` : `
let tileRow = i32(localId.y) * rowPerThread;
let tileCol = i32(localId.x) * colPerThread;

let globalRow = i32(globalId.y) * rowPerThread;
let globalCol = i32(globalId.x) * colPerThread;
let globalRowStart = i32(workgroupId.y) * ${d};

let tileRowA = i32(localId.y) * ${f};
let tileColA = i32(localId.x) * ${m};
let tileRowB = i32(localId.y) * ${h};
// Loop over shared dimension.
for (var t = 0; t < num_tiles; t = t + 1) {
  // Load one tile of A into local memory.
  for (var innerRow = 0; innerRow < ${f}; innerRow = innerRow + 1) {
    for (var innerCol = 0; innerCol < ${m}; innerCol = innerCol + 1) {
      let inputRow = tileRowA + innerRow;
      let inputCol = tileColA + innerCol;
      ${us(o, r)}
    }
  }

  // Load one tile of B into local memory.
  for (var innerRow = 0; innerRow < ${h}; innerRow = innerRow + 1) {
    for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
      let inputRow = tileRowB + innerRow;
      let inputCol = tileCol + innerCol;
      mm_Bsub[inputRow][inputCol] = mm_readB(batch,
        kStart + inputRow,
        globalCol + innerCol${r ? ", batchIndices" : ""});
    }
  }
  kStart = kStart + tileInner;
  workgroupBarrier();

  // Compute acc values for a single thread.
  var BCached : array<${n}, colPerThread>;
  for (var k = 0; k < tileInner; k = k + 1) {
    for (var inner = 0; inner < colPerThread; inner = inner + 1) {
      BCached[inner] = mm_Bsub[k][tileCol + inner];
    }

    for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
      ${ll(o)}
      for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
        acc[innerRow][innerCol] = acc[innerRow][innerCol] + ACached * BCached[innerCol];
      }
    }
  }

  workgroupBarrier();
}

for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
  for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
    mm_write(batch, globalRow + innerRow, globalCol + innerCol,
        acc[innerRow][innerCol]);
  }
}
`;
    return `
  var<workgroup> mm_Asub : array<array<${n}, ${c}>, ${p}>;
  var<workgroup> mm_Bsub : array<array<${n}, ${l}>, ${i}>;
  const rowPerThread = ${e[1]};
  const colPerThread = ${e[0]};
  const tileInner = ${i};

@compute @workgroup_size(${t[0]}, ${t[1]}, ${t[2]})
fn main(@builtin(local_invocation_id) localId : vec3<u32>,
        @builtin(global_invocation_id) globalId : vec3<u32>,
        @builtin(workgroup_id) workgroupId : vec3<u32>) {
    let batch = ${s ? "0" : "i32(globalId.z)"};
    ${r ? `let batchIndices = ${r.offsetToIndices("u32(batch)")};` : ""}
    let num_tiles = ${s ? `${Math.ceil(a / i)}` : "(uniforms.dim_inner - 1) / tileInner + 1"};
    var kStart = ${s ? `i32(globalId.z) * ${a}` : "0"};

    var acc : array<array<${n}, colPerThread>, rowPerThread>;
    ${_}
  }
`;
  }, cl = (e, t, n, r, o = false) => {
    let [i, s, a, u] = r, d = re(r[0].type.tensor);
    return `
    fn mm_readA(batch: i32, row: i32, colIn: i32, batchIndices: ${i.type.indices}) -> ${le(e, d)} {
      var value = ${le(e, d)}(0.0);
      let col = colIn * ${e};
      if(row < uniforms.dim_a_outer && col < uniforms.dim_inner)
      {
        var aIndices: ${s.type.indices};
        ${yt("aIndices", s, s.rank - 2, i.rank, "batchIndices")}
        ${s.indicesSet("aIndices", s.rank - 2, "u32(row)")}
        ${s.indicesSet("aIndices", s.rank - 1, "u32(colIn)")}
        value = ${s.getByIndices("aIndices")};
      }
      return value;
    }

    fn mm_readB(batch: i32, row: i32, colIn: i32, batchIndices: ${i.type.indices}) -> ${le(e, d)} {
      var value = ${le(e, d)}(0.0);
      let col = colIn * ${e};
      if(row < uniforms.dim_inner && col < uniforms.dim_b_outer)
      {
        var bIndices: ${a.type.indices};
        ${yt("bIndices", a, a.rank - 2, i.rank, "batchIndices")}
        ${a.indicesSet("bIndices", a.rank - 2, "u32(row)")}
        ${a.indicesSet("bIndices", a.rank - 1, "u32(colIn)")}
        value = ${a.getByIndices("bIndices")};
      }
      return value;
    }

    fn mm_write(batch: i32, row: i32, colIn: i32, valueIn: ${le(e, d)}) {
      let col = colIn * ${e};
      if (row < uniforms.dim_a_outer && col < uniforms.dim_b_outer) {
        var value = valueIn;
        let coords = vec3<i32>(batch, row, colIn);
        ${t ? `value = value + ${o ? "bias[colIn]" : `${le(e, d)}(bias[row])`};` : ""}
        ${n}
        ${u.setByIndices("vec3<u32>(coords)", "value")}
      }
    }
    `;
  }, bt = (e, t, n, r, o = false, i) => {
    let s = e[0].dims, a = e[1].dims, u = s.slice(0, -2), d = a.slice(0, -2), l = r ? r.slice(0, -2) : n.slice(0, -2), c = x$1.size(l), p = s[s.length - 2], f = s[s.length - 1], m = a[a.length - 1], h = f % 4 === 0 && m % 4 === 0, _ = p <= 8 ? [4, 1, 1] : [4, 4, 1], y = [8, 8, 1], g = [Math.ceil(m / y[0] / _[0]), Math.ceil(p / y[1] / _[1]), Math.ceil(c / y[2] / _[2])], b = h ? 4 : 1, w = [...u, p, f / b], v = w.length, $ = [...d, f, m / b], T = $.length, I = [c, p, m / b], E = [{ type: 6, data: p }, { type: 6, data: m }, { type: 6, data: f }];
    Ae(t, E), E.push(...P(l, w, $));
    let z = ["rank", "rank"], M = e.length > 2;
    M && (E.push(...P(e[2].dims)), z.push("rank")), E.push(...P(I));
    let O = (W) => {
      let K = l.length, U = Yt("batchDims", e[0].dataType, K, 1), R = re(e[0].dataType), G = S("a", e[0].dataType, v, b), V = S("b", e[1].dataType, T, b), j = C("result", e[0].dataType, I.length, b), Q = [G, V];
      if (M) {
        let B = o ? b : 1;
        Q.push(S("bias", e[2].dataType, e[2].dims.length, B));
      }
      let X = [{ name: "dim_a_outer", type: "i32" }, { name: "dim_b_outer", type: "i32" }, { name: "dim_inner", type: "i32" }];
      Ee(t, X);
      let Se = re(j.type.tensor), se = Ce(t, j.type.value, Se), A = cl(b, M, se, [U, G, V, j], o);
      return `
  ${W.registerUniforms(X).registerInternalVariables(U).declareVariables(...Q, j)}
  ${A}
  ${h ? Yn(_, y, R, U) : Jn(_, y, R, U)}
                   `;
    };
    return { name: "MatMul", shaderCache: { hint: `${_};${t.activation};${h};${o}`, inputDependencies: z }, getRunData: () => ({ outputs: [{ dims: i ? i(n) : n, dataType: e[0].dataType }], dispatchGroup: { x: g[0], y: g[1], z: g[2] }, programUniforms: E }), getShaderSource: O };
  };
});
var pl, ds, ls = k(() => {
  N();
  Pe();
  F();
  Fe();
  sn();
  as();
  dn();
  pl = (e, t, n, r, o = false, i, s = 4, a = 4, u = 4, d = "f32") => {
    let l = (z) => {
      switch (z) {
        case 1:
          return "resData = x[xIndex];";
        case 3:
          return `resData = vec3<${d}>(x[xIndex], x[xIndex + 1], x[xIndex + 2]);`;
        case 4:
          return "resData = x[xIndex / 4];";
        default:
          throw new Error(`innerElementSize ${z} is not supported.`);
      }
    }, c = (z) => {
      switch (z) {
        case 1:
          return "return w[row * i32(uniforms.w_shape[3]) + colIn];";
        case 4:
          return "return w[row * i32(uniforms.w_shape[3]) / 4 + colIn];";
        default:
          throw new Error(`innerElementSize ${z} is not supported.`);
      }
    }, p = e ? `
    let coord = vec4<i32>(batch, xRow, xCol, xCh);
    ` : `
    let coord = vec4<i32>(batch, xCh, xRow, xCol);
    `, f = e ? `
    let coords = vec4<i32>(
      batch,
      row / outWidth,
      row % outWidth,
      col);
    ` : `
    let coords = vec4<i32>(
      batch,
      row,
      col / outWidth,
      col % outWidth);
    `, m = e ? "i32(uniforms.x_shape[1])" : "i32(uniforms.x_shape[2])", h = e ? "i32(uniforms.x_shape[2])" : "i32(uniforms.x_shape[3])", _ = e ? "row" : "col", y = e ? "col" : "row", g = `
    let inChannels = i32(uniforms.w_shape[2]);
    let outWidth = ${e ? "i32(uniforms.result_shape[2])" : "i32(uniforms.result_shape[3])"};
    let outRow = ${_} / outWidth;
    let outCol = ${_} % outWidth;

    let WRow = ${y} / (i32(uniforms.w_shape[1]) * inChannels);
    let WCol = ${y} / inChannels % i32(uniforms.w_shape[1]);
    let xRow = outRow * uniforms.stride[0] + uniforms.dilation[0] * WRow - uniforms.pad[0];
    let xCol = outCol * uniforms.stride[1] + uniforms.dilation[1] * WCol - uniforms.pad[1];
    let xCh = ${y} % inChannels;
    var resData = ${le(s, d)}(0.0);
    // The bounds checking is always needed since we use it to pad zero for
    // the 'same' padding type.
    if (xRow >= 0 && xRow < ${m} && xCol >= 0 && xCol < ${h}) {
      ${p}
      let xIndex = getIndexFromCoords4D(coord, vec4<i32>(uniforms.x_shape));
      ${l(s)}
    }
    return resData;`, b = e ? t && r ? `
    let col = colIn * ${s};
    ${g}` : `
    let col = colIn * ${s};
    if (row < uniforms.dim_a_outer && col < uniforms.dim_inner) {
      ${g}
    }
    return ${le(s, d)}(0.0);` : r && n ? `
    let col = colIn * ${s};
    ${g}` : `
    let col = colIn * ${s};
    if (row < uniforms.dim_inner && col < uniforms.dim_b_outer) {
      ${g}
    }
    return ${le(s, d)}(0.0);`, w = e ? r && n ? c(a) : `
    let col = colIn * ${a};
    if (row < uniforms.dim_inner && col < uniforms.dim_b_outer) {
      ${c(a)}
    }
    return ${le(a, d)}(0.0);` : `
    let col = colIn * ${a};
    if (row < uniforms.dim_inner && col < uniforms.dim_a_outer) {
      ${c(a)}
    }
    return ${le(a, d)}(0.0);`, v = le(u, d), $ = e ? le(s, d) : le(a, d), T = e ? le(a, d) : le(s, d), I = Ce(i, v, d);
    return `
    fn mm_readA(batch: i32, row : i32, colIn : i32) -> ${$} {
      ${e ? b : w}
    }

    fn mm_readB(batch: i32, row : i32, colIn : i32) -> ${T} {
      ${e ? w : b}
    }

    fn mm_write(batch: i32, row : i32, colIn : i32, valueIn : ${v}) {
      let col = colIn * ${u};
      if (row < uniforms.dim_a_outer && col < uniforms.dim_b_outer)
      {
      var value = valueIn;
      let outWidth = ${e ? "i32(uniforms.result_shape[2])" : "i32(uniforms.result_shape[3])"};
      ${f}
      ${is(o)}
      ${I}
      setOutputAtCoords(coords[0], coords[1], coords[2], coords[3], value);
      }
    }`;
  }, ds = (e, t, n, r, o, i, s, a, u) => {
    let d = t.format === "NHWC", l = d ? e[0].dims[3] : e[0].dims[1], c = n[0], p = d ? n[2] : n[3], f = d ? n[1] : n[2], m = d ? n[3] : n[1], h = d && (l % 4 === 0 || l % 3 === 0) && m % 4 === 0, _ = d ? m : p * f, y = d ? p * f : m, g = [8, 8, 1], b = r <= 8 ? [4, 1, 1] : [4, 4, 1], w = [Math.ceil(_ / g[0] / b[0]), Math.ceil(y / g[1] / b[1]), Math.ceil(c / g[2] / b[2])];
    Z("verbose", () => `[conv2d_mm_webgpu] dispatch = ${w}`);
    let v = h ? d && l % 4 !== 0 ? 3 : 4 : 1, $ = g[1] * b[1], T = g[0] * b[0], I = Math.max(g[0] * v, g[1]), E = r % $ === 0, z = o % T === 0, M = i % I === 0, O = h ? [v, 4, 4] : [1, 1, 1], W = [{ type: 6, data: r }, { type: 6, data: o }, { type: 6, data: i }, { type: 6, data: [t.pads[0], t.pads[1]] }, { type: 6, data: t.strides }, { type: 6, data: t.dilations }];
    Ae(t, W), W.push(...P(e[0].dims, e[1].dims));
    let K = ["rank", "rank"];
    s && (W.push(...P(e[2].dims)), K.push("rank")), W.push(...P(n));
    let U = (R) => {
      let G = [{ name: "dim_a_outer", type: "i32" }, { name: "dim_b_outer", type: "i32" }, { name: "dim_inner", type: "i32" }, { name: "pad", type: "i32", length: 2 }, { name: "stride", type: "i32", length: 2 }, { name: "dilation", type: "i32", length: 2 }];
      Ee(t, G);
      let V = h ? 4 : 1, j = re(e[0].dataType), Q = `
      fn setOutputAtIndex(flatIndex : i32, value : ${h ? `vec4<${j}>` : j}) {
        result[flatIndex] = ${h ? `vec4<${j}>` : j}(value);
      }
      fn setOutputAtCoords(d0 : i32, d1 : i32, d2 : i32, d3 : i32, value : ${h ? `vec4<${j}>` : j}) {
        let flatIndex = getOutputIndexFromCoords(vec4<i32>(d0, d1, d2, d3));
        setOutputAtIndex(flatIndex ${h ? "/ 4" : ""}, value);
      }`, X = S("x", e[0].dataType, e[0].dims.length, v === 3 ? 1 : v), Se = S("w", e[1].dataType, e[1].dims.length, V), se = [X, Se], A = C("result", e[0].dataType, n.length, V);
      if (s) {
        let B = S("bias", e[2].dataType, e[2].dims.length, V);
        se.push(B), Q += `
        fn getBiasByOutputCoords(coords : vec4<i32>) -> ${h ? `vec4<${j}>` : j} {
          return bias[coords.${d ? "w" : "y"}${h ? "/ 4" : ""}];
        }`;
      }
      return `
        ${ss("uniforms.result_strides")}
        //struct Uniforms { xShape : vec4<i32>, wShape : vec4<i32>, outShape : vec4<i32>,
        //  outShapeStrides: vec3<i32>, filterDims : vec2<i32>, pad : vec2<i32>, stride : vec2<i32>,
        //  dilation : vec2<i32>, dimAOuter : i32, dimBOuter : i32, dimInner : i32 };
        ${R.registerUniforms(G).declareVariables(...se, A)}
        ${Q}
        ${pl(d, E, z, M, s, t, O[0], O[1], O[2], j)}
        ${h ? Yn(b, g, j, void 0, !d, I) : Jn(b, g, j, void 0, !d, I, false, void 0, a)}`;
    };
    return { name: "Conv2DMatMul", shaderCache: { hint: `${t.cacheKey};${v};${h};${E};${z};${M};${$};${T};${I}`, inputDependencies: K }, getRunData: () => ({ outputs: [{ dims: u ? u(n) : n, dataType: e[0].dataType }], dispatchGroup: { x: w[0], y: w[1], z: w[2] }, programUniforms: W }), getShaderSource: U };
  };
});
var ml, cs, ln, fl$1, ps, hl, ms, fs, hs = k(() => {
  N();
  Pe();
  H();
  F();
  Fe();
  sn();
  ml = (e) => {
    let t = 1;
    for (let n = 0; n < e.length; n++) t *= e[n];
    return t;
  }, cs = (e) => typeof e == "number" ? [e, e, e] : e, ln = (e, t) => t <= 1 ? e : e + (e - 1) * (t - 1), fl$1 = (e, t, n, r = 1) => {
    let o = ln(t, r);
    return Math.floor((e[0] * (n - 1) - n + o) / 2);
  }, ps = (e, t, n, r, o) => {
    o == null && (o = fl$1(e, t[0], r[0]));
    let i = [0, 0, 0, n];
    for (let s = 0; s < 3; s++) e[s] + 2 * o >= t[s] && (i[s] = Math.trunc((e[s] - t[s] + 2 * o) / r[s] + 1));
    return i;
  }, hl = (e, t, n, r, o, i, s, a, u, d) => {
    let l, c, p, f;
    if (e === "VALID" && (e = 0), typeof e == "number") {
      l = { top: e, bottom: e, left: e, right: e, front: e, back: e };
      let m = ps([t, n, r, 1], [a, u, d], 1, [o, i, s], e);
      c = m[0], p = m[1], f = m[2];
    } else if (Array.isArray(e)) {
      if (!e.every((h, _, y) => h === y[0])) throw Error(`Unsupported padding parameter: ${e}`);
      l = { top: e[0], bottom: e[1], left: e[2], right: e[3], front: e[4], back: e[5] };
      let m = ps([t, n, r, 1], [a, u, d], 1, [o, i, s], e[0]);
      c = m[0], p = m[1], f = m[2];
    } else if (e === "SAME_UPPER") {
      c = Math.ceil(t / o), p = Math.ceil(n / i), f = Math.ceil(r / s);
      let m = (c - 1) * o + a - t, h = (p - 1) * i + u - n, _ = (f - 1) * s + d - r, y = Math.floor(m / 2), g = m - y, b = Math.floor(h / 2), w = h - b, v = Math.floor(_ / 2), $ = _ - v;
      l = { top: b, bottom: w, left: v, right: $, front: y, back: g };
    } else throw Error(`Unknown padding parameter: ${e}`);
    return { padInfo: l, outDepth: c, outHeight: p, outWidth: f };
  }, ms = (e, t, n, r, o, i = false, s = "channelsLast") => {
    let a, u, d, l, c;
    if (s === "channelsLast") [a, u, d, l, c] = e;
    else if (s === "channelsFirst") [a, c, u, d, l] = e;
    else throw new Error(`Unknown dataFormat ${s}`);
    let [p, , f, m, h] = t, [_, y, g] = cs(n), [b, w, v] = cs(r), $ = ln(f, b), T = ln(m, w), I = ln(h, v), { padInfo: E, outDepth: z, outHeight: M, outWidth: O } = hl(o, u, d, l, _, y, g, $, T, I), W = i ? p * c : p, K = [0, 0, 0, 0, 0];
    return s === "channelsFirst" ? K = [a, W, z, M, O] : s === "channelsLast" && (K = [a, z, M, O, W]), { batchSize: a, dataFormat: s, inDepth: u, inHeight: d, inWidth: l, inChannels: c, outDepth: z, outHeight: M, outWidth: O, outChannels: W, padInfo: E, strideDepth: _, strideHeight: y, strideWidth: g, filterDepth: f, filterHeight: m, filterWidth: h, effectiveFilterDepth: $, effectiveFilterHeight: T, effectiveFilterWidth: I, dilationDepth: b, dilationHeight: w, dilationWidth: v, inShape: e, outShape: K, filterShape: t };
  }, fs = (e, t, n, r, o, i) => {
    let s = i === "channelsLast";
    s ? e[0].dims[3] : e[0].dims[1];
    let d = [64, 1, 1], l = { x: n.map((g, b) => b) }, c = [Math.ceil(ml(l.x.map((g) => n[g])) / d[0]), 1, 1];
    Z("verbose", () => `[conv3d_naive_webgpu] dispatch = ${c}`);
    let p = 1, f = x$1.size(n), m = [{ type: 12, data: f }, { type: 12, data: r }, { type: 12, data: o }, { type: 12, data: t.strides }, { type: 12, data: t.dilations }];
    Ae(t, m), m.push(...P(e[0].dims, e[1].dims));
    let h = ["rank", "rank"], _ = e.length === 3;
    _ && (m.push(...P(e[2].dims)), h.push("rank")), m.push(...P(n));
    let y = (g) => {
      let b = [{ name: "output_size", type: "u32" }, { name: "filter_dims", type: "u32", length: r.length }, { name: "pads", type: "u32", length: o.length }, { name: "strides", type: "u32", length: t.strides.length }, { name: "dilations", type: "u32", length: t.dilations.length }];
      Ee(t, b);
      let w = 1, v = re(e[0].dataType), $ = S("x", e[0].dataType, e[0].dims.length, p), T = S("W", e[1].dataType, e[1].dims.length, w), I = [$, T], E = C("result", e[0].dataType, n.length, w), z = "";
      if (_) {
        let W = S("bias", e[2].dataType, e[2].dims.length, w);
        I.push(W), z += `
        fn getBiasByOutputCoords(coords : array<u32, 5>) -> ${v} {
          return bias[${s ? D("coords", 4, 5) : D("coords", 1, 5)}${""}];
        }`;
      }
      let M = le(p, v), O = Ce(t, M, v);
      return `
            ${z}
            fn getX(d0 : u32, d1 : u32, d2 : u32, d3 : u32, d4 : u32) -> f32 {
              let aIndices = array<u32, 5>(d0, d1, d2, d3, d4);
              return ${$.getByIndices("aIndices")};
            }
            fn getW(d0 : u32, d1 : u32, d2 : u32, d3 : u32, d4 : u32) -> f32 {
              let aIndices = array<u32, 5>(d0, d1, d2, d3, d4);
              return ${T.getByIndices("aIndices")};
            }
          ${g.registerUniforms(b).declareVariables(...I, E)}
          ${g.mainStart()}
          ${g.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
              let coords = ${E.offsetToIndices("global_idx")};
              let batch = ${D("coords", 0, $.rank)};
              let d2 = ${s ? D("coords", $.rank - 1, $.rank) : D("coords", 1, $.rank)};
              let xFRCCorner = vec3<u32>(${s ? D("coords", 1, $.rank) : D("coords", 2, $.rank)},
              ${s ? D("coords", 2, $.rank) : D("coords", 3, $.rank)},
              ${s ? D("coords", 3, $.rank) : D("coords", 4, $.rank)}) * uniforms.strides - uniforms.pads;
              let xFCorner = xFRCCorner.x;
              let xRCorner = xFRCCorner.y;
              let xCCorner = xFRCCorner.z;
              let xShapeY = ${s ? D("uniforms.x_shape", 1, $.rank) : D("uniforms.x_shape", 2, $.rank)};
              let xShapeZ = ${s ? D("uniforms.x_shape", 2, $.rank) : D("uniforms.x_shape", 3, $.rank)};
              let xShapeW = ${s ? D("uniforms.x_shape", 3, $.rank) : D("uniforms.x_shape", 4, $.rank)};
              let xShapeU = ${s ? D("uniforms.x_shape", 4, $.rank) : D("uniforms.x_shape", 1, $.rank)};
              let inputDepthNearestVec4 = (xShapeU / 4) * 4;
              let inputDepthVec4Remainder = xShapeU % 4;

              var value = 0.0;
              for (var wF = 0u; wF < uniforms.filter_dims[0]; wF++) {
                let xF = xFCorner + wF * uniforms.dilations[0];
                if (xF < 0 || xF >= xShapeY) {
                  continue;
                }

                for (var wR = 0u; wR < uniforms.filter_dims[1]; wR++) {
                  let xR = xRCorner + wR * uniforms.dilations[1];
                  if (xR < 0 || xR >= xShapeZ) {
                    continue;
                  }

                  for (var wC = 0u; wC < uniforms.filter_dims[2]; wC++) {
                    let xC = xCCorner + wC * uniforms.dilations[2];
                    if (xC < 0 || xC >= xShapeW) {
                      continue;
                    }

                    for (var d1 = 0u; d1 < inputDepthNearestVec4; d1 += 4) {
                      ${s ? `let xValues = vec4<f32>(
                               getX(batch, xF, xR, xC, d1),
                               getX(batch, xF, xR, xC, d1 + 1),
                               getX(batch, xF, xR, xC, d1 + 2),
                               getX(batch, xF, xR, xC, d1 + 3));
                            ` : `let xValues = vec4<f32>(
                               getX(batch, d1, xF, xR, xC),
                               getX(batch, d1 + 1, xF, xR, xC),
                               getX(batch, d1 + 2, xF, xR, xC),
                               getX(batch, d1 + 3, xF, xR, xC));
                            `}
                            let wValues = vec4<f32>(
                              getW(d2, d1, wF, wR, wC),
                              getW(d2, d1 + 1, wF, wR, wC),
                              getW(d2, d1 + 2, wF, wR, wC),
                              getW(d2, d1 + 3, wF, wR, wC));
                      value += dot(xValues, wValues);
                    }
                    if (inputDepthVec4Remainder == 1) {
                        ${s ? `value += getX(batch, xF, xR, xC, inputDepthNearestVec4)
                          * getW(d2, inputDepthNearestVec4, wF, wR, wC);` : `value += getX(batch, inputDepthNearestVec4, xF, xR, xC)
                          * getW(d2, inputDepthNearestVec4, wF, wR, wC);`}
                    } else if (inputDepthVec4Remainder == 2) {
                      ${s ? `let xValues = vec2<f32>(
                        getX(batch, xF, xR, xC, inputDepthNearestVec4),
                        getX(batch, xF, xR, xC, inputDepthNearestVec4 + 1));
                      ` : `let xValues = vec2<f32>(
                        getX(batch, inputDepthNearestVec4, xF, xR, xC),
                        getX(batch, inputDepthNearestVec4 + 1, xF, xR, xC));
                    `}
                    let wValues = vec2<f32>(
                      getW(d2, inputDepthNearestVec4, wF, wR, wC),
                      getW(d2, inputDepthNearestVec4 + 1, wF, wR, wC));
                      value += dot(xValues, wValues);
                    } else if (inputDepthVec4Remainder == 3) {
                      ${s ? `let xValues = vec3<f32>(
                        getX(batch, xF, xR, xC, inputDepthNearestVec4),
                        getX(batch, xF, xR, xC, inputDepthNearestVec4 + 1),
                        getX(batch, xF, xR, xC, inputDepthNearestVec4 + 2));
                      ` : `let xValues = vec3<f32>(
                        getX(batch, inputDepthNearestVec4, xF, xR, xC),
                        getX(batch, inputDepthNearestVec4 + 1, xF, xR, xC),
                        getX(batch, inputDepthNearestVec4 + 2, xF, xR, xC));
                    `}
                    let wValues = vec3<f32>(
                      getW(d2, inputDepthNearestVec4, wF, wR, wC),
                      getW(d2, inputDepthNearestVec4 + 1, wF, wR, wC),
                      getW(d2, inputDepthNearestVec4 + 2, wF, wR, wC));
                      value += dot(xValues, wValues);
                    }
                  }
                }
              }
              ${_ ? "value = value + getBiasByOutputCoords(coords)" : ""};
              ${O}
              result[global_idx] = f32(value);
          }`;
    };
    return { name: "Conv3DNaive", shaderCache: { hint: `${t.cacheKey};${s};${p};${_}`, inputDependencies: h }, getRunData: () => ({ outputs: [{ dims: n, dataType: e[0].dataType }], dispatchGroup: { x: c[0], y: c[1], z: c[2] }, programUniforms: m }), getShaderSource: y };
  };
});
var gs, ys, bs = k(() => {
  N();
  H();
  F();
  Fe();
  gs = (e, t, n, r) => {
    let o = e.length > 2, i = o ? "value += b[output_channel];" : "", s = e[0].dims, a = e[1].dims, u = t.format === "NHWC", d = u ? n[3] : n[1], l = d / t.group, c = u && l >= 4 ? J(d) : 1, p = x$1.size(n) / c, f = [{ type: 12, data: p }, { type: 12, data: t.dilations }, { type: 12, data: [t.strides[0], t.strides[1]] }, { type: 12, data: [t.pads[0], t.pads[1]] }, { type: 12, data: l }];
    Ae(t, f), f.push(...P(s, [a[0], a[1], a[2], a[3] / c]));
    let m = o ? ["rank", "rank", "rank"] : ["rank", "rank"];
    f.push(...P([n[0], n[1], n[2], n[3] / c]));
    let h = (_) => {
      let y = C("output", e[0].dataType, n.length, c), g = re(y.type.tensor), b = Ce(t, y.type.value, g), w = S("x", e[0].dataType, s.length), v = S("w", e[1].dataType, a.length, c), $ = [w, v];
      o && $.push(S("b", e[2].dataType, e[2].dims, c));
      let T = [{ name: "output_size", type: "u32" }, { name: "dilations", type: "u32", length: t.dilations.length }, { name: "strides", type: "u32", length: 2 }, { name: "pads", type: "u32", length: 2 }, { name: "output_channels_per_group", type: "u32" }];
      Ee(t, T);
      let I = u ? `
      for (var wHeight: u32 = 0u; wHeight < uniforms.w_shape[0]; wHeight++) {
        let xHeight = xRCCorner.x + wHeight * uniforms.dilations[0];

        if (xHeight < 0u || xHeight >= uniforms.x_shape[1]) {
          continue;
        }

        for (var wWidth: u32 = 0u; wWidth < uniforms.w_shape[1]; wWidth++) {
          let xWidth = xRCCorner.y + wWidth * uniforms.dilations[1];
          if (xWidth < 0u || xWidth >= uniforms.x_shape[2]) {
            continue;
          }

          for (var wInChannel: u32 = 0u; wInChannel < uniforms.w_shape[2]; wInChannel++) {
            let input_channel = in_channel_offset + wInChannel;
            let xVal = ${w.get("batch", "xHeight", "xWidth", "input_channel")};
            let wVal = ${v.get("wHeight", "wWidth", "wInChannel", "output_channel")};
            value += xVal * wVal;
          }
        }
      }
      ` : `
      for (var wInChannel: u32 = 0u; wInChannel < uniforms.w_shape[1]; wInChannel++) {
        let input_channel = in_channel_offset + wInChannel;
        for (var wHeight: u32 = 0u; wHeight < uniforms.w_shape[2]; wHeight++) {
          let xHeight = xRCCorner.x + wHeight * uniforms.dilations[0];

          if (xHeight < 0u || xHeight >= uniforms.x_shape[2]) {
            continue;
          }

          for (var wWidth: u32 = 0u; wWidth < uniforms.w_shape[3]; wWidth++) {
            let xWidth = xRCCorner.y + wWidth * uniforms.dilations[1];
            if (xWidth < 0u || xWidth >= uniforms.x_shape[3]) {
              continue;
            }

            let xVal = ${w.get("batch", "input_channel", "xHeight", "xWidth")};
            let wVal = ${v.get("output_channel", "wInChannel", "wHeight", "wWidth")};
            value += xVal * wVal;
          }
        }
      }
      `;
      return `
  ${_.registerUniforms(T).declareVariables(...$, y)}

  ${_.mainStart()}
    ${_.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}

    let outputIndices = ${y.offsetToIndices("global_idx")};
    let batch: u32 = outputIndices[0];
    let output_channel: u32 = outputIndices[${u ? 3 : 1}];
    let xRCCorner: vec2<u32> = vec2<u32>(outputIndices[${u ? 1 : 2}], outputIndices[${u ? 2 : 3}]) * uniforms.strides - uniforms.pads;
    let group_id: u32 = output_channel * ${c} / uniforms.output_channels_per_group;
    var in_channel_offset = group_id * uniforms.w_shape[${u ? 2 : 1}];

    var value: ${y.type.value} = ${y.type.value}(0);
    ${I}
    ${i}
    ${b}
    ${y.setByOffset("global_idx", "value")}
  }`;
    };
    return { name: "GroupedConv", shaderCache: { hint: `${t.cacheKey}_${c}`, inputDependencies: m }, getRunData: () => ({ outputs: [{ dims: r ? r(n) : n, dataType: e[0].dataType }], dispatchGroup: { x: Math.ceil(p / 64) }, programUniforms: f }), getShaderSource: h };
  }, ys = (e, t, n, r) => {
    let o = e.length > 2, i = J(n[3]), s = J(n[2]), a = x$1.size(n) / i / s, u = [e[0].dims[0], e[0].dims[1], e[0].dims[2], e[0].dims[3] / i], d = [e[1].dims[0], e[1].dims[1], e[1].dims[2], e[1].dims[3] / i], l = [n[0], n[1], n[2], n[3] / i], c = [{ type: 12, data: a }, { type: 6, data: [t.strides[0], t.strides[1]] }, { type: 6, data: [t.pads[0], t.pads[1]] }];
    Ae(t, c), c.push(...P(u, d, l));
    let p = (s - 1) * t.strides[1] + d[1], f = (m) => {
      let h = C("output", e[0].dataType, l.length, i), _ = re(h.type.tensor), y = Ce(t, h.type.value, _), g = S("x", e[0].dataType, u.length, i), b = S("w", e[1].dataType, d.length, i), w = [g, b];
      o && w.push(S("b", e[2].dataType, e[2].dims, i));
      let v = o ? "value += b[output_channel];" : "", $ = [{ name: "output_size", type: "u32" }, { name: "strides", type: "i32", length: 2 }, { name: "pads", type: "i32", length: 2 }];
      return Ee(t, $), `
  ${m.registerUniforms($).declareVariables(...w, h)}
  ${m.mainStart()}
    ${m.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    let width0 = uniforms.output_shape[3];
    let output_channel = global_idx % width0;
    var index1 = global_idx / width0;
    let width1 = uniforms.output_shape[2] / ${s}u;
    let col = (index1 % width1) * ${s}u;
    index1 = index1 / width1;
    let row = index1 % uniforms.output_shape[1];
    let batch = index1 / uniforms.output_shape[1];

    let x_corner = vec2<i32>(i32(row), i32(col)) * uniforms.strides - uniforms.pads;

    var x_vals: array<${g.type.value}, ${p}>;
    var values: array<${h.type.value}, ${s}>;
    let input_channel = output_channel;
    // Use constant instead of uniform can give better performance for w's height/width.
    for (var w_height: u32 = 0u; w_height < ${d[0]}; w_height++) {
      let x_height = x_corner.x + i32(w_height);
      if (x_height >= 0 && u32(x_height) < uniforms.x_shape[1]) {
        for (var i = 0; i < ${p}; i++) {
          let x_width = x_corner.y + i;
          if (x_width >= 0 && u32(x_width) < uniforms.x_shape[2]) {
            x_vals[i] = ${g.get("batch", "u32(x_height)", "u32(x_width)", "input_channel")};
          } else {
            x_vals[i] = ${g.type.value}(0);
          }
        }
        for (var w_width: u32 = 0u; w_width < ${d[1]}; w_width++) {
          let w_val = ${b.get("w_height", "w_width", "0", "output_channel")};
          for (var i = 0u; i < ${s}u; i++) {
            values[i] = fma(x_vals[i * u32(uniforms.strides[1]) + w_width], w_val, values[i]);
          }
        }
      }
    }

    for (var i = 0u; i < ${s}u; i++) {
      var value = values[i];
      ${v}
      ${y}
      ${h.set("batch", "row", "col + i", "output_channel", "value")};
    }
  }`;
    };
    return { name: "GroupedConv-Vectorize", shaderCache: { hint: `${t.cacheKey};${i};${s};${p};${d[0]};${d[1]}`, inputDependencies: o ? ["rank", "rank", "type"] : ["rank", "rank"] }, getRunData: () => ({ outputs: [{ dims: r ? r(n) : n, dataType: e[0].dataType }], dispatchGroup: { x: Math.ceil(a / 64) }, programUniforms: c }), getShaderSource: f };
  };
});
var gl, er, yl, tr, nr, _s, bl, _l, rr, ws = k(() => {
  H();
  ls();
  hs();
  dn();
  bs();
  Fe();
  un();
  Re();
  gl = (e, t, n, r, o, i) => {
    let s = e[0], a = e.slice(i ? 1 : 2, i ? 3 : 4), u = a.length, d = t[0], c = t.slice(2).map((m, h) => m + (m - 1) * (n[h] - 1)), f = a.map((m, h) => m + r[h] + r[h + u]).map((m, h) => Math.floor((m - c[h] + o[h]) / o[h]));
    return f.splice(0, 0, s), f.splice(i ? 3 : 1, 0, d), f;
  }, er = [2, 3, 1, 0], yl = (e, t) => {
    if (!e || e.length !== 2 && e.length !== 3) throw new Error("Conv requires 2 or 3 inputs");
    if (e[0].dims.length > 5) throw new Error("greater than 5D is not supported");
    if (e[0].dims.length !== e[1].dims.length) throw new Error("filter does not have same dimension as input");
    let n = e[0].dims[t.format === "NHWC" ? e[0].dims.length - 1 : 1], r = e[1].dims[1] * t.group;
    if (n !== r) throw new Error("FILTER_IN_CHANNEL should be equal to DATA_CHANNEL");
    if (e.length === 3 && (e[2].dims.length !== 1 || e[1].dims[0] !== e[2].dims[0])) throw new Error("invalid bias");
    let o = e[0].dims.length - 2;
    if (t.dilations.length !== o) throw new Error(`dilations should be ${o}D`);
    if (t.strides.length !== o) throw new Error(`strides should be ${o}D`);
    if (t.pads.length !== o * 2) throw new Error(`pads should be ${o * 2}D`);
    if (t.kernelShape.length !== 0 && t.kernelShape.length !== e[1].dims.length - 2) throw new Error("invalid kernel shape");
  }, tr = (e, t) => {
    let n = e.kernelShape.slice();
    n.length < t[1].dims.length - 2 && n.push(...Array(t[1].dims.length - 2 - n.length).fill(0));
    for (let i = 2; i < t[1].dims.length; ++i) n[i - 2] === 0 && (n[i - 2] = t[1].dims[i]);
    let r = e.pads.slice();
    Ye.adjustPadsBasedOnAutoPad(t[0].dims, e.strides, e.dilations, n, r, e.format === "NHWC", e.autoPad);
    let o = Object.assign({}, e);
    return Object.assign(o, { kernelShape: n, pads: r }), o;
  }, nr = (e) => {
    let t = on(e), n = e.format, r = ["NOTSET", "VALID", "SAME_UPPER", "SAME_LOWER"][e.auto_pad], o = e.dilations, i = e.group, s = e.kernel_shape, a = e.pads, u = e.strides, d = e.w_is_const();
    return { autoPad: r, format: n, dilations: o, group: i, kernelShape: s, pads: a, strides: u, wIsConst: d, ...t, cacheKey: `${e.format};${t.activation};` };
  }, _s = (e, t, n, r) => {
    let o = n.format === "NHWC", i = gl(t[0].dims, t[1].dims, n.dilations, n.pads, n.strides, o);
    if (n.group !== 1) {
      let $ = [t[0]];
      if (o) {
        let I = e.kernelCustomData.wT ?? e.compute(me(t[1], er), { inputs: [1], outputs: [n.wIsConst ? -2 : -1] })[0];
        n.wIsConst && !e.kernelCustomData.wT && (e.kernelCustomData.wT = I), $.push(I);
      } else $.push(t[1]);
      t.length === 3 && $.push(t[2]), !e.adapterInfo.isArchitecture("ampere") && o && t[1].dims[0] === n.group && t[1].dims[1] === 1 && n.dilations[0] === 1 && n.dilations[1] === 1 ? e.compute(ys($, n, i, r), { inputs: $ }) : e.compute(gs($, n, i, r), { inputs: $ });
      return;
    }
    let s = t.length === 3, a = t[0].dims[o ? 1 : 2], u = t[0].dims[o ? 2 : 3], d = t[0].dims[o ? 3 : 1], l = t[1].dims[2], c = t[1].dims[3], p = i[o ? 1 : 2], f = i[o ? 2 : 3], m = i[o ? 3 : 1], h = o && l === a && c === u && n.pads[0] === 0 && n.pads[1] === 0;
    if (h || l === 1 && c === 1 && n.dilations[0] === 1 && n.dilations[1] === 1 && n.strides[0] === 1 && n.strides[1] === 1 && n.pads[0] === 0 && n.pads[1] === 0) {
      let $ = i[0], T, I, E, z = [];
      if (o) {
        let W = e.kernelCustomData.wT ?? e.compute(me(t[1], er), { inputs: [1], outputs: [n.wIsConst ? -2 : -1] })[0];
        if (n.wIsConst && !e.kernelCustomData.wT && (e.kernelCustomData.wT = W), h) {
          let K = a * u * d;
          T = t[0].reshape([1, $, K]), I = W.reshape([1, K, m]), E = [1, $, m];
        } else T = t[0].reshape([$, a * u, d]), I = W.reshape([1, d, m]), E = [$, p * f, m];
        z.push(T), z.push(I);
      } else T = t[0].reshape([$, d, a * u]), I = t[1].reshape([1, m, d]), E = [$, m, p * f], z.push(I), z.push(T);
      s && z.push(t[2]);
      let M = E[2], O = z[0].dims[z[0].dims.length - 1];
      M < 8 && O < 8 ? e.compute(an(z, n, i, E, o, r), { inputs: z }) : e.compute(bt(z, n, i, E, o, r), { inputs: z });
      return;
    }
    let _ = true, y = e.kernelCustomData.wT ?? e.compute(me(t[1], er), { inputs: [1], outputs: [n.wIsConst ? -2 : -1] })[0];
    n.wIsConst && !e.kernelCustomData.wT && (e.kernelCustomData.wT = y);
    let g = [t[0], y];
    s && g.push(t[2]);
    let b = o ? p * f : m, w = o ? m : p * f, v = l * c * d;
    e.compute(ds(g, n, i, b, w, v, s, _, r), { inputs: g });
  }, bl = (e, t) => {
    let n = t.format === "NHWC", r = [e.inputs[0].reshape(n ? [e.inputs[0].dims[0], 1, e.inputs[0].dims[1], e.inputs[0].dims[2]] : [e.inputs[0].dims[0], e.inputs[0].dims[1], 1, e.inputs[0].dims[2]]), e.inputs[1].reshape([e.inputs[1].dims[0], e.inputs[1].dims[1], 1, e.inputs[1].dims[2]])];
    e.inputs.length === 3 && r.push(e.inputs[2]);
    let o = [0, t.pads[0], 0, t.pads[1]], i = [1].concat(t.strides), s = [1].concat(t.dilations), a = [1].concat(t.kernelShape), u = tr({ ...t, pads: o, strides: i, dilations: s, kernelShape: a }, r);
    _s(e, r, u, (d) => n ? [d[0], d[2], d[3]] : [d[0], d[1], d[3]]);
  }, _l = (e, t, n) => {
    let r = n.format === "NHWC" ? "channelsLast" : "channelsFirst", o = tr(n, t), i = n.autoPad === "NOTSET" ? n.pads : n.autoPad, s = ms(t[0].dims, t[1].dims, n.strides, n.dilations, i, false, r);
    e.compute(fs(t, o, s.outShape, [s.filterDepth, s.filterHeight, s.filterWidth], [s.padInfo.front, s.padInfo.top, s.padInfo.left], r));
  }, rr = (e, t) => {
    if (yl(e.inputs, t), e.inputs[0].dims.length === 3) bl(e, t);
    else if (e.inputs[0].dims.length === 5) _l(e, e.inputs, t);
    else {
      let n = tr(t, e.inputs);
      _s(e, e.inputs, n);
    }
  };
});
var $s, vs = k(() => {
  N();
  Pe();
  H();
  F();
  $s = (e, t, n) => {
    let r = e.length > 2, o = t.outputShape, i = t.format === "NHWC", s = t.group, a = e[1].dims, u = a[2] / s, d = a[3], l = i ? J(u) : 1, c = i && d === 1 && u >= 4, p = c ? Math.floor(u / 4) * 4 : Math.floor(u / l) * l, f = u - p, m = i ? J(d) : 1, h = i ? d === 1 ? l : m : 1, _ = x$1.size(o) / m, y = [Math.ceil(_ / 64), 1, 1];
    Z("verbose", () => `[conv2d_backprop_webgpu] dispatch = ${y}`);
    let g = ["rank", "rank"], b = [t.strides[0], t.strides[1]], w = [t.kernelShape[i ? 1 : 2], t.kernelShape[i ? 2 : 3]], v = [t.dilations[0], t.dilations[1]], $ = [w[0] + (t.dilations[0] <= 1 ? 0 : (t.kernelShape[i ? 1 : 2] - 1) * (t.dilations[0] - 1)), w[1] + (t.dilations[1] <= 1 ? 0 : (t.kernelShape[i ? 2 : 3] - 1) * (t.dilations[1] - 1))], T = [$[0] - 1 - Math.floor((t.pads[0] + t.pads[2]) / 2), $[1] - 1 - Math.floor((t.pads[1] + t.pads[3]) / 2)], I = [{ type: 12, data: _ }, { type: 12, data: b }, { type: 12, data: w }, { type: 12, data: v }, { type: 12, data: $ }, { type: 6, data: T }, { type: 12, data: p }, { type: 12, data: u }, { type: 12, data: d }, ...P(e[0].dims, e[1].dims)];
    r && (I.push(...P(e[2].dims)), g.push("rank")), I.push(...P(o));
    let E = (z) => {
      let M = [{ name: "output_size", type: "u32" }, { name: "strides", type: "u32", length: b.length }, { name: "filter_dims", type: "u32", length: w.length }, { name: "dilations", type: "u32", length: w.length }, { name: "effective_filter_dims", type: "u32", length: $.length }, { name: "pads", type: "i32", length: T.length }, { name: "input_channels_per_group_int", type: "u32" }, { name: "input_channels_per_group", type: "u32" }, { name: "output_channels_per_group", type: "u32" }], O = re(e[0].dataType), W = i ? 1 : 2, K = i ? 2 : 3, U = i ? 3 : 1, R = S("W", e[1].dataType, e[1].dims.length, h), G = S("Dy", e[0].dataType, e[0].dims.length, l), V = [G, R];
      r && V.push(S("bias", e[2].dataType, [o[U]].length, m));
      let j = C("result", e[0].dataType, o.length, m), Q = () => {
        let se = "";
        if (c) l === 4 ? se += `
        let xValue = ${G.getByOffset("x_offset")};
        let wValue = ${R.getByOffset("w_offset")};
        dotProd = dotProd + dot(xValue, wValue);
        x_offset += 1u;
        w_offset += 1u;` : l === 2 ? se += `
          dotProd = dotProd + dot(vec4<${O}>(${G.getByOffset("x_offset")}, ${G.getByOffset("x_offset + 1u")}), vec4<${O}>(${R.getByOffset("w_offset")}, ${R.getByOffset("w_offset + 1u")}));
          x_offset += 2u;
          w_offset += 2u;` : l === 1 && (se += `
          dotProd = dotProd + dot(vec4<${O}>(${G.getByOffset("x_offset")}, ${G.getByOffset("x_offset + 1u")}, ${G.getByOffset("x_offset + 2u")}, ${G.getByOffset("x_offset + 3u")}), vec4<${O}>(${R.getByOffset("w_offset")}, ${R.getByOffset("w_offset + 1u")}, ${R.getByOffset("w_offset + 2u")}, ${R.getByOffset("w_offset + 3u")}));
          x_offset += 4u;
          w_offset += 4u;`);
        else if (se += `
                  let xValue = ${i ? G.getByOffset(`${G.indicesToOffset(`${G.type.indices}(batch, idyR, idyC, inputChannel)`)} / ${l}`) : G.get("batch", "inputChannel", "idyR", "idyC")};
        `, l === 1) se += `
          let w_offset = ${R.indicesToOffset(`${R.type.indices}(u32(wRPerm), u32(wCPerm), inputChannel, wOutChannel)`)};
          let wValue = ${R.getByOffset(`w_offset / ${h}`)};
          dotProd = dotProd + xValue * wValue;`;
        else for (let A = 0; A < l; A++) se += `
            let wValue${A} = ${R.getByOffset(`${R.indicesToOffset(`${R.type.indices}(u32(wRPerm), u32(wCPerm), inputChannel + ${A}, wOutChannel)`)} / ${h}`)};
            dotProd = dotProd + xValue[${A}] * wValue${A};`;
        return se;
      }, X = () => {
        if (f === 0) return "";
        if (!c) throw new Error(`packInputAs4 ${c} is not true.`);
        let se = "";
        if (l === 1) {
          se += "dotProd = dotProd";
          for (let A = 0; A < f; A++) se += `
            + ${G.getByOffset(`x_offset + ${A}`)} * ${R.getByOffset(`w_offset + ${A}`)}`;
          se += ";";
        } else if (l === 2) {
          if (f !== 2) throw new Error(`Invalid inputChannelsRemainder ${f}.`);
          se += `
          let xValue = ${G.getByOffset("x_offset")};
          let wValue = ${R.getByOffset("w_offset")};
          dotProd = dotProd + dot(xValue, wValue);`;
        }
        return se;
      }, Se = `
            let outputIndices = ${j.offsetToIndices(`global_idx * ${m}`)};
            let batch = ${j.indicesGet("outputIndices", 0)};
            let d1 = ${j.indicesGet("outputIndices", U)};
            let r = ${j.indicesGet("outputIndices", W)};
            let c = ${j.indicesGet("outputIndices", K)};
            let dyCorner = vec2<i32>(i32(r), i32(c)) - uniforms.pads;
            let dyRCorner = dyCorner.x;
            let dyCCorner = dyCorner.y;
            let groupId = d1 / uniforms.output_channels_per_group;
            let wOutChannel = d1 - groupId * uniforms.output_channels_per_group;
            // Convolve dy(?, ?, d2) with w(:, :, d1, d2) to compute dx(xR, xC, d1).
            // ? = to be determined. : = across all values in that axis.
            var dotProd = ${j.type.value}(0.0);
            var wR: u32 = 0;
            if (uniforms.dilations.x == 1) {
              // Minimum wR >= 0 that satisfies (dyRCorner + wR) % (uniforms.strides.x) == 0
              wR = u32(((dyRCorner + i32(uniforms.strides.x) - 1) / i32(uniforms.strides.x)) * i32(uniforms.strides.x) - dyRCorner);
            }
            for (; wR < uniforms.effective_filter_dims.x; wR = wR + 1) {
              if (wR % uniforms.dilations.x != 0) {
                continue;
              }
              let dyR = (${O}(dyRCorner) + ${O}(wR)) / ${O}(uniforms.strides[0]);
              let wRPerm = uniforms.filter_dims.x - 1 - wR / uniforms.dilations.x;
              if (dyR < 0.0 || dyR >= ${O}(uniforms.Dy_shape[${W}]) || fract(dyR) > 0.0 ||
                  wRPerm < 0) {
                continue;
              }
              let idyR: u32 = u32(dyR);
              var wC: u32 = 0;
              if (uniforms.dilations.y == 1) {
                // Minimum wC >= 0 that satisfies (dyCCorner + wC) % (uniforms.strides.y) == 0
                wC = u32(((dyCCorner + i32(uniforms.strides.y) - 1) / i32(uniforms.strides.y)) * i32(uniforms.strides.y) - dyCCorner);
              }
              for (; wC < uniforms.effective_filter_dims.y; wC = wC + 1) {
                if (wC % uniforms.dilations.y != 0) {
                  continue;
                }
                let dyC = (${O}(dyCCorner) + ${O}(wC)) / ${O}(uniforms.strides.y);
                let wCPerm = uniforms.filter_dims.y - 1 - wC / uniforms.dilations.y;
                if (dyC < 0.0 || dyC >= ${O}(uniforms.Dy_shape[${K}]) ||
                    fract(dyC) > 0.0 || wCPerm < 0) {
                  continue;
                }
                let idyC: u32 = u32(dyC);
                var inputChannel = groupId * uniforms.input_channels_per_group;
                ${c ? `
                var x_offset = ${G.indicesToOffset(`${G.type.indices}(batch, idyR, idyC, inputChannel)`)} / ${l};
                var w_offset = ${R.indicesToOffset(`${R.type.indices}(wRPerm, wCPerm, inputChannel, wOutChannel)`)} / ${h};
                  ` : ""}
                for (var d2: u32 = 0; d2 < uniforms.input_channels_per_group_int; d2 = d2 + ${c ? 4 : l}) {
                  ${Q()}
                  inputChannel = inputChannel + ${c ? 4 : l};
                }
                ${X()}
                wC = wC + uniforms.strides.y - 1;
              }
              wR = wR + uniforms.strides[0] - 1;
            }
            let value = dotProd${r ? ` + bias[d1 / ${m}]` : ""};
            ${j.setByOffset("global_idx", "value")};
          `;
      return `
    ${z.registerUniforms(M).declareVariables(...V, j)}
      ${z.mainStart()}
      ${z.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")};
    ${Se}}`;
    };
    return { name: "ConvTranspose2D", shaderCache: { hint: `${t.cacheKey};${l}${h}${m}${c}${f}`, inputDependencies: g }, getRunData: () => ({ dispatchGroup: { x: y[0], y: y[1], z: y[2] }, outputs: [{ dims: n ? n(o) : o, dataType: e[0].dataType }], programUniforms: I }), getShaderSource: E };
  };
});
var wl, $l, vl, xs, Ss, xl, Ts, Sl, Is, Cs = k(() => {
  vs();
  Fe();
  Re();
  wl = (e, t, n, r, o, i) => (e - 1) * t + n + (r - 1) * o + 1 - i, $l = (e, t, n, r, o) => {
    let i = Math.floor(e / 2);
    t === "SAME_UPPER" ? (n[r] = i, n[o] = e - i) : t === "SAME_LOWER" && (n[r] = e - i, n[o] = i);
  }, vl = (e, t, n, r, o, i, s, a, u, d) => {
    let l = e.length - 2, c = d.length === 0;
    u.length < l && u.push(...Array(l - u.length).fill(0));
    let p = e[0], f = t[a ? 3 : 1] * o;
    for (let m = 0, h = e.length - l - (a ? 1 : 0); m < l; ++m, ++h) {
      let _ = e[h], y = c ? _ * s[m] : d[m], g = wl(_, s[m], i[m], t[h], n[m], y);
      $l(g, r, i, m, m + l), c && d.push(s[m] * (_ - 1) + u[m] + (t[h] - 1) * n[m] + 1 - i[m] - i[m + l]);
    }
    d.splice(0, 0, p), d.splice(a ? 3 : 1, 0, f);
  }, xs = (e, t) => {
    let n = e.kernelShape.slice();
    if (e.kernelShape.length === 0 || e.kernelShape.reduce((c, p) => c * p, 1) === 0) {
      n.length = 0;
      for (let c = 2; c < t[1].dims.length; ++c) n.push(t[1].dims[c]);
    }
    let r = e.format === "NHWC";
    n.splice(0, 0, t[1].dims[0]), n.splice(r ? 3 : 1, 0, t[1].dims[1]);
    let o = e.pads.slice(), i = e.outputShape.slice(), s = e.outputPadding.slice(), a = t[0].dims, u = e.dilations.slice();
    if (u.reduce((c, p) => c + p, 0) === 0) {
      let c = t[0].dims.length - 2;
      u = new Array(c).fill(1);
    }
    let d = e.strides.slice();
    if (d.reduce((c, p) => c + p, 0) === 0) {
      let c = t[0].dims.length - 2;
      d = new Array(c).fill(1);
    }
    vl(a, n, u, e.autoPad, e.group, o, d, r, s, i);
    let l = Object.assign({}, e);
    return Object.assign(l, { kernelShape: n, pads: o, outputPadding: s, outputShape: i, dilations: u, strides: d }), l;
  }, Ss = (e) => {
    let t = on(e), n = e.format, r = ["NOTSET", "VALID", "SAME_UPPER", "SAME_LOWER"][typeof e.autoPad > "u" ? 0 : e.autoPad], o = e.dilations, i = e.group ?? 1, s = e.kernelShape, a = e.pads, u = e.strides, d = e.wIsConst(), l = e.outputPadding, c = e.outputShape;
    return { autoPad: r, format: n, dilations: o, group: i, kernelShape: s, outputPadding: l, outputShape: c, pads: a, strides: u, wIsConst: d, ...t, cacheKey: `${e.format};${t.activation};` };
  }, xl = (e, t) => {
    if (!e || e.length !== 2 && e.length !== 3) throw new Error("Conv requires 2 or 3 inputs");
    if (e[0].dims.length !== 4 && e[0].dims.length !== 3) throw new Error("currently only support 2-dimensional conv");
    if (e[0].dims.length !== e[1].dims.length) throw new Error("filter does not have same dimension as input");
    let n = e[0].dims[t.format === "NHWC" ? e[0].dims.length - 1 : 1], r = e[1].dims[0];
    if (n !== r) throw new Error("FILTER_IN_CHANNEL should be equal to DATA_CHANNEL");
    let o = e[1].dims[1] * t.group;
    if (e.length === 3 && (e[2].dims.length !== 1 || e[2].dims[0] !== o)) throw new Error("invalid bias");
    let i = e[0].dims.length - 2;
    if (t.dilations.reduce((l, c) => l + c, 0) > 0 && t.dilations.length !== i) throw new Error(`dilations should be ${i}D`);
    if (t.strides.reduce((l, c) => l + c, 0) > 0 && t.strides.length !== i) throw new Error(`strides should be ${i}D`);
    if (t.pads.reduce((l, c) => l + c, 0) > 0 && t.pads.length !== i * 2) throw new Error(`pads should be ${i * 2}D`);
    if (t.outputPadding.length !== i && t.outputPadding.length !== 0) throw new Error(`output_padding should be ${i}D`);
    if (t.kernelShape.reduce((l, c) => l + c, 0) > 0 && t.kernelShape.length !== 0 && t.kernelShape.length !== e[1].dims.length - 2) throw new Error("invalid kernel shape");
    if (t.outputShape.length !== 0 && t.outputShape.length !== e[0].dims.length - 2) throw new Error("invalid output shape");
  }, Ts = (e, t, n, r) => {
    let o = e.kernelCustomData.wT ?? e.compute(me(t[1], [2, 3, 0, 1]), { inputs: [1], outputs: [n.wIsConst ? -2 : -1] })[0];
    n.wIsConst && !e.kernelCustomData.wT && (e.kernelCustomData.wT = o);
    let i = [t[0], o];
    t.length === 3 && i.push(t[2]), e.compute($s(i, n, r), { inputs: i });
  }, Sl = (e, t) => {
    let n = t.format === "NHWC", r = [e.inputs[0].reshape(n ? [e.inputs[0].dims[0], 1, e.inputs[0].dims[1], e.inputs[0].dims[2]] : [e.inputs[0].dims[0], e.inputs[0].dims[1], 1, e.inputs[0].dims[2]]), e.inputs[1].reshape([e.inputs[1].dims[0], e.inputs[1].dims[1], 1, e.inputs[1].dims[2]])];
    e.inputs.length === 3 && r.push(e.inputs[2]);
    let o = t.kernelShape;
    (o.length === 0 || o[0] === 0) && (o = [e.inputs[1].dims[2]]);
    let i = t.dilations;
    (i.length === 0 || i[0] === 0) && (i = [1]);
    let s = t.strides;
    (s.length === 0 || s[0] === 0) && (s = [1]);
    let a = t.pads;
    a.length === 0 && (a = [0, 0]), a = [0, a[0], 0, a[1]], s = [1].concat(s), i = [1].concat(i), o = [1].concat(o);
    let u = t.outputPadding;
    u = [0].concat(u);
    let d = xs({ ...t, pads: a, strides: s, dilations: i, kernelShape: o, outputPadding: u }, r);
    Ts(e, r, d, (l) => n ? [l[0], l[2], l[3]] : [l[0], l[1], l[3]]);
  }, Is = (e, t) => {
    if (xl(e.inputs, t), e.inputs[0].dims.length === 3) Sl(e, t);
    else {
      let n = xs(t, e.inputs);
      Ts(e, e.inputs, n);
    }
  };
});
var Tl, As, Es, ks = k(() => {
  N();
  H();
  ue();
  F();
  Tl = (e, t, n, r) => {
    let o = x$1.size(t), i = t.length, s = S("input", e, i), a = C("output", e, i), u = n.dataType === 6 ? n.getInt32Array()[0] : Number(n.getBigInt64Array()[0]), d = x$1.normalizeAxis(u, i), l = (c) => {
      let p = ` i32(${s.indicesGet("inputIndices", "uniforms.axis")}) `, f = D("uniforms.input_shape", "uniforms.axis", i), m = r.reverse ? p + (r.exclusive ? " + 1" : "") : "0", h = r.reverse ? f : p + (r.exclusive ? "" : " + 1");
      return `
                ${c.registerUniform("outputSize", "u32").registerUniform("axis", "u32").declareVariables(s, a)}
                ${c.mainStart()}
                  ${c.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
                  var inputIndices = ${a.offsetToIndices("global_idx")};
                  var sum = ${a.type.value}(0);
                  let first : i32 = ${m};
                  let last : i32 = ${h};
                  for (var i : i32 = first; i < last; i++) {
                    ${s.indicesSet("inputIndices", "uniforms.axis", "u32(i)")};
                    sum = sum + ${s.getByIndices("inputIndices")};
                  }
                  ${a.setByOffset("global_idx", "sum")};
                }`;
    };
    return { name: "CumSum", shaderCache: { hint: r.cacheKey, inputDependencies: ["rank"] }, getRunData: () => ({ outputs: [{ dims: t, dataType: e }], dispatchGroup: { x: Math.ceil(o / 64) }, programUniforms: [{ type: 12, data: o }, { type: 12, data: d }, ...P(t, t)] }), getShaderSource: l };
  }, As = (e, t) => {
    let n = e.inputs[0].dims, r = e.inputs[0].dataType, o = e.inputs[1];
    e.compute(Tl(r, n, o, t), { inputs: [0] });
  }, Es = (e) => {
    let t = e.exclusive === 1, n = e.reverse === 1;
    return L({ exclusive: t, reverse: n });
  };
});
var Il, Cl, Al, Ps, zs, Bs = k(() => {
  N();
  H();
  ue();
  F();
  Il = (e) => {
    if (!e || e.length !== 1) throw new Error("DepthToSpace requires 1 input.");
    if (e[0].dims.length !== 4) throw new Error("DepthToSpace requires 4D input.");
  }, Cl = (e, t, n, r) => {
    let o = [];
    o.push(`fn perm(i: ${r.type.indices}) -> ${n.type.indices} {
    var a: ${n.type.indices};`);
    for (let i = 0; i < t; ++i) o.push(n.indicesSet("a", e[i], `i[${i}]`));
    return o.push("return a;}"), o.join(`
`);
  }, Al = (e, t) => {
    let n, r, o, i, s, a, u = t.format === "NHWC", d = t.blocksize, l = t.mode === "DCR";
    u ? ([n, r, o, i] = e.dims, s = l ? [n, r, o, d, d, i / d ** 2] : [n, r, o, i / d ** 2, d, d], a = l ? [0, 1, 3, 2, 4, 5] : [0, 1, 4, 2, 5, 3]) : ([n, r, o, i] = [e.dims[0], e.dims[2], e.dims[3], e.dims[1]], s = l ? [n, d, d, i / d ** 2, r, o] : [n, i / d ** 2, d, d, r, o], a = l ? [0, 3, 4, 1, 5, 2] : [0, 1, 4, 2, 5, 3]);
    let c = e.reshape(s), p = c.dims.length, f = e.dataType, m = S("a", f, p), h = C("output", f, p), _ = (y) => `
  ${y.registerUniform("output_size", "u32").declareVariables(m, h)}

  ${Cl(a, p, m, h)}

  ${y.mainStart()}
    ${y.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}

    let indices = ${h.offsetToIndices("global_idx")};
    let aIndices = perm(indices);

    ${h.setByOffset("global_idx", m.getByIndices("aIndices"))}
  }`;
    return { name: "DepthToSpace", shaderCache: { hint: `${e.dims};${t.blocksize};${t.mode}`, inputDependencies: ["rank"] }, getRunData: (y) => {
      let g = u ? [n, r * d, o * d, i / d ** 2] : [n, i / d ** 2, r * d, o * d], b = x$1.size(g), w = c.dims, v = x$1.sortBasedOnPerm(w, a);
      return { outputs: [{ dims: g, dataType: y[0].dataType }], dispatchGroup: { x: Math.ceil(b / 64) }, programUniforms: [{ type: 12, data: b }, ...P(w, v)] };
    }, getShaderSource: _ };
  }, Ps = (e, t) => {
    Il(e.inputs), e.compute(Al(e.inputs[0], t));
  }, zs = (e) => L({ blocksize: e.blocksize, mode: e.mode, format: e.format });
});
var or, cn, Ds, El, kl, ir, sr, Os, Pl, Ms, Us, Rs = k(() => {
  N();
  H();
  ue();
  F();
  or = "[a-zA-Z]|\\.\\.\\.", cn = "(" + or + ")+", Ds = "^" + cn + "$", El = "(" + cn + ",)*" + cn, kl = "^" + El + "$", ir = class {
    constructor(t = -1) {
      this.symbolToIndices = /* @__PURE__ */ new Map(), this.inputIndex = t;
    }
    addSymbol(t, n) {
      let r = this.symbolToIndices.get(t);
      r === void 0 ? r = [n] : r.push(n), this.symbolToIndices.set(t, r);
    }
  }, sr = class {
    constructor(t, n) {
      this.equation = n;
      this.hasEllipsis = false, this.symbolToInfo = /* @__PURE__ */ new Map(), this.lhs = new Array(), this.outputDims = [];
      let [r, o] = n.includes("->") ? n.split("->", 2) : [n, ""];
      if (!r.match(RegExp(kl))) throw new Error("Invalid LHS term");
      if (r.split(",").forEach((a, u) => {
        let d = t[u].dims.slice();
        if (!a.match(RegExp(Ds))) throw new Error("Invalid LHS term");
        let l = this.processTerm(a, true, d, u);
        this.lhs.push(l);
      }), o === "") o += [...this.symbolToInfo.entries()].filter(([a, u]) => u.count === 1 || a === "...").map(([a]) => a).join("");
      else if (!o.match(RegExp(cn))) throw new Error("Invalid RHS");
      o.match(RegExp(or, "g"))?.forEach((a) => {
        if (a === "...") this.outputDims = this.outputDims.concat(this.ellipsisDims);
        else {
          let u = this.symbolToInfo.get(a);
          if (u === void 0) throw new Error("Invalid RHS symbol");
          this.outputDims.push(u.dimValue);
        }
      }), this.rhs = this.processTerm(o, false, this.outputDims);
    }
    addSymbol(t, n, r) {
      let o = this.symbolToInfo.get(t);
      if (o !== void 0) {
        if (o.dimValue !== n && o.count !== 1) throw new Error("Dimension mismatch");
        o.count++, o.inputIndices.push(r);
      } else o = { count: 1, dimValue: n, inputIndices: [r] };
      this.symbolToInfo.set(t, o);
    }
    processTerm(t, n, r, o = -1) {
      let i = r.length, s = false, a = [], u = 0;
      if (!t.match(RegExp(Ds)) && !n && t !== "") throw new Error("Invalid LHS term");
      let d = t.match(RegExp(or, "g")), l = new ir(o);
      return d?.forEach((c, p) => {
        if (c === "...") {
          if (s) throw new Error("Only one ellipsis is allowed per input term");
          s = true;
          let f = i - d.length + 1;
          if (f < 0) throw new Error("Ellipsis out of bounds");
          if (a = r.slice(u, u + f), this.hasEllipsis) {
            if (this.ellipsisDims.length !== a.length || this.ellipsisDims.toString() !== a.toString()) throw new Error("Ellipsis dimensions mismatch");
          } else if (n) this.hasEllipsis = true, this.ellipsisDims = a;
          else throw new Error("Ellipsis must be specified in the LHS");
          for (let m = 0; m < a.length; m++) {
            let h = String.fromCharCode(48 + m);
            l.addSymbol(h, p + m), this.addSymbol(h, r[u++], o);
          }
        } else l.addSymbol(c, p + (this.hasEllipsis ? this.ellipsisDims.length - 1 : 0)), this.addSymbol(c, r[u++], o);
      }), l;
    }
  }, Os = (e) => e + "_max", Pl = (e, t, n, r) => {
    let i = e.map((l) => l.length).map((l, c) => S(`input${c}`, t, l)), s = x$1.size(r), a = C("output", t, r.length), u = [...n.symbolToInfo.keys()].filter((l) => !n.rhs.symbolToIndices.has(l)), d = (l) => {
      let c = [], p = "var prod = 1.0;", f = "var sum = 0.0;", m = "sum += prod;", h = [], _ = [], y = [], g = [], b = n.symbolToInfo.size === n.rhs.symbolToIndices.size;
      n.symbolToInfo.forEach((v, $) => {
        if (n.rhs.symbolToIndices.has($)) {
          let T = n.rhs.symbolToIndices.get($)?.[0];
          T !== void 0 && n.lhs.forEach((I, E) => {
            if (v.inputIndices.includes(E)) {
              let z = I.symbolToIndices.get($);
              if (z === void 0) throw new Error("Invalid symbol error");
              z.forEach((M) => {
                c.push(`${i[E].indicesSet(`input${E}Indices`, M, a.indicesGet("outputIndices", T))}`);
              });
            }
          });
        } else n.lhs.forEach((T, I) => {
          if (v.inputIndices.includes(I)) {
            let E = T.symbolToIndices.get($);
            if (E === void 0) throw new Error("Invalid symbol error");
            E.forEach((z) => {
              h.push(`${i[I].indicesSet(`input${I}Indices`, z, `${$}`)}`);
            }), g.push(`prod *= ${i[I].getByIndices(`input${I}Indices`)};`);
          }
        }), _.push(`for(var ${$}: u32 = 0; ${$} < uniforms.${Os($)}; ${$}++) {`), y.push("}");
      });
      let w = b ? [...c, `let sum = ${i.map((v, $) => v.getByIndices(`input${$}Indices`)).join(" * ")};`] : [...c, f, ..._, ...h, p, ...g, m, ...y];
      return `
            ${l.registerUniforms(u.map((v) => ({ name: `${Os(v)}`, type: "u32" }))).registerUniform("outputSize", "u32").declareVariables(...i, a)}

            ${l.mainStart()}
            ${l.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
            var outputIndices = ${a.offsetToIndices("global_idx")};
            ${i.map((v, $) => `var input${$}Indices: ${i[$].type.indices};`).join(`
`)}
            ${w.join(`
`)};
            ${a.setByOffset("global_idx", "sum")};
          }`;
    };
    return { name: "Einsum", shaderCache: { hint: n.equation, inputDependencies: e.map(() => "rank") }, getRunData: () => {
      let l = u.filter((p) => n.symbolToInfo.has(p)).map((p) => ({ type: 12, data: n.symbolToInfo.get(p)?.dimValue || 0 }));
      l.push({ type: 12, data: s });
      let c = e.map((p, f) => [...P(p)]).reduce((p, f) => p.concat(f), l);
      return c.push(...P(r)), { outputs: [{ dims: r, dataType: t }], dispatchGroup: { x: Math.ceil(s / 64) }, programUniforms: c };
    }, getShaderSource: d };
  }, Ms = (e, t) => {
    let n = new sr(e.inputs, t.equation), r = n.outputDims, o = e.inputs.map((i, s) => i.dims);
    e.compute(Pl(o, e.inputs[0].dataType, n, r));
  }, Us = (e) => {
    let t = e.equation.replace(/\s+/g, "");
    return L({ equation: t });
  };
});
var zl, Vs, Bl, Dl, Ns, Ls = k(() => {
  N();
  H();
  F();
  zl = (e) => {
    if (!e || e.length !== 2) throw new Error("Expand requires 2 input.");
    let t = e[0].dims, n = Array.from(e[1].getBigInt64Array(), Number), r = n.length < t.length ? 0 : n.length - t.length, o = t.length < n.length ? 0 : t.length - n.length;
    for (; r < n.length && o < t.length; ++r, ++o) if (n[r] !== t[o] && n[r] !== 1 && t[o] !== 1) throw new Error("Expand requires shape to be broadcastable to input");
  }, Vs = (e, t) => {
    let n = e.length - t.length, r = [];
    for (let o = 0; o < n; ++o) r.push(e[o]);
    for (let o = 0; o < t.length; ++o) r.push(t[o] === 1 ? e[o + n] : t[o]);
    return r;
  }, Bl = (e, t) => e.length > t.length ? Vs(e, t) : Vs(t, e), Dl = (e) => {
    let t = e[0].dims, n = Array.from(e[1].getBigInt64Array(), Number), r = Bl(t, n), o = e[0].dataType, i = o === 9 || x$1.size(t) === 1, s = o === 9 || t.length > 0 && t[t.length - 1] % 4 === 0 ? 4 : 1, a = i || r.length > 0 && r[r.length - 1] % 4 === 0 ? 4 : 1, u = Math.ceil(x$1.size(r) / a), d = (c) => {
      let p = S("input", o, t.length, s), f = C("output", o, r.length, a), m;
      if (o === 9) {
        let h = (_, y, g = "") => `
          let outputIndices${y} = ${f.offsetToIndices(`outputOffset + ${y}u`)};
          let offset${y} = ${p.broadcastedIndicesToOffset(`outputIndices${y}`, f)};
          let index${y} = offset${y} / 4u;
          let component${y} = offset${y} % 4u;
          ${_}[${y}] = ${g}(${p.getByOffset(`index${y}`)}[component${y}]);
        `;
        m = `
        let outputOffset = global_idx * ${a};
        var data = vec4<u32>(0);
        ${h("data", 0, "u32")}
        ${h("data", 1, "u32")}
        ${h("data", 2, "u32")}
        ${h("data", 3, "u32")}
        ${f.setByOffset("global_idx", "data")}
      }`;
      } else m = `
        let outputIndices = ${f.offsetToIndices(`global_idx * ${a}`)};
        let inputOffset = ${p.broadcastedIndicesToOffset("outputIndices", f)};
        let data = ${f.type.value}(${p.getByOffset(`inputOffset / ${s}`)});
        ${f.setByOffset("global_idx", "data")}
      }`;
      return `
    ${c.registerUniform("vec_size", "u32").declareVariables(p, f)}
    ${c.mainStart()}
    ${c.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.vec_size")}
    ${m}`;
    }, l = [{ type: 12, data: u }, ...P(t, r)];
    return { name: "Expand", shaderCache: { hint: `${r.length};${s}${a}`, inputDependencies: ["rank"] }, getShaderSource: d, getRunData: () => ({ outputs: [{ dims: r, dataType: e[0].dataType }], dispatchGroup: { x: Math.ceil(u / 64) }, programUniforms: l }) };
  }, Ns = (e) => {
    zl(e.inputs), e.compute(Dl(e.inputs), { inputs: [0] });
  };
});
var Ol, Ws, Gs = k(() => {
  N();
  H();
  F();
  rn();
  Ol = (e) => {
    let t = e[0].dataType, n = x$1.size(e[0].dims), r = x$1.size(e[1].dims), o = r % 4 === 0, i = (s) => {
      let a = S("x", t, [1], 4), u = S("bias", t, [1], 4), d = C("y", t, [1], 4), l = [{ name: "output_vec_size", type: "u32" }, { name: "bias_size", type: "u32" }], c = (f) => `
      let bias${f}_offset: u32 = (global_idx * 4 + ${f}) % uniforms.bias_size;
      let bias${f} = ${u.getByOffset(`bias${f}_offset / 4`)}[bias${f}_offset % 4];`, p = o ? `
      let bias = ${u.getByOffset("global_idx % (uniforms.bias_size / 4)")};` : `${c(0)}${c(1)}${c(2)}${c(3)}
      let bias = ${a.type.value}(bias0, bias1, bias2, bias3);`;
      return `${s.registerUniforms(l).declareVariables(a, u, d)}

    ${Qn(pe(t))}

    ${s.mainStart(Je)}
      ${s.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_vec_size")}

      let x = ${a.getByOffset("global_idx")};
      ${p}
      let x_in = x + bias;
      ${d.setByOffset("global_idx", Xn("x_in"))}
    }`;
    };
    return { name: "FastGeluWithBias", shaderCache: { hint: `${o}`, inputDependencies: ["type", "type"] }, getShaderSource: i, getRunData: (s) => ({ outputs: [{ dims: s[0].dims, dataType: s[0].dataType }], programUniforms: [{ type: 12, data: Math.ceil(n / 4) }, { type: 12, data: r }], dispatchGroup: { x: Math.ceil(n / Je / 4) } }) };
  }, Ws = (e) => {
    e.inputs.length < 2 || x$1.size(e.inputs[1].dims) === 0 ? Ri(e) : e.compute(Ol(e.inputs));
  };
});
var Ml, Ul, Hs, qs, Fs = k(() => {
  N();
  H();
  ue();
  F();
  Ml = (e) => {
    if (!e || e.length !== 2) throw new Error("Gather requires 2 inputs.");
  }, Ul = (e, t) => {
    let n = e[0].dims, r = e[1].dims, o = n.length, i = x$1.normalizeAxis(t.axis, o), s = n.slice(0);
    s.splice(i, 1, ...r);
    let a = n[i], u = e[0].dataType === 9 ? 4 : 1, d = Math.ceil(x$1.size(s) / u), l = [{ type: 12, data: d }, { type: 6, data: a }, { type: 12, data: i }, ...P(e[0].dims, e[1].dims, s)], c = (p) => {
      let f = S("data", e[0].dataType, e[0].dims.length, u), m = S("inputIndices", e[1].dataType, e[1].dims.length), h = C("output", e[0].dataType, s.length, u), _ = (g) => {
        let b = r.length, w = `var indicesIndices${g}  = ${m.type.indices}(0);`;
        for (let v = 0; v < b; v++) w += `${b > 1 ? `indicesIndices${g}[${v}]` : `indicesIndices${g}`} = ${s.length > 1 ? `outputIndices${g}[uniforms.axis + ${v}]` : `outputIndices${g}`};`;
        w += `
          var idx${g} = ${m.getByIndices(`indicesIndices${g}`)};
          if (idx${g} < 0) {
            idx${g} = idx${g} + uniforms.axisDimLimit;
          }
          var dataIndices${g} : ${f.type.indices};
        `;
        for (let v = 0, $ = 0; v < o; v++) v === i ? (w += `${o > 1 ? `dataIndices${g}[${v}]` : `dataIndices${g}`} = u32(idx${g});`, $ += b) : (w += `${o > 1 ? `dataIndices${g}[${v}]` : `dataIndices${g}`} = ${s.length > 1 ? `outputIndices${g}[${$}]` : `outputIndices${g}`};`, $++);
        return w;
      }, y;
      if (e[0].dataType === 9) {
        let g = (b, w, v = "") => `
          let outputIndices${w} = ${h.offsetToIndices(`outputOffset + ${w}u`)};
          ${_(w)};
          let offset${w} = ${f.indicesToOffset(`dataIndices${w}`)};
          let index${w} = offset${w} / 4u;
          let component${w} = offset${w} % 4u;
          ${b}[${w}] = ${v}(${f.getByOffset(`index${w}`)}[component${w}]);
        `;
        y = `
        let outputOffset = global_idx * ${u};
        var value = vec4<u32>(0);
        ${g("value", 0, "u32")}
        ${g("value", 1, "u32")}
        ${g("value", 2, "u32")}
        ${g("value", 3, "u32")}
        ${h.setByOffset("global_idx", "value")}
      `;
      } else y = `
      let outputIndices = ${h.offsetToIndices("global_idx")};
      ${_("")};
      let value = ${f.getByIndices("dataIndices")};
      ${h.setByOffset("global_idx", "value")};
      `;
      return `
      ${p.registerUniform("outputSize", "u32").registerUniform("axisDimLimit", "i32").registerUniform("axis", "u32").declareVariables(f, m, h)}
      ${p.mainStart()}
        ${p.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
        ${y}
      }`;
    };
    return { name: "Gather", shaderCache: { hint: t.cacheKey, inputDependencies: ["rank", "rank"] }, getRunData: () => ({ outputs: [{ dims: s, dataType: e[0].dataType }], dispatchGroup: { x: Math.ceil(d / 64) }, programUniforms: l }), getShaderSource: c };
  }, Hs = (e) => L({ axis: e.axis }), qs = (e, t) => {
    let n = e.inputs;
    Ml(n), e.compute(Ul(e.inputs, t));
  };
});
var Rl, Ks, js, Zs = k(() => {
  N();
  H();
  F();
  Rl = (e, t, n, r, o, i, s, a, u) => {
    let d = [{ type: 12, data: i }, { type: 12, data: r }, { type: 12, data: o }, { type: 12, data: n }, { type: 12, data: s }, { type: 12, data: a }, { type: 12, data: u }], l = [i];
    d.push(...P(t.dims, l));
    let c = (p) => {
      let f = S("indices_data", t.dataType, t.dims.length), m = C("input_slice_offsets_data", 12, 1, 1), h = [f, m], _ = [{ name: "output_size", type: "u32" }, { name: "batch_dims", type: "u32" }, { name: "input_dims", type: "u32", length: o.length }, { name: "sizes_from_slice_dims_data", type: "u32", length: n.length }, { name: "num_slices_per_batch", type: "u32" }, { name: "input_batch_stride", type: "u32" }, { name: "num_slice_dims", type: "u32" }];
      return `
  ${p.registerUniforms(_).declareVariables(...h)}
  ${p.mainStart()}
    ${p.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    let batch_idx = global_idx / uniforms.num_slices_per_batch;
    let base_offset = batch_idx * uniforms.input_batch_stride;

    let slice_indices_base_offset = global_idx * uniforms.num_slice_dims;
    var relative_slice_offset = 0;
    for (var dim_idx = 0u; dim_idx < uniforms.num_slice_dims; dim_idx ++) {
      var index = i32(indices_data[dim_idx + slice_indices_base_offset].x);
      let input_dim_idx = uniforms.batch_dims + dim_idx;
      if (index < 0) {
        ${o.length === 1 ? "index += i32(uniforms.input_dims);" : "index += i32(uniforms.input_dims[input_dim_idx]);"}
      }
      ${n.length === 1 ? "relative_slice_offset += index * i32(uniforms.sizes_from_slice_dims_data);" : "relative_slice_offset += index * i32(uniforms.sizes_from_slice_dims_data[dim_idx]);"}
    }

    input_slice_offsets_data[global_idx] =  base_offset + u32(relative_slice_offset);
  }`;
    };
    return e.compute({ name: "computeSliceOffsets", shaderCache: { hint: `${o.length}_${n.length}`, inputDependencies: ["rank"] }, getRunData: () => ({ outputs: [{ dims: l, dataType: e.inputs[1].dataType }], dispatchGroup: { x: Math.ceil(i / 64) }, programUniforms: d }), getShaderSource: c }, { inputs: [t], outputs: [-1] })[0];
  }, Ks = (e, t) => {
    let n = e.inputs, r = n[0].dims, o = n[0].dataType, i = n[1].dims, s = i[i.length - 1], a = x$1.sizeToDimension(i, i.length - 1), u = x$1.sizeFromDimension(r, t.batchDims + s), d = x$1.sizeToDimension(r, t.batchDims), l = x$1.sizeFromDimension(r, t.batchDims), c = a / d, p = new Array(s), f = u;
    for (let w = 0; w < s; ++w) p[s - 1 - w] = f, f *= r[t.batchDims + s - 1 - w];
    let m = Rl(e, n[1], p, t.batchDims, r, a, c, l, s), h = t.batchDims + s;
    if (h > r.length) throw new Error("last dimension of indices must not be larger than rank of input tensor");
    let _ = i.slice(0, -1).concat(r.slice(h)), y = x$1.size(_), g = [{ type: 12, data: y }, { type: 12, data: u }, ...P(n[0].dims, m.dims, _)], b = (w) => {
      let v = S("data", n[0].dataType, n[0].dims.length), $ = S("slice_offsets", 12, m.dims.length), T = C("output", n[0].dataType, _.length);
      return `
          ${w.registerUniform("output_size", "u32").registerUniform("slice_size", "u32").declareVariables(v, $, T)}
            ${w.mainStart()}
            ${w.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
          let slice_offset = slice_offsets[global_idx / uniforms.slice_size];
          output[global_idx] = data[u32(slice_offset) + global_idx % uniforms.slice_size];
        }`;
    };
    e.compute({ name: "GatherND", shaderCache: { hint: t.cacheKey, inputDependencies: ["rank", "rank"] }, getRunData: () => ({ outputs: [{ dims: _, dataType: o }], dispatchGroup: { x: Math.ceil(y / 64) }, programUniforms: g }), getShaderSource: b }, { inputs: [n[0], m] });
  }, js = (e) => ({ batchDims: e.batch_dims, cacheKey: "" });
});
var Vl, Nl, Qs, Xs, Ys = k(() => {
  N();
  H();
  ue();
  F();
  Vl = (e, t) => {
    if (e.length < 3 || e.length > 4) throw new Error("GatherBlockQuantized requires 3 or 4 inputs.");
    let n = x$1.normalizeAxis(t.quantizeAxis, e[0].dims.length), r = t.blockSize, o = e[0], i = e[2], s = e.length === 4 ? e[3] : void 0;
    if (i.dims.length !== o.dims.length || !o.dims.map((a, u) => u === n ? Math.ceil(a / r) === i.dims[u] : a === i.dims[u]).reduce((a, u) => a && u, true)) throw new Error("Scales must have the same rank as the input tensor and the dims should match except on gatherAxis.");
    if (s) {
      if (s.dataType !== o.dataType) throw new Error("Zero point must have the same data type as the input tensor.");
      if (s.dims.length !== i.dims.length || !s.dims.map((a, u) => a === i.dims[u]).reduce((a, u) => a && u, true)) throw new Error("Zero point must have the same rank as the input tensor and the dims should match except on quantizeAxis.");
    }
  }, Nl = (e, t) => {
    let n = e[0].dims, r = e[1].dims, o = n.length, i = x$1.normalizeAxis(t.gatherAxis, o), s = x$1.normalizeAxis(t.quantizeAxis, o), a = n.slice(0);
    a.splice(i, 1, ...r);
    let u = x$1.size(a), d = e[2].dataType, c = e[0].dataType === 22, p = [{ type: 12, data: u }, { type: 12, data: s }, { type: 12, data: i }, { type: 12, data: t.blockSize }, ...P(...e.map((m, h) => m.dims), a)], f = (m) => {
      let h = S("data", e[0].dataType, e[0].dims.length), _ = S("inputIndices", e[1].dataType, e[1].dims.length), y = S("scales", e[2].dataType, e[2].dims.length), g = e.length > 3 ? S("zeroPoint", e[3].dataType, e[3].dims.length) : void 0, b = C("output", d, a.length), w = [h, _, y];
      g && w.push(g);
      let v = [{ name: "output_size", type: "u32" }, { name: "quantize_axis", type: "u32" }, { name: "gather_axis", type: "u32" }, { name: "block_size", type: "u32" }];
      return `
        ${m.registerUniforms(v).declareVariables(...w, b)}
        ${m.mainStart()}
        let output_indices = ${b.offsetToIndices("global_idx")};
        var indices_indices = ${_.type.indices}(0);
        ${r.length > 1 ? `
          for (var i: u32 = 0; i < ${r.length}; i++) {
            let index = ${b.indicesGet("output_indices", "uniforms.gather_axis + i")};
            ${_.indicesSet("indices_indices", "i", "index")};
          }` : `indices_indices = ${b.indicesGet("output_indices", "uniforms.gather_axis")};`};
        var data_indices = ${h.type.indices}(0);
        for (var i: u32 = 0; i < uniforms.gather_axis; i++) {
          let index = ${b.indicesGet("output_indices", "i")};
          ${h.indicesSet("data_indices", "i", "index")};
        }
        var index_from_indices = ${_.getByIndices("indices_indices")};
        if (index_from_indices < 0) {
          index_from_indices += ${n[i]};
        }
        ${h.indicesSet("data_indices", "uniforms.gather_axis", "u32(index_from_indices)")};
        for (var i = uniforms.gather_axis + 1; i < ${a.length}; i++) {
          let index = ${b.indicesGet("output_indices", `i + ${r.length} - 1`)};
          ${h.indicesSet("data_indices", "i", "index")};
        }
        let data_offset = ${h.indicesToOffset("data_indices")};
        let data_index = data_offset % 8;
        // Convert 4-bit packed data to 8-bit packed data.
        let packed_4bit_quantized_data = ${h.getByOffset("data_offset / 8")};
        let packed_8bit_quantized_data = (packed_4bit_quantized_data >> (4 * (data_index % 2))) & 0x0f0f0f0f;
        let quantized_data_vec = ${c ? "unpack4xI8" : "unpack4xU8"}(u32(packed_8bit_quantized_data));
        let quantized_data = quantized_data_vec[data_index / 2];
        var scale_indices = data_indices;
        let quantize_axis_index = ${y.indicesGet("data_indices", "uniforms.quantize_axis")} / uniforms.block_size;
        ${y.indicesSet("scale_indices", "uniforms.quantize_axis", "quantize_axis_index")};
        var scale = ${y.getByIndices("scale_indices")};
        ${g ? `
              let zero_point_indices = scale_indices;
              let zero_point_offset = ${g.indicesToOffset("zero_point_indices")};
              let zero_point_index = zero_point_offset % 8;
              let packed_4bit_zero_points = ${g.getByOffset("zero_point_offset / 8")};
              let packed_8bit_zero_points = (packed_4bit_zero_points >> (4 * (zero_point_index % 2))) & 0x0f0f0f0f;
              let zero_point_vec = ${c ? "unpack4xI8" : "unpack4xU8"}(u32(packed_8bit_zero_points));
              let zero_point = zero_point_vec[zero_point_index / 2];` : "var zero_point = 0"};
        let dequantized_data = ${pe(d)}(quantized_data - zero_point) * scale;
        ${b.setByOffset("global_idx", "dequantized_data")};
    }`;
    };
    return { name: "GatherBlockQuantized", shaderCache: { hint: `${t.cacheKey};${e.filter((m, h) => h !== 1).map((m) => m.dims.join("_")).join(";")}`, inputDependencies: Array.from({ length: e.length }, (m, h) => "rank") }, getRunData: () => ({ outputs: [{ dims: a, dataType: d }], dispatchGroup: { x: Math.ceil(u / 64) }, programUniforms: p }), getShaderSource: f };
  }, Qs = (e, t) => {
    let n = e.inputs;
    Vl(n, t), e.compute(Nl(e.inputs, t));
  }, Xs = (e) => L({ blockSize: e.blockSize, gatherAxis: e.gatherAxis, quantizeAxis: e.quantizeAxis });
});
var Ll, Wl, Js, ea, ta = k(() => {
  N();
  H();
  ue();
  F();
  Ll = (e) => {
    if (!e || e.length !== 2) throw new Error("GatherElements requires 2 inputs.");
    if (e[0].dims.length < 1) throw new Error("GatherElements requires that the data input be rank >= 1.");
    if (e[0].dims.length !== e[1].dims.length) throw new Error(`GatherElements requires that the data input and
                     indices input tensors be of same rank.`);
  }, Wl = (e, t) => {
    let n = e[0].dims, r = e[0].dataType, o = n.length, i = e[1].dims, s = e[1].dataType, a = x$1.normalizeAxis(t.axis, o), u = n[a], d = i.slice(0), l = x$1.size(d), c = S("input", r, o), p = S("indicesInput", s, i.length), f = C("output", r, d.length), m = [{ type: 12, data: l }, { type: 6, data: u }, { type: 12, data: a }];
    return m.push(...P(n, i, d)), { name: "GatherElements", shaderCache: { inputDependencies: ["rank", "rank"] }, getRunData: () => ({ outputs: [{ dims: d, dataType: e[0].dataType }], dispatchGroup: { x: Math.ceil(l / 64) }, programUniforms: m }), getShaderSource: (y) => `
      ${y.registerUniform("outputSize", "u32").registerUniform("axisDimLimit", "i32").registerUniform("axis", "u32").declareVariables(c, p, f)}
      ${y.mainStart()}
      ${y.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}

      let outputIndices = ${f.offsetToIndices("global_idx")};

      var idx = ${p.getByOffset("global_idx")};
      if (idx < 0) {
        idx = idx + uniforms.axisDimLimit;
      }
      var inputIndices = ${c.type.indices}(outputIndices);
      ${c.indicesSet("inputIndices", "uniforms.axis", "u32(idx)")};
      let value = ${c.getByIndices("inputIndices")};

      ${f.setByOffset("global_idx", "value")};
  }` };
  }, Js = (e) => L({ axis: e.axis }), ea = (e, t) => {
    let n = e.inputs;
    Ll(n), e.compute(Wl(e.inputs, t));
  };
});
var Gl, Hl, na, ra, oa = k(() => {
  N();
  H();
  F();
  Gl = (e) => {
    if (!e) throw new Error("Input is missing");
    if (e.length < 2 || e.length > 3) throw new Error("Invaid input number.");
    if (e.length === 3 && e[2].dims.length > 2) throw new Error("Invalid input shape of C");
    if (e[0].dataType !== e[1].dataType || e.length === 3 && e[0].dataType !== e[2].dataType) throw new Error("Input types are mismatched");
  }, Hl = (e, t) => {
    let n = e[0].dims.slice(), r = e[1].dims.slice(), [o, i, s] = Ht.getShapeOfGemmResult(n, t.transA, r, t.transB, e.length === 3 ? e[2].dims : void 0), a = [o, i];
    if (!a) throw new Error("Can't use gemm on the given tensors");
    let u = 16, d = Math.ceil(i / u), l = Math.ceil(o / u), c = true, p = x$1.size(a), f = [{ type: 12, data: c ? d : p }, { type: 12, data: o }, { type: 12, data: i }, { type: 12, data: s }, { type: 1, data: t.alpha }, { type: 1, data: t.beta }], m = ["type", "type"];
    e.length === 3 && (f.push(...P(e[2].dims)), m.push("rank")), f.push(...P(a));
    let h = (y) => {
      let g = "";
      t.transA && t.transB ? g = "value += a[k * uniforms.M + m] * b[n * uniforms.K + k];" : t.transA && !t.transB ? g = "value += a[k * uniforms.M + m] * b[k * uniforms.N + n];" : !t.transA && t.transB ? g = "value += a[m * uniforms.K + k] * b[n * uniforms.K + k];" : !t.transA && !t.transB && (g = "value += a[m * uniforms.K + k] * b[k * uniforms.N + n];");
      let b = t.alpha === 1 ? "" : "value *= uniforms.alpha;", w = S("a", e[0].dataType, e[0].dims), v = S("b", e[1].dataType, e[1].dims), $ = w.type.value, T = null, I = [w, v];
      e.length === 3 && (T = S("c", e[2].dataType, e[2].dims.length), I.push(T));
      let E = C("output", e[0].dataType, a.length);
      I.push(E);
      let z = [{ name: "output_size", type: "u32" }, { name: "M", type: "u32" }, { name: "N", type: "u32" }, { name: "K", type: "u32" }, { name: "alpha", type: "f32" }, { name: "beta", type: "f32" }];
      return `
  ${y.registerUniforms(z).declareVariables(...I)}

  ${y.mainStart()}
    ${y.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}

    let m = global_idx / uniforms.N;
    let n = global_idx % uniforms.N;

    var value = ${$}(0);
    for (var k: u32 = 0u; k < uniforms.K; k++) {
      ${g}
    }

    ${b}
    ${T != null ? `let cOffset = ${T.broadcastedIndicesToOffset("vec2(m, n)", E)}; value += ${$}(uniforms.beta) * ${T.getByOffset("cOffset")};` : ""}
    output[global_idx] = value;
  }`;
    }, _ = (y) => {
      let g = S("a", e[0].dataType, e[0].dims), b = S("b", e[1].dataType, e[1].dims), w = null, v = [g, b];
      e.length === 3 && (w = S("c", e[2].dataType, e[2].dims.length), v.push(w));
      let $ = C("output", e[0].dataType, a.length);
      v.push($);
      let T = [{ name: "num_tile_n", type: "u32" }, { name: "M", type: "u32" }, { name: "N", type: "u32" }, { name: "K", type: "u32" }, { name: "alpha", type: "f32" }, { name: "beta", type: "f32" }], I = "", E = "";
      t.transA && t.transB ? (E = `
      var col = tile_row_start + local_id.x;
      var row = k_start + local_id.y;
      if (col < uniforms.M && row < uniforms.K) {
        tile_a[local_id.y][local_id.x] = a[row * uniforms.M + col];
      } else {
        tile_a[local_id.y][local_id.x] = ${g.type.value}(0);
      }

      col = k_start + local_id.x;
      row = tile_col_start + local_id.y;
      if (col < uniforms.K && row < uniforms.N) {
        tile_b[local_id.y][local_id.x] = b[row * uniforms.K + col];
      } else {
        tile_b[local_id.y][local_id.x] = ${b.type.value}(0);
      }
      `, I = "value += tile_a[k][local_id.y] * tile_b[local_id.x][k];") : t.transA && !t.transB ? (E = `
      var col = tile_row_start + local_id.x;
      var row = k_start + local_id.y;
      if (col < uniforms.M && row < uniforms.K) {
        tile_a[local_id.y][local_id.x] = a[row * uniforms.M + col];
      } else {
        tile_a[local_id.y][local_id.x] = ${g.type.value}(0);
      }

      col = tile_col_start + local_id.x;
      row = k_start + local_id.y;
      if (col < uniforms.N && row < uniforms.K) {
        tile_b[local_id.y][local_id.x] = b[row * uniforms.N + col];
      } else {
        tile_b[local_id.y][local_id.x] = ${b.type.value}(0);
      }
      `, I = "value += tile_a[k][local_id.y] * tile_b[k][local_id.x];") : !t.transA && t.transB ? (E = `
      var col = k_start + local_id.x;
      var row = tile_row_start + local_id.y;
      if (col < uniforms.K && row < uniforms.M) {
        tile_a[local_id.y][local_id.x] = a[row * uniforms.K + col];
      } else {
        tile_a[local_id.y][local_id.x] = ${g.type.value}(0);
      }

      col = k_start + local_id.x;
      row = tile_col_start + local_id.y;
      if (col < uniforms.K && row < uniforms.N) {
        tile_b[local_id.y][local_id.x] = b[row * uniforms.K + col];
      } else {
        tile_b[local_id.y][local_id.x] = ${b.type.value}(0);
      }
      `, I = "value += tile_a[local_id.y][k] * tile_b[local_id.x][k];") : !t.transA && !t.transB && (E = `
      var col = k_start + local_id.x;
      var row = tile_row_start + local_id.y;
      if (col < uniforms.K && row < uniforms.M) {
        tile_a[local_id.y][local_id.x] = a[row * uniforms.K + col];
      } else {
        tile_a[local_id.y][local_id.x] = ${g.type.value}(0);
      }

      col = tile_col_start + local_id.x;
      row = k_start + local_id.y;
      if (col < uniforms.N && row < uniforms.K) {
        tile_b[local_id.y][local_id.x] = b[row * uniforms.N + col];
      } else {
        tile_b[local_id.y][local_id.x] = ${b.type.value}(0);
      }
      `, I = "value += tile_a[local_id.y][k] * tile_b[k][local_id.x];");
      let z = t.alpha === 1 ? "" : "value *= uniforms.alpha;";
      return `
  ${y.registerUniforms(T).declareVariables(...v)}
  var<workgroup> tile_a: array<array<${g.type.storage}, ${u}>, ${u}>;
  var<workgroup> tile_b: array<array<${b.type.storage}, ${u}>, ${u}>;
  ${y.mainStart([u, u, 1])}
    let tile_col_start = (workgroup_index % uniforms.num_tile_n) * ${u};
    let tile_row_start = (workgroup_index / uniforms.num_tile_n) * ${u};
    let num_tiles = (uniforms.K - 1) / ${u} + 1;
    var k_start = 0u;
    var value = ${$.type.value}(0);
    for (var t: u32 = 0u; t < num_tiles; t++) {
      ${E}
      k_start = k_start + ${u};
      workgroupBarrier();

      for (var k: u32 = 0u; k < ${u}; k++) {
        ${I}
      }
      workgroupBarrier();
    }

    ${z}
    let m = tile_row_start + local_id.y;
    let n = tile_col_start + local_id.x;
    ${w != null ? `let cOffset = ${w.broadcastedIndicesToOffset("vec2(m, n)", $)}; value += ${$.type.value}(uniforms.beta) * ${w.getByOffset("cOffset")};` : ""}
    if (m < uniforms.M && n < uniforms.N) {
      output[m * uniforms.N + n] = value;
    }
  }`;
    };
    return c ? { name: "GemmShared", shaderCache: { hint: `${t.cacheKey}`, inputDependencies: m }, getRunData: () => ({ outputs: [{ dims: a, dataType: e[0].dataType }], dispatchGroup: { x: d * l }, programUniforms: f }), getShaderSource: _ } : { name: "Gemm", shaderCache: { hint: `${t.cacheKey}`, inputDependencies: m }, getRunData: () => ({ outputs: [{ dims: a, dataType: e[0].dataType }], dispatchGroup: { x: Math.ceil(p / 64) }, programUniforms: f }), getShaderSource: h };
  }, na = (e) => {
    let t = e.transA, n = e.transB, r = e.alpha, o = e.beta;
    return { transA: t, transB: n, alpha: r, beta: o, cacheKey: `${e.transA};${e.transB};${e.alpha === 1}` };
  }, ra = (e, t) => {
    Gl(e.inputs), e.compute(Hl(e.inputs, t));
  };
});
var Ve, Ke, st, at, ql, Fl, Kl, jl, Zl, Ql, Xl, Yl, ia, sa, aa = k(() => {
  N();
  H();
  ue();
  F();
  [Ve, Ke, st, at] = [0, 1, 2, 3], ql = (e) => {
    if (e[0].dims.length !== 4) throw new Error("only 4-D tensor is supported.");
    if (e[0].dims.length !== e[1].dims.length) throw new Error("input dimensions must be equal to grid dimensions");
    if (e[0].dims.length - 2 !== e[1].dims[e[1].dims.length - 1]) throw new Error(`last dimension of grid must be equal to ${e[0].dims.length - 2}`);
    if (e[0].dims[0] !== e[1].dims[0]) throw new Error("grid batch size must match input batch size");
  }, Fl = `
  fn gs_get_cubic_coeffs(x: f32) -> vec4<f32> {
    let cubic_alpha = -0.75f;
    let x_abs = abs(x);
    var coeffs: vec4<f32>;
    coeffs[0] = (((cubic_alpha * (x_abs + 1) - 5 * cubic_alpha) * (x_abs + 1) + 8 * cubic_alpha) * (x_abs + 1) - 4 * cubic_alpha);
    coeffs[1] = (((cubic_alpha + 2) * x_abs - (cubic_alpha + 3)) * x_abs * x_abs + 1);
    coeffs[2] = (((cubic_alpha + 2) * (1 - x_abs) - (cubic_alpha + 3)) * (1 - x_abs) * (1 - x_abs) + 1);
    coeffs[3] = (((cubic_alpha * (2 - x_abs) - 5 * cubic_alpha) * (2 - x_abs) + 8 * cubic_alpha) * (2 - x_abs) - 4 * cubic_alpha);
    return coeffs;
  }
`, Kl = (e) => `
  fn gs_bicubic_interpolate(p: mat4x4<${e}>, x: f32, y: f32) -> ${e} {
    var v: vec4<f32>;
    var coeffs = gs_get_cubic_coeffs(x);
    for (var i = 0; i < 4; i++) {
      v[i] = coeffs[0] * p[i][0] + coeffs[1] * p[i][1] + coeffs[2] * p[i][2] + coeffs[3] * p[i][3];
    }
    coeffs = gs_get_cubic_coeffs(y);
    let pixel = ${e}(coeffs[0] * v[0] + coeffs[1] * v[1] + coeffs[2] * v[2] + coeffs[3] * v[3]);
    return pixel;
  }
`, jl = (e) => `
  fn gs_denormalize(n: f32, length: i32) -> f32 {
    ${e.alignCorners === 0 ? `
    // alignCorners: false => [-1, 1] to [-0.5, length - 0.5]
    return ((n + 1.0) * f32(length) - 1.0) / 2.0;
    ` : `
    // alignCorners: true => [-1, 1] to [0, length - 1]
    return (n + 1.0) / 2.0 * (f32(length - 1));
    `}
  }
`, Zl = (e) => `
  ${e.paddingMode === "reflection" ? `
      fn gs_reflect(x: i32, x_min: f32, x_max: f32) -> u32 {
        var dx = 0.0;
        var fx = f32(x);
        let range = x_max - x_min;
        if (fx < x_min) {
          dx = x_min - fx;
          let n = u32(dx / range);
          let r = dx - f32(n) * range;
          if (n % 2 == 0) {
            fx = x_min + r;
          } else {
            fx = x_max - r;
          }
        } else if (fx > x_max) {
          dx = fx - x_max;
          let n = u32(dx / range);
          let r = dx - f32(n) * range;
          if (n % 2 == 0) {
            fx = x_max - r;
          } else {
            fx = x_min + r;
          }
        }
        return u32(fx);
      }` : ""}
`, Ql = (e, t, n) => `
  fn pixel_at_grid(r: i32, c: i32, H: i32, W: i32, batch: u32, channel: u32, border: vec4<f32>) -> ${t} {
     var pixel = ${t}(0);
     var indices = vec4<u32>(0);
     indices[${Ve}] = batch;
     indices[${Ke}] = channel;` + (() => {
    switch (n.paddingMode) {
      case "zeros":
        return `
          if (r >= 0 && r < H && c >=0 && c < W) {
            indices[${st}] = u32(r);
            indices[${at}] = u32(c);
          } else {
            return ${t}(0);
          }
        `;
      case "border":
        return `
          indices[${st}] = u32(clamp(r, 0, H - 1));
          indices[${at}] = u32(clamp(c, 0, W - 1));
        `;
      case "reflection":
        return `
          indices[${st}] = gs_reflect(r, border[1], border[3]);
          indices[${at}] = gs_reflect(c, border[0], border[2]);
        `;
      default:
        throw new Error(`padding mode ${n.paddingMode} is not supported`);
    }
  })() + `
    return ${e.getByIndices("indices")};
  }
`, Xl = (e, t, n) => (() => {
    switch (n.mode) {
      case "nearest":
        return `
          let result = pixel_at_grid(i32(round(y)), i32(round(x)), H_in, W_in, indices[${Ve}], indices[${Ke}], border);
        `;
      case "bilinear":
        return `
          let x1 = i32(floor(x));
          let y1 = i32(floor(y));
          let x2 = x1 + 1;
          let y2 = y1 + 1;

          let p11 = pixel_at_grid(y1, x1, H_in, W_in, indices[${Ve}], indices[${Ke}], border);
          let p12 = pixel_at_grid(y1, x2, H_in, W_in, indices[${Ve}], indices[${Ke}], border);
          let p21 = pixel_at_grid(y2, x1, H_in, W_in, indices[${Ve}], indices[${Ke}], border);
          let p22 = pixel_at_grid(y2, x2, H_in, W_in, indices[${Ve}], indices[${Ke}], border);

          let dx2 = ${t}(f32(x2) - x);
          let dx1 = ${t}(x - f32(x1));
          let dy2 = ${t}(f32(y2) - y);
          let dy1 = ${t}(y - f32(y1));
          let result = dy2 * (dx2 * p11 + dx1 * p12) + dy1 * (dx2 * p21 + dx1 * p22);
        `;
      case "bicubic":
        return `
          let x0 = i32(floor(x)) - 1;
          let y0 = i32(floor(y)) - 1;
          var p: mat4x4<${t}>;
          for (var h = 0; h < 4; h++) {
            for (var w = 0; w < 4; w++) {
              p[h][w] = pixel_at_grid(h + y0, w + x0, H_in, W_in, indices[${Ve}], indices[${Ke}], border);
            }
          }

          let dx = x - f32(x0 + 1);
          let dy = y - f32(y0 + 1);
          let result = gs_bicubic_interpolate(p, dx, dy);
        `;
      default:
        throw new Error(`mode ${n.mode} is not supported`);
    }
  })() + `${e.setByOffset("global_idx", "result")}`, Yl = (e, t) => {
    let n = S("x", e[0].dataType, e[0].dims.length), r = [e[1].dims[0], e[1].dims[1], e[1].dims[2]], o = S("grid", e[1].dataType, r.length, 2), i = [e[0].dims[0], e[0].dims[1], e[1].dims[1], e[1].dims[2]];
    t.format === "NHWC" && (i = [e[0].dims[0], e[1].dims[1], e[1].dims[2], e[0].dims[3]], [Ve, Ke, st, at] = [0, 3, 1, 2]);
    let s = C("output", e[0].dataType, i.length), a = n.type.value, u = x$1.size(i), d = [{ type: 12, data: u }, ...P(e[0].dims, r, i)], l = (c) => `
  ${c.registerUniform("output_size", "u32").declareVariables(n, o, s)}
  ${Fl}
  ${Kl(a)}
  ${jl(t)}
  ${Zl(t)}
  ${Ql(n, a, t)}

  ${c.mainStart()}
    ${c.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
      let H_in = i32(uniforms.x_shape[${st}]);
      let W_in = i32(uniforms.x_shape[${at}]);

      ${t.alignCorners === 0 ? `
      let x_min = -0.5;
      let x_max = f32(W_in) - 0.5;
      let y_min = -0.5;
      let y_max = f32(H_in) - 0.5;
      ` : `
      let x_min = 0.0;
      let x_max = f32(W_in) - 1.0;
      let y_min = 0.0;
      let y_max = f32(H_in) - 1.0;
      `};
      let border = vec4<f32>(x_min, y_min, x_max, y_max);

      let indices = ${s.offsetToIndices("global_idx")};
      var grid_indices = vec3<u32>(indices[${Ve}], indices[${st}], indices[${at}]);
      let nxy = ${o.getByIndices("grid_indices")};
      var x = gs_denormalize(f32(nxy[0]), W_in);
      var y = gs_denormalize(f32(nxy[1]), H_in);

      ${Xl(s, a, t)}
  }`;
    return { name: "GridSample", shaderCache: { hint: `${t.cacheKey}`, inputDependencies: ["type", "type"] }, getRunData: (c) => {
      let p = x$1.size(i);
      return { outputs: [{ dims: i, dataType: c[0].dataType }], dispatchGroup: { x: Math.ceil(p / 64) }, programUniforms: d };
    }, getShaderSource: l };
  }, ia = (e, t) => {
    ql(e.inputs), e.compute(Yl(e.inputs, t));
  }, sa = (e) => L({ alignCorners: e.align_corners, mode: e.mode, paddingMode: e.padding_mode, format: e.format });
});
var be, tc, da, ua, nc, _t, la, ar = k(() => {
  N();
  H();
  ue();
  Qt();
  tn();
  F();
  Re();
  be = (e, t) => e.length > t && e[t].dims.length > 0 ? e[t] : void 0, tc = (e, t) => {
    let n = e[0], r = be(e, 1), o = be(e, 2), i = be(e, 3), s = be(e, 4), a = be(e, 5), u = be(e, 6), d = be(e, 7);
    if (n.dims.length !== 3 && n.dims.length !== 5) throw new Error("Input query is expected to have 3 or 5 dimensions");
    let l = n.dims[0], c = n.dims[1], p = n.dims.length === 3 ? n.dims[2] : t.numHeads * n.dims[4], f = c, m = 0, h = 0, _ = Math.floor(p / t.numHeads);
    if (u && d && x$1.size(u.dims) && x$1.size(d.dims)) {
      if (u.dims.length !== 4) throw new Error('Input "past_key" is expected to have 4 dimensions');
      if (u.dims[0] !== l || u.dims[1] !== t.numHeads || u.dims[3] !== _) throw new Error('Input "past_key" shape (batch_size, num_heads, past_sequence_length, head_size)');
      if (d.dims[0] !== l || d.dims[1] !== t.numHeads || d.dims[3] !== _) throw new Error('Input "past_value" shape (batch_size, num_heads, past_sequence_length, head_size)');
      if (u.dims[2] !== d.dims[2]) throw new Error('Input "past_key" and "past_value" shall have same dim 2 (past_sequence_length)');
      if (d.dims.length !== 4) throw new Error('Input "past_value" is expected to have 4 dimensions');
      m = u.dims[2], h = u.dims[2];
    } else if (u && x$1.size(u.dims) || d && x$1.size(d.dims)) throw new Error('Input "past_key" and "past_value" shall be both present or both absent');
    let y;
    if (r && x$1.size(r.dims) > 0) {
      if (n.dims.length !== 3) throw new Error('Input "query" is expected to have 3 dimensions when key is given');
      if (r.dims.length < 3 || r.dims.length > 5) throw new Error('Input "key" is expected to have 3, 4, or 5 dimensions');
      if (n.dims[0] !== r.dims[0]) throw new Error('Input "query" and "key" shall have same dim 0 (batch size)');
      if (r.dims.length === 3) {
        if (r.dims[2] !== n.dims[2]) throw new Error('Input "query" and "key" shall have same dim 2 (hidden_size)');
        y = 2, f = r.dims[1];
      } else if (r.dims.length === 5) {
        if (r.dims[2] !== t.numHeads || r.dims[3] !== 2 || r.dims[4] !== _) throw new Error('Expect "key" shape (batch_size, kv_sequence_length, num_heads, 2, head_size) for packed kv');
        if (o) throw new Error('Expect "value" be none when "key" has packed kv format.');
        y = 5, f = r.dims[1];
      } else {
        if (r.dims[1] !== t.numHeads || r.dims[3] !== _) throw new Error('Expect "key" shape (batch_size, num_heads, kv_sequence_length, head_size) for past_key');
        y = 0, f = r.dims[2];
      }
    } else {
      if (n.dims.length !== 5) throw new Error('Input "query" is expected to have 5 dimensions when key is empty');
      if (n.dims[2] !== t.numHeads || n.dims[3] !== 3) throw new Error('Expect "query" shape (batch_size, kv_sequence_length, num_heads, 3, head_size) for packed kv');
      y = 3;
    }
    if (i && x$1.size(i.dims) > 0) {
      if (i.dims.length !== 1) throw new Error('Input "bias" is expected to have 1 dimension');
      if (r && r.dims.length === 5 && r.dims[3] === 2) throw new Error("bias is not allowed for packed kv.");
    }
    let g = m + f, b = 0;
    if (s && x$1.size(s.dims) > 0) {
      b = 8;
      let T = s.dims;
      throw T.length === 1 ? T[0] === l ? b = 1 : T[0] === 3 * l + 2 && (b = 3) : T.length === 2 && T[0] === l && T[1] === g && (b = 5), b === 8 ? new Error('Input "key_padding_mask" shape shall be (batch_size) or (batch_size, total_sequence_length)') : new Error("Mask not supported");
    }
    let w = false, v = p;
    if (o && x$1.size(o.dims) > 0) {
      if (o.dims.length !== 3 && o.dims.length !== 4) throw new Error('Input "value" is expected to have 3 or 4 dimensions');
      if (n.dims[0] !== o.dims[0]) throw new Error('Input "query" and "value" shall have same dim 0 (batch_size)');
      if (o.dims.length === 3) {
        if (f !== o.dims[1]) throw new Error('Input "key" and "value" shall have the same dim 1 (kv_sequence_length)');
        v = o.dims[2];
      } else {
        if (f !== o.dims[2]) throw new Error('Input "key" and "value" shall have the same dim 2 (kv_sequence_length)');
        v = o.dims[1] * o.dims[3], w = true;
      }
    }
    let $ = false;
    if (s && x$1.size(s.dims) > 0) throw new Error("Key padding mask is not supported");
    if (a && x$1.size(a.dims) > 0) {
      if (a.dims.length !== 4) throw new Error('Input "attention_bias" is expected to have 4 dimensions');
      if (a.dims[0] !== l || a.dims[1] !== t.numHeads || a.dims[2] !== c || a.dims[3] !== g) throw new Error('Expect "attention_bias" shape (batch_size, num_heads, sequence_length, total_sequence_length)');
    }
    return { batchSize: l, sequenceLength: c, pastSequenceLength: m, kvSequenceLength: f, totalSequenceLength: g, maxSequenceLength: h, inputHiddenSize: 0, hiddenSize: p, vHiddenSize: v, headSize: _, vHeadSize: Math.floor(v / t.numHeads), numHeads: t.numHeads, isUnidirectional: false, pastPresentShareBuffer: false, maskFilterValue: t.maskFilterValue, maskType: b, scale: t.scale, broadcastResPosBias: $, passPastInKv: w, qkvFormat: y };
  }, da = (e) => L({ ...e }), ua = L({ perm: [0, 2, 1, 3] }), nc = (e, t, n, r, o, i, s) => {
    let a = [r, o, i], u = x$1.size(a), d = [{ type: 12, data: u }, { type: 12, data: s }, { type: 12, data: i }], l = (c) => {
      let p = C("qkv_with_bias", t.dataType, a), f = S("qkv", t.dataType, a), m = S("bias", n.dataType, a), h = [{ name: "output_size", type: "u32" }, { name: "bias_offset", type: "u32" }, { name: "hidden_size", type: "u32" }];
      return `
  ${c.registerUniforms(h).declareVariables(f, m, p)}
  ${c.mainStart()}
    ${c.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    let bias_offset_idx = (global_idx % uniforms.hidden_size) + uniforms.bias_offset;

    qkv_with_bias[global_idx] = qkv[global_idx] + bias[bias_offset_idx];
  }`;
    };
    return e.compute({ name: "MultiHeadAttentionAddBias", shaderCache: { inputDependencies: ["type", "type"] }, getRunData: () => ({ outputs: [{ dims: a, dataType: t.dataType, gpuDataType: 0 }], dispatchGroup: { x: Math.ceil(u / 64) }, programUniforms: d }), getShaderSource: l }, { inputs: [t, n], outputs: [-1] })[0];
  }, _t = (e, t, n, r, o, i, s, a) => {
    let u = i;
    if (s && x$1.size(s.dims) > 0) {
      if (r === 1) throw new Error("AddBiasReshape is not implemented. Please export your model with packed QKV or KV");
      return u = nc(e, i, s, t, r, n * o, a), u = u.reshape([t, r, n, o]), n === 1 || r === 1 ? u : e.compute(me(u, ua.perm), { inputs: [u], outputs: [-1] })[0];
    } else return i.dims.length === 3 && (u = i.reshape([t, r, n, o])), n === 1 || r === 1 ? u : e.compute(me(u, ua.perm), { inputs: [u], outputs: [-1] })[0];
  }, la = (e, t) => {
    let n = tc(e.inputs, t), r = e.inputs[0], o = be(e.inputs, 1), i = be(e.inputs, 2), s = be(e.inputs, 3), a = be(e.inputs, 4), u = be(e.inputs, 5), d = be(e.inputs, 6), l = be(e.inputs, 7);
    if (r.dims.length === 5) throw new Error("Packed QKV is not implemented");
    if (o?.dims.length === 5) throw new Error("Packed KV is not implemented");
    let c = o && i && o.dims.length === 4 && i.dims.length === 4, p = _t(e, n.batchSize, n.numHeads, n.sequenceLength, n.headSize, r, s, 0);
    if (c) return it(e, p, o, i, a, void 0, d, l, u, n);
    if (!o || !i) throw new Error("key and value must be provided");
    let f = _t(e, n.batchSize, n.numHeads, n.kvSequenceLength, n.headSize, o, s, n.hiddenSize), m = _t(e, n.batchSize, n.numHeads, n.kvSequenceLength, n.vHeadSize, i, s, 2 * n.hiddenSize);
    it(e, p, f, m, a, void 0, d, l, u, n);
  };
});
var rc, oc, ic, sc, ur, ca, pa, dr = k(() => {
  N();
  H();
  ue();
  F();
  rc = (e) => {
    if (!e || e.length < 1) throw new Error("too few inputs");
  }, oc = (e, t) => {
    let n = [], r = t.numOutputs;
    return e[1].dims[0] > 0 && (e[1].getBigInt64Array().forEach((o) => n.push(Number(o))), r = n.length), L({ numOutputs: r, axis: t.axis, splitSizes: n });
  }, ic = (e) => `
fn calculateOutputIndex(index: u32) -> u32 {
    for (var i: u32 = 0u; i < ${e}u; i += 1u ) {
    if (index < ${D("uniforms.size_in_split_axis", "i", e)}) {
        return i;
    }
    }
    return ${e}u;
}`, sc = (e) => {
    let t = e.length, n = [];
    for (let r = 0; r < t; ++r) {
      let o = e[r].setByIndices("indices", "input[global_idx]");
      t === 1 ? n.push(o) : r === 0 ? n.push(`if (output_number == ${r}u) { ${o} }`) : r === t - 1 ? n.push(`else { ${o} }`) : n.push(`else if (output_number == ${r}) { ${o} }`);
    }
    return `
      fn writeBufferData(output_number: u32, indices: ${e[0].type.indices}, global_idx: u32) {
        ${n.join(`
`)}
      }`;
  }, ur = (e, t) => {
    let n = e[0].dims, r = x$1.size(n), o = e[0].dataType, i = x$1.normalizeAxis(t.axis, n.length), s = new Array(t.numOutputs), a = S("input", o, n.length), u = new Array(t.numOutputs), d = [], l = [], c = 0, p = [{ type: 12, data: r }];
    for (let m = 0; m < t.numOutputs; m++) {
      c += t.splitSizes[m], u[m] = c;
      let h = n.slice();
      h[i] = t.splitSizes[m], l.push(h), s[m] = C(`output${m}`, o, h.length), d.push({ dims: l[m], dataType: e[0].dataType });
    }
    p.push({ type: 12, data: u }, ...P(n, ...l));
    let f = (m) => `
  ${m.registerUniform("input_size", "u32").registerUniform("size_in_split_axis", "u32", u.length).declareVariables(a, ...s)}
  ${ic(u.length)}
  ${sc(s)}

  ${m.mainStart()}
    ${m.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.input_size")}

    var indices = ${a.offsetToIndices("global_idx")};
    var index = ${a.indicesGet("indices", i)};
    let output_number = calculateOutputIndex(index);
    if (output_number != 0) {
      index -= ${D("uniforms.size_in_split_axis", "output_number - 1u", u.length)};
      ${a.indicesSet("indices", i, "index")};
    }
    writeBufferData(output_number, indices, global_idx);
  }`;
    return { name: "Split", shaderCache: { hint: t.cacheKey, inputDependencies: ["rank"] }, getShaderSource: f, getRunData: () => ({ outputs: d, dispatchGroup: { x: Math.ceil(r / 64) }, programUniforms: p }) };
  }, ca = (e, t) => {
    rc(e.inputs);
    let n = e.inputs.length === 1 ? t : oc(e.inputs, t);
    e.compute(ur(e.inputs, n), { inputs: [0] });
  }, pa = (e) => {
    let t = e.axis, n = e.splitSizes, r = e.numOutputs < 0 ? n.length : e.numOutputs;
    if (r !== n.length) throw new Error("numOutputs and splitSizes length must be equal");
    return L({ axis: t, numOutputs: r, splitSizes: n });
  };
});
var ac, pn, ma, lr = k(() => {
  N();
  H();
  ue();
  F();
  ac = (e, t) => {
    let [n, r, o, i] = e, { numHeads: s, rotaryEmbeddingDim: a } = t;
    if (n.dims.length !== 3 && n.dims.length !== 4) throw new Error(`Input 'x' is expected to have 3 or 4 dimensions, got ${n.dims.length}`);
    if (!x$1.areEqual(r.dims, []) && !x$1.areEqual(r.dims, [1]) && r.dims.length !== 2) throw new Error(`Input 'position_ids' is expected to have 0, 1, or 2 dimensions, got ${r.dims.length}`);
    if (o.dims.length !== 2) throw new Error(`Input 'cos_cache' is expected to have 2 dimensions, got ${o.dims.length}`);
    if (i.dims.length !== 2) throw new Error(`Input 'sin_cache' is expected to have 2 dimensions, got ${i.dims.length}`);
    if (!x$1.areEqual(o.dims, i.dims)) throw new Error("Inputs 'cos_cache' and 'sin_cache' are expected to have the same shape");
    if (a > 0 && s === 0) throw new Error("num_heads must be provided if rotary_embedding_dim is specified");
    let u = n.dims[0], d = n.dims[n.dims.length - 2], l = o.dims[0], c = x$1.sizeFromDimension(n.dims, 1) / d, p = a === 0 ? o.dims[1] * 2 : c / s;
    if (a > p) throw new Error("rotary_embedding_dim must be less than or equal to head_size");
    if (r.dims.length === 2) {
      if (u !== r.dims[0]) throw new Error(`Input 'position_ids' dimension 0 should be of size batch_size, got ${r.dims[0]}`);
      if (d !== r.dims[1]) throw new Error(`Input 'position_ids' dimension 1 should be of size sequence_length, got ${r.dims[1]}`);
    }
    if (d > l) throw new Error("Updating cos_cache and sin_cache in RotaryEmbedding is not currently supported");
    if (p / 2 !== o.dims[1] && a / 2 !== o.dims[1]) throw new Error(`Input 'cos_cache' dimension 1 should be same as head_size / 2 or rotary_embedding_dim / 2, got ${o.dims[1]}`);
  }, pn = (e, t) => {
    let { interleaved: n, numHeads: r, rotaryEmbeddingDim: o, scale: i } = t, s = e[0].dims[0], a = x$1.sizeFromDimension(e[0].dims, 1), u = e[0].dims[e[0].dims.length - 2], d = a / u, l = e[2].dims[1], c = o === 0 ? l * 2 : d / r, p = new Array(s, u, d / c, c - l), f = x$1.computeStrides(p), m = [{ type: 1, data: i }, { type: 12, data: p }, { type: 12, data: f }, ...e[0].dims.length === 3 ? new Array({ type: 12, data: [a, d, c, 1] }) : [], ...e[0].dims.length === 4 ? new Array({ type: 12, data: [a, c, u * c, 1] }) : [], ...P(e[0].dims, e[1].dims, e[2].dims, e[3].dims, e[0].dims)], h = (_) => {
      let y = S("input", e[0].dataType, e[0].dims.length), g = S("position_ids", e[1].dataType, e[1].dims.length), b = S("cos_cache", e[2].dataType, e[2].dims.length), w = S("sin_cache", e[3].dataType, e[3].dims.length), v = C("output", e[0].dataType, e[0].dims.length);
      return _.registerUniforms([{ name: "scale", type: "f32" }, { name: "global_shape", type: "u32", length: p.length }, { name: "global_strides", type: "u32", length: f.length }, { name: "input_output_strides", type: "u32", length: f.length }]), `
        ${_.declareVariables(y, g, b, w, v)}

        ${_.mainStart(Je)}
          let half_rotary_emb_dim = uniforms.${b.name}_shape[1];
          let bsnh = global_idx / uniforms.global_strides % uniforms.global_shape;
          let size = uniforms.global_shape[0] * uniforms.global_strides[0];
          ${_.guardAgainstOutOfBoundsWorkgroupSizes("size")}

          if (bsnh[3] < half_rotary_emb_dim) {
            let position_ids_idx =
                ${g.broadcastedIndicesToOffset("bsnh.xy", C("", g.type.tensor, 2))};
            let position_id =
                u32(${g.getByOffset("position_ids_idx")}) + select(0, bsnh[1], position_ids_idx == 0);
            let i = dot(bsnh, uniforms.input_output_strides) + select(0, bsnh[3], ${n});
            let j = i + select(half_rotary_emb_dim, 1, ${n});
            let re = ${y.getByOffset("i")} * ${b.get("position_id", "bsnh[3]")} -
                ${y.getByOffset("j")} * ${w.get("position_id", "bsnh[3]")};
            ${v.setByOffset("i", "re")}
            let im = ${y.getByOffset("i")} * ${w.get("position_id", "bsnh[3]")} +
                ${y.getByOffset("j")} * ${b.get("position_id", "bsnh[3]")};
            ${v.setByOffset("j", "im")}
          } else {
            let k = dot(bsnh, uniforms.input_output_strides) + half_rotary_emb_dim;
            ${v.setByOffset("k", y.getByOffset("k"))}
          }
        }`;
    };
    return { name: "RotaryEmbedding", shaderCache: { hint: L({ interleaved: n }).cacheKey, inputDependencies: ["rank", "rank", "rank", "rank"] }, getShaderSource: h, getRunData: () => ({ outputs: [{ dims: e[0].dims, dataType: e[0].dataType }], dispatchGroup: { x: Math.ceil(x$1.size(p) / Je) }, programUniforms: m }) };
  }, ma = (e, t) => {
    ac(e.inputs, t), e.compute(pn(e.inputs, t));
  };
});
var uc, dc, fa, lc, ha, ga = k(() => {
  ue();
  N();
  tn();
  ar();
  dr();
  Re();
  lr();
  F();
  uc = (e, t) => {
    if (t.doRotary && e.length <= 7) throw new Error("cos_cache and sin_cache inputs are required if do_rotary is specified");
    let n = e[0], r = e[1], o = e[2], i = e[3], s = e[4];
    if (t.doRotary !== 0 && e.length <= 7) throw new Error("cos_cast and sin_cache are expected if do_rotary attribute is non-zero");
    if (t.localWindowSize !== -1) throw new Error("Local attention is not supported");
    if (t.softcap !== 0) throw new Error("Softcap is not supported");
    if (t.rotaryInterleaved !== 0) throw new Error("Rotary interleaved is not supported");
    if (t.smoothSoftmax) throw new Error("Smooth softmax is not supported");
    if (n.dims.length !== 3 && n.dims.length !== 5) throw new Error("Input query is expected to have 3 or 5 dimensions");
    let a = false, u = n.dims[0], d = n.dims[1], l = n.dims.length === 3 ? a ? n.dims[2] / 3 : n.dims[2] : t.numHeads * n.dims[4], c = d, p = 0, f = !r || r.dims.length === 0, m = Math.floor(f ? l / (t.numHeads + 2 * t.kvNumHeads) : l / t.numHeads);
    f && (l = m * t.numHeads);
    let h = i && i.dims.length !== 0, _ = s && s.dims.length !== 0;
    if (h && i.dims.length === 4 && i.dims[0] === u && i.dims[1] !== t.kvNumHeads && i.dims[2] === t.kvNumHeads && i.dims[3] === m) throw new Error("BSNH pastKey/pastValue is not supported");
    if (h && _) {
      if (i.dims.length !== 4) throw new Error('Input "past_key" is expected to have 4 dimensions');
      if (s.dims.length !== 4) throw new Error('Input "past_value" is expected to have 4 dimensions');
      p = i.dims[2];
    } else if (h || _) throw new Error('Input "past_key" and "past_value" shall be both present or both absent');
    let g = 1;
    if (r && r.dims.length > 0) {
      if (n.dims.length !== 3) throw new Error('Input "query" is expected to have 3 dimensions when key is given');
      if (r.dims.length < 3 || r.dims.length > 5) throw new Error('Input "key" is expected to have 3, 4, or 5 dimensions');
      if (n.dims[0] !== r.dims[0]) throw new Error('Input "query" and "key" shall have same dim 0 (batch size)');
      if (r.dims.length === 3) {
        if (n.dims[2] % r.dims[2] !== 0) throw new Error('Dimension 2 of "query" should be a multiple of "key"');
        c = r.dims[1];
      } else if (r.dims.length === 5) {
        if (r.dims[2] !== t.numHeads || r.dims[3] !== 2 || r.dims[4] !== m) throw new Error('Expect "key" shape (batch_size, kv_sequence_length, num_heads, 2, head_size) for packed kv');
        if (o) throw new Error('Expect "value" be none when "key" has packed kv format.');
        c = r.dims[1];
      } else {
        if (r.dims[1] !== t.numHeads || r.dims[3] !== m) throw new Error('Expect "key" shape (batch_size, num_heads, kv_sequence_length, head_size) for past_key');
        c = r.dims[2];
      }
    } else {
      if (n.dims.length !== 3 && n.dims.length !== 5) throw new Error('Input "query" is expected to have 3 or 5 dimensions when key is empty');
      if (n.dims.length === 5 && (n.dims[2] !== t.numHeads || n.dims[3] !== 3)) throw new Error('Expect "query" shape (batch_size, kv_sequence_length, num_heads, 3, head_size) for packed kv');
      g = 3;
    }
    let b = 0, w = false, v = t.kvNumHeads ? m * t.kvNumHeads : l;
    if (o && o.dims.length > 0) {
      if (o.dims.length !== 3 && o.dims.length !== 4) throw new Error('Input "value" is expected to have 3 or 4 dimensions');
      if (n.dims[0] !== o.dims[0]) throw new Error('Input "query" and "value" shall have same dim 0 (batch_size)');
      if (o.dims.length === 3) {
        if (c !== o.dims[1]) throw new Error('Input "key" and "value" shall have the same dim 1 (kv_sequence_length)');
        v = o.dims[2];
      } else {
        if (c !== o.dims[2]) throw new Error('Input "past_key" and "past_value" shall have the same dim 2 (kv_sequence_length)');
        v = o.dims[1] * o.dims[3], w = true;
      }
    }
    let $ = e.length > 4 ? e[5] : void 0;
    if ($) {
      if ($.dims.length === 0) throw new Error("seqlens_k must be at least 1D, got scalar.");
      let z = $.dims.reduce((M, O) => M * O, 1);
      if (z !== u) throw new Error(`seqlens_k must have batch_size (${u}) elements, got ${z}.`);
      for (let M = 0; M < $.dims.length; M++) if ($.dims[M] !== 1 && $.dims[M] !== u) throw new Error(`seqlens_k has unexpected shape. Each dimension must be 1 or batch_size (${u}), got dims[${M}] = ${$.dims[M]}.`);
    }
    return { batchSize: u, sequenceLength: d, pastSequenceLength: p, kvSequenceLength: c, totalSequenceLength: -1, maxSequenceLength: -1, inputHiddenSize: 0, hiddenSize: l, vHiddenSize: v, headSize: m, vHeadSize: Math.floor(v / t.kvNumHeads), numHeads: t.numHeads, kvNumHeads: t.kvNumHeads, nReps: t.numHeads / t.kvNumHeads, pastPresentShareBuffer: false, maskType: b, scale: t.scale, broadcastResPosBias: false, passPastInKv: w, qkvFormat: g };
  }, dc = L({ perm: [0, 2, 1, 3] }), fa = (e, t, n) => {
    let r = t, o = n.kvNumHeads;
    return t.dims.length === 3 && n.kvSequenceLength !== 0 && (r = t.reshape([n.batchSize, n.kvSequenceLength, o, n.headSize]), r = e.compute(me(r, dc.perm), { inputs: [r], outputs: [-1] })[0]), r;
  }, lc = (e, t, n, r) => {
    let o = 7, i = ["type", "type"], s = [e * t], a = e * t, u = [{ type: 12, data: a }, { type: 12, data: t }, { type: 12, data: e }], d = (l) => {
      let c = S("seq_lens", n.dataType, n.dims), p = S("total_seq_lens", r.dataType, r.dims), f = C("pos_ids", o, s), m = [{ name: "output_size", type: "u32" }, { name: "sequence_length", type: "u32" }, { name: "batch_size", type: "u32" }];
      return `
  ${l.registerUniforms(m).declareVariables(c, p, f)}
  ${l.mainStart()}
    ${l.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    let total_sequence_length = u32(${p.getByOffset("0")});
    let is_subsequent_prompt = uniforms.sequence_length > 1 && uniforms.sequence_length != total_sequence_length;
    let is_first_prompt = !is_subsequent_prompt && uniforms.sequence_length == total_sequence_length;
    let batch_idx = global_idx / uniforms.sequence_length;
    let sequence_idx = i32(global_idx % uniforms.sequence_length);
    var pos_id: i32 = 0;
    let seqlen = ${c.getByOffset("batch_idx")};
    let total_seqlen = seqlen + 1;
    if (is_first_prompt) {
      if (sequence_idx < total_seqlen) {
        pos_id = sequence_idx;
      } else {
        pos_id = 1;
      }
      ${f.setByOffset("global_idx", "pos_id")}
    } else if (is_subsequent_prompt) {
      let past_seqlen = total_seqlen - i32(uniforms.sequence_length);
      if (past_seqlen + sequence_idx < total_seqlen) {
        pos_id = past_seqlen + sequence_idx;
      } else {
        pos_id = 1;
      }
      ${f.setByOffset("global_idx", "pos_id")}
    } else if (global_idx < uniforms.batch_size) {
      ${f.setByOffset("global_idx", "seqlen")}
    };
  }
  `;
    };
    return { name: "GeneratePositionIds", shaderCache: { hint: `${e};${t}`, inputDependencies: i }, getRunData: () => ({ outputs: [{ dims: s, dataType: o }], dispatchGroup: { x: Math.ceil(a / 64) }, programUniforms: u }), getShaderSource: d };
  }, ha = (e, t) => {
    let n = uc(e.inputs, t);
    if (e.inputs[0].dims.length === 5) throw new Error("Packed QKV is not implemented");
    if (e.inputs[1]?.dims.length === 5) throw new Error("Packed KV is not implemented");
    let r = e.inputs[0], o = e.inputs[1] && e.inputs[1].dims.length > 0 ? e.inputs[1] : void 0, i = e.inputs[2] && e.inputs[2].dims.length > 0 ? e.inputs[2] : void 0, s = e.inputs[3] && e.inputs[3].dims.length !== 0 ? e.inputs[3] : void 0, a = e.inputs[4] && e.inputs[4].dims.length !== 0 ? e.inputs[4] : void 0, u = e.inputs.length > 4 ? e.inputs[5] : void 0, d = e.inputs.length > 5 ? e.inputs[6] : void 0, l = n.kvNumHeads ? n.kvNumHeads : n.numHeads, c = L({ axis: 2, numOutputs: 3, splitSizes: [n.numHeads * n.headSize, l * n.headSize, l * n.headSize] }), [p, f, m] = !o && !i ? e.compute(ur([r], c), { inputs: [r], outputs: [-1, -1, -1] }) : [r, o, i], h, _;
    if (t.doRotary) {
      let w = e.compute(lc(n.batchSize, n.sequenceLength, u, d), { inputs: [u, d], outputs: [-1] })[0], v = e.inputs[7], $ = e.inputs[8], T = L({ interleaved: t.rotaryInterleaved !== 0, numHeads: n.numHeads, rotaryEmbeddingDim: 0, scale: t.scale }), I = [p, w, v, $], E = [-1];
      h = e.compute(pn(I, T), { inputs: I, outputs: E })[0], I.splice(0, 1, f);
      let z = L({ interleaved: t.rotaryInterleaved !== 0, numHeads: n.kvNumHeads, rotaryEmbeddingDim: 0, scale: t.scale });
      _ = e.compute(pn(I, z), { inputs: I, outputs: E })[0];
    }
    let y = _t(e, n.batchSize, n.numHeads, n.sequenceLength, n.headSize, t.doRotary ? h : p, void 0, 0), g = fa(e, t.doRotary ? _ : f, n), b = fa(e, m, n);
    it(e, y, g, b, void 0, void 0, s, a, void 0, n, u, d);
  };
});
var ya, cc, pc, ba, _a$1 = k(() => {
  N();
  H();
  Re();
  F();
  ya = (e, t, n, r, o, i, s, a) => {
    let u = J(i), d = u === 1 ? "f32" : `vec${u}f`, l = u === 1 ? "vec2f" : `mat2x${u}f`, c = o * s, p = 64;
    c === 1 && (p = 256);
    let f = [o, s, i / u], m = [o, s, 2], h = ["rank", "type", "type"], _ = [];
    _.push(...P(f, m));
    let y = (g) => {
      let b = S("x", t.dataType, 3, u), w = S("scale", n.dataType, n.dims), v = S("bias", r.dataType, r.dims), $ = C("output", 1, 3, 2), T = [b, w, v, $];
      return `
  var<workgroup> workgroup_shared : array<${l}, ${p}>;
  const workgroup_size = ${p}u;
  ${g.declareVariables(...T)}
  ${g.mainStart(p)}
    let batch = workgroup_index / uniforms.x_shape[1];
    let channel = workgroup_index % uniforms.x_shape[1];
    let hight = uniforms.x_shape[2];
    // initialize workgroup memory
    var sum = ${d}(0);
    var squared_sum = ${d}(0);
    for (var h = local_idx; h < hight; h += workgroup_size) {
      let value = ${d}(${b.get("batch", "channel", "h")});
      sum += value;
      squared_sum += value * value;
    }
    workgroup_shared[local_idx] = ${l}(sum, squared_sum);
    workgroupBarrier();

    for (var currSize = workgroup_size >> 1;  currSize > 0; currSize = currSize >> 1) {
      if (local_idx < currSize) {
        workgroup_shared[local_idx] = workgroup_shared[local_idx] + workgroup_shared[local_idx + currSize];
      }
      workgroupBarrier();
    }
    if (local_idx == 0) {
      let sum_final = ${Ie("workgroup_shared[0][0]", u)} / f32(hight * ${u});
      let squared_sum_final = ${Ie("workgroup_shared[0][1]", u)} / f32(hight * ${u});

      let inv_std_dev = inverseSqrt(squared_sum_final - sum_final * sum_final + f32(${a}));
      let channel_scale = inv_std_dev * f32(scale[channel]);
      let channel_shift = f32(bias[channel]) - sum_final * channel_scale;
      output[workgroup_index] = vec2f(channel_scale, channel_shift);
    }
  }`;
    };
    return e.compute({ name: "InstanceNormComputeChannelScaleShift", shaderCache: { hint: `${u};${a};${p}`, inputDependencies: h }, getRunData: () => ({ outputs: [{ dims: m, dataType: 1 }], dispatchGroup: { x: c }, programUniforms: _ }), getShaderSource: y }, { inputs: [t, n, r], outputs: [-1] })[0];
  }, cc = (e, t, n) => {
    let r = t[0].dims, o = r, i = 2, s = r[0], a = r[1], u = x$1.sizeFromDimension(r, i), d = J(u), l = x$1.size(o) / d, c = ya(e, t[0], t[1], t[2], s, u, a, n.epsilon), p = [s, a, u / d], f = [s, a], m = ["type", "none"], h = (_) => {
      let y = S("x", t[0].dataType, p.length, d), g = S("scale_shift", 1, f.length, 2), b = C("output", t[0].dataType, p.length, d), w = [y, g, b];
      return `
  ${_.registerUniform("output_size", "u32").declareVariables(...w)}
  ${_.mainStart()}
  ${_.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
      let outputIndices = ${b.offsetToIndices("global_idx")};
      let batch = outputIndices[0];
      let channel = outputIndices[1];
      let scale_shift = ${g.getByIndices("vec2<u32>(batch, channel)")};
      let value = ${y.getByOffset("global_idx")} * ${b.type.value}(scale_shift.x) + ${b.type.value}(scale_shift.y);
      ${b.setByOffset("global_idx", "value")};
  }`;
    };
    e.compute({ name: "InstanceNormalization", shaderCache: { hint: `${d}`, inputDependencies: m }, getRunData: () => ({ outputs: [{ dims: o, dataType: t[0].dataType }], dispatchGroup: { x: Math.ceil(l / 64) }, programUniforms: [{ type: 12, data: l }, ...P(p, f, p)] }), getShaderSource: h }, { inputs: [t[0], c] });
  }, pc = (e, t, n) => {
    let r = t[0].dims, o = r, i = r[0], s = r[r.length - 1], a = x$1.sizeFromDimension(r, 1) / s, u = J(s), d = x$1.size(o) / u, l = [{ type: 12, data: a }, { type: 12, data: Math.floor(s / u) }], c = ["type", "type"], p = false, f = [0, r.length - 1];
    for (let y = 0; y < r.length - 2; y++) p = p || r[y + 1] !== 1, f.push(y + 1);
    p = p && r[r.length - 1] !== 1;
    let m = p ? e.compute(me(e.inputs[0], f), { inputs: [e.inputs[0]], outputs: [-1] })[0] : e.inputs[0].reshape(Array.from({ length: r.length }, (y, g) => r[f[g]])), h = ya(e, m, t[1], t[2], i, a, s, n.epsilon), _ = (y) => {
      let g = re(t[0].dataType), b = u === 1 ? "vec2f" : `mat${u}x2f`, w = (T) => {
        let I = T === 0 ? "x" : "y", E = u === 1 ? "f32" : `vec${u}f`;
        switch (u) {
          case 1:
            return `${g}(${E}(scale.${I}))`;
          case 2:
            return `vec2<${g}>(${E}(scale[0].${I}, scale[1].${I}))`;
          case 4:
            return `vec4<${g}>(${E}(scale[0].${I}, scale[1].${I}, scale[2].${I}, scale[3].${I}))`;
          default:
            throw new Error(`Not supported compoents ${u}`);
        }
      }, v = S("input", t[0].dataType, t[0].dims, u), $ = C("output", t[0].dataType, o, u);
      return `
  @group(0) @binding(0) var<storage, read> input : array<${v.type.storage}>;
  @group(0) @binding(1) var<storage, read> scale_input : array<${b}>;
  @group(0) @binding(2) var<storage, read_write> output : array<${$.type.storage}>;
  struct Uniforms {H: u32, C : u32};
  @group(0) @binding(3) var<uniform> uniforms: Uniforms;

  ${y.mainStart()}
    let current_image_number = global_idx / (uniforms.C * uniforms.H);
    let current_channel_number = global_idx % uniforms.C;

    let scale_offset = current_image_number * uniforms.C + current_channel_number;
    let scale = scale_input[scale_offset];
    output[global_idx] = fma(input[global_idx], ${w(0)}, ${w(1)});
  }`;
    };
    e.compute({ name: "InstanceNormalizationNHWC", shaderCache: { hint: `${u}`, inputDependencies: c }, getRunData: () => ({ outputs: [{ dims: o, dataType: t[0].dataType }], dispatchGroup: { x: Math.ceil(d / 64) }, programUniforms: l }), getShaderSource: _ }, { inputs: [t[0], h] });
  }, ba = (e, t) => {
    t.format === "NHWC" ? pc(e, e.inputs, t) : cc(e, e.inputs, t);
  };
});
var mc, fc, wa, $a = k(() => {
  N();
  H();
  F();
  mc = (e) => {
    if (!e || e.length < 2) throw new Error("layerNorm requires at least 2 inputs.");
  }, fc = (e, t, n) => {
    let r = t.simplified, o = e[0].dims, i = e[1], s = !r && e[2], a = o, u = x$1.normalizeAxis(t.axis, o.length), d = x$1.sizeToDimension(o, u), l = x$1.sizeFromDimension(o, u), c = x$1.size(i.dims), p = s ? x$1.size(s.dims) : 0;
    if (c !== l || s && p !== l) throw new Error(`Size of X.shape()[axis:] == ${l}.
       Size of scale and bias (if provided) must match this.
       Got scale size of ${c} and bias size of ${p}`);
    let f = [];
    for (let v = 0; v < o.length; ++v) v < u ? f.push(o[v]) : f.push(1);
    let m = J(l), h = ["type", "type"], _ = [{ type: 12, data: d }, { type: 1, data: l }, { type: 12, data: Math.floor(l / m) }, { type: 1, data: t.epsilon }];
    s && h.push("type");
    let y = n > 1, g = n > 2, b = (v) => {
      let $ = re(e[0].dataType), T = [S("x", e[0].dataType, e[0].dims, m), S("scale", i.dataType, i.dims, m)];
      s && T.push(S("bias", s.dataType, s.dims, m)), T.push(C("output", e[0].dataType, a, m)), y && T.push(C("mean_data_output", 1, f)), g && T.push(C("inv_std_output", 1, f));
      let I = [{ name: "norm_count", type: "u32" }, { name: "norm_size", type: "f32" }, { name: "norm_size_vectorized", type: "u32" }, { name: "epsilon", type: "f32" }];
      return `
  ${v.registerUniforms(I).declareVariables(...T)}
  ${v.mainStart()}
    ${v.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.norm_count")}
    let offset = global_idx * uniforms.norm_size_vectorized;
    var mean_vector = ${Fn("f32", m)};
    var mean_square_vector = ${Fn("f32", m)};

    for (var h: u32 = 0u; h < uniforms.norm_size_vectorized; h++) {
      let value = ${et$1($, m, "x[h + offset]")};
      mean_vector += value;
      mean_square_vector += value * value;
    }
    let mean = ${Ie("mean_vector", m)} / uniforms.norm_size;
    let inv_std_dev = inverseSqrt(${Ie("mean_square_vector", m)} / uniforms.norm_size ${r ? "" : "- mean * mean"} + uniforms.epsilon);

    for (var j: u32 = 0; j < uniforms.norm_size_vectorized; j++) {
      let f32input = ${et$1($, m, "x[j + offset]")};
      let f32scale = ${et$1($, m, "scale[j]")};
      output[j + offset] = ${T[0].type.value}((f32input ${r ? "" : "- mean"}) * inv_std_dev * f32scale
        ${s ? `+ ${et$1($, m, "bias[j]")}` : ""}
      );
    }

    ${y ? "mean_data_output[global_idx] = mean" : ""};
    ${g ? "inv_std_output[global_idx] = inv_std_dev" : ""};
  }`;
    }, w = [{ dims: a, dataType: e[0].dataType }];
    return y && w.push({ dims: f, dataType: 1 }), g && w.push({ dims: f, dataType: 1 }), { name: "LayerNormalization", shaderCache: { hint: `${m};${n};${r}`, inputDependencies: h }, getRunData: () => ({ outputs: w, dispatchGroup: { x: Math.ceil(d / 64) }, programUniforms: _ }), getShaderSource: b };
  }, wa = (e, t) => {
    mc(e.inputs), e.compute(fc(e.inputs, t, e.outputCount));
  };
});
var hc, va, xa = k(() => {
  H();
  un();
  dn();
  hc = (e) => {
    if (!e || e.length !== 2) throw new Error("MatMul requires 2 inputs.");
    if (e[0].dims[e[0].dims.length - 1] !== e[1].dims[e[1].dims.length - 2]) throw new Error("shared dimension does not match.");
  }, va = (e) => {
    hc(e.inputs);
    let t = ze.calcShape(e.inputs[0].dims, e.inputs[1].dims, true);
    if (!t) throw new Error("Can't use matmul on the given tensors");
    let n = t[t.length - 1], r = e.inputs[0].dims[e.inputs[0].dims.length - 1];
    if (n < 8 && r < 8) e.compute(an(e.inputs, { activation: "" }, t));
    else {
      let o = t[t.length - 2], i = x$1.size(e.inputs[0].dims.slice(0, -2)), s = x$1.size(e.inputs[1].dims.slice(0, -2));
      if (i !== 1 && o === 1 && s === 1) {
        let a = e.inputs[0].reshape([1, i, r]), u = e.inputs[1].reshape([1, r, n]), d = [1, i, n], l = [a, u];
        e.compute(bt(l, { activation: "" }, t, d), { inputs: l });
      } else e.compute(bt(e.inputs, { activation: "" }, t));
    }
  };
});
var gc, yc, bc, Sa, Ta, Ia = k(() => {
  N();
  H();
  ue();
  F();
  gc = (e, t) => {
    if (e.length < 3 || e.length > 4) throw new Error("MatMulNBits requires 3 or 4 inputs");
    let n = e[0], r = n.dims.length;
    if (n.dims[r - 1] !== t.k) throw new Error("The last dim of input shape does not match the k value");
    let o = Math.floor((t.k + t.blockSize - 1) / t.blockSize), i = t.blockSize / 8 * t.bits, s = e[1];
    if (!x$1.areEqual(s.dims, [t.n, o, i])) throw new Error("The second inputs must be 3D tensor with shape N X nBlocksPerCol X blobSize");
    let u = e[2].dims;
    if (x$1.size(u) !== t.n * o) throw new Error("scales input size error.");
    if (e.length === 4) {
      let l = e[3].dims, c = t.n * (t.bits === 8 ? o : Math.floor((o * t.bits + 7) / 8));
      if (x$1.size(l) !== c) throw new Error("zeroPoints input size error.");
    }
  }, yc = (e, t) => {
    let n = e[0].dims, r = n.length, o = n[r - 2], i = t.k, s = t.n, a = n.slice(0, r - 2), u = x$1.size(a), l = e[1].dims[2] / 4, c = e[0].dataType, p = J(t.k), f = J(l), m = J(s), h = a.concat([o, s]), _ = o > 1 && s / m % 2 === 0 ? 2 : 1, y = x$1.size(h) / m / _, g = 64, b = [], w = [u, o, i / p], v = x$1.convertShape(e[1].dims).slice();
    v.splice(-1, 1, l / f), b.push(...P(w)), b.push(...P(v)), b.push(...P(e[2].dims)), e.length === 4 && b.push(...P(x$1.convertShape(e[3].dims)));
    let $ = [u, o, s / m];
    b.push(...P($));
    let T = (I) => {
      let E = w.length, z = S("a", e[0].dataType, E, p), M = S("b", 12, v.length, f), O = S("scales", e[2].dataType, e[2].dims.length), W = [z, M, O], K = e.length === 4 ? S("zero_points", 12, e[3].dims.length) : void 0;
      K && W.push(K);
      let U = $.length, R = C("output", e[0].dataType, U, m), G = re(e[0].dataType), V = (() => {
        switch (p) {
          case 1:
            return `array<${G}, 8>`;
          case 2:
            return `mat4x2<${G}>`;
          case 4:
            return `mat2x4<${G}>`;
          default:
            throw new Error(`${p}-component is not supported.`);
        }
      })(), j = Math.floor(32 / t.bits), Q = Math.floor(j / 8), X = () => {
        let A = "";
        for (let B = 0; B < Q; B++) {
          let oe = B * t.bits * 4, he = oe + t.bits;
          A += `
          // reuse a data (pass ${B})
            var input_offset${B > 0 ? B : ""} = ${B === 0 ? z.indicesToOffset(`${z.type.indices}(batch, row, word_offset)`) : "input_offset"};
            var a_data${B > 0 ? B : ""}: ${V};
            for (var j${B > 0 ? B : ""}: u32 = 0; j${B > 0 ? B : ""} < ${8 / p}; j${B > 0 ? B : ""}++) {
              a_data${B > 0 ? B : ""}[j${B > 0 ? B : ""}] = ${z.getByOffset(`input_offset${B > 0 ? B : ""}`)};
              input_offset${B > 0 ? B : ""}++;
            }
          `;
          for (let ae = 0; ae < m * _; ae++) A += `
            b_value = ${f === 1 ? `b${ae}_data` : `b${ae}_data[i]`};
            ${t.bits === 2 ? `{
              let half_word = b_value >> ${B * 16}u;
              let byte_lo = half_word & 0xFFu;
              let byte_hi = (half_word >> 8u) & 0xFFu;
              let spread_word = (byte_lo & 0xFu) | ((byte_lo >> 4u) << 8u) | ((byte_hi & 0xFu) << 16u) | ((byte_hi >> 4u) << 24u);
              b_value_lower = unpack4xU8(spread_word & b_mask);
              b_value_upper = unpack4xU8((spread_word >> 2u) & b_mask);
            }` : `b_value_lower = unpack4xU8((b_value >> ${oe}u) & b_mask);
            b_value_upper = unpack4xU8((b_value >> ${he}u) & b_mask);`}
            b_quantized_values = ${V}(${Array.from({ length: 4 }, (ge, ie) => `${G}(b_value_lower[${ie}]), ${G}(b_value_upper[${ie}])`).join(", ")});
            b_dequantized_values = ${p === 1 ? `${V}(${Array.from({ length: 8 }, (ge, ie) => `(b_quantized_values[${ie}] - ${K ? `zero_point${ae}` : "zero_point"}) * scale${ae}`).join(", ")});` : `(b_quantized_values - ${V}(${Array(8).fill(`${K ? `zero_point${ae}` : "zero_point"}`).join(",")})) * scale${ae};`};
            workgroup_shared[local_id.x * ${_} + ${Math.floor(ae / m)}]${m > 1 ? `[${ae % m}]` : ""} += ${Array.from({ length: 8 / p }, (ge, ie) => `${p === 1 ? `a_data${B > 0 ? B : ""}[${ie}] * b_dequantized_values[${ie}]` : `dot(a_data${B > 0 ? B : ""}[${ie}], b_dequantized_values[${ie}])`}`).join(" + ")};
          `;
        }
        return A;
      }, Se = () => {
        let A = `
            var col_index = col * ${m};
            ${K ? `
            let zero_point_values_per_byte: u32 = ${Math.floor(8 / t.bits)}u;
            let zero_point_bytes_per_col = (nBlocksPerCol + zero_point_values_per_byte - 1u) / zero_point_values_per_byte;
            var zero_point_byte_count: u32;
            var zero_point_word_index: u32;
            var zero_point_byte_offset: u32;
            let zero_point_sub_offset: u32 = block % zero_point_values_per_byte;
            var zero_point_bits_offset: u32;
            var zero_point_word: u32;` : `
            // The default zero point is ${Math.pow(2, t.bits - 1)} for unsigned ${t.bits}-bit quantization.
            let zero_point = ${G}(${Math.pow(2, t.bits - 1).toFixed(1)});`}
            `;
        for (let B = 0; B < m * _; B++) A += `
            let scale${B} = ${O.getByOffset("col_index * nBlocksPerCol + block")};
            ${K ? `
            zero_point_byte_count = col_index * zero_point_bytes_per_col + (block / zero_point_values_per_byte);
            zero_point_word_index = zero_point_byte_count >> 0x2u;
            zero_point_byte_offset = zero_point_byte_count & 0x3u;
            zero_point_bits_offset = (zero_point_byte_offset << 3) + (zero_point_sub_offset * ${t.bits}u);
            zero_point_word = ${K.getByOffset("zero_point_word_index")} >> zero_point_bits_offset;
            let zero_point${B} = ${G}((zero_point_word) & ${t.bits === 2 ? "0x3u" : "0xFu"});` : ""}
            col_index += 1;`;
        return A;
      }, se = () => {
        let A = `col_index = col * ${m};`;
        for (let B = 0; B < m * _; B++) A += `
            let b${B}_data = ${M.getByIndices(`${M.type.indices}(col_index, block, word)`)};
            col_index += 1;`;
        return A += `
            var b_value: u32;
            let b_mask: u32 = ${t.bits === 2 ? "0x03030303u" : "0x0F0F0F0Fu"};
            var b_value_lower: vec4<u32>;
            var b_value_upper: vec4<u32>;
            var b_quantized_values: ${V};
            var b_dequantized_values: ${V};`, A;
      };
      return `
        var<workgroup> workgroup_shared: array<${R.type.value}, ${_ * g}>;
        ${I.declareVariables(...W, R)}
        ${I.mainStart([g, 1, 1])}
          let output_indices = ${R.offsetToIndices(`(global_idx / ${g}) * ${_}`)};
          let col = output_indices[2];
          let row = output_indices[1];
          let batch = output_indices[0];
          let nBlocksPerCol = uniforms.b_shape[1];

          for (var block = local_id.x; block < nBlocksPerCol; block += ${g}) {
            //process one block
            var word_offset: u32 = block * ${t.blockSize / p};
            ${Se()}
            for (var word: u32 = 0; word < ${l}; word += ${f}) {
              ${se()}
              for (var i: u32 = 0; i < ${f}; i++) {
                ${X()}
                word_offset += ${j / p};
              }
            }
          }
          workgroupBarrier();

          if (local_id.x < ${_}) {
            var output_value: ${R.type.value} = ${R.type.value}(0);
            var workgroup_shared_offset: u32 = local_id.x;
            for (var b: u32 = 0u; b < ${g}u; b++) {
              output_value += workgroup_shared[workgroup_shared_offset];
              workgroup_shared_offset += ${_};
            }
            ${R.setByIndices(`${R.type.indices}(batch, row, col + local_id.x)`, "output_value")};
          }
        }`;
    };
    return { name: "MatMulNBits", shaderCache: { hint: `${t.blockSize};${t.bits};${p};${f};${m};${_};${g}`, inputDependencies: Array(e.length).fill("rank") }, getRunData: () => ({ outputs: [{ dims: h, dataType: c }], dispatchGroup: { x: y }, programUniforms: b }), getShaderSource: T };
  }, bc = (e, t) => {
    let n = e[0].dims, r = n.length, o = n[r - 2], i = t.k, s = t.n, a = n.slice(0, r - 2), u = x$1.size(a), l = e[1].dims[2] / 4, c = e[0].dataType, p = J(t.k), f = J(l), m = a.concat([o, s]), h = 128, _ = s % 8 === 0 ? 8 : s % 4 === 0 ? 4 : 1, y = h / _, g = Math.floor(32 / t.bits), b = y * f * g, w = b / p, v = b / t.blockSize, $ = x$1.size(m) / _, T = [], I = [u, o, i / p], E = x$1.convertShape(e[1].dims).slice();
    E.splice(-1, 1, l / f), T.push(...P(I)), T.push(...P(E)), T.push(...P(e[2].dims)), e.length === 4 && T.push(...P(x$1.convertShape(e[3].dims)));
    let z = [u, o, s];
    T.push(...P(z));
    let M = (O) => {
      let W = I.length, K = S("a", e[0].dataType, W, p), U = S("b", 12, E.length, f), R = S("scales", e[2].dataType, e[2].dims.length), G = [K, U, R], V = e.length === 4 ? S("zero_points", 12, e[3].dims.length) : void 0;
      V && G.push(V);
      let j = z.length, Q = C("output", e[0].dataType, j), X = re(e[0].dataType), Se = () => {
        switch (p) {
          case 1:
            return `
          let a_data0 = vec4<${X}>(sub_a[word_offset], sub_a[word_offset + 1], sub_a[word_offset + 2], sub_a[word_offset + 3]);
          let a_data1 = vec4<${X}>(sub_a[word_offset + 4], sub_a[word_offset + 5], sub_a[word_offset + 6], sub_a[word_offset + 7]);`;
          case 2:
            return `
          let a_data0 = vec4<${X}>(sub_a[word_offset], sub_a[word_offset + 1]);
          let a_data1 = vec4<${X}>(sub_a[word_offset + 2], sub_a[word_offset + 3]);`;
          case 4:
            return `
          let a_data0 = sub_a[word_offset];
          let a_data1 = sub_a[word_offset + 1];`;
          default:
            throw new Error(`${p}-component is not supported.`);
        }
      };
      return `
        var<workgroup> sub_a: array<${K.type.value}, ${w}>;
        var<workgroup> inter_results: array<array<${Q.type.value}, ${y}>, ${_}>;
        ${O.declareVariables(...G, Q)}
        ${O.mainStart([y, _, 1])}
          let output_indices = ${Q.offsetToIndices(`workgroup_index * ${_}`)};
          let col = output_indices[2];
          let row = output_indices[1];
          let batch = output_indices[0];
          let n_blocks_per_col = uniforms.b_shape[1];
          let num_tiles =  (n_blocks_per_col - 1) / ${v} + 1;

          // Loop over shared dimension.
          for (var tile: u32 = 0; tile < num_tiles; tile += 1) {
            let a_col_start = tile * ${w};
            // load one tile A data into shared memory.
            for (var a_offset = local_idx; a_offset < ${w}; a_offset += ${h})
            {
              let a_col = a_col_start + a_offset;
              if (a_col < uniforms.a_shape[2])
              {
                sub_a[a_offset] = ${K.getByIndices(`${K.type.indices}(batch, row, a_col)`)};
              } else {
                sub_a[a_offset] = ${K.type.value}(0);
              }
            }
            workgroupBarrier();

            // each thread process one block
            let b_row = col + local_id.y;
            let block = tile * ${v} + local_id.x;
            ${V ? `
            let zero_point_values_per_byte: u32 = ${Math.floor(8 / t.bits)}u;
            let zero_point_bytes_per_col = (n_blocks_per_col + zero_point_values_per_byte - 1u) / zero_point_values_per_byte;
            let zero_point_byte_count = b_row * zero_point_bytes_per_col + (block / zero_point_values_per_byte);
            let zero_point_word_index = zero_point_byte_count >> 0x2u;
            let zero_point_byte_offset = zero_point_byte_count & 0x3u;
            let zero_point_sub_offset: u32 = block % zero_point_values_per_byte;
            let zero_point_bits_offset = (zero_point_byte_offset << 3) + (zero_point_sub_offset * ${t.bits}u);
            let zero_point_word = ${V.getByOffset("zero_point_word_index")} >> zero_point_bits_offset;
            let zero_point = ${X}((zero_point_word) & ${t.bits === 2 ? "0x3u" : "0xFu"});` : `
            // The default zero point is ${Math.pow(2, t.bits - 1)} for unsigned ${t.bits}-bit quantization.
            let zero_point = ${X}(${Math.pow(2, t.bits - 1).toFixed(1)});`}
            let scale = ${R.getByOffset("b_row * n_blocks_per_col + block")};
            let b_data = ${U.getByIndices(`${U.type.indices}(b_row, block, 0)`)};
            var word_offset = local_id.x * ${t.blockSize / p};
            for (var i: u32 = 0; i < ${f}; i++) {
              let b_value = ${f === 1 ? "b_data" : "b_data[i]"};
              ${(() => {
        let se = Math.floor(g / 8), A = "";
        for (let B = 0; B < se; B++) {
          let oe = B * t.bits * 4, he = oe + t.bits;
          A += `
              ${Se()}
              {${t.bits === 2 ? `
                let half_word = b_value >> ${B * 16}u;
                let byte_lo = half_word & 0xFFu;
                let byte_hi = (half_word >> 8u) & 0xFFu;
                let spread_word = (byte_lo & 0xFu) | ((byte_lo >> 4u) << 8u) | ((byte_hi & 0xFu) << 16u) | ((byte_hi >> 4u) << 24u);
                let b_value_lower = unpack4xU8(spread_word & 0x03030303u);
                let b_value_upper = unpack4xU8((spread_word >> 2u) & 0x03030303u);` : `
                let b_value_lower = unpack4xU8((b_value >> ${oe}u) & 0x0F0F0F0Fu);
                let b_value_upper = unpack4xU8((b_value >> ${he}u) & 0x0F0F0F0Fu);`}
                let b_quantized_values = mat2x4<${X}>(${Array.from({ length: 4 }, (ae, ge) => `${X}(b_value_lower[${ge}]), ${X}(b_value_upper[${ge}])`).join(", ")});
                let b_dequantized_values = (b_quantized_values - mat2x4<${X}>(${Array(8).fill("zero_point").join(",")})) * scale;
                inter_results[local_id.y][local_id.x] += ${Array.from({ length: 2 }, (ae, ge) => `${`dot(a_data${ge}, b_dequantized_values[${ge}])`}`).join(" + ")};
              }
              word_offset += ${8 / p};`;
        }
        return A;
      })()}
            }
            workgroupBarrier();
          }

          if (local_idx < ${_}) {
            var output_value: ${Q.type.value} = ${Q.type.value}(0);
            for (var b = 0u; b < ${y}; b++) {
              output_value += inter_results[local_idx][b];
            }
            if (col + local_idx < uniforms.output_shape[2])
            {
              ${Q.setByIndices(`${Q.type.indices}(batch, row, col + local_idx)`, "output_value")}
            }
          }
        }`;
    };
    return { name: "BlockwiseMatMulNBits32", shaderCache: { hint: `${t.blockSize};${p};${f};${y};${_}`, inputDependencies: Array(e.length).fill("rank") }, getRunData: () => ({ outputs: [{ dims: m, dataType: c }], dispatchGroup: { x: $ }, programUniforms: T }), getShaderSource: M };
  }, Sa = (e, t) => {
    gc(e.inputs, t), t.blockSize === 32 && e.adapterInfo.isVendor("intel") && e.adapterInfo.isArchitecture("gen-12lp") ? e.compute(bc(e.inputs, t)) : e.compute(yc(e.inputs, t));
  }, Ta = (e) => L(e);
});
var _c, wc, $c, vc, xc, Sc, Tc, Ic, Ca, Aa = k(() => {
  N();
  H();
  F();
  _c = (e) => {
    if (!e || e.length < 1) throw new Error("Too few inputs");
    if (e[0].dataType !== 1 && e[0].dataType !== 10) throw new Error("Input type must be float or float16.");
    if (e.length >= 2) {
      let t = e[0].dims.length * 2 === e[1].dims[0];
      if (e.length === 4 && (t = e[3].dims[0] * 2 === e[1].dims[0]), !t) throw new Error("The pads should be a 1D tensor of shape [2 * input_rank] or [2 * num_axes].");
    }
  }, wc = (e, t, n) => {
    let r = "";
    for (let o = t - 1; o >= 0; --o) r += `
            k = i32(${e.indicesGet("indices", o)}) - ${D("uniforms.pads", o, n)};
            if (k < 0) {
              break;
            }
            if (k >= i32(${D("uniforms.x_shape", o, t)})) {
              break;
            }
            offset += k * i32(${D("uniforms.x_strides", o, t)});
        `;
    return `
          value = ${e.type.value}(uniforms.constant_value);
          for (var i = 0; i < 1; i++) {
            var offset = 0;
            var k = 0;
            ${r}
            value = x[offset];
          }
      `;
  }, $c = (e, t, n) => {
    let r = "";
    for (let o = t - 1; o >= 0; --o) r += `
                k = i32(${e.indicesGet("indices", o)}) - ${D("uniforms.pads", o, n)};
                if (k < 0) {
                  k = -k;
                }
                {
                  let _2n_1 = 2 * (i32(${D("uniforms.x_shape", o, t)}) - 1);
                  k = k % _2n_1;
                  if(k >= i32(${D("uniforms.x_shape", o, t)})) {
                    k = _2n_1 - k;
                  }
                }
                offset += k * i32(${D("uniforms.x_strides", o, t)});
            `;
    return `
              var offset = 0;
              var k = 0;
              ${r}
              value = x[offset];
          `;
  }, vc = (e, t, n) => {
    let r = "";
    for (let o = t - 1; o >= 0; --o) r += `
                k = i32(${e.indicesGet("indices", o)}) - ${D("uniforms.pads", o, n)};
                if (k < 0) {
                  k = 0;
                }
                if (k >= i32(${D("uniforms.x_shape", o, t)})) {
                  k = i32(${D("uniforms.x_shape", o, t)}) - 1;
                }
                offset += k * i32(${D("uniforms.x_strides", o, t)});
            `;
    return `
              var offset = 0;
              var k = 0;
              ${r}
              value = x[offset];
          `;
  }, xc = (e, t, n) => {
    let r = "";
    for (let o = t - 1; o >= 0; --o) r += `
                k = i32(${e.indicesGet("indices", o)}) - ${D("uniforms.pads", o, n)};
                if (k < 0)  {
                  k += i32(${D("uniforms.x_shape", o, t)}]);
                }
                if (k >= i32(${D("uniforms.x_shape", o, t)})) {
                  k -= i32(${D("uniforms.x_shape", o, t)});
                }
                offset += k * i32(${D("uniforms.x_strides", o, t)});
            `;
    return `
              var offset = 0;
              var k = 0;
              ${r}
              value = x[offset];
          `;
  }, Sc = (e, t, n) => {
    switch (n.mode) {
      case 0:
        return wc(e, t, n.pads.length);
      case 1:
        return $c(e, t, n.pads.length);
      case 2:
        return vc(e, t, n.pads.length);
      case 3:
        return xc(e, t, n.pads.length);
      default:
        throw new Error("Invalid mode");
    }
  }, Tc = (e, t) => {
    let n = x$1.padShape(e[0].dims.slice(), t.pads), r = e[0].dims, o = x$1.size(n), i = [{ type: 12, data: o }, { type: 6, data: t.pads }], s = e.length >= 3 && e[2].data;
    t.mode === 0 && i.push({ type: s ? e[2].dataType : 1, data: t.value }), i.push(...P(e[0].dims, n));
    let a = ["rank"], u = (d) => {
      let l = C("output", e[0].dataType, n.length), c = S("x", e[0].dataType, r.length), p = c.type.value, f = Sc(l, r.length, t), m = [{ name: "output_size", type: "u32" }, { name: "pads", type: "i32", length: t.pads.length }];
      return t.mode === 0 && m.push({ name: "constant_value", type: s ? p : "f32" }), `
            ${d.registerUniforms(m).declareVariables(c, l)}
            ${d.mainStart()}
            ${d.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}

            let indices = ${l.offsetToIndices("global_idx")};

            var value = ${p}(0);
            ${f}
            output[global_idx] = value;
        }`;
    };
    return { name: "Pad", shaderCache: { hint: `${t.mode}${s}`, inputDependencies: a }, getRunData: () => ({ outputs: [{ dims: n, dataType: e[0].dataType }], dispatchGroup: { x: Math.ceil(x$1.size(n) / 64) }, programUniforms: i }), getShaderSource: u };
  }, Ic = (e, t) => {
    if (e.length > 1) {
      let n = e[1].getBigInt64Array(), r = e.length >= 3 && e[2].data ? e[2].dataType === 10 ? e[2].getUint16Array()[0] : e[2].getFloat32Array()[0] : 0, o = e[0].dims.length, i = new Int32Array(2 * o).fill(0);
      if (e.length >= 4) {
        let a = e[3].getBigInt64Array();
        for (let u = 0; u < a.length; u++) i[Number(a[u])] = Number(n[u]), i[Number(a[u]) + o] = Number(n[u + a.length]);
      } else n.forEach((a, u) => i[Number(u)] = Number(a));
      let s = [];
      return i.forEach((a) => s.push(a)), { mode: t.mode, value: r, pads: s };
    } else return t;
  }, Ca = (e, t) => {
    _c(e.inputs);
    let n = Ic(e.inputs, t);
    e.compute(Tc(e.inputs, n), { inputs: [0] });
  };
});
var mn, Ea, ka, Pa, za, Cc, Ac, Ba, Da, Oa, Ma, Ua, Ra, Va, Na, La, Wa, Ga, Ha, qa = k(() => {
  we();
  N();
  H();
  F();
  mn = (e) => {
    if (ne.webgpu.validateInputContent && (!e || e.length !== 1)) throw new Error("Pool ops requires 1 input.");
  }, Ea = (e, t, n) => {
    let r = t.format === "NHWC", o = e.dims.slice();
    r && o.splice(1, 0, o.pop());
    let i = Object.hasOwnProperty.call(t, "dilations"), s = t.kernelShape.slice(), a = t.strides.slice(), u = i ? t.dilations.slice() : [], d = t.pads.slice();
    Ye.adjustPoolAttributes(n, o, s, a, u, d);
    let l = Ye.computePoolOutputShape(n, o, a, u, s, d, t.autoPad), c = Object.assign({}, t);
    i ? Object.assign(c, { kernelShape: s, strides: a, pads: d, dilations: u, cacheKey: t.cacheKey }) : Object.assign(c, { kernelShape: s, strides: a, pads: d, cacheKey: t.cacheKey });
    let p = l.slice();
    return p.push(p.splice(1, 1)[0]), [c, r ? p : l];
  }, ka = (e, t) => {
    let n = t.format === "NHWC", r = x$1.size(e), o = x$1.size(t.kernelShape), i = [{ type: 12, data: r }, { type: 12, data: o }], s = [{ name: "outputSize", type: "u32" }, { name: "kernelSize", type: "u32" }];
    if (t.kernelShape.length <= 2) {
      let a = t.kernelShape[t.kernelShape.length - 1], u = t.strides[t.strides.length - 1], d = t.pads[t.pads.length / 2 - 1], l = t.pads[t.pads.length - 1], c = !!(d + l);
      i.push({ type: 12, data: a }, { type: 12, data: u }, { type: 12, data: d }, { type: 12, data: l }), s.push({ name: "kw", type: "u32" }, { name: "sw", type: "u32" }, { name: "pwStart", type: "u32" }, { name: "pwEnd", type: "u32" });
      let p = false;
      if (t.kernelShape.length === 2) {
        let f = t.kernelShape[t.kernelShape.length - 2], m = t.strides[t.strides.length - 2], h = t.pads[t.pads.length / 2 - 2], _ = t.pads[t.pads.length - 2];
        p = !!(h + _), i.push({ type: 12, data: f }, { type: 12, data: m }, { type: 12, data: h }, { type: 12, data: _ }), s.push({ name: "kh", type: "u32" }, { name: "sh", type: "u32" }, { name: "phStart", type: "u32" }, { name: "phEnd", type: "u32" });
      }
      return [i, s, true, c, p];
    } else {
      if (n) throw new Error("Pooling with kernelShape.length > 2 is not supported for NHWC format.");
      let a = x$1.computeStrides(t.kernelShape);
      i.push({ type: 12, data: a }, { type: 12, data: t.pads }, { type: 12, data: t.strides }), s.push({ name: "kernelStrides", type: "u32", length: a.length }, { name: "pads", type: "u32", length: t.pads.length }, { name: "strides", type: "u32", length: t.strides.length });
      let u = t.pads.reduce((d, l) => d + l);
      return [i, s, !!u, false, false];
    }
  }, Pa = (e, t, n, r, o, i, s, a, u, d, l, c) => {
    let p = o.format === "NHWC", f = t.type.value, m = C("output", t.type.tensor, r);
    if (o.kernelShape.length <= 2) {
      let h = "", _ = "", y = "", g = n - (p ? 2 : 1);
      if (l ? h = `
                for (var i: u32 = 0u; i < uniforms.kw; i++) {
                  xIndices[${g}] = indices[${g}] * uniforms.sw - uniforms.pwStart + i;
                  if (xIndices[${g}] < 0 || xIndices[${g}]
                      >= uniforms.x_shape[${g}]) {
                    pad++;
                    continue;
                  }
                  let x_val = x[${t.indicesToOffset("xIndices")}];
                  ${i}
                }` : h = `
                for (var i: u32 = 0u; i < uniforms.kw; i++) {
                  xIndices[${g}] = indices[${g}] * uniforms.sw - uniforms.pwStart + i;
                  let x_val = x[${t.indicesToOffset("xIndices")}];
                  ${i}
                }`, o.kernelShape.length === 2) {
        let w = n - (p ? 3 : 2);
        c ? _ = `
                for (var j: u32 = 0u; j < uniforms.kh; j++) {
                  xIndices[${w}] = indices[${w}] * uniforms.sh - uniforms.phStart + j;
                  if (xIndices[${w}] < 0 || xIndices[${w}] >= uniforms.x_shape[${w}]) {
                    pad += i32(uniforms.kw);
                    continue;
                  }
              ` : _ = `
                for (var j: u32 = 0u; j < uniforms.kh; j++) {
                  xIndices[${w}] = indices[${w}] * uniforms.sh - uniforms.phStart + j;
                `, y = `
              }
            `;
      }
      return `
            ${e.registerUniforms(u).declareVariables(t, m)}

            ${e.mainStart()}
              ${e.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}

              let indices = ${m.offsetToIndices("global_idx")};
              var xIndices = ${m.offsetToIndices("global_idx")};

              var value = ${f}(${a});
              var pad = 0;
              ${_}
              ${h}
              ${y}
              ${s}

              output[global_idx] = value;
            }`;
    } else {
      if (p) throw new Error("Pooling with kernelShape.length > 2 is not supported for NHWC format.");
      let h = o.kernelShape.length, _ = o.pads.length, y = "";
      return d ? y = `
                if (xIndices[j] >= uniforms.x_shape[j]) {
                  pad++;
                  isPad = true;
                  break;
                }
              }
              if (!isPad) {
                let x_val = x[${t.indicesToOffset("xIndices")}];
                ${i}
              }` : y = `
              }
              let x_val = x[${t.indicesToOffset("xIndices")}];
              ${i}
            `, `
            ${e.registerUniforms(u).declareVariables(t, m)}

            ${e.mainStart()}
              ${e.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
              let indices = ${m.offsetToIndices("global_idx")};
              var xIndices = ${m.offsetToIndices("global_idx")};

              var offsets: array<u32, ${h}>;

              var value = ${f}(${a});
              var pad = 0;
              var isPad = false;

              for (var i: u32 = 0u; i < uniforms.kernelSize; i++) {
                var offset = i;
                for (var j = 0u; j < ${h - 1}u; j++) {
                  offsets[j] = offset / ${D("uniforms.kernelStrides", "j", h)};
                  offset -= offsets[j] * ${D("uniforms.kernelStrides", "j", h)};
                }
                offsets[${h - 1}] = offset;

                isPad = false;
                for (var j = ${n - h}u; j < ${n}u; j++) {
                  xIndices[j] = indices[j] * ${D("uniforms.strides", `j - ${n - h}u`, h)}
                    + offsets[j - ${n - h}u] - ${D("uniforms.pads", "j - 2u", _)};
                  ${y}
              }
              ${s}

              output[global_idx] = value;
            }`;
    }
  }, za = (e) => `${e.format};${e.ceilMode};${e.autoPad};${e.kernelShape.length}`, Cc = (e) => `${za(e)};${e.countIncludePad}`, Ac = (e) => `${za(e)};${e.storageOrder};${e.dilations}`, Ba = (e) => ({ format: e.format, autoPad: ["NOTSET", "VALID", "SAME_UPPER", "SAME_LOWER"][e.auto_pad], ceilMode: e.ceil_mode, kernelShape: e.kernel_shape, strides: e.strides, pads: e.pads }), Da = (e, t, n, r) => {
    let [o, i] = Ea(t, r, n), s = S("x", t.dataType, t.dims.length), a = s.type.value, u = "value += x_val;", d = "";
    o.countIncludePad ? d += `value /= ${a}(uniforms.kernelSize);` : d += `value /= ${a}(i32(uniforms.kernelSize) - pad);`;
    let [l, c, p, f, m] = ka(i, o);
    l.push(...P(t.dims, i));
    let h = ["rank"];
    return { name: e, shaderCache: { hint: `${r.cacheKey};${p};${f};${m}`, inputDependencies: h }, getRunData: () => ({ outputs: [{ dims: i, dataType: t.dataType }], dispatchGroup: { x: Math.ceil(x$1.size(i) / 64) }, programUniforms: l }), getShaderSource: (_) => Pa(_, s, t.dims.length, i.length, o, u, d, 0, c, p, f, m) };
  }, Oa = (e) => {
    let t = e.count_include_pad !== 0, n = Ba(e);
    if (n.ceilMode !== 0) throw new Error("using ceil() in shape computation is not yet supported for AveragePool");
    let r = { countIncludePad: t, ...n, cacheKey: "" };
    return { ...r, cacheKey: Cc(r) };
  }, Ma = (e, t) => {
    mn(e.inputs), e.compute(Da("AveragePool", e.inputs[0], false, t));
  }, Ua = { autoPad: "", ceilMode: 0, countIncludePad: false, kernelShape: [], strides: [], pads: [], storageOrder: 0, dilations: [] }, Ra = (e) => {
    let t = e.format;
    return { format: t, ...Ua, cacheKey: t };
  }, Va = (e, t) => {
    mn(e.inputs), e.compute(Da("GlobalAveragePool", e.inputs[0], true, t));
  }, Na = (e, t, n, r) => {
    let [o, i] = Ea(t, r, n), s = `
      value = max(x_val, value);
    `, a = "", u = S("x", t.dataType, t.dims.length), d = ["rank"], [l, c, p, f, m] = ka(i, o);
    return l.push(...P(t.dims, i)), { name: e, shaderCache: { hint: `${r.cacheKey};${p};${f};${m}`, inputDependencies: d }, getRunData: () => ({ outputs: [{ dims: i, dataType: t.dataType }], dispatchGroup: { x: Math.ceil(x$1.size(i) / 64) }, programUniforms: l }), getShaderSource: (h) => Pa(h, u, t.dims.length, i.length, o, s, a, t.dataType === 10 ? -65504 : -1e5, c, p, f, m) };
  }, La = (e, t) => {
    mn(e.inputs), e.compute(Na("MaxPool", e.inputs[0], false, t));
  }, Wa = (e) => {
    let t = e.storage_order, n = e.dilations, r = Ba(e);
    if (t !== 0) throw new Error("column major storage order is not yet supported for MaxPool");
    if (r.ceilMode !== 0) throw new Error("using ceil() in shape computation is not yet supported for MaxPool");
    let o = { storageOrder: t, dilations: n, ...r, cacheKey: "" };
    return { ...o, cacheKey: Ac(o) };
  }, Ga = (e) => {
    let t = e.format;
    return { format: t, ...Ua, cacheKey: t };
  }, Ha = (e, t) => {
    mn(e.inputs), e.compute(Na("GlobalMaxPool", e.inputs[0], true, t));
  };
});
var kc, Pc, Fa, Ka, ja = k(() => {
  N();
  H();
  ue();
  F();
  kc = (e, t) => {
    if (e.length < 2 || e.length > 3) throw new Error("DequantizeLinear requires 2 or 3 inputs.");
    if (e.length === 3 && e[1].dims === e[2].dims) throw new Error("x-scale and x-zero-point must have the same shape.");
    if (e.length === 3 && e[0].dataType !== e[2].dataType) throw new Error("x and x-zero-point must have the same data type.");
    if (e[1].dims.length !== 0 && e[1].dims.length !== 1 && e[1].dims.length !== e[0].dims.length) throw new Error("scale input must be a scalar, a 1D tensor, or have the same rank as the input tensor.");
    if (e.length > 2) {
      if (e[0].dataType !== e[2].dataType) throw new Error("x and x-zero-point must have the same data type.");
      if (e[1].dims.length !== e[2].dims.length) throw new Error("scale and zero-point inputs must have the same rank.");
      if (!e[1].dims.map((n, r) => n === e[2].dims[r]).reduce((n, r) => n && r, true)) throw new Error("scale and zero-point inputs must have the same shape.");
    }
    if (t.blockSize > 0) {
      if (e[1].dims.length === 0 || e[1].dims.length === 1 && e[1].dims[0] === 1) throw new Error("blockSize must be set only for block quantization.");
      if (!e[1].dims.map((o, i) => i === t.axis || o === e[0].dims[i]).reduce((o, i) => o && i, true)) throw new Error("For block qunatization, scale input shape to match the input shape except for the axis");
      if (e[1].dims.length !== e[0].dims.length) throw new Error("For block qunatization the scale input rank must be the same as the x rank.");
      let n = e[0].dims[t.axis], r = e[1].dims[t.axis];
      if (t.blockSize < Math.ceil(n / r) || t.blockSize > Math.ceil(n / (r - 1) - 1)) throw new Error("blockSize must be with in the range [ceil(dI / Si), ceil(dI / (Si - 1) - 1)].");
    }
  }, Pc = (e, t) => {
    let n = x$1.normalizeAxis(t.axis, e[0].dims.length), r = e[0].dataType, o = r === 3, i = e[0].dims, s = e[1].dataType, a = x$1.size(i), u = r === 3 || r === 2, d = u ? [Math.ceil(x$1.size(e[0].dims) / 4)] : e[0].dims, l = e[1].dims, c = e.length > 2 ? e[2] : void 0, p = c ? u ? [Math.ceil(x$1.size(c.dims) / 4)] : c.dims : void 0, f = l.length === 0 || l.length === 1 && l[0] === 1, m = f === false && l.length === 1, h = J(a), _ = f && (!u || h === 4), y = _ ? h : 1, g = _ && !u ? h : 1, b = S("input", u ? 12 : r, d.length, g), w = S("scale", s, l.length), v = c ? S("zero_point", u ? 12 : r, p.length) : void 0, $ = C("output", s, i.length, y), T = [b, w];
    v && T.push(v);
    let I = [d, l];
    c && I.push(p);
    let E = [{ type: 12, data: a / y }, { type: 12, data: n }, { type: 12, data: t.blockSize }, ...P(...I, i)], z = (M) => {
      let O = [{ name: "output_size", type: "u32" }, { name: "axis", type: "u32" }, { name: "block_size", type: "u32" }];
      return `
      ${M.registerUniforms(O).declareVariables(...T, $)}
      ${M.mainStart()}
          ${M.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
          let output_indices = ${$.offsetToIndices("global_idx")};

          // Set input x
          ${u ? `
            let input = ${b.getByOffset("global_idx / 4")};
            let x_vec = ${o ? "unpack4xI8(input)" : "unpack4xU8(input)"};
            let x_value = ${y === 1 ? "x_vec[global_idx % 4]" : "x_vec"};` : `let x_value = ${b.getByOffset("global_idx")};`};

          // Set scale input
          ${f ? `let scale_value= ${w.getByOffset("0")}` : m ? `
            let scale_index = ${$.indicesGet("output_indices", "uniforms.axis")};
            let scale_value= ${w.getByOffset("scale_index")};` : `
            var scale_indices: ${w.type.indices} = output_indices;
            let index = ${w.indicesGet("scale_indices", "uniforms.axis")} / uniforms.block_size;
            ${w.indicesSet("scale_indices", "uniforms.axis", "index")};
            let scale_value= ${w.getByIndices("scale_indices")};`};

          // Set zero-point input
          ${v ? f ? u ? `
                let zero_point_input = ${v.getByOffset("0")};
                let zero_point_vec =  ${o ? "unpack4xI8(zero_point_input)" : "unpack4xU8(zero_point_input)"};
                let zero_point_value= zero_point_vec[0]` : `let zero_point_value = ${v.getByOffset("0")}` : m ? u ? `
                let zero_point_index = ${$.indicesGet("output_indices", "uniforms.axis")};
                let zero_point_input = ${v.getByOffset("zero_point_index / 4")};
                let zero_point_vec =  ${o ? "unpack4xI8(zero_point_input)" : "unpack4xU8(zero_point_input)"};
                let zero_point_value = zero_point_vec[zero_point_index % 4]` : `
                let zero_point_index = ${$.indicesGet("output_indices", "uniforms.axis")};
                let zero_point_value = ${v.getByOffset("zero_point_index")};` : u ? `
                let zero_point_offset = ${w.indicesToOffset("scale_indices")};
                let zero_point_input = ${v.getByOffset("zero_point_offset / 4")};
                let zero_point_vec = ${o ? "unpack4xI8(zero_point_input)" : "unpack4xU8(zero_point_input)"};
                let zero_point_value = zero_point_vec[zero_point_offset % 4];` : `let zero_point_value = ${v.getByIndices("scale_indices")};` : `let zero_point_value = ${u ? o ? "i32" : "u32" : b.type.value}(0);`};
      // Compute and write output
      ${$.setByOffset("global_idx", `${$.type.value}(x_value - zero_point_value) * scale_value`)};
      }`;
    };
    return { name: "DequantizeLinear", shaderCache: { hint: t.cacheKey, inputDependencies: v ? ["rank", "rank", "rank"] : ["rank", "rank"] }, getShaderSource: z, getRunData: () => ({ outputs: [{ dims: i, dataType: s }], dispatchGroup: { x: Math.ceil(a / y / 64), y: 1, z: 1 }, programUniforms: E }) };
  }, Fa = (e, t) => {
    kc(e.inputs, t), e.compute(Pc(e.inputs, t));
  }, Ka = (e) => L({ axis: e.axis, blockSize: e.blockSize });
});
var zc, Bc, Za, Qa = k(() => {
  we();
  N();
  F();
  zc = (e, t, n) => {
    let r = e === t, o = e < t && n < 0, i = e > t && n > 0;
    if (r || o || i) throw new Error("Range these inputs' contents are invalid.");
  }, Bc = (e, t, n, r) => {
    let o = Math.abs(Math.ceil((t - e) / n)), i = [o], s = o, a = [{ type: 12, data: s }, { type: r, data: e }, { type: r, data: n }, ...P(i)], u = (d) => {
      let l = C("output", r, i.length), c = l.type.value, p = [{ name: "outputSize", type: "u32" }, { name: "start", type: c }, { name: "delta", type: c }];
      return `
        ${d.registerUniforms(p).declareVariables(l)}
        ${d.mainStart()}
        ${d.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
        output[global_idx] = uniforms.start + ${c}(global_idx) * uniforms.delta;
      }`;
    };
    return { name: "Range", shaderCache: { hint: `${r}` }, getShaderSource: u, getRunData: () => ({ outputs: [{ dims: i, dataType: r }], dispatchGroup: { x: Math.ceil(s / 64) }, programUniforms: a }) };
  }, Za = (e) => {
    let t = 0, n = 0, r = 0;
    e.inputs[0].dataType === 6 ? (t = e.inputs[0].getInt32Array()[0], n = e.inputs[1].getInt32Array()[0], r = e.inputs[2].getInt32Array()[0]) : e.inputs[0].dataType === 1 && (t = e.inputs[0].getFloat32Array()[0], n = e.inputs[1].getFloat32Array()[0], r = e.inputs[2].getFloat32Array()[0]), ne.webgpu.validateInputContent && zc(t, n, r), e.compute(Bc(t, n, r, e.inputs[0].dataType), { inputs: [] });
  };
});
var Dc, Oc, Xa, Ya, Ja = k(() => {
  N();
  H();
  ue();
  F();
  Dc = (e, t, n, r) => {
    if (e !== "none" && r !== "i32" && r !== "u32" && r !== "f32") throw new Error(`Input ${r} is not supported with reduction ${e}.`);
    let o = `{
                var oldValue = 0;
                loop {
                  let newValueF32 =`, i = `;
                  let newValue = bitcast<i32>(newValueF32);
                  let res = atomicCompareExchangeWeak(&${t}, oldValue, newValue);
                  if res.exchanged {
                    break;
                  }
                  oldValue = res.old_value;
                }
              }`;
    switch (e) {
      case "none":
        return `${t}=${n};`;
      case "add":
        return r === "i32" || r === "u32" ? `atomicAdd(&${t}, bitcast<${r}>(${n}));` : `
              ${o}bitcast<${r}>(oldValue) + (${n})${i}`;
      case "max":
        return r === "i32" || r === "u32" ? `atomicMax(&${t}, bitcast<${r}>(${n}));` : `
                ${o}max(bitcast<f32>(oldValue), (${n}))${i}`;
      case "min":
        return r === "i32" || r === "u32" ? `atomicMin(&${t}, bitcast<${r}>(${n}));` : `${o}min(bitcast<${r}>(oldValue), (${n}))${i}`;
      case "mul":
        return `${o}(bitcast<${r}>(oldValue) * (${n}))${i}`;
      default:
        throw new Error(`Reduction ${e} is not supported.`);
    }
  }, Oc = (e, t) => {
    let n = e[0].dims, r = e[1].dims, o = n, i = 1, s = Math.ceil(x$1.sizeToDimension(r, r.length - 1) / i), a = r[r.length - 1], u = x$1.sizeFromDimension(n, a), d = [{ type: 12, data: s }, { type: 12, data: a }, { type: 12, data: u }, ...P(e[1].dims, e[2].dims, o)], l = (c) => {
      let p = S("indices", e[1].dataType, e[1].dims.length), f = S("updates", e[2].dataType, e[2].dims.length, i), m = t.reduction !== "none" && t.reduction !== "" ? To("output", e[0].dataType, o.length) : C("output", e[0].dataType, o.length, i);
      return `
      ${c.registerUniform("output_size", "u32").registerUniform("last_index_dimension", "u32").registerUniform("num_updates_elements", "u32").declareVariables(p, f, m)}
      ${c.mainStart()}
        ${c.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
  var data_offset = 0u;
  let indices_start = uniforms.last_index_dimension * global_idx;
  let indices_end = indices_start + uniforms.last_index_dimension;
  for (var i = indices_start; i < indices_end; i++) {
    var index = i32(indices[i].x);
    ${e[0].dims.length === 1 ? `
    let element_count_dim = uniforms.output_strides;
    let dim_value = uniforms.output_shape;` : `
    let element_count_dim = uniforms.output_strides[i - indices_start];
    let dim_value = uniforms.output_shape[i - indices_start];`}
    if (index >= 0) {
      if (index >= i32(dim_value)) {
        index = i32(dim_value - 1);
      }
    } else {
      if (index < -i32(dim_value)) {
        index = 0;
      } else {
        index += i32(dim_value);
      }
    }
    data_offset += u32((u32(index) * element_count_dim));
  }

  for (var i = 0u; i < uniforms.num_updates_elements; i++) {
    let value = updates[uniforms.num_updates_elements * global_idx + i];
    ${Dc(t.reduction, "output[data_offset + i]", "value", m.type.value)}
  }

      }`;
    };
    return { name: "ScatterND", shaderCache: { hint: `${t.cacheKey}_${t.reduction}`, inputDependencies: ["rank", "rank"] }, getRunData: () => ({ outputs: [{ dims: o, dataType: e[0].dataType }], dispatchGroup: { x: Math.ceil(s / 64) }, programUniforms: d }), getShaderSource: l };
  }, Xa = (e) => L({ reduction: e.reduction }), Ya = (e, t) => {
    e.compute(Oc(e.inputs, t), { inputs: [e.inputs[1], e.inputs[2]], outputs: [] });
  };
});
var Mc, Uc, Rc, eu, Vc, Nc, Lc, Wc, Gc, Hc, qc, Fc, tu, Kc, jc, Zc, Qc, Xc, nu, ru, ou = k(() => {
  N();
  H();
  ue();
  F();
  Mc = (e, t) => {
    if (e.every((n) => n > 0 || (() => {
      throw new Error("Resize requires scales input values to be positive");
    })), e.length > 0) {
      if (t.mode === "linear") {
        if (!(e.length === 2 || e.length === 3 || e.length === 4 && e[0] === 1 && e[1] === 1 || e.length === 4 && e[0] === 1 && e[3] === 1 || e.length === 5 && e[0] === 1 && e[1] === 1)) throw new Error(`For linear mode, Resize requires scales to be 2D, 3D, 4D with either two outermost or one innermost and
            one outermost scale values equal to 1, or 5D with two outermost scale values equal to 1`);
      } else if (t.mode === "cubic" && !(e.length === 2 || e.length === 4 && e[0] === 1 && e[1] === 1 || e.length === 4 && e[0] === 1 && e[3] === 1)) throw new Error("Resize requires scales input size to be 2 or 4 for cubic mode");
    }
  }, Uc = (e, t, n) => {
    t.every((o) => o >= 0 && o < n || (() => {
      throw new Error("Resize requires axes input values to be positive and less than rank");
    }));
    let r = new Array(n).fill(1);
    return t.forEach((o, i) => r[o] = e[i]), r;
  }, Rc = (e, t, n, r, o, i) => {
    let [s, a, u] = n > 10 ? [1, 2, 3] : [-1, e.length > 1 ? 1 : -1, -1], d = e[0].dims.length;
    if (s > 0 && e.length > s && e[s].dims.length > 0) e[s].getFloat32Array().forEach((l) => i.push(l));
    else if (t.coordinateTransformMode === "tf_crop_and_resize") throw new Error("Resize requires RoI input to be specified when coordinateTransformMode is tfCropAndResize");
    if (a > 0 && e.length > a && e[a].dims.length === 1 && e[a].dims[0] > 0) {
      if (e[a].getFloat32Array().forEach((l) => r.push(l)), r.length !== 0 && r.length !== d && n >= 18 && r.length !== t.axes.length) throw new Error("Resize requires scales input size to be same as input rank or axes size for opset 18 and up");
      Mc(r, t), t.axes.length > 0 && Uc(r, t.axes, d).forEach((l, c) => r[c] = l);
    }
    if (u > 0 && e.length > u && e[u].dims.length === 1 && e[u].dims[0] > 0 && (e[u].getBigInt64Array().forEach((l) => o.push(Number(l))), o.length !== 0 && o.length !== d && n >= 18 && o.length !== t.axes.length)) throw new Error("Resize requires sizes input size to be same as input rank or axes size for opset 18 and up");
    if (t.axes.length > 0) {
      if (r.length !== 0 && r.length !== t.axes.length) throw new Error('Resize requires "scales" input size to be of axes rank when axes attributes is specified');
      if (o.length !== 0 && o.length !== t.axes.length) throw new Error('Resize requires "sizes" input size to be of rank axes rank when axes attributes is specified');
    }
    if (typeof r < "u" && typeof o < "u" && r.length > 0 && o.length > d) throw new Error("Resize requires only of scales or sizes to be specified");
  }, eu = (e, t, n, r) => `
  // The whole part and the fractional part are calculated separately due to inaccuracy of floating
  // point division. As an example, f32(21) / f32(7) may evaluate to 2.99... instead of 3, causing an
  // offset-by-one error later in floor().
  let big = (${e}) * (${t});
  let whole = ${r}(big / (${n}));
  let fract = ${r}(big % (${n})) / ${r}(${n});
  return whole + fract;
`, Vc = (e, t) => `fn getOriginalCoordinateFromResizedCoordinate(xResized: u32, xScale: f32, lengthResized: u32,
     lengthOriginal: u32, roiStart: f32, roiEnd: f32) -> ${t} { ` + (() => {
    switch (e) {
      case "asymmetric":
        return `
          if (xScale < 1.0 || floor(xScale) != xScale) {
            return ${t}(xResized) / ${t}(xScale);
          } else {
            ${eu("xResized", "lengthOriginal", "lengthResized", t)}
          }
        `;
      case "pytorch_half_pixel":
        return `if (lengthResized > 1) {
                    return (${t}(xResized) + 0.5) / ${t}(xScale) - 0.5;
                  } else {
                    return 0.0;
                  }`;
      case "tf_half_pixel_for_nn":
        return `return (${t}(xResized) + 0.5) / ${t}(xScale);`;
      case "align_corners":
        return `if (lengthResized == 1) {
                    return 0.0;
                  } else {
                    ${eu("xResized", "lengthOriginal - 1", "lengthResized - 1", t)}
                  }`;
      case "tf_crop_and_resize":
        return `if (lengthResized > 1) {
                    return ${t}(roiStart) * ${t}(lengthOriginal - 1) +
                        (${t}(xResized) * ${t}(roiEnd - roiStart) * ${t}(lengthOriginal - 1)) /
                        ${t}(lengthResized - 1);
                  } else {
                    return 0.5 * ${t}(roiStart + roiEnd) * ${t}(lengthOriginal - 1);
                  }`;
      case "half_pixel_symmetric":
        return `const outputWidth = ${t}xScale * ${t}(lengthResized);
                  const adjustment = ${t}(lengthResized) / outputWidth;
                  const center = ${t}(lengthOriginal) / 2;
                  const offset = center * (1 - adjustment);
                  return offset + ((${t}(xResized) + 0.5) / ${t}(xScale)) - 0.5;`;
      case "half_pixel":
        return `return ((${t}(xResized) + 0.5) / ${t}(xScale)) - 0.5;`;
      default:
        throw new Error(`Coordinate transform mode ${e} is not supported`);
    }
  })() + "}", Nc = (e, t, n) => `fn getNearestPixelFromOriginal(xOriginal: ${n}, isDownSample: bool) -> ${n} {` + (() => {
    switch (e) {
      case "round_prefer_ceil":
        return "if (fract(xOriginal) == 0.5) {             return ceil(xOriginal);           } else {             return round(xOriginal);           }";
      case "floor":
        return "return floor(xOriginal);";
      case "ceil":
        return "return ceil(xOriginal);";
      case "round_prefer_floor":
        return "if (fract(xOriginal) == 0.5) {                     return floor(xOriginal);                   } else {                     return round(xOriginal);                   }";
      case "simple":
      default:
        if (t < 11) return "if (isDownSample)                     {                       return ceil(xOriginal);                     } else {                       return xOriginal;                     }";
        throw new Error(`Nearest mode ${e} is not supported`);
    }
  })() + "}", Lc = (e, t, n) => {
    let r = new Array(n).fill(0).concat(new Array(n).fill(1)), o = e.length === 0 ? r : e.slice();
    return t.length > 0 ? (t.forEach((i, s) => {
      r[i] = o[s], r[s + n] = o[t.length + s];
    }), r) : o;
  }, Wc = (e, t, n, r) => {
    let o = [];
    if (n.length > 0) if (r.length > 0) {
      if (e.forEach((i) => o.push(i)), Math.max(...r) > e.length) throw new Error("axes is out of bound");
      r.forEach((i, s) => o[i] = n[s]);
    } else n.forEach((i) => o.push(i));
    else {
      if (t.length === 0) throw new Error("Resize requires either scales or sizes.");
      o = e.map((i, s) => Math.round(i * t[s]));
    }
    return o;
  }, Gc = (e, t, n) => {
    let r = (() => {
      switch (n.keepAspectRatioPolicy) {
        case "not_larger":
          return n.axes.length > 0 ? Math.min(...n.axes.map((i) => t[i]), Number.MAX_VALUE) : Math.min(...t, Number.MAX_VALUE);
        case "not_smaller":
          return n.axes.length > 0 ? Math.max(...n.axes.map((i) => t[i]), Number.MIN_VALUE) : Math.max(...t, Number.MIN_VALUE);
        default:
          throw new Error(`Keep aspect ratio policy ${n.keepAspectRatioPolicy} is not supported`);
      }
    })();
    t.fill(1, 0, t.length);
    let o = e.slice();
    return n.axes.length > 0 ? (n.axes.forEach((i) => t[i] = r), n.axes.forEach((i) => o[i] = Math.round(e[i] * t[i]))) : (t.fill(r, 0, t.length), o.forEach((i, s) => o[s] = Math.round(i * t[s]))), o;
  }, Hc = (e, t, n, r, o) => `
    fn calculateOriginalIndicesFromOutputIndices(output_indices: ${e.type.indices}) -> array<${e.type.value}, ${n.length}> {
      var original_indices: array<${e.type.value}, ${n.length}>;
      for (var i:u32 = 0; i < ${n.length}; i++) {
        var output_index = ${e.indicesGet("output_indices", "i")};
        var scale = ${D("uniforms.scales", "i", r)};
        var roi_low = ${D("uniforms.roi", "i", o)};
        var roi_hi = ${D("uniforms.roi", `i + ${t.length}`, o)};
        if (scale == 1.0) {
          original_indices[i] = ${e.type.value}(output_index);
        } else {
          var input_shape_i = ${D("uniforms.input_shape", "i", t.length)};
          var output_shape_i = ${D("uniforms.output_shape", "i", n.length)};
          original_indices[i] = getOriginalCoordinateFromResizedCoordinate(output_index, scale, output_shape_i,
                                                                           input_shape_i, roi_low, roi_hi);
        }
      }
      return original_indices;
    }`, qc = (e, t, n, r, o, i, s) => `
    fn calculateInputIndicesFromOutputIndices(output_indices: ${t.type.indices}) -> ${e.type.indices} {
      var input_indices: ${e.type.indices};
      for (var i:u32 = 0; i < ${r.length}; i++) {
        var output_index = ${t.indicesGet("output_indices", "i")};
        var input_index: u32;
        var scale = ${D("uniforms.scales", "i", o)};
        if (scale == 1.0) {
          input_index = output_index;
        } else {
          var roi_low = ${D("uniforms.roi", "i", i)};
          var roi_hi = ${D("uniforms.roi", `i + ${n.length}`, i)};
          var input_shape_i = ${D("uniforms.input_shape", "i", n.length)};
          var output_shape_i = ${D("uniforms.output_shape", "i", r.length)};
          var original_idx = getOriginalCoordinateFromResizedCoordinate(output_index, scale, output_shape_i,
                                                                        input_shape_i, roi_low, roi_hi);
          if (!${s} || (original_idx >= 0 && original_idx < ${t.type.value}(input_shape_i))) {
            if (original_idx < 0) {
              input_index = 0;
            } else if (original_idx > ${t.type.value}(input_shape_i - 1)) {
              input_index = input_shape_i - 1;
            } else {
              input_index = u32(getNearestPixelFromOriginal(original_idx, scale < 1));
            }
          } else {
            input_index = u32(original_idx);
          }
        }
        ${e.indicesSet("input_indices", "i", "input_index")}
      }
      return input_indices;
    }`, Fc = (e, t) => `
    fn checkInputIndices(input_indices: ${e.type.indices}) -> bool {
      for (var i:u32 = 0; i < ${t.length}; i++) {
        var input_index = ${e.indicesGet("input_indices", "i")};
        if (input_index < 0 || input_index >= ${D("uniforms.input_shape", "i", t.length)}) {
          return false;
        }
      }
      return true;
    }`, tu = (e, t, n, r) => e.rank > r ? `
    ${e.indicesSet("input_indices", t, "channel")};
    ${e.indicesSet("input_indices", n, "batch")};
` : "", Kc = (e, t, n, r, o) => {
    let [s, a, u, d] = n.length === 2 ? [-1, 0, 1, -1] : [0, 2, 3, 1], l = e.type.value;
    return `
    fn getInputValue(batch: u32, channel: u32, row: u32, col: u32) -> ${l} {
      var input_indices: ${e.type.indices};
      ${e.indicesSet("input_indices", a, `max(0, min(row, ${n[a]} - 1))`)};
      ${e.indicesSet("input_indices", u, `max(0, min(col, ${n[u]} - 1))`)};
      ${tu(e, d, s, 2)}
      return ${e.getByIndices("input_indices")};
    }

    fn bilinearInterpolation(output_indices: ${t.type.indices}) -> ${l} {
      var originalIndices = calculateOriginalIndicesFromOutputIndices(output_indices);
      var row:${l} = originalIndices[${a}];
      var col:${l} = originalIndices[${u}];
      ${r ? `if (row < 0 || row > (${n[a]} - 1) || col < 0 || col > (${n[u]} - 1)) {
        return ${o};
      }` : ""};
      row = max(0, min(row, ${n[a]} - 1));
      col = max(0, min(col, ${n[u]} - 1));
      var row1: u32 = u32(row);
      var col1: u32 = u32(col);
      var row2: u32 = u32(row + 1);
      var col2: u32 = u32(col + 1);
      var channel: u32 = ${n.length > 2 ? `u32(originalIndices[${d}])` : "0"};
      var batch: u32 =  ${n.length > 2 ? `u32(originalIndices[${s}])` : "0"};
      var x11: ${l} = getInputValue(batch, channel, row1, col1);
      var x12: ${l} = getInputValue(batch, channel, row1, col2);
      var x21: ${l} = getInputValue(batch, channel, row2, col1);
      var x22: ${l} = getInputValue(batch, channel, row2, col2);
      var dx1: ${l} = abs(row - ${l}(row1));
      var dx2: ${l} = abs(${l}(row2) - row);
      var dy1: ${l} = abs(col - ${l}(col1));
      var dy2: ${l} = abs(${l}(col2) - col);
      if (row1 == row2) {
        dx1 = 0.5;
        dx2 = 0.5;
      }
      if (col1 == col2) {
        dy1 = 0.5;
        dy2 = 0.5;
      }
      return (x11 * dx2 * dy2 + x12 * dx2 * dy1 + x21 * dx1 * dy2 + x22 * dx1 * dy1);
    }`;
  }, jc = (e, t, n, r, o, i, s, a, u, d) => {
    let l = n.length === 2, [p, f] = l ? [0, 1] : [2, 3], m = e.type.value, h = (_) => {
      let y = _ === p ? "row" : "col";
      return `
      fn ${y}CubicInterpolation(input_indices: ${e.type.indices}, output_indices: ${t.type.indices}) -> ${m} {
        var output_index = ${t.indicesGet("output_indices", _)};
        var originalIdx: ${m} = getOriginalCoordinateFromResizedCoordinate(output_index, ${o[_]},
        ${r[_]}, ${n[_]}, ${i[_]}, ${i[_]} + ${n.length});
        var fractOriginalIdx: ${m} = originalIdx - floor(originalIdx);
        var coefs = getCubicInterpolationCoefs(fractOriginalIdx);

        if (${a} && (originalIdx < 0 || originalIdx > (${n[_]} - 1))) {
          return ${u};
        }
        var data: array<${m}, 4> = array<${m}, 4>(0.0, 0.0, 0.0, 0.0);
        for (var i: i32 = -1; i < 3; i++) {
          var ${y}: ${m} = originalIdx + ${m}(i);
          if (${y} < 0 || ${y} >= ${n[_]}) {
            ${d ? `coefs[i + 1] = 0.0;
                        continue;` : a ? `return ${u};` : `${y} = max(0, min(${y}, ${n[_]} - 1));`};
          }
        var input_indices_copy: ${e.type.indices} = input_indices;
          ${e.indicesSet("input_indices_copy", _, `u32(${y})`)};
          data[i + 1] = ${_ === p ? e.getByIndices("input_indices_copy") : "rowCubicInterpolation(input_indices_copy, output_indices)"};
        }
        return cubicInterpolation1D(data, coefs);
      }`;
    };
    return `
    ${h(p)};
    ${h(f)};
  fn getCubicInterpolationCoefs(s: ${m}) -> array<${m}, 4> {
    var absS = abs(s);
    var coeffs: array<${m}, 4> = array<${m}, 4>(0.0, 0.0, 0.0, 0.0);
    var oneMinusAbsS: ${m} = 1.0 - absS;
    var twoMinusAbsS: ${m} = 2.0 - absS;
    var onePlusAbsS: ${m} = 1.0 + absS;
    coeffs[0] = ((${s} * onePlusAbsS - 5 * ${s}) * onePlusAbsS + 8 * ${s}) * onePlusAbsS - 4 * ${s};
    coeffs[1] = ((${s} + 2) * absS - (${s} + 3)) * absS * absS + 1;
    coeffs[2] = ((${s} + 2) * oneMinusAbsS - (${s} + 3)) * oneMinusAbsS * oneMinusAbsS + 1;
    coeffs[3] = ((${s} * twoMinusAbsS - 5 * ${s}) * twoMinusAbsS + 8 * ${s}) * twoMinusAbsS - 4 * ${s};
    return coeffs;
  }

  fn cubicInterpolation1D(x: array<${m}, 4>, coefs: array<${m}, 4>) -> ${m} {
    var coefsSum: ${m} = coefs[0] + coefs[1] + coefs[2] + coefs[3];
    return (x[0] * coefs[0] + x[1] * coefs[1]+ x[2] * coefs[2]+ x[3] * coefs[3]) / coefsSum;
  }

  fn bicubicInterpolation(output_indices: ${t.type.indices}) -> ${m} {
    var input_indices: ${e.type.indices} = output_indices;
    return colCubicInterpolation(input_indices, output_indices);
  }
    `;
  }, Zc = (e, t, n, r, o) => {
    let [s, a, u, d, l] = n.length === 3 ? [-1, 0, 1, 2, -1] : [0, 2, 3, 4, 1], c = e.type.value;
    return `
    fn getInputValue(batch: u32, channel: u32, depth:u32, height: u32, width: u32) -> ${c} {
      var input_indices: ${e.type.indices};
      ${e.indicesSet("input_indices", a, `max(0, min(depth, ${n[a]} - 1))`)};
      ${e.indicesSet("input_indices", u, `max(0, min(height, ${n[u]} - 1))`)};
      ${e.indicesSet("input_indices", d, `max(0, min(width, ${n[d]} - 1))`)};
      ${tu(e, l, s, 3)}
      return ${e.getByIndices("input_indices")};
    }

    fn trilinearInterpolation(output_indices: ${t.type.indices}) -> ${c} {
      var originalIndices = calculateOriginalIndicesFromOutputIndices(output_indices);
      var depth:${c} = originalIndices[${a}];
      var height:${c} = originalIndices[${u}];
      var width:${c} = originalIndices[${d}];
      ${r ? `if (depth < 0 || depth > (${n[a]} - 1) || height < 0 || height > (${n[u]} - 1) || width < 0 || (width > ${n[d]} - 1)) {
      return ${o};
        }` : ""};

    depth = max(0, min(depth, ${n[a]} - 1));
      height = max(0, min(height, ${n[u]} - 1));
      width = max(0, min(width, ${n[d]} - 1));
      var depth1: u32 = u32(depth);
      var height1: u32 = u32(height);
      var width1: u32 = u32(width);
      var depth2: u32 = u32(depth + 1);
      var height2: u32 = u32(height + 1);
      var width2: u32 = u32(width + 1);
      var channel: u32 = ${n.length > 3 ? `u32(originalIndices[${l}])` : "0"};
      var batch: u32 =  ${n.length > 3 ? `u32(originalIndices[${s}])` : "0"};

      var x111: ${c} = getInputValue(batch, channel, depth1, height1, width1);
      var x112: ${c} = getInputValue(batch, channel, depth1, height1, width2);
      var x121: ${c} = getInputValue(batch, channel, depth1, height2, width1);
      var x122: ${c} = getInputValue(batch, channel, depth1, height2, width2);
      var x211: ${c} = getInputValue(batch, channel, depth2, height1, width1);
      var x212: ${c} = getInputValue(batch, channel, depth2, height1, width2);
      var x221: ${c} = getInputValue(batch, channel, depth2, height2, width1);
      var x222: ${c} = getInputValue(batch, channel, depth2, height2, width2);
      var dx1: ${c} = abs(depth - ${c}(depth1));
      var dx2: ${c} = abs(${c}(depth2) - depth);
      var dy1: ${c} = abs(height - ${c}(height1));
      var dy2: ${c} = abs(${c}(height2) - height);
      var dz1: ${c} = abs(width - ${c}(width1));
      var dz2: ${c} = abs(${c}(width2) - width);
      if (depth1 == depth2) {
        dx1 = 0.5;
        dx2 = 0.5;
      }
      if (height1 == height2) {
        dy1 = 0.5;
        dy2 = 0.5;
      }
      if (width1 == width2) {
        dz1 = 0.5;
        dz2 = 0.5;
      }
      return (x111 * dx2 * dy2 * dz2 + x112 * dx2 * dy2 * dz1 + x121 * dx2 * dy1 *dz2 + x122 * dx2 * dy1 * dz1 +
              x211 * dx1 * dy2 * dz2 + x212 * dx1 * dy2 * dz1 + x221 * dx1 * dy1 *dz2 + x222 * dx1 * dy1 * dz1);
    }`;
  }, Qc = (e, t, n, r, o, i) => {
    let s = e.dims, a = Lc(i, t.axes, s.length), u = Wc(s, r, o, t.axes), d = r.slice();
    r.length === 0 && (d = s.map((g, b) => g === 0 ? 1 : u[b] / g), t.keepAspectRatioPolicy !== "stretch" && (u = Gc(s, d, t)));
    let l = C("output", e.dataType, u.length), c = S("input", e.dataType, s.length), p = x$1.size(u), f = s.length === u.length && s.every((g, b) => g === u[b]), m = t.coordinateTransformMode === "tf_crop_and_resize", h = t.extrapolationValue, _ = c.type.value, y = (g) => `
      ${f ? "" : `
      ${Vc(t.coordinateTransformMode, _)};
      ${(() => {
      switch (t.mode) {
        case "nearest":
          return `
              ${Fc(c, s)};
              ${Nc(t.nearestMode, n, _)};
              ${qc(c, l, s, u, d.length, a.length, m)};
              `;
        case "linear":
          return `
              ${Hc(l, s, u, d.length, a.length)};
              ${(() => {
            if (s.length === 2 || s.length === 4) return `${Kc(c, l, s, m, h)}`;
            if (s.length === 3 || s.length === 5) return `${Zc(c, l, s, m, h)}`;
            throw Error("Linear mode only supports input dims 2, 3, 4 and 5 are supported in linear mode.");
          })()};
            `;
        case "cubic":
          return `
            ${(() => {
            if (s.length === 2 || s.length === 4) return `${jc(c, l, s, u, d, a, t.cubicCoeffA, m, t.extrapolationValue, t.excludeOutside)}`;
            throw Error("Cubic mode only supports input dims 2 and 4 are supported in linear mode.");
          })()};
            `;
        default:
          throw Error("Invalid resize mode");
      }
    })()};
      `}
      ${g.registerUniform("output_size", "u32").registerUniform("scales", "f32", d.length).registerUniform("roi", "f32", a.length).declareVariables(c, l)}
      ${g.mainStart()}
        ${g.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
        ${f ? "output[global_idx] = input[global_idx];" : `
        let output_indices = ${l.offsetToIndices("global_idx")};
        var input_indices: ${c.type.indices};
        ${(() => {
      switch (t.mode) {
        case "nearest":
          return `input_indices = calculateInputIndicesFromOutputIndices(output_indices);
                if (checkInputIndices(input_indices)) {
                  output[global_idx] = ${c.getByIndices("input_indices")};
                } else {
                  output[global_idx] = ${t.extrapolationValue};
                }`;
        case "linear":
          return `output[global_idx] = ${s.length === 2 || s.length === 4 ? "bilinearInterpolation" : "trilinearInterpolation"}(output_indices);`;
        case "cubic":
          return "output[global_idx] = bicubicInterpolation(output_indices);";
        default:
          throw Error(`Unsupported resize mode: ${t.mode}`);
      }
    })()};
`}
      }`;
    return { name: "Resize", shaderCache: { hint: `${t.cacheKey}|${n}|${d.length > 0 ? t.mode === "cubic" ? d : d.length : ""}|${o.length > 0 ? o : ""}|${a.length > 0 ? a : ""}|${f}|${t.mode === "nearest" ? s.length : s}`, inputDependencies: ["rank"] }, getShaderSource: y, getRunData: () => ({ outputs: [{ dims: u, dataType: e.dataType }], dispatchGroup: { x: Math.ceil(p / 64) }, programUniforms: [{ type: 12, data: p }, { type: 1, data: d }, { type: 1, data: a }, ...P(s, u)] }) };
  }, Xc = (e) => {
    let t = e.customDataBuffer;
    return new Uint32Array(t, t.byteOffset, 1)[0];
  }, nu = (e, t) => {
    let n = [], r = [], o = [], i = Xc(e);
    if (t.antialias !== 0) throw Error("Only default value (0) for Antialias attribute is supported");
    Rc(e.inputs, t, i, n, r, o), e.compute(Qc(e.inputs[0], t, i, n, r, o), { inputs: [0] });
  }, ru = (e) => {
    let t = e.antialias, n = e.axes, r = e.coordinateTransformMode, o = e.cubicCoeffA, i = e.excludeOutside !== 0, s = e.extrapolationValue, a = e.keepAspectRatioPolicy, u = e.mode, d = e.nearestMode === "" ? "simple" : e.nearestMode;
    return L({ antialias: t, axes: n, coordinateTransformMode: r, cubicCoeffA: o, excludeOutside: i, extrapolationValue: s, keepAspectRatioPolicy: a, mode: u, nearestMode: d });
  };
});
var Yc, Jc, iu, su = k(() => {
  N();
  H();
  F();
  Yc = (e) => {
    if (!e || e.length < 3) throw new Error("layerNorm requires at least 3 inputs.");
    let t = e[0], n = e[1], r = e[2];
    if (t.dataType !== n.dataType || t.dataType !== r.dataType) throw new Error("All inputs must have the same data type");
    if (t.dims.length !== 3 && t.dims.length !== 2) throw new Error("Input must be 2D or 3D");
    if (n.dims.length !== 3 && n.dims.length !== 2) throw new Error("Skip must be 2D or 3D");
    let o = t.dims[t.dims.length - 1], i = t.dims[t.dims.length - 2];
    if (n.dims[n.dims.length - 1] !== o) throw new Error("Skip must have the same hidden size as input");
    if (n.dims[n.dims.length - 2] !== i) throw new Error("Skip must have the same sequence length as input");
    if (r.dims.length !== 1) throw new Error("Gamma must be 1D");
    if (r.dims[r.dims.length - 1] !== o) throw new Error("Gamma must have the same hidden size as input");
    if (e.length > 3) {
      let s = e[3];
      if (s.dims.length !== 1) throw new Error("Beta must be 1D");
      if (s.dims[s.dims.length - 1] !== o) throw new Error("Beta must have the same hidden size as input");
    }
    if (e.length > 4) {
      let s = e[4];
      if (s.dims.length !== 1) throw new Error("Bias must be 1D");
      if (s.dims[s.dims.length - 1] !== o) throw new Error("Bias must have the same hidden size as input");
    }
  }, Jc = (e, t, n, r) => {
    let o = t.simplified, i = e[0].dims, s = x$1.size(i), a = i, u = s, d = i.slice(-1)[0], l = r ? i.slice(0, -1).concat(1) : [], c = !o && e.length > 3, p = e.length > 4, f = r && n > 1, m = r && n > 2, h = n > 3, _ = 64, y = J(d), g = [{ type: 12, data: u }, { type: 12, data: y }, { type: 12, data: d }, { type: 1, data: t.epsilon }], b = (v) => {
      let $ = [{ name: "output_size", type: "u32" }, { name: "components", type: "u32" }, { name: "hidden_size", type: "u32" }, { name: "epsilon", type: "f32" }], T = [S("x", e[0].dataType, e[0].dims, y), S("skip", e[1].dataType, e[1].dims, y), S("gamma", e[2].dataType, e[2].dims, y)];
      c && T.push(S("beta", e[3].dataType, e[3].dims, y)), p && T.push(S("bias", e[4].dataType, e[4].dims, y)), T.push(C("output", e[0].dataType, a, y)), f && T.push(C("mean_output", 1, l)), m && T.push(C("inv_std_output", 1, l)), h && T.push(C("input_skip_bias_sum", e[0].dataType, a, y));
      let I = re(e[0].dataType), E = re(1, y);
      return `

      ${v.registerUniforms($).declareVariables(...T)}
      var<workgroup> sum_shared : array<${E}, ${_}>;
      var<workgroup> sum_squared_shared : array<${E}, ${_}>;

      ${v.mainStart([_, 1, 1])}
        let ix = local_id.x;
        let iy = global_id.x / ${_};

        let hidden_size_vectorized: u32 = uniforms.hidden_size / uniforms.components;
        var stride = hidden_size_vectorized / ${_};
        let offset = ix * stride + iy * hidden_size_vectorized;
        let offset1d = stride * ix;
        if (ix == ${_ - 1}) {
          stride = hidden_size_vectorized - stride * ix;
        }
        for (var i: u32 = 0; i < stride; i++) {
          let skip_value = skip[offset + i];
          let bias_value = ${p ? "bias[offset1d + i]" : I + "(0.0)"};
          let input_value = x[offset + i];
          let value = input_value + skip_value + bias_value;
          ${h ? "input_skip_bias_sum[offset + i] = value;" : ""}
          output[offset + i] = value;
          let f32_value = ${et$1(I, y, "value")};
          sum_shared[ix] += f32_value;
          sum_squared_shared[ix] += f32_value * f32_value;
        }
        workgroupBarrier();

        var reduce_size : u32 = ${_};
        for (var curr_size = reduce_size >> 1;  curr_size > 0; curr_size = reduce_size >> 1) {
          reduce_size = curr_size + (reduce_size & 1);
          if (ix < curr_size) {
            sum_shared[ix] += sum_shared[ix + reduce_size];
            sum_squared_shared[ix] += sum_squared_shared[ix + reduce_size];
          }
          workgroupBarrier();
        }

        let sum = sum_shared[0];
        let square_sum = sum_squared_shared[0];
        let mean = ${Ie("sum", y)} / f32(uniforms.hidden_size);
        let inv_std_dev = inverseSqrt(${Ie("square_sum", y)} / f32(uniforms.hidden_size) ${o ? "" : "- mean * mean"} + uniforms.epsilon);
        ${f ? "mean_output[global_idx] = mean;" : ""}
        ${m ? "inv_std_output[global_idx] = inv_std_dev;" : ""}

        for (var i: u32 = 0; i < stride; i++) {
          output[offset + i] = (output[offset + i] ${o ? "" : `- ${I}(mean)`}) *
            ${I}(inv_std_dev) * gamma[offset1d + i]
            ${c ? "+ beta[offset1d + i]" : ""};
        }
      }`;
    }, w = [{ dims: a, dataType: e[0].dataType }];
    return n > 1 && w.push({ dims: l, dataType: 1 }), n > 2 && w.push({ dims: l, dataType: 1 }), n > 3 && w.push({ dims: i, dataType: e[0].dataType }), { name: "SkipLayerNormalization", shaderCache: { hint: `${y};${f};${m};${h}`, inputDependencies: e.map((v, $) => "type") }, getShaderSource: b, getRunData: () => ({ outputs: w, dispatchGroup: { x: Math.ceil(u / d) }, programUniforms: g }) };
  }, iu = (e, t) => {
    Yc(e.inputs);
    let r = [0];
    e.outputCount > 1 && r.push(-3), e.outputCount > 2 && r.push(-3), e.outputCount > 3 && r.push(3), e.compute(Jc(e.inputs, t, e.outputCount, false), { outputs: r });
  };
});
var ep, fn, tp, au, np, rp, uu, du, lu = k(() => {
  N();
  H();
  ue();
  F();
  ep = (e, t) => {
    if (!e || e.length < 1) throw new Error("too few inputs");
    if (t.axes.length !== 0) {
      if (t.axes.length !== t.starts.length || t.axes.length !== t.ends.length) throw new Error("axes, starts and ends must have the same length");
    } else if (t.starts.length !== t.ends.length) throw new Error("starts and ends must have the same length");
    e.slice(1).forEach((n, r) => {
      if (e[r + 1].dataType !== 6 && e[r + 1].dataType !== 7) throw new Error(`Input ${r} must be an array of int32 or int64`);
    });
  }, fn = (e, t) => {
    let n = [];
    if (e.length > t) if (e[t].dataType === 7) e[t].getBigInt64Array().forEach((r) => n.push(Number(r)));
    else if (e[t].dataType === 6) e[t].getInt32Array().forEach((r) => n.push(Number(r)));
    else throw new Error(`Input ${t} must be an array of int32 or int64`);
    return n;
  }, tp = (e, t) => {
    if (e.length > 1) {
      let n = fn(e, 1), r = fn(e, 2), o = fn(e, 3);
      return o.length === 0 && (o = [...Array(e[0].dims.length).keys()]), L({ starts: n, ends: r, axes: o });
    } else return t;
  }, au = (e, t, n, r, o) => {
    let i = e;
    return e < 0 && (i += n[r[t]]), o[t] < 0 ? Math.max(0, Math.min(i, n[r[t]] - 1)) : Math.max(0, Math.min(i, n[r[t]]));
  }, np = (e, t, n) => `fn calculateInputIndices(output_indices: ${t.type.indices}) -> ${e.type.indices} {
          var input_indices: ${e.type.indices};
          var carry = 0u;
          for (var i = ${n.length - 1}; i >= 0; i--) {
            let input_shape_i = ${D("uniforms.input_shape", "i", n.length)};
            let steps_i = ${D("uniforms.steps", "i", n.length)};
            let signs_i = ${D("uniforms.signs", "i", n.length)};
            let starts_i = ${D("uniforms.starts", "i", n.length)};
            var output_index = ${t.indicesGet("output_indices", "i")};
            var input_index = output_index * steps_i + starts_i + carry;
            carry = input_index / input_shape_i;
            input_index = input_index % input_shape_i;
            if (signs_i < 0) {
              input_index = input_shape_i - input_index - 1u + starts_i;
            }
            ${e.indicesSet("input_indices", "i", "input_index")};
          }
          return input_indices;
      }`, rp = (e, t) => {
    let n = e[0].dims, r = x$1.size(n), o = t.axes.length > 0 ? x$1.normalizeAxes(t.axes, n.length) : [...Array(n.length).keys()], i = fn(e, 4);
    i.forEach((y) => y !== 0 || (() => {
      throw new Error("step cannot be 0");
    })), i.length === 0 && (i = Array(o.length).fill(1));
    let s = t.starts.map((y, g) => au(y, g, n, o, i)), a = t.ends.map((y, g) => au(y, g, n, o, i));
    if (o.length !== s.length || o.length !== a.length) throw new Error("start, ends and axes should have the same number of elements");
    if (o.length !== n.length) for (let y = 0; y < n.length; ++y) o.includes(y) || (s.splice(y, 0, 0), a.splice(y, 0, n[y]), i.splice(y, 0, 1));
    let u = i.map((y) => Math.sign(y));
    i.forEach((y, g, b) => {
      if (y < 0) {
        let w = (a[g] - s[g]) / y, v = s[g], $ = v + w * i[g];
        s[g] = $, a[g] = v, b[g] = -y;
      }
    });
    let d = n.slice(0);
    o.forEach((y, g) => {
      d[y] = Math.ceil((a[y] - s[y]) / i[y]);
    });
    let l = { dims: d, dataType: e[0].dataType }, c = C("output", e[0].dataType, d.length), p = S("input", e[0].dataType, e[0].dims.length), f = x$1.size(d), m = [{ name: "outputSize", type: "u32" }, { name: "starts", type: "u32", length: s.length }, { name: "signs", type: "i32", length: u.length }, { name: "steps", type: "u32", length: i.length }], h = [{ type: 12, data: f }, { type: 12, data: s }, { type: 6, data: u }, { type: 12, data: i }, ...P(e[0].dims, d)], _ = (y) => `
      ${y.registerUniforms(m).declareVariables(p, c)}
        ${np(p, c, n)}
        ${y.mainStart()}
          ${y.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
          let output_indices = ${c.offsetToIndices("global_idx")};
          let input_indices = calculateInputIndices(output_indices);
          ${c.setByOffset("global_idx", p.getByIndices("input_indices"))}
      }`;
    return { name: "Slice", shaderCache: { hint: `${u.length}_${s.length}_${i.length}`, inputDependencies: ["rank"] }, getShaderSource: _, getRunData: () => ({ outputs: [l], dispatchGroup: { x: Math.ceil(r / 64) }, programUniforms: h }) };
  }, uu = (e, t) => {
    ep(e.inputs, t);
    let n = tp(e.inputs, t);
    e.compute(rp(e.inputs, n), { inputs: [0] });
  }, du = (e) => {
    let t = e.starts, n = e.ends, r = e.axes;
    return L({ starts: t, ends: n, axes: r });
  };
});
var op, ip, cu, pu, mu = k(() => {
  N();
  H();
  ue();
  Re();
  F();
  op = (e) => {
    if (!e || e.length !== 1) throw new Error("Softmax op requires 1 input.");
  }, ip = (e, t) => {
    let n = e.inputs[0], r = n.dims, o = x$1.size(r), i = r.length, s = x$1.normalizeAxis(t.axis, i), a = s < r.length - 1, u, d = [];
    a ? (d = Array.from({ length: i }, (T, I) => I), d[s] = i - 1, d[i - 1] = s, u = e.compute(me(n, d), { inputs: [n], outputs: [-1] })[0]) : u = n;
    let l = u.dims, c = l[i - 1], p = o / c, f = J(c), m = c / f, h = 64;
    p === 1 && (h = 256);
    let _ = (T, I) => I === 4 ? `max(max(${T}.x, ${T}.y), max(${T}.z, ${T}.w))` : I === 2 ? `max(${T}.x, ${T}.y)` : I === 3 ? `max(max(${T}.x, ${T}.y), ${T}.z)` : T, y = S("x", u.dataType, u.dims, f), g = C("result", u.dataType, u.dims, f), b = y.type.value, w = re(u.dataType) === "f32" ? `var threadMax = ${b}(-3.4028234663852886e+38f);` : `var threadMax = ${b}(-65504.0h);`, v = (T) => `
      var<workgroup> rowMaxShared : ${b};
      var<workgroup> rowSumShared : ${b};
      var<workgroup> threadShared : array<${b}, ${h}>;

      fn getValue(row: i32, col: i32, row_stride: i32) -> ${b} {
        let index = row * row_stride + col;
        return x[index];
      }

      fn setValue(row: i32, col: i32, row_stride: i32, value: ${b}) {
        let index = row * row_stride + col;
        result[index] = value;
      }
      ${T.registerUniform("packedCols", "i32").declareVariables(y, g)}
      ${T.mainStart(h)}
        let gindex = i32(global_idx);
        let lindex = i32(local_idx);
        const wg = ${h};
        let row = gindex / wg;
        let cols = uniforms.packedCols;
        let row_stride : i32 = uniforms.packedCols;

        // find the rows max
        ${w}
        for (var col = lindex; col < cols; col += wg) {
          let value = getValue(row, col, row_stride);
          threadMax = max(threadMax, value);
        }
        if (lindex < cols) {
          threadShared[lindex] = threadMax;
        }
        workgroupBarrier();

        var reduceSize = min(cols, wg);
        for (var currSize = reduceSize >> 1;  currSize > 0; currSize = reduceSize >> 1) {
          reduceSize = currSize + (reduceSize & 1);
          if (lindex < currSize) {
            threadShared[lindex] = max(threadShared[lindex], threadShared[lindex + reduceSize]);
          }
          workgroupBarrier();
        }
        if (lindex == 0) {
          rowMaxShared = ${b}(${_("threadShared[0]", f)});
        }
        workgroupBarrier();

        // find the rows sum
        var threadSum = ${b}(0.0);
        for (var col = lindex; col < cols; col += wg) {
          let subExp = exp(getValue(row, col, row_stride) - rowMaxShared);
          threadSum += subExp;
        }
        threadShared[lindex] = threadSum;
        workgroupBarrier();

        for (var currSize = wg >> 1;  currSize > 0; currSize = currSize >> 1) {
          if (lindex < currSize) {
            threadShared[lindex] = threadShared[lindex] + threadShared[lindex + currSize];
          }
          workgroupBarrier();
        }
        if (lindex == 0) {
          rowSumShared = ${b}(${Ie("threadShared[0]", f)});
        }
        workgroupBarrier();

        // calculate final value for each element in the row
        for (var col = lindex; col < cols; col += wg) {
          var value = exp(getValue(row, col, row_stride) - rowMaxShared) / rowSumShared;
          // max operation protects against NaN since all values should be >=0
          value = max(value, ${b}(0.0));
          setValue(row, col, row_stride, value);
        }
      }`, $ = e.compute({ name: "Softmax", shaderCache: { hint: `${f};${h}`, inputDependencies: ["type"] }, getRunData: () => ({ outputs: [{ dims: l, dataType: u.dataType }], dispatchGroup: { x: p }, programUniforms: [{ type: 6, data: m }] }), getShaderSource: v }, { inputs: [u], outputs: [a ? -1 : 0] })[0];
    a && e.compute(me($, d), { inputs: [$] });
  }, cu = (e, t) => {
    op(e.inputs), ip(e, t);
  }, pu = (e) => L({ axis: e.axis });
});
var fu, sp, ap, up, hu, gu = k(() => {
  N();
  H();
  F();
  fu = (e) => Array.from(e.getBigInt64Array(), Number), sp = (e) => {
    if (!e || e.length !== 2) throw new Error("Tile requires 2 inputs.");
    if (e[0].dataType !== 1 && e[0].dataType !== 10 && e[0].dataType !== 6 && e[0].dataType !== 12) throw new Error("Tile only support float, float16, int32, and uint32 data types");
    if (e[1].dataType !== 7) throw new Error("Tile `repeats` input should be of int64 data type");
    if (e[1].dims.length !== 1) throw new Error("Tile `repeats` input should be 1-D");
    if (fu(e[1]).length !== e[0].dims.length) throw new Error("Tile `repeats` input should have same number of elements as rank of input data tensor");
  }, ap = (e, t) => {
    let n = [];
    for (let r = 0; r < e.length; ++r) n.push(e[r] * t[r]);
    return n;
  }, up = (e, t) => {
    let n = e[0].dims, r = t ?? fu(e[1]), o = ap(n, r), i = x$1.size(o), s = e[0].dataType, a = S("input", s, n.length), u = C("output", s, o.length), d = (l) => `
      const inputShape = ${a.indices(...n)};
      ${l.registerUniform("output_size", "u32").declareVariables(a, u)}
      ${l.mainStart()}
      ${l.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
      let output_indices = ${u.offsetToIndices("global_idx")};
      var input_indices: ${a.type.indices};
      for (var i = 0; i < ${n.length}; i++) {
        let input_dim_i = ${a.indicesGet("uniforms.input_shape", "i")};
        let input_dim_value = ${u.indicesGet("output_indices", "i")}  % input_dim_i;

        ${a.indicesSet("input_indices", "i", "input_dim_value")}
      }
      ${u.setByOffset("global_idx", a.getByIndices("input_indices"))}
    }`;
    return { name: "Tile", shaderCache: { hint: `${r}`, inputDependencies: ["rank"] }, getRunData: () => ({ outputs: [{ dims: o, dataType: e[0].dataType }], dispatchGroup: { x: Math.ceil(i / 64) }, programUniforms: [{ type: 12, data: i }, ...P(e[0].dims, o)] }), getShaderSource: d };
  }, hu = (e) => {
    sp(e.inputs), e.compute(up(e.inputs), { inputs: [0] });
  };
});
var dp, lp, yu, bu = k(() => {
  N();
  H();
  F();
  dp = (e, t, n, r, o) => {
    let i = C("output_data", o, n.length, 4), s = S("a_data", t[1].dataType, t[1].dims.length, 4), a = S("b_data", t[2].dataType, t[2].dims.length, 4), u = S("c_data", t[0].dataType, t[0].dims.length, 4), d, l = (c, p, f) => `select(${p}, ${c}, ${f})`;
    if (!r) d = i.setByOffset("global_idx", l(s.getByOffset("global_idx"), a.getByOffset("global_idx"), u.getByOffset("global_idx")));
    else {
      let c = (p, f, m = "") => {
        let h = `a_data[index_a${f}][component_a${f}]`, _ = `b_data[index_b${f}][component_b${f}]`, y = `bool(c_data[index_c${f}] & (0xffu << (component_c${f} * 8)))`;
        return `
            let output_indices${f} = ${i.offsetToIndices(`global_idx * 4u + ${f}u`)};
            let offset_a${f} = ${s.broadcastedIndicesToOffset(`output_indices${f}`, i)};
            let offset_b${f} = ${a.broadcastedIndicesToOffset(`output_indices${f}`, i)};
            let offset_c${f} = ${u.broadcastedIndicesToOffset(`output_indices${f}`, i)};
            let index_a${f} = offset_a${f} / 4u;
            let index_b${f} = offset_b${f} / 4u;
            let index_c${f} = offset_c${f} / 4u;
            let component_a${f} = offset_a${f} % 4u;
            let component_b${f} = offset_b${f} % 4u;
            let component_c${f} = offset_c${f} % 4u;
            ${p}[${f}] = ${m}(${l(h, _, y)});
          `;
      };
      o === 9 ? d = `
            var data = vec4<u32>(0);
            ${c("data", 0, "u32")}
            ${c("data", 1, "u32")}
            ${c("data", 2, "u32")}
            ${c("data", 3, "u32")}
            output_data[global_idx] = dot(vec4<u32>(0x1, 0x100, 0x10000, 0x1000000), vec4<u32>(data));` : d = `
            ${c("output_data[global_idx]", 0)}
            ${c("output_data[global_idx]", 1)}
            ${c("output_data[global_idx]", 2)}
            ${c("output_data[global_idx]", 3)}
          `;
    }
    return `
        ${e.registerUniform("vec_size", "u32").declareVariables(u, s, a, i)}
        ${e.mainStart()}
        ${e.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.vec_size")}
        ${d}
      }`;
  }, lp = (e) => {
    let t = e[1].dims, n = e[2].dims, r = e[0].dims, o = e[1].dataType, i = !(x$1.areEqual(t, n) && x$1.areEqual(n, r)), s = t, a = x$1.size(t);
    if (i) {
      let d = ze.calcShape(ze.calcShape(t, n, false), r, false);
      if (!d) throw new Error("Can't perform where op on the given tensors");
      s = d, a = x$1.size(s);
    }
    let u = Math.ceil(a / 4);
    return { name: "Where", shaderCache: { inputDependencies: ["rank", "rank", "rank"] }, getShaderSource: (d) => dp(d, e, s, i, o), getRunData: () => ({ outputs: [{ dims: s, dataType: o }], dispatchGroup: { x: Math.ceil(a / 64 / 4) }, programUniforms: [{ type: 12, data: u }, ...P(r, t, n, s)] }) };
  }, yu = (e) => {
    e.compute(lp(e.inputs));
  };
});
var _u, wu = k(() => {
  ei();
  tn();
  ri();
  ii();
  Hi();
  ts();
  os();
  ws();
  Cs();
  ks();
  Bs();
  Rs();
  Ls();
  Gs();
  Fs();
  Zs();
  Ys();
  ta();
  oa();
  aa();
  ga();
  _a$1();
  $a();
  xa();
  Ia();
  ar();
  Aa();
  qa();
  ja();
  Qa();
  Ja();
  Jt();
  ou();
  lr();
  su();
  lu();
  mu();
  dr();
  gu();
  Re();
  rn();
  bu();
  _u = /* @__PURE__ */ new Map([["Abs", [si]], ["Acos", [ai]], ["Acosh", [ui]], ["Add", [qi]], ["ArgMax", [Jo, jn]], ["ArgMin", [Yo, jn]], ["Asin", [di]], ["Asinh", [li]], ["Atan", [ci]], ["Atanh", [pi]], ["Attention", [ti]], ["AveragePool", [Ma, Oa]], ["BatchNormalization", [ni]], ["BiasAdd", [oi]], ["BiasSplitGelu", [Gi]], ["Cast", [fi, mi]], ["Ceil", [gi]], ["Clip", [hi]], ["Concat", [ns, rs]], ["Conv", [rr, nr]], ["ConvTranspose", [Is, Ss]], ["Cos", [yi]], ["Cosh", [bi]], ["CumSum", [As, Es]], ["DepthToSpace", [Ps, zs]], ["DequantizeLinear", [Fa, Ka]], ["Div", [Fi]], ["Einsum", [Ms, Us]], ["Elu", [_i, gt]], ["Equal", [Ki]], ["Erf", [wi]], ["Exp", [$i]], ["Expand", [Ns]], ["FastGelu", [Ws]], ["Floor", [vi]], ["FusedConv", [rr, nr]], ["Gather", [qs, Hs]], ["GatherElements", [ea, Js]], ["GatherBlockQuantized", [Qs, Xs]], ["GatherND", [Ks, js]], ["Gelu", [xi]], ["Gemm", [ra, na]], ["GlobalAveragePool", [Va, Ra]], ["GlobalMaxPool", [Ha, Ga]], ["Greater", [Xi]], ["GreaterOrEqual", [Ji]], ["GridSample", [ia, sa]], ["GroupQueryAttention", [ha]], ["HardSigmoid", [Pi, ki]], ["InstanceNormalization", [ba]], ["LayerNormalization", [wa]], ["LeakyRelu", [Si, gt]], ["Less", [Yi]], ["LessOrEqual", [es]], ["Log", [Ni]], ["MatMul", [va]], ["MatMulNBits", [Sa, Ta]], ["MaxPool", [La, Wa]], ["Mul", [ji]], ["MultiHeadAttention", [la, da]], ["Neg", [Ii]], ["Not", [Ti]], ["Pad", [Ca]], ["Pow", [Zi]], ["QuickGelu", [Li, gt]], ["Range", [Za]], ["Reciprocal", [Ci]], ["ReduceMin", [Fo]], ["ReduceMean", [Lo]], ["ReduceMax", [qo]], ["ReduceSum", [jo]], ["ReduceProd", [Ko]], ["ReduceL1", [Wo]], ["ReduceL2", [Go]], ["ReduceLogSum", [Qo]], ["ReduceLogSumExp", [Ho]], ["ReduceSumSquare", [Zo]], ["Relu", [Ai]], ["Resize", [nu, ru]], ["RotaryEmbedding", [ma]], ["ScatterND", [Ya, Xa]], ["Sigmoid", [Ei]], ["Sin", [zi]], ["Sinh", [Bi]], ["Slice", [uu, du]], ["SkipLayerNormalization", [iu]], ["Split", [ca, pa]], ["Sqrt", [Di]], ["Softmax", [cu, pu]], ["Sub", [Qi]], ["Tan", [Oi]], ["Tanh", [Ui]], ["ThresholdedRelu", [Vi, gt]], ["Tile", [hu]], ["Transpose", [Ao, Eo]], ["Where", [yu]]]);
});
var hn, $u = k(() => {
  we();
  Pe();
  F();
  hn = class {
    constructor(t) {
      this.backend = t;
      this.repo = /* @__PURE__ */ new Map(), this.attributesBound = false;
    }
    getArtifact(t) {
      return this.repo.get(t);
    }
    setArtifact(t, n) {
      this.repo.set(t, n);
    }
    run(t, n, r, o, i) {
      _e(t.programInfo.name);
      let s = this.backend.device, a = this.backend.getComputePassEncoder();
      this.backend.writeTimestamp(this.backend.pendingDispatchNumber * 2);
      let u = [];
      for (let l of n) u.push({ binding: u.length, resource: { buffer: l.buffer } });
      for (let l of r) u.push({ binding: u.length, resource: { buffer: l.buffer } });
      i && u.push({ binding: u.length, resource: i });
      let d = s.createBindGroup({ layout: t.computePipeline.getBindGroupLayout(0), entries: u, label: t.programInfo.name });
      if (this.backend.sessionStatus === "capturing") {
        let l = { kernelId: this.backend.currentKernelId, computePipeline: t.computePipeline, bindGroup: d, dispatchGroup: o };
        this.backend.capturedCommandList.get(this.backend.currentSessionId).push(l);
      }
      a.setPipeline(t.computePipeline), a.setBindGroup(0, d), a.dispatchWorkgroups(...o), this.backend.writeTimestamp(this.backend.pendingDispatchNumber * 2 + 1), this.backend.pendingDispatchNumber++, (this.backend.pendingDispatchNumber >= this.backend.maxDispatchNumber || this.backend.queryType === "at-passes") && this.backend.endComputePass(), this.backend.pendingDispatchNumber >= this.backend.maxDispatchNumber && this.backend.flush(), ye(t.programInfo.name);
    }
    dispose() {
    }
    build(t, n) {
      _e(t.name);
      let r = this.backend.device, o = [];
      [{ feature: "shader-f16", extension: "f16" }, { feature: "subgroups", extension: "subgroups" }].forEach((c) => {
        r.features.has(c.feature) && o.push(`enable ${c.extension};`);
      });
      let s = Io(n, this.backend.device.limits), a = t.getShaderSource(s), u = `${o.join(`
`)}
${s.additionalImplementations}
${a}`, d = r.createShaderModule({ code: u, label: t.name });
      Z("verbose", () => `[WebGPU] ${t.name} shader code: ${u}`);
      let l = r.createComputePipeline({ compute: { module: d, entryPoint: "main" }, layout: "auto", label: t.name });
      return ye(t.name), { programInfo: t, computePipeline: l, uniformVariablesInfo: s.variablesInfo };
    }
    normalizeDispatchGroupSize(t) {
      let n = typeof t == "number" ? t : t.x, r = typeof t == "number" ? 1 : t.y || 1, o = typeof t == "number" ? 1 : t.z || 1, i = this.backend.device.limits.maxComputeWorkgroupsPerDimension;
      if (n <= i && r <= i && o <= i) return [n, r, o];
      let s = n * r * o, a = Math.ceil(Math.sqrt(s));
      if (a > i) {
        if (a = Math.ceil(Math.cbrt(s)), a > i) throw new Error("Total dispatch size exceeds WebGPU maximum.");
        return [a, a, a];
      } else return [a, a, 1];
    }
  };
});
var vu = {};
lt(vu, { WebGpuBackend: () => pr });
var cp, pp, cr, pr, xu = k(() => {
  we();
  N();
  Pe();
  Mn();
  So();
  wu();
  $u();
  cp = (e, t) => {
    if (t.length !== e.length) throw new Error(`inputDependencies length ${t.length} is not equal to inputTensors length ${e.length}.`);
    let n = [];
    for (let r = 0; r < e.length; ++r) {
      let o = e[r].dataType;
      switch (t[r]) {
        case "none": {
          n.push("");
          break;
        }
        case "type": {
          n.push(`${o}`);
          break;
        }
        case "rank": {
          let i = e[r].dims.length;
          n.push(`${o};${i}`);
          break;
        }
        case "dims": {
          let i = e[r].dims.join(",");
          n.push(`${o};${i}`);
          break;
        }
        default:
          throw new Error(`unsupported input dependency: ${t[r]}`);
      }
    }
    return n.join("|");
  }, pp = (e, t, n) => {
    let r = e.name;
    return e.shaderCache?.hint && (r += "[" + e.shaderCache.hint + "]"), r += ":" + n + `:${cp(t, e.shaderCache?.inputDependencies ?? new Array(t.length).fill("dims"))}`, r;
  }, cr = class {
    constructor(t) {
      t && (this.architecture = t.architecture, this.vendor = t.vendor);
    }
    isArchitecture(t) {
      return this.architecture === t;
    }
    isVendor(t) {
      return this.vendor === t;
    }
  }, pr = class {
    constructor() {
      this.currentSessionId = null;
      this.currentKernelId = null;
      this.commandEncoder = null;
      this.computePassEncoder = null;
      this.maxDispatchNumber = 16;
      this.pendingDispatchNumber = 0;
      this.pendingKernels = [];
      this.pendingQueries = /* @__PURE__ */ new Map();
      this.sessionStatus = "default";
      this.capturedCommandList = /* @__PURE__ */ new Map();
      this.capturedPendingKernels = /* @__PURE__ */ new Map();
      this.sessionExternalDataMapping = /* @__PURE__ */ new Map();
    }
    get currentKernelCustomData() {
      if (this.currentKernelId === null) throw new Error("currentKernelCustomData(): currentKernelId is null. (should not happen)");
      let t = this.kernelCustomData.get(this.currentKernelId);
      return t || (t = {}, this.kernelCustomData.set(this.currentKernelId, t)), t;
    }
    async initialize(t, n) {
      this.env = t;
      let r = [], o = { requiredLimits: { maxComputeWorkgroupStorageSize: n.limits.maxComputeWorkgroupStorageSize, maxComputeWorkgroupsPerDimension: n.limits.maxComputeWorkgroupsPerDimension, maxStorageBufferBindingSize: n.limits.maxStorageBufferBindingSize, maxBufferSize: n.limits.maxBufferSize, maxComputeInvocationsPerWorkgroup: n.limits.maxComputeInvocationsPerWorkgroup, maxComputeWorkgroupSizeX: n.limits.maxComputeWorkgroupSizeX, maxComputeWorkgroupSizeY: n.limits.maxComputeWorkgroupSizeY, maxComputeWorkgroupSizeZ: n.limits.maxComputeWorkgroupSizeZ }, requiredFeatures: r }, i = (s) => n.features.has(s) && r.push(s) && true;
      i("chromium-experimental-timestamp-query-inside-passes") || i("timestamp-query"), i("shader-f16"), i("subgroups"), this.device = await n.requestDevice(o), this.adapterInfo = new cr(n.info || await n.requestAdapterInfo()), this.gpuDataManager = xo(this), this.programManager = new hn(this), this.kernels = /* @__PURE__ */ new Map(), this.kernelPersistentData = /* @__PURE__ */ new Map(), this.kernelCustomData = /* @__PURE__ */ new Map(), Gt(t.logLevel, !!t.debug), this.device.onuncapturederror = (s) => {
        s.error instanceof GPUValidationError && console.error(`An uncaught WebGPU validation error was raised: ${s.error.message}`);
      }, Object.defineProperty(this.env.webgpu, "device", { value: this.device, writable: false, enumerable: true, configurable: true }), Object.defineProperty(this.env.webgpu, "adapter", { value: n, writable: false, enumerable: true, configurable: false }), this.setQueryType();
    }
    dispose() {
      typeof this.querySet < "u" && this.querySet.destroy(), this.gpuDataManager.dispose(), this.device && this.env?.webgpu && this.device.lost.then(() => {
        delete this.env.webgpu.device;
      });
    }
    getCommandEncoder() {
      return this.commandEncoder || (this.commandEncoder = this.device.createCommandEncoder()), this.commandEncoder;
    }
    getComputePassEncoder() {
      if (!this.computePassEncoder) {
        let t = this.getCommandEncoder(), n = {};
        this.queryType === "at-passes" && (n.timestampWrites = { querySet: this.querySet, beginningOfPassWriteIndex: this.pendingDispatchNumber * 2, endOfPassWriteIndex: this.pendingDispatchNumber * 2 + 1 }), this.computePassEncoder = t.beginComputePass(n);
      }
      return this.computePassEncoder;
    }
    endComputePass() {
      this.computePassEncoder && (this.computePassEncoder.end(), this.computePassEncoder = null);
    }
    flush() {
      if (!this.commandEncoder) return;
      _e(), this.endComputePass();
      let t;
      this.queryType !== "none" && (this.commandEncoder.resolveQuerySet(this.querySet, 0, this.pendingDispatchNumber * 2, this.queryResolveBuffer, 0), t = this.device.createBuffer({ size: this.pendingDispatchNumber * 2 * 8, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }), this.pendingQueries.set(t, this.pendingKernels), this.pendingKernels = [], this.commandEncoder.copyBufferToBuffer(this.queryResolveBuffer, 0, t, 0, this.pendingDispatchNumber * 2 * 8)), this.device.queue.submit([this.commandEncoder.finish()]), this.gpuDataManager.refreshPendingBuffers(), this.commandEncoder = null, this.pendingDispatchNumber = 0, this.queryType !== "none" && t.mapAsync(GPUMapMode.READ).then(() => {
        let n = new BigUint64Array(t.getMappedRange()), r = this.pendingQueries.get(t);
        for (let o = 0; o < n.length / 2; o++) {
          let i = r[o], s = i.kernelId, a = this.kernels.get(s), u = a.kernelType, d = a.kernelName, l = i.programName, c = i.inputTensorViews, p = i.outputTensorViews, f = n[o * 2], m = n[o * 2 + 1];
          typeof this.queryTimeBase > "u" && (this.queryTimeBase = f);
          let h = Number(f - this.queryTimeBase), _ = Number(m - this.queryTimeBase);
          if (!Number.isSafeInteger(h) || !Number.isSafeInteger(_)) throw new RangeError("incorrect timestamp range");
          if (this.env.webgpu.profiling?.ondata) this.env.webgpu.profiling.ondata({ version: 1, inputsMetadata: c.map((y) => ({ dims: y.dims, dataType: ke(y.dataType) })), outputsMetadata: p.map((y) => ({ dims: y.dims, dataType: ke(y.dataType) })), kernelId: s, kernelType: u, kernelName: d, programName: l, startTime: h, endTime: _ });
          else {
            let y = "";
            c.forEach((b, w) => {
              y += `input[${w}]: [${b.dims}] | ${ke(b.dataType)}, `;
            });
            let g = "";
            p.forEach((b, w) => {
              g += `output[${w}]: [${b.dims}] | ${ke(b.dataType)}, `;
            }), console.log(`[profiling] kernel "${s}|${u}|${d}|${l}" ${y}${g}start time: ${h} ns, execution time: ${_ - h} ns`);
          }
          It("GPU", `${l}::${f}::${m}`);
        }
        t.unmap(), this.pendingQueries.delete(t);
      }), ye();
    }
    run(t, n, r, o, i, s) {
      _e(t.name);
      let a = [];
      for (let b = 0; b < n.length; ++b) {
        let w = n[b].data;
        if (w === 0) continue;
        let v = this.gpuDataManager.get(w);
        if (!v) throw new Error(`no GPU data for input: ${w}`);
        a.push(v);
      }
      let { outputs: u, dispatchGroup: d, programUniforms: l } = t.getRunData(n), c = r.length === 0 ? u.map((b, w) => w) : r;
      if (c.length !== u.length) throw new Error(`Output size ${c.length} must be equal to ${u.length}.`);
      let p = [], f = [];
      for (let b = 0; b < u.length; ++b) {
        if (!Number.isInteger(c[b]) || c[b] < -3 || c[b] >= s) throw new Error(`Invalid output index: ${c[b]}`);
        if (c[b] === -3) continue;
        let w = c[b] === -1, v = c[b] === -2, $ = w || v ? i(u[b].dataType, u[b].dims) : o(c[b], u[b].dataType, u[b].dims);
        if (p.push($), $.data === 0) continue;
        let T = this.gpuDataManager.get($.data);
        if (!T) throw new Error(`no GPU data for output: ${$.data}`);
        if (w && this.temporaryData.push(T), v) {
          let I = this.kernelPersistentData.get(this.currentKernelId);
          I || (I = [], this.kernelPersistentData.set(this.currentKernelId, I)), I.push(T);
        }
        f.push(T);
      }
      if (a.length !== n.length || f.length !== p.length) {
        if (f.length === 0) return ye(t.name), p;
        throw new Error(`Program ${t.name} has zero-sized tensor(s) in inputs or outputs. This is not supported now.`);
      }
      let m;
      if (l) {
        let b = 0, w = [];
        l.forEach((I) => {
          let E = typeof I.data == "number" ? [I.data] : I.data;
          if (E.length === 0) return;
          let z = I.type === 10 ? 2 : 4, M, O;
          I.type === 10 ? (O = E.length > 4 ? 16 : E.length > 2 ? 8 : E.length * z, M = E.length > 4 ? 16 : z * E.length) : (O = E.length <= 2 ? E.length * z : 16, M = 16), b = Math.ceil(b / O) * O, w.push(b);
          let W = I.type === 10 ? 8 : 4;
          b += E.length > 4 ? Math.ceil(E.length / W) * M : E.length * z;
        });
        let v = 16;
        b = Math.ceil(b / v) * v;
        let $ = new ArrayBuffer(b);
        l.forEach((I, E) => {
          let z = w[E], M = typeof I.data == "number" ? [I.data] : I.data;
          if (I.type === 6) new Int32Array($, z, M.length).set(M);
          else if (I.type === 12) new Uint32Array($, z, M.length).set(M);
          else if (I.type === 10) new Uint16Array($, z, M.length).set(M);
          else if (I.type === 1) new Float32Array($, z, M.length).set(M);
          else throw new Error(`Unsupported uniform type: ${ke(I.type)}`);
        });
        let T = this.gpuDataManager.create(b, GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM);
        this.device.queue.writeBuffer(T.buffer, 0, $, 0, b), this.gpuDataManager.release(T.id), m = { offset: 0, size: b, buffer: T.buffer };
      }
      let h = this.programManager.normalizeDispatchGroupSize(d), _ = h[1] === 1 && h[2] === 1, y = pp(t, n, _), g = this.programManager.getArtifact(y);
      if (g || (g = this.programManager.build(t, h), this.programManager.setArtifact(y, g), Z("info", () => `[artifact] key: ${y}, programName: ${t.name}`)), l && g.uniformVariablesInfo) {
        if (l.length !== g.uniformVariablesInfo.length) throw new Error(`Uniform variables count mismatch: expect ${g.uniformVariablesInfo.length}, got ${l.length} in program "${g.programInfo.name}".`);
        for (let b = 0; b < l.length; b++) {
          let w = l[b], v = w.type, $ = typeof w.data == "number" ? 1 : w.data.length, [T, I] = g.uniformVariablesInfo[b];
          if (v !== T || $ !== I) throw new Error(`Uniform variable ${b} mismatch: expect type ${T} with size ${I}, got type ${v} with size ${$} in program "${g.programInfo.name}".`);
        }
      }
      if (Z("info", () => `[ProgramManager] run "${t.name}" (key=${y}) with ${h[0]}x${h[1]}x${h[2]}`), this.queryType !== "none" || this.sessionStatus === "capturing") {
        let b = { kernelId: this.currentKernelId, programName: g.programInfo.name, inputTensorViews: n, outputTensorViews: p };
        this.pendingKernels.push(b), this.sessionStatus === "capturing" && this.capturedPendingKernels.get(this.currentSessionId).push(b);
      }
      return this.programManager.run(g, a, f, h, m), ye(t.name), p;
    }
    upload(t, n) {
      this.gpuDataManager.upload(t, n);
    }
    memcpy(t, n) {
      this.gpuDataManager.memcpy(t, n);
    }
    async download(t, n) {
      await this.gpuDataManager.download(t, n);
    }
    alloc(t) {
      return this.gpuDataManager.create(t).id;
    }
    free(t) {
      return this.gpuDataManager.release(t);
    }
    createKernel(t, n, r, o) {
      let i = _u.get(t);
      if (!i) throw new Error(`kernel not implemented: ${t}`);
      let s = { kernelType: t, kernelName: o, kernelEntry: i[0], attributes: [i[1], r] };
      this.kernels.set(n, s);
    }
    releaseKernel(t) {
      let n = this.kernelPersistentData.get(t);
      if (n) {
        for (let r of n) this.gpuDataManager.release(r.id);
        this.kernelPersistentData.delete(t);
      }
      this.kernelCustomData.delete(t), this.kernels.delete(t);
    }
    computeKernel(t, n, r) {
      let o = this.kernels.get(t);
      if (!o) throw new Error(`kernel not created: ${t}`);
      let i = o.kernelType, s = o.kernelName, a = o.kernelEntry, u = o.attributes;
      if (this.currentKernelId !== null) throw new Error(`kernel "[${i}] ${s}" is not allowed to be called recursively`);
      this.currentKernelId = t, u[0] && (u[1] = u[0](u[1]), u[0] = void 0), Z("info", () => `[WebGPU] Start to run kernel "[${i}] ${s}"...`);
      let d = this.env.debug;
      this.temporaryData = [];
      try {
        return d && this.device.pushErrorScope("validation"), a(n, u[1]), 0;
      } catch (l) {
        return r.push(Promise.resolve(`[WebGPU] Kernel "[${i}] ${s}" failed. ${l}`)), 1;
      } finally {
        d && r.push(this.device.popErrorScope().then((l) => l ? `GPU validation error for kernel "[${i}] ${s}": ${l.message}` : null));
        for (let l of this.temporaryData) this.gpuDataManager.release(l.id);
        this.temporaryData = [], this.currentKernelId = null;
      }
    }
    registerBuffer(t, n, r, o) {
      let i = this.sessionExternalDataMapping.get(t);
      i || (i = /* @__PURE__ */ new Map(), this.sessionExternalDataMapping.set(t, i));
      let s = i.get(n), a = this.gpuDataManager.registerExternalBuffer(r, o, s);
      return i.set(n, [a, r]), a;
    }
    unregisterBuffers(t) {
      let n = this.sessionExternalDataMapping.get(t);
      n && (n.forEach((r) => this.gpuDataManager.unregisterExternalBuffer(r[0])), this.sessionExternalDataMapping.delete(t));
    }
    getBuffer(t) {
      let n = this.gpuDataManager.get(t);
      if (!n) throw new Error(`no GPU data for buffer: ${t}`);
      return n.buffer;
    }
    createDownloader(t, n, r) {
      return async () => {
        let o = await Wn(this, t, n);
        return qt(o.buffer, r);
      };
    }
    writeTimestamp(t) {
      this.queryType === "inside-passes" && this.computePassEncoder.writeTimestamp(this.querySet, t);
    }
    setQueryType() {
      this.queryType = "none", (this.env.webgpu.profiling?.mode === "default" || (typeof this.env.trace > "u" ? this.env.wasm.trace : this.env.trace)) && (this.device.features.has("chromium-experimental-timestamp-query-inside-passes") ? this.queryType = "inside-passes" : this.device.features.has("timestamp-query") && (this.queryType = "at-passes"), this.queryType !== "none" && typeof this.querySet > "u" && (this.querySet = this.device.createQuerySet({ type: "timestamp", count: this.maxDispatchNumber * 2 }), this.queryResolveBuffer = this.device.createBuffer({ size: this.maxDispatchNumber * 2 * 8, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.QUERY_RESOLVE })));
    }
    captureBegin() {
      Z("info", "captureBegin"), this.capturedCommandList.get(this.currentSessionId) || this.capturedCommandList.set(this.currentSessionId, []), this.capturedPendingKernels.get(this.currentSessionId) || this.capturedPendingKernels.set(this.currentSessionId, []), this.flush(), this.sessionStatus = "capturing";
    }
    captureEnd() {
      Z("info", "captureEnd"), this.flush(), this.sessionStatus = "default";
    }
    replay() {
      Z("info", "replay"), this.sessionStatus = "replaying";
      let t = this.capturedCommandList.get(this.currentSessionId), n = this.capturedPendingKernels.get(this.currentSessionId), r = t.length;
      this.pendingKernels = [];
      for (let o = 0; o < r; o++) {
        let i = this.getComputePassEncoder(), s = t[o];
        this.writeTimestamp(this.pendingDispatchNumber * 2), i.setPipeline(s.computePipeline), i.setBindGroup(0, s.bindGroup), i.dispatchWorkgroups(...s.dispatchGroup), this.writeTimestamp(this.pendingDispatchNumber * 2 + 1), this.pendingDispatchNumber++, this.queryType !== "none" && this.pendingKernels.push(n[o]), (this.pendingDispatchNumber >= this.maxDispatchNumber || this.queryType === "at-passes") && this.endComputePass(), this.pendingDispatchNumber >= this.maxDispatchNumber && this.flush();
      }
      this.flush(), this.sessionStatus = "default";
    }
    onCreateSession() {
      this.gpuDataManager.onCreateSession();
    }
    onReleaseSession(t) {
      this.unregisterBuffers(t), this.capturedCommandList.has(t) && this.capturedCommandList.delete(t), this.capturedPendingKernels.has(t) && this.capturedPendingKernels.delete(t), this.gpuDataManager.onReleaseSession(t);
    }
    onRunStart(t) {
      this.currentSessionId = t, this.setQueryType();
    }
  };
});
var Su = {};
lt(Su, { init: () => mp });
var wt, mr, mp, Tu = k(() => {
  N();
  Pe();
  H();
  _o();
  wt = class e {
    constructor(t, n, r, o) {
      this.module = t;
      this.dataType = n;
      this.data = r;
      this.dims = o;
    }
    getFloat32Array() {
      if (this.dataType !== 1) throw new Error("Invalid data type");
      let t = x$1.size(this.dims);
      return t === 0 ? new Float32Array() : new Float32Array(this.module.HEAP8.buffer, this.data, t);
    }
    getBigInt64Array() {
      if (this.dataType !== 7) throw new Error("Invalid data type");
      let t = x$1.size(this.dims);
      return t === 0 ? new BigInt64Array() : new BigInt64Array(this.module.HEAP8.buffer, this.data, t);
    }
    getInt32Array() {
      if (this.dataType !== 6) throw new Error("Invalid data type");
      let t = x$1.size(this.dims);
      return t === 0 ? new Int32Array() : new Int32Array(this.module.HEAP8.buffer, this.data, t);
    }
    getUint16Array() {
      if (this.dataType !== 10 && this.dataType !== 4) throw new Error("Invalid data type");
      let t = x$1.size(this.dims);
      return t === 0 ? new Uint16Array() : new Uint16Array(this.module.HEAP8.buffer, this.data, t);
    }
    reshape(t) {
      if (x$1.size(t) !== x$1.size(this.dims)) throw new Error("Invalid new shape");
      return new e(this.module, this.dataType, this.data, t);
    }
  }, mr = class {
    constructor(t, n, r) {
      this.module = t;
      this.backend = n;
      this.customDataOffset = 0;
      this.customDataSize = 0;
      this.adapterInfo = n.adapterInfo;
      let o = t.PTR_SIZE, i = r / t.PTR_SIZE, s = o === 4 ? "i32" : "i64";
      this.opKernelContext = Number(t.getValue(o * i++, s));
      let a = Number(t.getValue(o * i++, s));
      this.outputCount = Number(t.getValue(o * i++, s)), this.customDataOffset = Number(t.getValue(o * i++, "*")), this.customDataSize = Number(t.getValue(o * i++, s));
      let u = [];
      for (let d = 0; d < a; d++) {
        let l = Number(t.getValue(o * i++, s)), c = Number(t.getValue(o * i++, "*")), p = Number(t.getValue(o * i++, s)), f = [];
        for (let m = 0; m < p; m++) f.push(Number(t.getValue(o * i++, s)));
        u.push(new wt(t, l, c, f));
      }
      this.inputs = u;
    }
    get kernelCustomData() {
      return this.backend.currentKernelCustomData;
    }
    get customDataBuffer() {
      return this.module.HEAPU8.subarray(this.customDataOffset, this.customDataOffset + this.customDataSize);
    }
    compute(t, n) {
      let r = n?.inputs?.map((a) => typeof a == "number" ? this.inputs[a] : a) ?? this.inputs, o = n?.outputs ?? [], i = (a, u, d) => new wt(this.module, u, this.output(a, d), d), s = (a, u) => {
        let d = qe(a, u);
        if (!d) throw new Error(`Unsupported data type: ${a}`);
        let l = d > 0 ? this.backend.gpuDataManager.create(d).id : 0;
        return new wt(this.module, a, l, u);
      };
      return this.backend.run(t, r, o, i, s, this.outputCount);
    }
    output(t, n) {
      let r = this.module.stackSave();
      try {
        let o = this.module.PTR_SIZE, i = o === 4 ? "i32" : "i64", s = this.module.stackAlloc((1 + n.length) * o);
        this.module.setValue(s, n.length, i);
        for (let a = 0; a < n.length; a++) this.module.setValue(s + o * (a + 1), n[a], i);
        return this.module._JsepOutput(this.opKernelContext, t, s);
      } catch (o) {
        throw new Error(`Failed to generate kernel's output[${t}] with dims [${n}]. If you are running with pre-allocated output, please make sure the output type/dims are correct. Error: ${o}`);
      } finally {
        this.module.stackRestore(r);
      }
    }
  }, mp = async (e, t, n, r) => {
    let o = t.jsepInit;
    if (!o) throw new Error("Failed to initialize JSEP. The WebAssembly module is not built with JSEP support.");
    if (e === "webgpu") {
      let i = (xu(), xt(vu)).WebGpuBackend, s = new i();
      await s.initialize(n, r), o("webgpu", [s, (a) => s.alloc(Number(a)), (a) => s.free(a), (a, u, d, l = false) => {
        if (l) Z("verbose", () => `[WebGPU] jsepCopyGpuToGpu: src=${Number(a)}, dst=${Number(u)}, size=${Number(d)}`), s.memcpy(Number(a), Number(u));
        else {
          Z("verbose", () => `[WebGPU] jsepCopyCpuToGpu: dataOffset=${Number(a)}, gpuDataId=${Number(u)}, size=${Number(d)}`);
          let c = t.HEAPU8.subarray(Number(a >>> 0), Number(a >>> 0) + Number(d));
          s.upload(Number(u), c);
        }
      }, async (a, u, d) => {
        Z("verbose", () => `[WebGPU] jsepCopyGpuToCpu: gpuDataId=${a}, dataOffset=${u}, size=${d}`), await s.download(Number(a), () => t.HEAPU8.subarray(Number(u) >>> 0, Number(u + d) >>> 0));
      }, (a, u, d) => s.createKernel(a, Number(u), d, t.UTF8ToString(t._JsepGetNodeName(Number(u)))), (a) => s.releaseKernel(a), (a, u, d, l) => {
        Z("verbose", () => `[WebGPU] jsepRun: sessionHandle=${d}, kernel=${a}, contextDataOffset=${u}`);
        let c = new mr(t, s, Number(u));
        return s.computeKernel(Number(a), c, l);
      }, () => s.captureBegin(), () => s.captureEnd(), () => s.replay()]);
    } else {
      let i = new Zt(n);
      o("webnn", [i, () => i.reserveTensorId(), (s) => i.releaseTensorId(s), async (s, a, u, d, l) => i.ensureTensor(s, a, u, d, l), (s, a) => {
        i.uploadTensor(s, a);
      }, async (s, a) => i.downloadTensor(s, a), (s, a) => i.registerMLContext(s, a), !!n.trace]);
    }
  };
});
var fp, Pt, zt, tt, hp, Iu, pt, Bt, Dt, Cu, Ot, Mt, Ut, En = k(() => {
  we();
  io();
  ao();
  N();
  Ge();
  Nt();
  Dn();
  fp = (e, t) => {
    te()._OrtInit(e, t) !== 0 && Y("Can't initialize onnxruntime.");
  }, Pt = async (e) => {
    fp(e.wasm.numThreads, ft(e.logLevel));
  }, zt = async (e, t) => {
    te().asyncInit?.();
    let n = e.webgpu.adapter;
    if (t === "webgpu") {
      if (typeof navigator > "u" || !navigator.gpu) throw new Error("WebGPU is not supported in current environment");
      if (n) {
        if (typeof n.limits != "object" || typeof n.features != "object" || typeof n.requestDevice != "function") throw new Error("Invalid GPU adapter set in `env.webgpu.adapter`. It must be a GPUAdapter object.");
      } else {
        let r = e.webgpu.powerPreference;
        if (r !== void 0 && r !== "low-power" && r !== "high-performance") throw new Error(`Invalid powerPreference setting: "${r}"`);
        let o = e.webgpu.forceFallbackAdapter;
        if (o !== void 0 && typeof o != "boolean") throw new Error(`Invalid forceFallbackAdapter setting: "${o}"`);
        if (n = await navigator.gpu.requestAdapter({ powerPreference: r, forceFallbackAdapter: o }), !n) throw new Error('Failed to get GPU adapter. You may need to enable flag "--enable-unsafe-webgpu" if you are using Chrome.');
      }
    }
    if (t === "webnn" && (typeof navigator > "u" || !navigator.ml)) throw new Error("WebNN is not supported in current environment");
    {
      let r = (Tu(), xt(Su)).init;
      t === "webgpu" && await r("webgpu", te(), e, n), t === "webnn" && await r("webnn", te(), e);
    }
  }, tt = /* @__PURE__ */ new Map(), hp = (e) => {
    let t = te(), n = t.stackSave();
    try {
      let r = t.PTR_SIZE, o = t.stackAlloc(2 * r);
      t._OrtGetInputOutputCount(e, o, o + r) !== 0 && Y("Can't get session input/output count.");
      let s = r === 4 ? "i32" : "i64";
      return [Number(t.getValue(o, s)), Number(t.getValue(o + r, s))];
    } finally {
      t.stackRestore(n);
    }
  }, Iu = (e, t) => {
    let n = te(), r = n.stackSave(), o = 0;
    try {
      let i = n.PTR_SIZE, s = n.stackAlloc(2 * i);
      n._OrtGetInputOutputMetadata(e, t, s, s + i) !== 0 && Y("Can't get session input/output metadata.");
      let u = Number(n.getValue(s, "*"));
      o = Number(n.getValue(s + i, "*"));
      let d = n.HEAP32[o / 4];
      if (d === 0) return [u, 0];
      let l = n.HEAPU32[o / 4 + 1], c = [];
      for (let p = 0; p < l; p++) {
        let f = Number(n.getValue(o + 8 + p * i, "*"));
        c.push(f !== 0 ? n.UTF8ToString(f) : Number(n.getValue(o + 8 + (p + l) * i, "*")));
      }
      return [u, d, c];
    } finally {
      n.stackRestore(r), o !== 0 && n._OrtFree(o);
    }
  }, pt = (e) => {
    let t = te(), n = t._malloc(e.byteLength);
    if (n === 0) throw new Error(`Can't create a session. failed to allocate a buffer of size ${e.byteLength}.`);
    return t.HEAPU8.set(e, n), [n, e.byteLength];
  }, Bt = async (e, t) => {
    let n, r, o = te();
    Array.isArray(e) ? [n, r] = e : e.buffer === o.HEAPU8.buffer ? [n, r] = [e.byteOffset, e.byteLength] : [n, r] = pt(e);
    let i = 0, s = 0, a = 0, u = [], d = [], l = [];
    try {
      if ([s, u] = await so(t), t?.externalData && o.mountExternalData) {
        let w = [];
        for (let v of t.externalData) {
          let $ = typeof v == "string" ? v : v.path;
          w.push(ht(typeof v == "string" ? v : v.data).then((T) => {
            o.mountExternalData($, T);
          }));
        }
        await Promise.all(w);
      }
      for (let w of t?.executionProviders ?? []) if ((typeof w == "string" ? w : w.name) === "webnn") {
        if (o.shouldTransferToMLTensor = false, typeof w != "string") {
          let $ = w, T = $?.context, I = $?.gpuDevice, E = $?.deviceType, z = $?.powerPreference;
          T ? o.currentContext = T : I ? o.currentContext = await o.webnnCreateMLContext(I) : o.currentContext = await o.webnnCreateMLContext({ deviceType: E, powerPreference: z });
        } else o.currentContext = await o.webnnCreateMLContext();
        break;
      }
      i = await o._OrtCreateSession(n, r, s), o.webgpuOnCreateSession?.(i), i === 0 && Y("Can't create a session."), o.jsepOnCreateSession?.(), o.currentContext && (o.webnnRegisterMLContext(i, o.currentContext), o.currentContext = void 0, o.shouldTransferToMLTensor = true);
      let [c, p] = hp(i), f = !!t?.enableGraphCapture, m = [], h = [], _ = [], y = [], g = [];
      for (let w = 0; w < c; w++) {
        let [v, $, T] = Iu(i, w);
        v === 0 && Y("Can't get an input name."), d.push(v);
        let I = o.UTF8ToString(v);
        m.push(I), _.push($ === 0 ? { name: I, isTensor: false } : { name: I, isTensor: true, type: ke($), shape: T });
      }
      for (let w = 0; w < p; w++) {
        let [v, $, T] = Iu(i, w + c);
        v === 0 && Y("Can't get an output name."), l.push(v);
        let I = o.UTF8ToString(v);
        h.push(I), y.push($ === 0 ? { name: I, isTensor: false } : { name: I, isTensor: true, type: ke($), shape: T });
        {
          if (f && t?.preferredOutputLocation === void 0) {
            g.push("gpu-buffer");
            continue;
          }
          let E = typeof t?.preferredOutputLocation == "string" ? t.preferredOutputLocation : t?.preferredOutputLocation?.[I] ?? "cpu", z = o.webnnIsGraphOutput;
          if (E === "cpu" && z && z(i, I)) {
            g.push("ml-tensor-cpu-output");
            continue;
          }
          if (E !== "cpu" && E !== "cpu-pinned" && E !== "gpu-buffer" && E !== "ml-tensor") throw new Error(`Not supported preferred output location: ${E}.`);
          if (f && E !== "gpu-buffer") throw new Error(`Not supported preferred output location: ${E}. Only 'gpu-buffer' location is supported when enableGraphCapture is true.`);
          g.push(E);
        }
      }
      let b = null;
      return g.some((w) => w === "gpu-buffer" || w === "ml-tensor" || w === "ml-tensor-cpu-output") && (a = o._OrtCreateBinding(i), a === 0 && Y("Can't create IO binding."), b = { handle: a, outputPreferredLocations: g, outputPreferredLocationsEncoded: g.map((w) => w === "ml-tensor-cpu-output" ? "ml-tensor" : w).map((w) => Bn(w)) }), tt.set(i, [i, d, l, b, f, false]), [i, m, h, _, y];
    } catch (c) {
      throw d.forEach((p) => o._OrtFree(p)), l.forEach((p) => o._OrtFree(p)), a !== 0 && o._OrtReleaseBinding(a) !== 0 && Y("Can't release IO binding."), i !== 0 && o._OrtReleaseSession(i) !== 0 && Y("Can't release session."), c;
    } finally {
      o._free(n), s !== 0 && o._OrtReleaseSessionOptions(s) !== 0 && Y("Can't release session options."), u.forEach((c) => o._free(c)), o.unmountExternalData?.();
    }
  }, Dt = (e) => {
    let t = te(), n = tt.get(e);
    if (!n) throw new Error(`cannot release session. invalid session id: ${e}`);
    let [r, o, i, s, a] = n;
    s && (a && t._OrtClearBoundOutputs(s.handle) !== 0 && Y("Can't clear bound outputs."), t._OrtReleaseBinding(s.handle) !== 0 && Y("Can't release IO binding.")), t.jsepOnReleaseSession?.(e), t.webnnOnReleaseSession?.(e), t.webgpuOnReleaseSession?.(e), o.forEach((u) => t._OrtFree(u)), i.forEach((u) => t._OrtFree(u)), t._OrtReleaseSession(r) !== 0 && Y("Can't release session."), tt.delete(e);
  }, Cu = async (e, t, n, r, o, i, s = false) => {
    if (!e) {
      t.push(0);
      return;
    }
    let a = te(), u = a.PTR_SIZE, d = e[0], l = e[1], c = e[3], p = c, f, m;
    if (d === "string" && (c === "gpu-buffer" || c === "ml-tensor")) throw new Error("String tensor is not supported on GPU.");
    if (s && c !== "gpu-buffer") throw new Error(`External buffer must be provided for input/output index ${i} when enableGraphCapture is true.`);
    if (c === "gpu-buffer") {
      let y = e[2].gpuBuffer;
      m = qe(He(d), l);
      {
        let g = a.jsepRegisterBuffer;
        if (!g) throw new Error('Tensor location "gpu-buffer" is not supported without using WebGPU.');
        f = g(r, i, y, m);
      }
    } else if (c === "ml-tensor") {
      let y = e[2].mlTensor;
      m = qe(He(d), l);
      let g = a.webnnRegisterMLTensor;
      if (!g) throw new Error('Tensor location "ml-tensor" is not supported without using WebNN.');
      f = g(r, y, He(d), l);
    } else {
      let y = e[2];
      if (Array.isArray(y)) {
        m = u * y.length, f = a._malloc(m), n.push(f);
        for (let g = 0; g < y.length; g++) {
          if (typeof y[g] != "string") throw new TypeError(`tensor data at index ${g} is not a string`);
          a.setValue(f + g * u, ve(y[g], n), "*");
        }
      } else {
        let g = a.webnnIsGraphInput, b = a.webnnIsGraphOutput;
        if (d !== "string" && g && b) {
          let w = a.UTF8ToString(o);
          if (g(r, w) || b(r, w)) {
            let v = He(d);
            m = qe(v, l), p = "ml-tensor";
            let $ = a.webnnCreateTemporaryTensor, T = a.webnnUploadTensor;
            if (!$ || !T) throw new Error('Tensor location "ml-tensor" is not supported without using WebNN.');
            let I = await $(r, v, l);
            T(I, new Uint8Array(y.buffer, y.byteOffset, y.byteLength)), f = I;
          } else m = y.byteLength, f = a._malloc(m), n.push(f), a.HEAPU8.set(new Uint8Array(y.buffer, y.byteOffset, m), f);
        } else m = y.byteLength, f = a._malloc(m), n.push(f), a.HEAPU8.set(new Uint8Array(y.buffer, y.byteOffset, m), f);
      }
    }
    let h = a.stackSave(), _ = a.stackAlloc(4 * l.length);
    try {
      l.forEach((g, b) => a.setValue(_ + b * u, g, u === 4 ? "i32" : "i64"));
      let y = a._OrtCreateTensor(He(d), f, m, _, l.length, Bn(p));
      y === 0 && Y(`Can't create tensor for input/output. session=${r}, index=${i}.`), t.push(y);
    } finally {
      a.stackRestore(h);
    }
  }, Ot = async (e, t, n, r, o, i) => {
    let s = te(), a = s.PTR_SIZE, u = tt.get(e);
    if (!u) throw new Error(`cannot run inference. invalid session id: ${e}`);
    let d = u[0], l = u[1], c = u[2], p = u[3], f = u[4], m = u[5], h = t.length, _ = r.length, y = 0, g = [], b = [], w = [], v = [], $ = [], T = s.stackSave(), I = s.stackAlloc(h * a), E = s.stackAlloc(h * a), z = s.stackAlloc(_ * a), M = s.stackAlloc(_ * a);
    try {
      [y, g] = oo(i), Le("wasm prepareInputOutputTensor");
      for (let U = 0; U < h; U++) await Cu(n[U], b, v, e, l[t[U]], t[U], f);
      for (let U = 0; U < _; U++) await Cu(o[U], w, v, e, c[r[U]], h + r[U], f);
      We("wasm prepareInputOutputTensor");
      for (let U = 0; U < h; U++) s.setValue(I + U * a, b[U], "*"), s.setValue(E + U * a, l[t[U]], "*");
      for (let U = 0; U < _; U++) s.setValue(z + U * a, w[U], "*"), s.setValue(M + U * a, c[r[U]], "*");
      if (p && !m) {
        let { handle: U, outputPreferredLocations: R, outputPreferredLocationsEncoded: G } = p;
        if (l.length !== h) throw new Error(`input count from feeds (${h}) is expected to be always equal to model's input count (${l.length}).`);
        Le("wasm bindInputsOutputs");
        for (let V = 0; V < h; V++) {
          let j = t[V];
          await s._OrtBindInput(U, l[j], b[V]) !== 0 && Y(`Can't bind input[${V}] for session=${e}.`);
        }
        for (let V = 0; V < _; V++) {
          let j = r[V];
          o[V]?.[3] ? ($.push(w[V]), s._OrtBindOutput(U, c[j], w[V], 0) !== 0 && Y(`Can't bind pre-allocated output[${V}] for session=${e}.`)) : s._OrtBindOutput(U, c[j], 0, G[j]) !== 0 && Y(`Can't bind output[${V}] to ${R[V]} for session=${e}.`);
        }
        We("wasm bindInputsOutputs"), tt.set(e, [d, l, c, p, f, true]);
      }
      s.jsepOnRunStart?.(d), s.webnnOnRunStart?.(d);
      let O;
      p ? O = await s._OrtRunWithBinding(d, p.handle, _, z, y) : O = await s._OrtRun(d, E, I, h, M, _, z, y), O !== 0 && Y("failed to call OrtRun().");
      let W = [], K = [];
      Le("wasm ProcessOutputTensor");
      for (let U = 0; U < _; U++) {
        let R = Number(s.getValue(z + U * a, "*"));
        if (R === w[U] || $.includes(w[U])) {
          W.push(o[U]), R !== w[U] && s._OrtReleaseTensor(R) !== 0 && Y("Can't release tensor.");
          continue;
        }
        let G = s.stackSave(), V = s.stackAlloc(4 * a), j = false, Q, X = 0;
        try {
          s._OrtGetTensorData(R, V, V + a, V + 2 * a, V + 3 * a) !== 0 && Y(`Can't access output tensor data on index ${U}.`);
          let se = a === 4 ? "i32" : "i64", A = Number(s.getValue(V, se));
          X = s.getValue(V + a, "*");
          let B = s.getValue(V + a * 2, "*"), oe = Number(s.getValue(V + a * 3, se)), he = [];
          for (let ie = 0; ie < oe; ie++) he.push(Number(s.getValue(B + ie * a, se)));
          s._OrtFree(B) !== 0 && Y("Can't free memory for tensor dims.");
          let ae = he.reduce((ie, de) => ie * de, 1);
          Q = ke(A);
          let ge = p?.outputPreferredLocations[r[U]];
          if (Q === "string") {
            if (ge === "gpu-buffer" || ge === "ml-tensor") throw new Error("String tensor is not supported on GPU.");
            let ie = [];
            for (let de = 0; de < ae; de++) {
              let Ne = s.getValue(X + de * a, "*"), vt = s.getValue(X + (de + 1) * a, "*"), yr = de === ae - 1 ? void 0 : vt - Ne;
              ie.push(s.UTF8ToString(Ne, yr));
            }
            W.push([Q, he, ie, "cpu"]);
          } else if (ge === "gpu-buffer" && ae > 0) {
            let ie = s.jsepGetBuffer;
            if (!ie) throw new Error('preferredLocation "gpu-buffer" is not supported without using WebGPU.');
            let de = ie(X), Ne = qe(A, ae);
            if (Ne === void 0 || !Lt(Q)) throw new Error(`Unsupported data type: ${Q}`);
            j = true, W.push([Q, he, { gpuBuffer: de, download: s.jsepCreateDownloader(de, Ne, Q), dispose: () => {
              s._OrtReleaseTensor(R) !== 0 && Y("Can't release tensor.");
            } }, "gpu-buffer"]);
          } else if (ge === "ml-tensor" && ae > 0) {
            let ie = s.webnnEnsureTensor, de = s.webnnIsGraphInputOutputTypeSupported;
            if (!ie || !de) throw new Error('preferredLocation "ml-tensor" is not supported without using WebNN.');
            if (qe(A, ae) === void 0 || !Wt(Q)) throw new Error(`Unsupported data type: ${Q}`);
            if (!de(e, Q, false)) throw new Error(`preferredLocation "ml-tensor" for ${Q} output is not supported by current WebNN Context.`);
            let vt = await ie(e, X, A, he, false);
            j = true, W.push([Q, he, { mlTensor: vt, download: s.webnnCreateMLTensorDownloader(X, Q), dispose: () => {
              s.webnnReleaseTensorId(X), s._OrtReleaseTensor(R);
            } }, "ml-tensor"]);
          } else if (ge === "ml-tensor-cpu-output" && ae > 0) {
            let ie = s.webnnCreateMLTensorDownloader(X, Q)(), de = W.length;
            j = true, K.push((async () => {
              let Ne = [de, await ie];
              return s.webnnReleaseTensorId(X), s._OrtReleaseTensor(R), Ne;
            })()), W.push([Q, he, [], "cpu"]);
          } else {
            let ie = ot(Q), de = new ie(ae);
            new Uint8Array(de.buffer, de.byteOffset, de.byteLength).set(s.HEAPU8.subarray(X, X + de.byteLength)), W.push([Q, he, de, "cpu"]);
          }
        } finally {
          s.stackRestore(G), Q === "string" && X && s._free(X), j || s._OrtReleaseTensor(R);
        }
      }
      p && !f && (s._OrtClearBoundOutputs(p.handle) !== 0 && Y("Can't clear bound outputs."), tt.set(e, [d, l, c, p, f, false]));
      for (let [U, R] of await Promise.all(K)) W[U][2] = R;
      return We("wasm ProcessOutputTensor"), W;
    } finally {
      s.webnnOnRunEnd?.(d), s.stackRestore(T), b.forEach((O) => s._OrtReleaseTensor(O)), w.forEach((O) => s._OrtReleaseTensor(O)), v.forEach((O) => s._free(O)), y !== 0 && s._OrtReleaseRunOptions(y), g.forEach((O) => s._free(O));
    }
  }, Mt = (e) => {
    let t = te(), n = tt.get(e);
    if (!n) throw new Error("invalid session id");
    let r = n[0], o = t._OrtEndProfiling(r);
    o === 0 && Y("Can't get an profile file name."), t._OrtFree(o);
  }, Ut = (e) => {
    let t = [];
    for (let n of e) {
      let r = n[2];
      !Array.isArray(r) && "buffer" in r && t.push(r.buffer);
    }
    return t;
  };
});
var nt, xe, $t, yn, bn, gn, fr, hr, ut, dt, yp, Au, Eu, ku, Pu, zu, Bu, Du, gr = k(() => {
  we();
  En();
  Ge();
  Et();
  nt = () => !!ne.wasm.proxy && typeof document < "u", $t = false, yn = false, bn = false, hr = /* @__PURE__ */ new Map(), ut = (e, t) => {
    let n = hr.get(e);
    n ? n.push(t) : hr.set(e, [t]);
  }, dt = () => {
    if ($t || !yn || bn || !xe) throw new Error("worker not ready");
  }, yp = (e) => {
    switch (e.data.type) {
      case "init-wasm":
        $t = false, e.data.err ? (bn = true, fr[1](e.data.err)) : (yn = true, fr[0]()), gn && (URL.revokeObjectURL(gn), gn = void 0);
        break;
      case "init-ep":
      case "copy-from":
      case "create":
      case "release":
      case "run":
      case "end-profiling": {
        let t = hr.get(e.data.type);
        e.data.err ? t.shift()[1](e.data.err) : t.shift()[0](e.data.out);
        break;
      }
    }
  }, Au = async () => {
    if (!yn) {
      if ($t) throw new Error("multiple calls to 'initWasm()' detected.");
      if (bn) throw new Error("previous call to 'initWasm()' failed.");
      if ($t = true, nt()) return new Promise((e, t) => {
        xe?.terminate(), to().then(([n, r]) => {
          try {
            xe = r, xe.onerror = (i) => t(i), xe.onmessage = yp, fr = [e, t];
            let o = { type: "init-wasm", in: ne };
            if (!o.in.wasm.wasmPaths && n) {
              let i = Rt();
              i && (o.in.wasm.wasmPaths = i);
            }
            xe.postMessage(o), gn = n;
          } catch (o) {
            t(o);
          }
        }, t);
      });
      try {
        await kt(ne.wasm), await Pt(ne), yn = true;
      } catch (e) {
        throw bn = true, e;
      } finally {
        $t = false;
      }
    }
  }, Eu = async (e) => {
    if (nt()) return dt(), new Promise((t, n) => {
      ut("init-ep", [t, n]);
      let r = { type: "init-ep", in: { epName: e, env: ne } };
      xe.postMessage(r);
    });
    await zt(ne, e);
  }, ku = async (e) => nt() ? (dt(), new Promise((t, n) => {
    ut("copy-from", [t, n]);
    let r = { type: "copy-from", in: { buffer: e } };
    xe.postMessage(r, [e.buffer]);
  })) : pt(e), Pu = async (e, t) => {
    if (nt()) {
      if (t?.preferredOutputLocation) throw new Error('session option "preferredOutputLocation" is not supported for proxy.');
      return dt(), new Promise((n, r) => {
        ut("create", [n, r]);
        let o = { type: "create", in: { model: e, options: { ...t } } }, i = [];
        e instanceof Uint8Array && i.push(e.buffer), xe.postMessage(o, i);
      });
    } else return Bt(e, t);
  }, zu = async (e) => {
    if (nt()) return dt(), new Promise((t, n) => {
      ut("release", [t, n]);
      let r = { type: "release", in: e };
      xe.postMessage(r);
    });
    Dt(e);
  }, Bu = async (e, t, n, r, o, i) => {
    if (nt()) {
      if (n.some((s) => s[3] !== "cpu")) throw new Error("input tensor on GPU is not supported for proxy.");
      if (o.some((s) => s)) throw new Error("pre-allocated output tensor is not supported for proxy.");
      return dt(), new Promise((s, a) => {
        ut("run", [s, a]);
        let u = n, d = { type: "run", in: { sessionId: e, inputIndices: t, inputs: u, outputIndices: r, options: i } };
        xe.postMessage(d, Ut(u));
      });
    } else return Ot(e, t, n, r, o, i);
  }, Du = async (e) => {
    if (nt()) return dt(), new Promise((t, n) => {
      ut("end-profiling", [t, n]);
      let r = { type: "end-profiling", in: e };
      xe.postMessage(r);
    });
    Mt(e);
  };
});
var Ou, bp, _n, Mu = k(() => {
  we();
  gr();
  N();
  At();
  Dn();
  Ou = (e, t) => {
    switch (e.location) {
      case "cpu":
        return [e.type, e.dims, e.data, "cpu"];
      case "gpu-buffer":
        return [e.type, e.dims, { gpuBuffer: e.gpuBuffer }, "gpu-buffer"];
      case "ml-tensor":
        return [e.type, e.dims, { mlTensor: e.mlTensor }, "ml-tensor"];
      default:
        throw new Error(`invalid data location: ${e.location} for ${t()}`);
    }
  }, bp = (e) => {
    switch (e[3]) {
      case "cpu":
        return new Te(e[0], e[2], e[1]);
      case "gpu-buffer": {
        let t = e[0];
        if (!Lt(t)) throw new Error(`not supported data type: ${t} for deserializing GPU tensor`);
        let { gpuBuffer: n, download: r, dispose: o } = e[2];
        return Te.fromGpuBuffer(n, { dataType: t, dims: e[1], download: r, dispose: o });
      }
      case "ml-tensor": {
        let t = e[0];
        if (!Wt(t)) throw new Error(`not supported data type: ${t} for deserializing MLTensor tensor`);
        let { mlTensor: n, download: r, dispose: o } = e[2];
        return Te.fromMLTensor(n, { dataType: t, dims: e[1], download: r, dispose: o });
      }
      default:
        throw new Error(`invalid data location: ${e[3]}`);
    }
  }, _n = class {
    async fetchModelAndCopyToWasmMemory(t) {
      return ku(await ht(t));
    }
    async loadModel(t, n) {
      _e();
      let r;
      typeof t == "string" ? r = await this.fetchModelAndCopyToWasmMemory(t) : r = t, [this.sessionId, this.inputNames, this.outputNames, this.inputMetadata, this.outputMetadata] = await Pu(r, n), ye();
    }
    async dispose() {
      return zu(this.sessionId);
    }
    async run(t, n, r) {
      _e();
      let o = [], i = [];
      Object.entries(t).forEach((p) => {
        let f = p[0], m = p[1], h = this.inputNames.indexOf(f);
        if (h === -1) throw new Error(`invalid input '${f}'`);
        o.push(m), i.push(h);
      });
      let s = [], a = [];
      Object.entries(n).forEach((p) => {
        let f = p[0], m = p[1], h = this.outputNames.indexOf(f);
        if (h === -1) throw new Error(`invalid output '${f}'`);
        s.push(m), a.push(h);
      });
      let u = o.map((p, f) => Ou(p, () => `input "${this.inputNames[i[f]]}"`)), d = s.map((p, f) => p ? Ou(p, () => `output "${this.outputNames[a[f]]}"`) : null), l = await Bu(this.sessionId, i, u, a, d, r), c = {};
      for (let p = 0; p < l.length; p++) c[this.outputNames[a[p]]] = s[p] ?? bp(l[p]);
      return ye(), c;
    }
    startProfiling() {
    }
    endProfiling() {
      Du(this.sessionId);
    }
  };
});
var Ru = {};
lt(Ru, { OnnxruntimeWebAssemblyBackend: () => wn, initializeFlags: () => Uu, wasmBackend: () => _p });
var Uu, wn, _p, Vu = k(() => {
  we();
  gr();
  Mu();
  Uu = () => {
    (typeof ne.wasm.initTimeout != "number" || ne.wasm.initTimeout < 0) && (ne.wasm.initTimeout = 0);
    let e = ne.wasm.simd;
    if (typeof e != "boolean" && e !== void 0 && e !== "fixed" && e !== "relaxed" && (console.warn(`Property "env.wasm.simd" is set to unknown value "${e}". Reset it to \`false\` and ignore SIMD feature checking.`), ne.wasm.simd = false), typeof ne.wasm.proxy != "boolean" && (ne.wasm.proxy = false), typeof ne.wasm.trace != "boolean" && (ne.wasm.trace = false), typeof ne.wasm.numThreads != "number" || !Number.isInteger(ne.wasm.numThreads) || ne.wasm.numThreads <= 0) if (typeof self < "u" && !self.crossOriginIsolated) ne.wasm.numThreads = 1;
    else {
      let t = typeof navigator > "u" ? vn("node:os").cpus().length : navigator.hardwareConcurrency;
      ne.wasm.numThreads = Math.min(4, Math.ceil((t || 1) / 2));
    }
  }, wn = class {
    async init(t) {
      Uu(), await Au(), await Eu(t);
    }
    async createInferenceSessionHandler(t, n) {
      let r = new _n();
      return await r.loadModel(t, n), r;
    }
  }, _p = new wn();
});
we();
we();
we();
var Fr = "1.26.0";
{
  let e = (Vu(), xt(Ru)).wasmBackend;
  Ze("webgpu", e, 5), Ze("webnn", e, 5), Ze("cpu", e, 10), Ze("wasm", e, 10);
}
Object.defineProperty(ne.versions, "web", { value: Fr, enumerable: true });
class RvcError extends Error {
  code;
  cause;
  constructor(code, message, cause) {
    super(message);
    this.code = code;
    this.cause = cause;
    this.name = "WebRvcError";
    Object.setPrototypeOf(this, RvcError.prototype);
  }
}
const ErrorCodes = {
  AUDIO_FILE_EMPTY: "AUDIO_FILE_EMPTY",
  AUDIO_INVALID_TYPE: "AUDIO_INVALID_TYPE",
  AUDIO_FILE_READ_FAILED: "AUDIO_FILE_READ_FAILED",
  AUDIO_DECODE_FAILED: "AUDIO_DECODE_FAILED",
  AUDIO_RESAMPLE_INVALID_RATE: "AUDIO_RESAMPLE_INVALID_RATE",
  MODEL_FILE_EMPTY: "MODEL_FILE_EMPTY",
  MODEL_UNSUPPORTED_FORMAT: "MODEL_UNSUPPORTED_FORMAT",
  MODEL_READ_FAILED: "MODEL_READ_FAILED",
  MODEL_CONVERTER_UNAVAILABLE: "MODEL_CONVERTER_UNAVAILABLE",
  MODEL_CONVERSION_FAILED: "MODEL_CONVERSION_FAILED",
  MODEL_VERIFY_SESSION_FAILED: "MODEL_VERIFY_SESSION_FAILED",
  MODEL_VERIFY_RUN_FAILED: "MODEL_VERIFY_RUN_FAILED",
  MODEL_VERIFY_UNSUPPORTED_INPUT: "MODEL_VERIFY_UNSUPPORTED_INPUT",
  SYNTH_FEED_BUILD_FAILED: "SYNTH_FEED_BUILD_FAILED",
  SYNTH_INFERENCE_FAILED: "SYNTH_INFERENCE_FAILED",
  SYNTH_OUTPUT_PARSE_FAILED: "SYNTH_OUTPUT_PARSE_FAILED",
  FEATURE_MODEL_LOAD_FAILED: "FEATURE_MODEL_LOAD_FAILED",
  FEATURE_PREPROCESS_FAILED: "FEATURE_PREPROCESS_FAILED",
  FEATURE_INFERENCE_FAILED: "FEATURE_INFERENCE_FAILED",
  FEATURE_INVALID_AUDIO: "FEATURE_INVALID_AUDIO",
  PITCH_MODEL_LOAD_FAILED: "PITCH_MODEL_LOAD_FAILED",
  PITCH_INFERENCE_FAILED: "PITCH_INFERENCE_FAILED",
  WORKER_TIMEOUT: "WORKER_TIMEOUT",
  WORKER_UNKNOWN_ERROR: "WORKER_UNKNOWN_ERROR",
  WORKER_FETCH_FAILED: "WORKER_FETCH_FAILED"
};
const SUPPORTED_AUDIO_TYPES = /* @__PURE__ */ new Set(["audio/mpeg", "audio/wav", "audio/wave", "audio/x-wav"]);
const SUPPORTED_AUDIO_EXTENSIONS = /* @__PURE__ */ new Set([".mp3", ".wav"]);
async function readAsArrayBuffer(file) {
  validateAudioFile(file);
  try {
    return await file.arrayBuffer();
  } catch (cause) {
    throw new RvcError(
      ErrorCodes.AUDIO_FILE_READ_FAILED,
      `Failed to read audio file "${file.name}".`,
      cause
    );
  }
}
function validateAudioFile(file) {
  if (file.size === 0) {
    throw new RvcError(ErrorCodes.AUDIO_FILE_EMPTY, `The audio file "${file.name}" is empty.`);
  }
  const mime = file.type.toLowerCase();
  const extension = getFileExtension(file.name);
  const mimeAllowed = mime.length > 0 && SUPPORTED_AUDIO_TYPES.has(mime);
  const extensionAllowed = SUPPORTED_AUDIO_EXTENSIONS.has(extension);
  if (!mimeAllowed && !extensionAllowed) {
    throw new RvcError(
      ErrorCodes.AUDIO_INVALID_TYPE,
      `Unsupported audio file "${file.name}". Only mp3/wav are allowed.`
    );
  }
}
function getFileExtension(name) {
  const dot = name.lastIndexOf(".");
  if (dot < 0) {
    return "";
  }
  return name.slice(dot).toLowerCase();
}
async function decodeToAudioBuffer(buffer) {
  if (buffer.byteLength === 0) {
    throw new RvcError(
      ErrorCodes.AUDIO_DECODE_FAILED,
      "Failed to decode audio: input buffer is empty."
    );
  }
  const ctx = createAudioContext();
  try {
    return await ctx.decodeAudioData(buffer.slice(0));
  } catch (cause) {
    throw new RvcError(ErrorCodes.AUDIO_DECODE_FAILED, "Failed to decode audio data.", cause);
  } finally {
    try {
      await ctx.close();
    } catch {
    }
  }
}
function createAudioContext() {
  const g = globalThis;
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) {
    throw new RvcError(
      ErrorCodes.AUDIO_DECODE_FAILED,
      "Failed to decode audio: AudioContext is not supported in this environment."
    );
  }
  try {
    return new Ctor();
  } catch (cause) {
    throw new RvcError(
      ErrorCodes.AUDIO_DECODE_FAILED,
      "Failed to initialize AudioContext for decoding.",
      cause
    );
  }
}
function downmixToMono(audioBuffer) {
  if (audioBuffer.numberOfChannels === 1) {
    return new Float32Array(audioBuffer.getChannelData(0));
  }
  const mono = new Float32Array(audioBuffer.length);
  const channels = audioBuffer.numberOfChannels;
  for (let c = 0; c < channels; c += 1) {
    const ch = audioBuffer.getChannelData(c);
    for (let i = 0; i < audioBuffer.length; i += 1) {
      mono[i] += ch[i] / channels;
    }
  }
  return mono;
}
function resampleTo16k(data, originalRate) {
  const TARGET_RATE = 16e3;
  const resampled = resampleAudio(data, originalRate, TARGET_RATE);
  return { audio: resampled, sampleRate: TARGET_RATE };
}
function resampleAudio(data, originalRate, targetRate) {
  if (!Number.isFinite(originalRate) || originalRate <= 0) {
    throw new RvcError(
      ErrorCodes.AUDIO_RESAMPLE_INVALID_RATE,
      `Invalid input sample rate: ${originalRate}.`
    );
  }
  if (!Number.isFinite(targetRate) || targetRate <= 0) {
    throw new RvcError(
      ErrorCodes.AUDIO_RESAMPLE_INVALID_RATE,
      `Invalid target sample rate: ${targetRate}.`
    );
  }
  if (originalRate === targetRate) {
    return data;
  }
  if (data.length === 0) {
    return new Float32Array(0);
  }
  const ratio = originalRate / targetRate;
  const outputLength = Math.max(1, Math.round(data.length / ratio));
  const output = new Float32Array(outputLength);
  const lastIndex = data.length - 1;
  for (let i = 0; i < outputLength; i += 1) {
    const sourcePos = i * ratio;
    const left = Math.floor(sourcePos);
    const right = Math.min(left + 1, lastIndex);
    const t = sourcePos - left;
    output[i] = data[left] * (1 - t) + data[right] * t;
  }
  return output;
}
async function prepareInputAudio(file) {
  const bytes = await readAsArrayBuffer(file);
  const decoded = await decodeToAudioBuffer(bytes);
  const mono = downmixToMono(decoded);
  const audio16k = resampleTo16k(mono, decoded.sampleRate);
  return { audio: audio16k.audio, sampleRate: audio16k.sampleRate };
}
const DEFAULT_CHUNK_DURATION = 20;
const DEFAULT_PAD_DURATION = 0.5;
const DEFAULT_INPUT_SAMPLE_RATE = 16e3;
const DEFAULT_OUTPUT_SAMPLE_RATE = 40e3;
function splitAudioIntoChunks(audio, config = {}) {
  const chunkDuration = config.chunkDuration ?? DEFAULT_CHUNK_DURATION;
  const padDuration = config.padDuration ?? DEFAULT_PAD_DURATION;
  const sampleRate = config.inputSampleRate ?? DEFAULT_INPUT_SAMPLE_RATE;
  const chunkSamples = Math.floor(chunkDuration * sampleRate);
  const padSamples = Math.floor(padDuration * sampleRate);
  const totalSamples = audio.length;
  let numChunks = Math.ceil(totalSamples / chunkSamples);
  const lastChunkStart = (numChunks - 1) * chunkSamples;
  const lastChunkDuration = (totalSamples - lastChunkStart) / sampleRate;
  const MIN_CHUNK_DURATION = 10;
  if (numChunks > 1 && lastChunkDuration < MIN_CHUNK_DURATION) {
    numChunks = numChunks - 1;
  }
  if (numChunks === 1) {
    return [
      {
        data: audio,
        index: 0,
        startTime: 0,
        endTime: totalSamples / sampleRate,
        isFirst: true,
        isLast: true
      }
    ];
  }
  const chunks = [];
  for (let i = 0; i < numChunks; i++) {
    const startSample = i * chunkSamples;
    const endSample = Math.min(startSample + chunkSamples, totalSamples);
    const originalChunk = audio.slice(startSample, endSample);
    const paddedChunk = padAudioMirror(originalChunk, padSamples, audio, startSample, endSample);
    chunks.push({
      data: paddedChunk,
      index: i,
      startTime: startSample / sampleRate,
      endTime: endSample / sampleRate,
      isFirst: i === 0,
      isLast: i === numChunks - 1
    });
  }
  return chunks;
}
function padAudioSymmetric(audio, padSamples) {
  const result = new Float32Array(audio.length + 2 * padSamples);
  for (let i = 0; i < padSamples; i++) {
    result[padSamples - 1 - i] = audio[Math.min(i, audio.length - 1)];
  }
  result.set(audio, padSamples);
  for (let i = 0; i < padSamples; i++) {
    result[padSamples + audio.length + i] = audio[Math.max(0, audio.length - 1 - i)];
  }
  return result;
}
function padAudioMirror(chunk, padSamples, fullAudio, chunkStart, chunkEnd) {
  const result = new Float32Array(chunk.length + 2 * padSamples);
  for (let i = 0; i < padSamples; i++) {
    const sourceIdx = chunkStart + i;
    if (sourceIdx < fullAudio.length) {
      result[padSamples - 1 - i] = fullAudio[sourceIdx];
    } else {
      result[padSamples - 1 - i] = chunk[0];
    }
  }
  result.set(chunk, padSamples);
  for (let i = 0; i < padSamples; i++) {
    const sourceIdx = chunkEnd - 1 - i;
    if (sourceIdx >= 0) {
      result[padSamples + chunk.length + i] = fullAudio[sourceIdx];
    } else {
      result[padSamples + chunk.length + i] = chunk[chunk.length - 1];
    }
  }
  return result;
}
function mergeProcessedChunks(chunks, config = {}) {
  if (chunks.length === 0) {
    return new Float32Array(0);
  }
  if (chunks.length === 1) {
    return chunks[0];
  }
  const padDuration = config.padDuration ?? DEFAULT_PAD_DURATION;
  const chunkDuration = config.chunkDuration ?? DEFAULT_CHUNK_DURATION;
  const outputSampleRate = config.outputSampleRate ?? (chunks[0].length > 0 ? Math.round(chunks[0].length / (chunkDuration + 2 * padDuration)) : DEFAULT_OUTPUT_SAMPLE_RATE);
  const padSamples = Math.floor(padDuration * outputSampleRate);
  const crossfadeSamples = Math.min(Math.floor(outputSampleRate * 0.05), Math.floor(padSamples / 2)); // 50ms smooth crossfade

  let totalLength = 0;
  const trimmedChunks = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const trimStart = padSamples;
    const trimEnd = chunk.length - padSamples;
    if (trimStart >= trimEnd) {
      trimmedChunks.push(chunk);
      totalLength += chunk.length;
      continue;
    }
    const trimmed = chunk.slice(trimStart, trimEnd);
    trimmedChunks.push(trimmed);
    totalLength += trimmed.length;
  }

  if (crossfadeSamples <= 0 || trimmedChunks.length <= 1) {
    const result = new Float32Array(totalLength);
    let offset = 0;
    for (const trimmed of trimmedChunks) {
      result.set(trimmed, offset);
      offset += trimmed.length;
    }
    return result;
  }

  const finalLen = totalLength - (trimmedChunks.length - 1) * crossfadeSamples;
  const result = new Float32Array(Math.max(0, finalLen));
  let writeOffset = 0;

  for (let i = 0; i < trimmedChunks.length; i++) {
    const cur = trimmedChunks[i];
    if (i === 0) {
      result.set(cur, 0);
      writeOffset = cur.length - crossfadeSamples;
    } else {
      for (let j = 0; j < crossfadeSamples; j++) {
        const t = j / crossfadeSamples;
        const wOut = Math.cos(t * Math.PI * 0.5);
        const wIn = Math.sin(t * Math.PI * 0.5);
        result[writeOffset + j] = result[writeOffset + j] * wOut + cur[j] * wIn;
      }
      if (cur.length > crossfadeSamples) {
        result.set(cur.subarray(crossfadeSamples), writeOffset + crossfadeSamples);
      }
      writeOffset += cur.length - crossfadeSamples;
    }
  }
  return result;
}
async function processAudioInChunks(audio, processor, config = {}, onProgress) {
  const chunks = splitAudioIntoChunks(audio, config);
  const processedChunks = [];
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(i + 1, chunks.length);
    const processed = await processor(chunks[i], i + 1, chunks.length);
    processedChunks.push(processed);
    if (i < chunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  return mergeProcessedChunks(processedChunks, config);
}
const CONTENTVEC_PAD_MULTIPLE = 160;
function preprocessForContentVec(audio, options = {}) {
  const { normalize = true } = options;
  const processed = normalize ? layerNormalize(audio) : audio;
  return padToMultiple(processed, CONTENTVEC_PAD_MULTIPLE);
}
function layerNormalize(audio) {
  if (audio.length === 0) {
    return new Float32Array(0);
  }
  let sum = 0;
  for (let i = 0; i < audio.length; i++) {
    sum += audio[i];
  }
  const mean = sum / audio.length;
  let variance = 0;
  for (let i = 0; i < audio.length; i++) {
    const diff = audio[i] - mean;
    variance += diff * diff;
  }
  const std = Math.sqrt(variance / audio.length + 1e-5);
  const normalized = new Float32Array(audio.length);
  for (let i = 0; i < audio.length; i++) {
    normalized[i] = (audio[i] - mean) / std;
  }
  return normalized;
}
function padToMultiple(audio, multiple) {
  const remainder = audio.length % multiple;
  if (remainder === 0) {
    return audio;
  }
  const padding = multiple - remainder;
  const padded = new Float32Array(audio.length + padding);
  padded.set(audio);
  padded.fill(0, audio.length);
  return padded;
}
async function loadContentVecModel(source, onProgress) {
  const arrayBuffer = source instanceof File ? await readFileWithProgress(source, onProgress) : source;
  return createSession$1(arrayBuffer);
}
async function createSession$1(arrayBuffer) {
  try {
    const session = await qu.create(arrayBuffer, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "disabled"
    });
    return session;
  } catch (cause) {
    throw new RvcError(
      ErrorCodes.FEATURE_MODEL_LOAD_FAILED,
      "Failed to create ContentVec ONNX session.",
      cause
    );
  }
}
async function readFileWithProgress(file, onProgress) {
  if (!onProgress) {
    return file.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded, event.total);
      }
    };
    reader.onload = () => {
      onProgress(file.size, file.size);
      resolve(reader.result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}
async function runContentVecInference(session, audio) {
  try {
    const inputNames = session.inputNames;
    const outputNames = session.outputNames;
    const feeds = {};
    if (inputNames.length === 1 && inputNames[0] === "source") {
      feeds.source = new Te("float32", audio, [1, 1, audio.length]);
    } else {
      for (const name of inputNames) {
        if (name === "source") {
          feeds[name] = new Te("float32", audio, [1, audio.length]);
        } else if (name === "padding_mask") {
          feeds[name] = new Te("bool", new Uint8Array(audio.length).fill(0), [
            1,
            audio.length
          ]);
        } else if (name === "output_layer") {
          feeds[name] = new Te("int64", new BigInt64Array([12n]), [1]);
        }
      }
    }
    const results = await session.run(feeds);
    const output = results[outputNames[0]];
    let features;
    let frameCount;
    let featureSize;
    if (output.dims.length === 3) {
      const [batch, dim1, dim2] = output.dims;
      if (dim1 === 768 || dim1 === 256) {
        featureSize = dim1;
        frameCount = dim2;
        features = transposeFeatures(output.data, batch, featureSize, frameCount);
      } else if (dim2 === 768 || dim2 === 256) {
        frameCount = dim1;
        featureSize = dim2;
        features = output.data;
      } else {
        if (dim1 > dim2) {
          frameCount = dim1;
          featureSize = dim2;
          features = output.data;
        } else {
          featureSize = dim1;
          frameCount = dim2;
          features = transposeFeatures(output.data, batch, featureSize, frameCount);
        }
      }
    } else {
      throw new Error(`Unexpected output shape: ${output.dims.join(", ")}`);
    }
    const upsampled = upsampleFeaturesRepeat(features, frameCount, featureSize);
    return {
      hiddenStates: upsampled,
      frameCount,
      upsampledFrameCount: frameCount * 2,
      featureSize
    };
  } catch (cause) {
    throw new RvcError(ErrorCodes.FEATURE_INFERENCE_FAILED, "ContentVec inference failed.", cause);
  }
}
function transposeFeatures(data, batch, featureSize, frameCount) {
  const result = new Float32Array(batch * frameCount * featureSize);
  for (let b = 0; b < batch; b++) {
    for (let f = 0; f < featureSize; f++) {
      for (let t = 0; t < frameCount; t++) {
        const srcIdx = b * featureSize * frameCount + f * frameCount + t;
        const dstIdx = b * frameCount * featureSize + t * featureSize + f;
        result[dstIdx] = data[srcIdx];
      }
    }
  }
  return result;
}
function upsampleFeaturesRepeat(features, frameCount, featureSize) {
  const upsampledCount = frameCount * 2;
  const result = new Float32Array(upsampledCount * featureSize);
  for (let i = 0; i < frameCount; i++) {
    const srcOffset = i * featureSize;
    const dstOffset1 = (2 * i) * featureSize;
    const dstOffset2 = (2 * i + 1) * featureSize;
    const slice = features.subarray(srcOffset, srcOffset + featureSize);
    result.set(slice, dstOffset1);
    result.set(slice, dstOffset2);
  }
  return result;
}
async function extractHubertFeatures(audio, options) {
  const processed = preprocessForContentVec(audio, { normalize: true });
  const session = options.contentVec instanceof File ? await loadContentVecModel(options.contentVec, options.onModelProgress) : options.contentVec;
  return await runContentVecInference(session, processed);
}
const DEFAULT_BACKENDS = ["wasm"];
async function createSessionFromOnnxBuffer(onnxBuffer, options = {}) {
  const backends = normalizeBackends(options.preferredBackends);
  const sessionOptions = options.sessionOptions;
  let lastCause;
  for (const backend of backends) {
    try {
      const session = await qu.create(onnxBuffer, {
        ...sessionOptions,
        executionProviders: [backend]
      });
      return { session, backend };
    } catch (cause) {
      lastCause = cause; console.error("[worker-session-fail]", String(cause && cause.message || cause));
    }
  }
  throw new RvcError(
    ErrorCodes.MODEL_VERIFY_SESSION_FAILED,
    `Failed to create an ONNX Runtime session with backends: ${backends.join(", ")}.`,
    lastCause
  );
}
function normalizeBackends(backends) {
  if (!backends || backends.length === 0) {
    return DEFAULT_BACKENDS;
  }
  const unique = new Set(backends);
  return Array.from(unique);
}
const SUPPORTED_MODEL_EXTENSIONS = /* @__PURE__ */ new Set([".onnx", ".pth"]);
async function readModelAsArrayBuffer(file) {
  validateModelFile(file);
  try {
    return await file.arrayBuffer();
  } catch (cause) {
    throw new RvcError(
      ErrorCodes.MODEL_READ_FAILED,
      `Failed to read model file "${file.name}".`,
      cause
    );
  }
}
function getModelFileExtension(name) {
  const dot = name.lastIndexOf(".");
  if (dot < 0) {
    return "";
  }
  return name.slice(dot).toLowerCase();
}
function validateModelFile(file) {
  if (file.size === 0) {
    throw new RvcError(ErrorCodes.MODEL_FILE_EMPTY, `The model file "${file.name}" is empty.`);
  }
  const extension = getModelFileExtension(file.name);
  if (!SUPPORTED_MODEL_EXTENSIONS.has(extension)) {
    throw new RvcError(
      ErrorCodes.MODEL_UNSUPPORTED_FORMAT,
      `Unsupported model file "${file.name}". Only .onnx or .pth are allowed.`
    );
  }
}
var u8 = Uint8Array, u16 = Uint16Array, i32 = Int32Array;
var fleb = new u8([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  0,
  /* unused */
  0,
  0,
  /* impossible */
  0
]);
var fdeb = new u8([
  0,
  0,
  0,
  0,
  1,
  1,
  2,
  2,
  3,
  3,
  4,
  4,
  5,
  5,
  6,
  6,
  7,
  7,
  8,
  8,
  9,
  9,
  10,
  10,
  11,
  11,
  12,
  12,
  13,
  13,
  /* unused */
  0,
  0
]);
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
var freb = function(eb, start) {
  var b = new u16(31);
  for (var i = 0; i < 31; ++i) {
    b[i] = start += 1 << eb[i - 1];
  }
  var r = new i32(b[30]);
  for (var i = 1; i < 30; ++i) {
    for (var j = b[i]; j < b[i + 1]; ++j) {
      r[j] = j - b[i] << 5 | i;
    }
  }
  return { b, r };
};
var _a = freb(fleb, 2), fl = _a.b, revfl = _a.r;
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0), fd = _b.b;
var rev = new u16(32768);
for (var i = 0; i < 32768; ++i) {
  var x = (i & 43690) >> 1 | (i & 21845) << 1;
  x = (x & 52428) >> 2 | (x & 13107) << 2;
  x = (x & 61680) >> 4 | (x & 3855) << 4;
  rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
}
var hMap = (function(cd2, mb, r) {
  var s = cd2.length;
  var i = 0;
  var l = new u16(mb);
  for (; i < s; ++i) {
    if (cd2[i])
      ++l[cd2[i] - 1];
  }
  var le2 = new u16(mb);
  for (i = 1; i < mb; ++i) {
    le2[i] = le2[i - 1] + l[i - 1] << 1;
  }
  var co2;
  if (r) {
    co2 = new u16(1 << mb);
    var rvb = 15 - mb;
    for (i = 0; i < s; ++i) {
      if (cd2[i]) {
        var sv = i << 4 | cd2[i];
        var r_1 = mb - cd2[i];
        var v = le2[cd2[i] - 1]++ << r_1;
        for (var m = v | (1 << r_1) - 1; v <= m; ++v) {
          co2[rev[v] >> rvb] = sv;
        }
      }
    }
  } else {
    co2 = new u16(s);
    for (i = 0; i < s; ++i) {
      if (cd2[i]) {
        co2[i] = rev[le2[cd2[i] - 1]++] >> 15 - cd2[i];
      }
    }
  }
  return co2;
});
var flt = new u8(288);
for (var i = 0; i < 144; ++i)
  flt[i] = 8;
for (var i = 144; i < 256; ++i)
  flt[i] = 9;
for (var i = 256; i < 280; ++i)
  flt[i] = 7;
for (var i = 280; i < 288; ++i)
  flt[i] = 8;
var fdt = new u8(32);
for (var i = 0; i < 32; ++i)
  fdt[i] = 5;
var flrm = /* @__PURE__ */ hMap(flt, 9, 1);
var fdrm = /* @__PURE__ */ hMap(fdt, 5, 1);
var max = function(a) {
  var m = a[0];
  for (var i = 1; i < a.length; ++i) {
    if (a[i] > m)
      m = a[i];
  }
  return m;
};
var bits = function(d, p, m) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
};
var bits16 = function(d, p) {
  var o = p / 8 | 0;
  return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
};
var shft = function(p) {
  return (p + 7) / 8 | 0;
};
var slc = function(v, s, e) {
  if (s == null || s < 0)
    s = 0;
  if (e == null || e > v.length)
    e = v.length;
  return new u8(v.subarray(s, e));
};
var ec = [
  "unexpected EOF",
  "invalid block type",
  "invalid length/literal",
  "invalid distance",
  "stream finished",
  "no stream handler",
  ,
  "no callback",
  "invalid UTF-8 data",
  "extra field too long",
  "date not in range 1980-2099",
  "filename too long",
  "stream finishing",
  "invalid zip data"
  // determined by unknown compression method
];
var err = function(ind, msg, nt2) {
  var e = new Error(msg || ec[ind]);
  e.code = ind;
  if (Error.captureStackTrace)
    Error.captureStackTrace(e, err);
  if (!nt2)
    throw e;
  return e;
};
var inflt = function(dat, st2, buf, dict) {
  var sl2 = dat.length, dl2 = dict ? dict.length : 0;
  if (!sl2 || st2.f && !st2.l)
    return buf || new u8(0);
  var noBuf = !buf;
  var resize = noBuf || st2.i != 2;
  var noSt = st2.i;
  if (noBuf)
    buf = new u8(sl2 * 3);
  var cbuf = function(l2) {
    var bl2 = buf.length;
    if (l2 > bl2) {
      var nbuf = new u8(Math.max(bl2 * 2, l2));
      nbuf.set(buf);
      buf = nbuf;
    }
  };
  var final = st2.f || 0, pos = st2.p || 0, bt2 = st2.b || 0, lm = st2.l, dm = st2.d, lbt = st2.m, dbt = st2.n;
  var tbts = sl2 * 8;
  do {
    if (!lm) {
      final = bits(dat, pos, 1);
      var type = bits(dat, pos + 1, 3);
      pos += 3;
      if (!type) {
        var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
        if (t > sl2) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt2 + l);
        buf.set(dat.subarray(s, t), bt2);
        st2.b = bt2 += l, st2.p = pos = t * 8, st2.f = final;
        continue;
      } else if (type == 1)
        lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
      else if (type == 2) {
        var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
        var tl2 = hLit + bits(dat, pos + 5, 31) + 1;
        pos += 14;
        var ldt = new u8(tl2);
        var clt = new u8(19);
        for (var i = 0; i < hcLen; ++i) {
          clt[clim[i]] = bits(dat, pos + i * 3, 7);
        }
        pos += hcLen * 3;
        var clb = max(clt), clbmsk = (1 << clb) - 1;
        var clm = hMap(clt, clb, 1);
        for (var i = 0; i < tl2; ) {
          var r = clm[bits(dat, pos, clbmsk)];
          pos += r & 15;
          var s = r >> 4;
          if (s < 16) {
            ldt[i++] = s;
          } else {
            var c = 0, n = 0;
            if (s == 16)
              n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
            else if (s == 17)
              n = 3 + bits(dat, pos, 7), pos += 3;
            else if (s == 18)
              n = 11 + bits(dat, pos, 127), pos += 7;
            while (n--)
              ldt[i++] = c;
          }
        }
        var lt2 = ldt.subarray(0, hLit), dt2 = ldt.subarray(hLit);
        lbt = max(lt2);
        dbt = max(dt2);
        lm = hMap(lt2, lbt, 1);
        dm = hMap(dt2, dbt, 1);
      } else
        err(1);
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
    }
    if (resize)
      cbuf(bt2 + 131072);
    var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
    var lpos = pos;
    for (; ; lpos = pos) {
      var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
      pos += c & 15;
      if (pos > tbts) {
        if (noSt)
          err(0);
        break;
      }
      if (!c)
        err(2);
      if (sym < 256)
        buf[bt2++] = sym;
      else if (sym == 256) {
        lpos = pos, lm = null;
        break;
      } else {
        var add2 = sym - 254;
        if (sym > 264) {
          var i = sym - 257, b = fleb[i];
          add2 = bits(dat, pos, (1 << b) - 1) + fl[i];
          pos += b;
        }
        var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
        if (!d)
          err(3);
        pos += d & 15;
        var dt2 = fd[dsym];
        if (dsym > 3) {
          var b = fdeb[dsym];
          dt2 += bits16(dat, pos) & (1 << b) - 1, pos += b;
        }
        if (pos > tbts) {
          if (noSt)
            err(0);
          break;
        }
        if (resize)
          cbuf(bt2 + 131072);
        var end = bt2 + add2;
        if (bt2 < dt2) {
          var shift = dl2 - dt2, dend = Math.min(dt2, end);
          if (shift + bt2 < 0)
            err(3);
          for (; bt2 < dend; ++bt2)
            buf[bt2] = dict[shift + bt2];
        }
        for (; bt2 < end; ++bt2)
          buf[bt2] = buf[bt2 - dt2];
      }
    }
    st2.l = lm, st2.p = lpos, st2.b = bt2, st2.f = final;
    if (lm)
      final = 1, st2.m = lbt, st2.d = dm, st2.n = dbt;
  } while (!final);
  return bt2 != buf.length && noBuf ? slc(buf, 0, bt2) : buf.subarray(0, bt2);
};
var et = /* @__PURE__ */ new u8(0);
var b2 = function(d, b) {
  return d[b] | d[b + 1] << 8;
};
var b4 = function(d, b) {
  return (d[b] | d[b + 1] << 8 | d[b + 2] << 16 | d[b + 3] << 24) >>> 0;
};
var b8 = function(d, b) {
  return b4(d, b) + b4(d, b + 4) * 4294967296;
};
function inflateSync(data, opts) {
  return inflt(data, { i: 2 }, opts && opts.out, opts && opts.dictionary);
}
var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
var tds = 0;
try {
  td.decode(et, { stream: true });
  tds = 1;
} catch (e) {
}
var dutf8 = function(d) {
  for (var r = "", i = 0; ; ) {
    var c = d[i++];
    var eb = (c > 127) + (c > 223) + (c > 239);
    if (i + eb > d.length)
      return { s: r, r: slc(d, i - 1) };
    if (!eb)
      r += String.fromCharCode(c);
    else if (eb == 3) {
      c = ((c & 15) << 18 | (d[i++] & 63) << 12 | (d[i++] & 63) << 6 | d[i++] & 63) - 65536, r += String.fromCharCode(55296 | c >> 10, 56320 | c & 1023);
    } else if (eb & 1)
      r += String.fromCharCode((c & 31) << 6 | d[i++] & 63);
    else
      r += String.fromCharCode((c & 15) << 12 | (d[i++] & 63) << 6 | d[i++] & 63);
  }
};
function strFromU8(dat, latin1) {
  if (latin1) {
    var r = "";
    for (var i = 0; i < dat.length; i += 16384)
      r += String.fromCharCode.apply(null, dat.subarray(i, i + 16384));
    return r;
  } else if (td) {
    return td.decode(dat);
  } else {
    var _a2 = dutf8(dat), s = _a2.s, r = _a2.r;
    if (r.length)
      err(8);
    return s;
  }
}
var slzh = function(d, b) {
  return b + 30 + b2(d, b + 26) + b2(d, b + 28);
};
var zh = function(d, b, z) {
  var fnl = b2(d, b + 28), fn2 = strFromU8(d.subarray(b + 46, b + 46 + fnl), !(b2(d, b + 8) & 2048)), es2 = b + 46 + fnl, bs2 = b4(d, b + 20);
  var _a2 = z && bs2 == 4294967295 ? z64e(d, es2) : [bs2, b4(d, b + 24), b4(d, b + 42)], sc2 = _a2[0], su2 = _a2[1], off = _a2[2];
  return [b2(d, b + 10), sc2, su2, fn2, es2 + b2(d, b + 30) + b2(d, b + 32), off];
};
var z64e = function(d, b) {
  for (; b2(d, b) != 1; b += 4 + b2(d, b + 2))
    ;
  return [b8(d, b + 12), b8(d, b + 4), b8(d, b + 20)];
};
function unzipSync(data, opts) {
  var files = {};
  var e = data.length - 22;
  for (; b4(data, e) != 101010256; --e) {
    if (!e || data.length - e > 65558)
      err(13);
  }
  var c = b2(data, e + 8);
  if (!c)
    return {};
  var o = b4(data, e + 16);
  var z = o == 4294967295 || c == 65535;
  if (z) {
    var ze2 = b4(data, e - 12);
    z = b4(data, ze2) == 101075792;
    if (z) {
      c = b4(data, ze2 + 32);
      o = b4(data, ze2 + 48);
    }
  }
  for (var i = 0; i < c; ++i) {
    var _a2 = zh(data, o, z), c_2 = _a2[0], sc2 = _a2[1], su2 = _a2[2], fn2 = _a2[3], no2 = _a2[4], off = _a2[5], b = slzh(data, off);
    o = no2;
    {
      if (!c_2)
        files[fn2] = slc(data, b, b + sc2);
      else if (c_2 == 8)
        files[fn2] = inflateSync(data.subarray(b, b + sc2), { out: new u8(su2) });
      else
        err(14, "unknown compression type " + c_2);
    }
  }
  return files;
}
const DTYPE_SIZES = {
  float32: 4,
  float64: 8,
  int32: 4,
  int64: 8,
  uint8: 1,
  int8: 1,
  int16: 2,
  float16: 2,
  bfloat16: 2,
  bool: 1,
  complex64: 8,
  complex128: 16,
  qint8: 1,
  quint8: 1,
  qint32: 4
};
const NUMPY_DTYPE_MAP = {
  float32: "float32",
  float64: "float64",
  float16: "float16",
  int64: "int64",
  int32: "int32",
  int16: "int16",
  int8: "int8",
  uint8: "uint8",
  bool: "bool",
  "<f4": "float32",
  "<f8": "float64",
  "<f2": "float16",
  "<i8": "int64",
  "<i4": "int32",
  "<i2": "int16",
  "<i1": "int8",
  "|u1": "uint8",
  "|b1": "bool",
  ">f4": "float32",
  ">f8": "float64"
};
const EXTENSION_REGISTRY = {
  // Standard extensions can be added here
  // code -> [module, name]
};
class PythonObject {
  module;
  name;
  args;
  state = null;
  kwargs = {};
  constructor(module, name, args = []) {
    this.module = module;
    this.name = name;
    this.args = args;
  }
  get fullName() {
    return `${this.module}.${this.name}`;
  }
}
class PersistentId {
  id;
  constructor(id2) {
    this.id = id2;
  }
}
class Unpickler {
  pos = 0;
  data;
  dataView;
  stack = [];
  memo = /* @__PURE__ */ new Map();
  markStack = [];
  storageResolver;
  buffers = [];
  bufferIndex = 0;
  protocol = 0;
  constructor(data, storageResolver, buffers = []) {
    this.data = data;
    this.dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.storageResolver = storageResolver;
    this.buffers = buffers;
  }
  /**
   * Load and return the pickled object.
   */
  load() {
    while (this.pos < this.data.length) {
      const opcode = this.data[this.pos++];
      switch (opcode) {
        // =================================================================
        // Protocol markers
        // =================================================================
        case 128:
          this.protocol = this.data[this.pos++];
          break;
        case 149:
          this.pos += 8;
          break;
        case 46:
          return this.stack.pop();
        // =================================================================
        // Stack manipulation
        // =================================================================
        case 40:
          this.markStack.push(this.stack.length);
          break;
        case 48:
          this.stack.pop();
          break;
        case 49:
          this.popMark();
          break;
        case 50:
          this.stack.push(this.stack[this.stack.length - 1]);
          break;
        // =================================================================
        // Singletons
        // =================================================================
        case 78:
          this.stack.push(null);
          break;
        case 136:
          this.stack.push(true);
          break;
        case 137:
          this.stack.push(false);
          break;
        // =================================================================
        // Integers (text-based - Protocol 0)
        // =================================================================
        case 73: {
          const line = this.readLine();
          if (line === "00") {
            this.stack.push(false);
          } else if (line === "01") {
            this.stack.push(true);
          } else {
            this.stack.push(parseInt(line, 10));
          }
          break;
        }
        case 76: {
          const line = this.readLine();
          const numStr = line.endsWith("L") ? line.slice(0, -1) : line;
          this.stack.push(BigInt(numStr));
          break;
        }
        // =================================================================
        // Integers (binary)
        // =================================================================
        case 74:
          this.stack.push(this.readInt32());
          break;
        case 75:
          this.stack.push(this.data[this.pos++]);
          break;
        case 77:
          this.stack.push(this.readUint16());
          break;
        case 138: {
          const n = this.data[this.pos++];
          this.stack.push(this.readLongBytes(n));
          break;
        }
        case 139: {
          const n = this.readInt32();
          this.stack.push(this.readLongBytes(n));
          break;
        }
        // =================================================================
        // Floats
        // =================================================================
        case 70: {
          const line = this.readLine();
          this.stack.push(parseFloat(line));
          break;
        }
        case 71:
          this.stack.push(this.readFloat64BE());
          break;
        // =================================================================
        // Strings (text-based - Protocol 0)
        // =================================================================
        case 83: {
          const line = this.readLine();
          this.stack.push(this.unescapeString(line));
          break;
        }
        case 86: {
          const line = this.readLine();
          this.stack.push(this.decodeUnicodeEscape(line));
          break;
        }
        // =================================================================
        // Strings (binary)
        // =================================================================
        case 85: {
          const len = this.data[this.pos++];
          this.stack.push(this.readLatin1(len));
          break;
        }
        case 84: {
          const len = this.readInt32();
          this.stack.push(this.readLatin1(len));
          break;
        }
        case 140: {
          const len = this.data[this.pos++];
          this.stack.push(this.readUtf8(len));
          break;
        }
        case 88: {
          const len = this.readUint32();
          this.stack.push(this.readUtf8(len));
          break;
        }
        case 141: {
          const len = Number(this.readUint64());
          this.stack.push(this.readUtf8(len));
          break;
        }
        // =================================================================
        // Bytes
        // =================================================================
        case 67: {
          const len = this.data[this.pos++];
          this.stack.push(this.readBytesRaw(len));
          break;
        }
        case 66: {
          const len = this.readUint32();
          this.stack.push(this.readBytesRaw(len));
          break;
        }
        case 142: {
          const len = Number(this.readUint64());
          this.stack.push(this.readBytesRaw(len));
          break;
        }
        case 150: {
          const len = Number(this.readUint64());
          this.stack.push(this.readBytesRaw(len));
          break;
        }
        // =================================================================
        // Collections - Empty
        // =================================================================
        case 93:
          this.stack.push([]);
          break;
        case 41:
          this.stack.push([]);
          break;
        case 125:
          this.stack.push({});
          break;
        case 143:
          this.stack.push(/* @__PURE__ */ new Set());
          break;
        // =================================================================
        // Collections - Build from mark
        // =================================================================
        case 108: {
          const items = this.popMark();
          this.stack.push(items);
          break;
        }
        case 116: {
          const items = this.popMark();
          this.stack.push(items);
          break;
        }
        case 133: {
          const a = this.stack.pop();
          this.stack.push([a]);
          break;
        }
        case 134: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          this.stack.push([a, b]);
          break;
        }
        case 135: {
          const c = this.stack.pop();
          const b = this.stack.pop();
          const a = this.stack.pop();
          this.stack.push([a, b, c]);
          break;
        }
        case 100: {
          const items = this.popMark();
          const dict = {};
          for (let i = 0; i < items.length; i += 2) {
            dict[String(items[i])] = items[i + 1];
          }
          this.stack.push(dict);
          break;
        }
        case 145: {
          const items = this.popMark();
          this.stack.push(new Set(items));
          break;
        }
        // =================================================================
        // Collection mutation
        // =================================================================
        case 115: {
          const value = this.stack.pop();
          const key = this.stack.pop();
          const dict = this.stack[this.stack.length - 1];
          dict[String(key)] = value;
          break;
        }
        case 117: {
          const items = this.popMark();
          const dict = this.stack[this.stack.length - 1];
          for (let i = 0; i < items.length; i += 2) {
            dict[String(items[i])] = items[i + 1];
          }
          break;
        }
        case 97: {
          const item = this.stack.pop();
          const list = this.stack[this.stack.length - 1];
          list.push(item);
          break;
        }
        case 101: {
          const items = this.popMark();
          const list = this.stack[this.stack.length - 1];
          list.push(...items);
          break;
        }
        case 144: {
          const items = this.popMark();
          const set = this.stack[this.stack.length - 1];
          for (const item of items) {
            set.add(item);
          }
          break;
        }
        // =================================================================
        // Object construction
        // =================================================================
        case 99: {
          const module = this.readLine();
          const name = this.readLine();
          this.stack.push(new PythonObject(module, name));
          break;
        }
        case 147: {
          const name = this.stack.pop();
          const module = this.stack.pop();
          this.stack.push(new PythonObject(module, name));
          break;
        }
        case 82: {
          const args = this.stack.pop();
          const callable = this.stack.pop();
          this.stack.push(this.reduce(callable, args));
          break;
        }
        case 129: {
          const args = this.stack.pop();
          const cls = this.stack.pop();
          this.stack.push(this.newobj(cls, args, {}));
          break;
        }
        case 146: {
          const kwargs = this.stack.pop();
          const args = this.stack.pop();
          const cls = this.stack.pop();
          this.stack.push(this.newobj(cls, args, kwargs));
          break;
        }
        case 105: {
          const module = this.readLine();
          const name = this.readLine();
          const args = this.popMark();
          this.stack.push(this.newobj(new PythonObject(module, name), args, {}));
          break;
        }
        case 111: {
          const args = this.popMark();
          const cls = args.shift();
          this.stack.push(this.newobj(cls, args, {}));
          break;
        }
        case 98: {
          const state = this.stack.pop();
          const obj = this.stack[this.stack.length - 1];
          this.applyBuild(obj, state);
          break;
        }
        // =================================================================
        // Extension registry
        // =================================================================
        case 130: {
          const code = this.data[this.pos++];
          this.stack.push(this.getExtension(code));
          break;
        }
        case 131: {
          const code = this.readUint16();
          this.stack.push(this.getExtension(code));
          break;
        }
        case 132: {
          const code = this.readInt32();
          this.stack.push(this.getExtension(code));
          break;
        }
        // =================================================================
        // Memo operations
        // =================================================================
        case 112: {
          const key = this.readLine();
          this.memo.set(key, this.stack[this.stack.length - 1]);
          break;
        }
        case 113: {
          const idx = this.data[this.pos++];
          this.memo.set(idx, this.stack[this.stack.length - 1]);
          break;
        }
        case 114: {
          const idx = this.readUint32();
          this.memo.set(idx, this.stack[this.stack.length - 1]);
          break;
        }
        case 148: {
          this.memo.set(this.memo.size, this.stack[this.stack.length - 1]);
          break;
        }
        case 103: {
          const key = this.readLine();
          this.stack.push(this.memo.get(key) ?? this.memo.get(parseInt(key, 10)));
          break;
        }
        case 104: {
          const idx = this.data[this.pos++];
          this.stack.push(this.memo.get(idx));
          break;
        }
        case 106: {
          const idx = this.readUint32();
          this.stack.push(this.memo.get(idx));
          break;
        }
        // =================================================================
        // Persistent ID (for tensor storage)
        // =================================================================
        case 80: {
          const line = this.readLine();
          this.stack.push(this.persistentLoad(line));
          break;
        }
        case 81: {
          const pid = this.stack.pop();
          this.stack.push(this.persistentLoad(pid));
          break;
        }
        // =================================================================
        // Protocol 5 buffer protocol
        // =================================================================
        case 151: {
          if (this.bufferIndex >= this.buffers.length) {
            throw new Error("No more buffers available for NEXT_BUFFER");
          }
          this.stack.push(this.buffers[this.bufferIndex++]);
          break;
        }
        case 152: {
          break;
        }
        default:
          throw new Error(`Unknown pickle opcode: 0x${opcode.toString(16)} (char: ${String.fromCharCode(opcode)}) at position ${this.pos - 1}`);
      }
    }
    throw new Error("Unexpected end of pickle data (missing STOP opcode)");
  }
  // =========================================================================
  // Object construction handlers
  // =========================================================================
  /**
   * Handle NEWOBJ/NEWOBJ_EX opcodes.
   */
  newobj(cls, args, kwargs) {
    const fullName = cls.fullName;
    if (fullName.includes("Storage")) {
      return this.createStorage(cls, args);
    }
    const obj = new PythonObject(cls.module, cls.name, args);
    obj.kwargs = kwargs;
    return obj;
  }
  /**
   * Handle BUILD opcode.
   */
  applyBuild(obj, state) {
    if (obj instanceof PythonObject) {
      obj.state = state;
    } else if (typeof obj === "object" && obj !== null && state !== null) {
      if (Array.isArray(state)) {
        const [stateDict, slotsDict] = state;
        if (stateDict && typeof stateDict === "object") {
          Object.assign(obj, stateDict);
        }
        if (slotsDict && typeof slotsDict === "object") {
          Object.assign(obj, slotsDict);
        }
      } else if (typeof state === "object") {
        Object.assign(obj, state);
      }
    }
  }
  /**
   * Create storage object from NEWOBJ.
   */
  createStorage(cls, _args) {
    const dtype = this.getDtypeFromStorageType(cls);
    return {
      data: new Float32Array(0),
      shape: [],
      dtype
    };
  }
  /**
   * Get extension from registry.
   */
  getExtension(code) {
    const entry = EXTENSION_REGISTRY[code];
    if (entry) {
      return new PythonObject(entry[0], entry[1]);
    }
    throw new Error(`Unknown extension code: ${code}`);
  }
  /**
   * Handle persistent ID loading (for tensor storage).
   */
  persistentLoad(pid) {
    if (!Array.isArray(pid) || pid[0] !== "storage") {
      return new PersistentId(pid);
    }
    const [, storageType, storageKey, , elementCount] = pid;
    const dtype = this.getDtypeFromStorageType(storageType);
    let rawData;
    try {
      rawData = this.storageResolver(storageKey);
    } catch (e) {
      console.warn(`Storage not found: ${storageKey}`);
      return {
        data: new Float32Array(0),
        shape: [],
        dtype
      };
    }
    const data = this.createTypedArray(dtype, rawData.buffer, rawData.byteOffset, elementCount);
    return {
      data,
      shape: [],
      // Shape will be set later by _rebuild_tensor_v2
      dtype
    };
  }
  /**
   * Get dtype string from PyTorch storage type.
   */
  getDtypeFromStorageType(storageType) {
    const name = storageType.name.toLowerCase();
    if (name.includes("qint8"))
      return "qint8";
    if (name.includes("quint8"))
      return "quint8";
    if (name.includes("qint32"))
      return "qint32";
    if (name.includes("complex128") || name.includes("complexdouble"))
      return "complex128";
    if (name.includes("complex64") || name.includes("complexfloat"))
      return "complex64";
    if (name.includes("bfloat16") || name.includes("bfloat"))
      return "bfloat16";
    if (name.includes("half") || name.includes("float16"))
      return "float16";
    if (name.includes("double") || name.includes("float64"))
      return "float64";
    if (name.includes("float"))
      return "float32";
    if (name.includes("long") || name.includes("int64"))
      return "int64";
    if (name.includes("int") && !name.includes("8") && !name.includes("16"))
      return "int32";
    if (name.includes("short") || name.includes("int16"))
      return "int16";
    if (name.includes("char") || name.includes("int8"))
      return "int8";
    if (name.includes("byte") || name.includes("uint8"))
      return "uint8";
    if (name.includes("bool"))
      return "bool";
    return "float32";
  }
  /**
   * Create a TypedArray from raw buffer.
   */
  createTypedArray(dtype, buffer, offset, count) {
    const byteSize = DTYPE_SIZES[dtype] || 4;
    const byteLength = count * byteSize;
    let alignedBuffer = buffer;
    let actualOffset = offset;
    if (offset % byteSize !== 0) {
      const slice2 = new Uint8Array(buffer, offset, byteLength);
      alignedBuffer = slice2.buffer.slice(slice2.byteOffset, slice2.byteOffset + slice2.byteLength);
      actualOffset = 0;
    }
    switch (dtype) {
      case "float32":
        return new Float32Array(alignedBuffer, actualOffset, count);
      case "float64": {
        const f64 = new Float64Array(alignedBuffer, actualOffset, count);
        return new Float32Array(f64);
      }
      case "float16":
        return this.convertFloat16ToFloat32(new Uint16Array(alignedBuffer, actualOffset, count));
      case "bfloat16":
        return this.convertBFloat16ToFloat32(new Uint16Array(alignedBuffer, actualOffset, count));
      case "int64":
        return new BigInt64Array(alignedBuffer, actualOffset, count);
      case "int32":
        return new Int32Array(alignedBuffer, actualOffset, count);
      case "int16":
        return new Int16Array(alignedBuffer, actualOffset, count);
      case "int8":
        return new Int8Array(alignedBuffer, actualOffset, count);
      case "uint8":
      case "bool":
      case "qint8":
      case "quint8":
        return new Uint8Array(alignedBuffer, actualOffset, count);
      case "qint32":
        return new Int32Array(alignedBuffer, actualOffset, count);
      case "complex64":
        return new Float32Array(alignedBuffer, actualOffset, count * 2);
      case "complex128": {
        const c128 = new Float64Array(alignedBuffer, actualOffset, count * 2);
        return new Float32Array(c128);
      }
      default:
        return new Float32Array(alignedBuffer, actualOffset, count);
    }
  }
  /**
   * Convert float16 to float32.
   */
  convertFloat16ToFloat32(input) {
    const output = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const h = input[i];
      const sign = (h & 32768) >> 15;
      const exponent = (h & 31744) >> 10;
      const fraction = h & 1023;
      let value;
      if (exponent === 0) {
        if (fraction === 0) {
          value = sign ? -0 : 0;
        } else {
          value = (sign ? -1 : 1) * Math.pow(2, -14) * (fraction / 1024);
        }
      } else if (exponent === 31) {
        value = fraction ? NaN : sign ? -Infinity : Infinity;
      } else {
        value = (sign ? -1 : 1) * Math.pow(2, exponent - 15) * (1 + fraction / 1024);
      }
      output[i] = value;
    }
    return output;
  }
  /**
   * Convert bfloat16 to float32.
   */
  convertBFloat16ToFloat32(input) {
    const output = new Float32Array(input.length);
    const buffer = new ArrayBuffer(4);
    const u32 = new Uint32Array(buffer);
    const f32 = new Float32Array(buffer);
    for (let i = 0; i < input.length; i++) {
      u32[0] = input[i] << 16;
      output[i] = f32[0];
    }
    return output;
  }
  /**
   * Handle REDUCE opcode for known PyTorch reconstructors.
   */
  reduce(callable, args) {
    const fullName = callable.fullName;
    switch (fullName) {
      // =====================================================================
      // PyTorch tensor reconstruction
      // =====================================================================
      case "torch._utils._rebuild_tensor_v2":
      case "torch._utils._rebuild_tensor_v3": {
        return this.rebuildTensorV2(args);
      }
      case "torch._utils._rebuild_parameter": {
        const [tensor, requiresGrad] = args;
        if (tensor) {
          tensor.requiresGrad = requiresGrad;
        }
        return tensor;
      }
      case "torch._utils._rebuild_qtensor": {
        return this.rebuildQTensor(args);
      }
      case "torch._utils._rebuild_sparse_tensor":
      case "torch._utils._rebuild_sparse_coo_tensor": {
        return this.rebuildSparseTensor(args);
      }
      case "torch._utils._rebuild_device_tensor_v2": {
        return this.rebuildTensorV2(args);
      }
      case "torch.storage._load_from_bytes": {
        return this.loadStorageFromBytes(args);
      }
      // =====================================================================
      // Collections
      // =====================================================================
      case "collections.OrderedDict":
      case "builtins.dict":
        return {};
      case "torch.Size":
      case "builtins.tuple":
      case "builtins.list":
        return args[0] || [];
      case "builtins.set":
        return new Set(args[0] || []);
      case "builtins.frozenset":
        return new Set(args[0] || []);
      // =====================================================================
      // Numpy
      // =====================================================================
      case "numpy.core.multiarray._reconstruct":
      case "numpy._core.multiarray._reconstruct":
        return this.rebuildNumpyArray(args);
      case "numpy.dtype":
      case "numpy.core.multiarray.dtype":
        return this.rebuildNumpyDtype(args);
      // =====================================================================
      // Codecs
      // =====================================================================
      case "_codecs.encode": {
        const [text, encoding] = args;
        if (encoding === "latin-1" || encoding === "latin1") {
          return new TextEncoder().encode(text);
        }
        return text;
      }
      // =====================================================================
      // Functools
      // =====================================================================
      case "functools.partial": {
        const [func, ...partialArgs] = args;
        return new PythonObject("functools", "partial", [func, ...partialArgs]);
      }
      // =====================================================================
      // Default: return placeholder
      // =====================================================================
      default:
        return new PythonObject(callable.module, callable.name, args);
    }
  }
  // =========================================================================
  // PyTorch-specific tensor reconstructors
  // =========================================================================
  /**
   * Rebuild tensor from _rebuild_tensor_v2 / v3.
   */
  rebuildTensorV2(args) {
    const [storage, offset, shape2, stride, requiresGrad] = args;
    if (!storage || !storage.data) {
      return null;
    }
    const flatData = storage.data;
    const numElements = shape2.reduce((a, b) => a * b, 1) || 1;
    let data = flatData;
    if (offset > 0 || numElements < flatData.length) {
      data = flatData.slice(offset, offset + numElements);
    }
    return {
      data,
      shape: shape2,
      stride,
      dtype: storage.dtype,
      requiresGrad
    };
  }
  /**
   * Rebuild quantized tensor.
   */
  rebuildQTensor(args) {
    const [storage, offset, shape2, stride, , requiresGrad] = args;
    if (!storage || !storage.data) {
      return null;
    }
    const flatData = storage.data;
    const numElements = shape2.reduce((a, b) => a * b, 1) || 1;
    let data = flatData;
    if (offset > 0 || numElements < flatData.length) {
      data = flatData.slice(offset, offset + numElements);
    }
    return {
      data,
      shape: shape2,
      stride,
      dtype: storage.dtype,
      requiresGrad
    };
  }
  /**
   * Rebuild sparse tensor (returns placeholder).
   */
  rebuildSparseTensor(args) {
    return { __type__: "sparse_tensor", args };
  }
  /**
   * Load storage from bytes (used in some checkpoints).
   */
  loadStorageFromBytes(args) {
    const [bytesData] = args;
    return {
      data: new Float32Array(bytesData.buffer, bytesData.byteOffset, bytesData.byteLength / 4),
      shape: [],
      dtype: "float32"
    };
  }
  /**
   * Rebuild numpy array (placeholder).
   */
  rebuildNumpyArray(args) {
    return { __type__: "ndarray", args };
  }
  /**
   * Rebuild numpy dtype.
   */
  rebuildNumpyDtype(args) {
    const [typeStr] = args;
    return NUMPY_DTYPE_MAP[typeStr] || "float32";
  }
  // =========================================================================
  // String helpers
  // =========================================================================
  /**
   * Unescape a Python string literal.
   */
  unescapeString(s) {
    if (s.startsWith("'") && s.endsWith("'") || s.startsWith('"') && s.endsWith('"')) {
      s = s.slice(1, -1);
    }
    return s.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "	").replace(/\\\\/g, "\\").replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }
  /**
   * Decode Python unicode escape sequences.
   */
  decodeUnicodeEscape(s) {
    return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/\\U([0-9a-fA-F]{8})/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16))).replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "	").replace(/\\\\/g, "\\");
  }
  // =========================================================================
  // Binary reading helpers
  // =========================================================================
  readInt32() {
    const val = this.dataView.getInt32(this.pos, true);
    this.pos += 4;
    return val;
  }
  readUint16() {
    const val = this.dataView.getUint16(this.pos, true);
    this.pos += 2;
    return val;
  }
  readUint32() {
    const val = this.dataView.getUint32(this.pos, true);
    this.pos += 4;
    return val;
  }
  readUint64() {
    const val = this.dataView.getBigUint64(this.pos, true);
    this.pos += 8;
    return val;
  }
  readFloat64BE() {
    const val = this.dataView.getFloat64(this.pos, false);
    this.pos += 8;
    return val;
  }
  readLongBytes(n) {
    if (n === 0)
      return 0n;
    const bytes = this.data.slice(this.pos, this.pos + n);
    this.pos += n;
    let result = 0n;
    for (let i = n - 1; i >= 0; i--) {
      result = result << 8n | BigInt(bytes[i]);
    }
    if (bytes[n - 1] & 128) {
      result -= 1n << BigInt(n * 8);
    }
    return result;
  }
  readUtf8(len) {
    const bytes = this.data.slice(this.pos, this.pos + len);
    this.pos += len;
    return new TextDecoder().decode(bytes);
  }
  readLatin1(len) {
    const bytes = this.data.slice(this.pos, this.pos + len);
    this.pos += len;
    return Array.from(bytes).map((b) => String.fromCharCode(b)).join("");
  }
  readBytesRaw(len) {
    const bytes = this.data.slice(this.pos, this.pos + len);
    this.pos += len;
    return bytes;
  }
  readLine() {
    let end = this.pos;
    while (end < this.data.length && this.data[end] !== 10) {
      end++;
    }
    const line = new TextDecoder().decode(this.data.slice(this.pos, end));
    this.pos = end + 1;
    return line;
  }
  popMark() {
    const markIdx = this.markStack.pop();
    const items = this.stack.splice(markIdx);
    return items;
  }
}
async function parsePth(buffer) {
  const bytes = new Uint8Array(buffer);
  const isZip = bytes[0] === 80 && bytes[1] === 75;
  if (!isZip) {
    throw new Error("Legacy pickle format not supported. Please use a PyTorch 1.6+ checkpoint.");
  }
  const unzipped = unzipSync(bytes);
  let pickleData;
  let dataPrefix = "";
  for (const [path, data] of Object.entries(unzipped)) {
    if (path.endsWith("data.pkl") || path.endsWith(".pkl")) {
      pickleData = data;
      const dir = path.substring(0, path.lastIndexOf("/") + 1);
      dataPrefix = dir + "data/";
      break;
    }
  }
  if (!pickleData) {
    throw new Error("No pickle file found in .pth archive");
  }
  const storageResolver = (key) => {
    const possiblePaths = [
      `${dataPrefix}${key}`,
      `data/${key}`,
      `archive/data/${key}`,
      key
    ];
    for (const path of possiblePaths) {
      if (unzipped[path]) {
        return unzipped[path];
      }
    }
    throw new Error(`Storage key not found: ${key}`);
  };
  const unpickler = new Unpickler(pickleData, storageResolver);
  const checkpoint = unpickler.load();
  if (!checkpoint.config || !checkpoint.weight) {
    throw new Error("Invalid checkpoint: missing 'config' or 'weight' keys. This may not be an RVC model.");
  }
  const configArray = checkpoint.config;
  const config = parseConfigArray(configArray);
  const weights = /* @__PURE__ */ new Map();
  const weightDict = checkpoint.weight;
  const getActualDtype = (data, originalDtype) => {
    if (data instanceof Float32Array)
      return "float32";
    if (data instanceof BigInt64Array)
      return "int64";
    if (data instanceof Int32Array)
      return "int32";
    if (data instanceof Uint8Array)
      return "uint8";
    if (data instanceof Float64Array)
      return "float64";
    return originalDtype || "float32";
  };
  for (const [name, storage] of Object.entries(weightDict)) {
    if (storage && storage.data) {
      weights.set(name, {
        data: storage.data,
        shape: storage.shape || [],
        dtype: getActualDtype(storage.data, storage.dtype),
        requiresGrad: storage.requiresGrad
      });
    }
  }
  const useF0 = Boolean(checkpoint.f0 ?? 1);
  const version = checkpoint.version || "v1";
  const vocoder = checkpoint.vocoder || "HiFi-GAN";
  if (weights.has("emb_g.weight")) {
    const embWeight = weights.get("emb_g.weight");
    config.spkEmbedDim = embWeight.shape[0];
  }
  return {
    config,
    weights,
    useF0,
    version,
    vocoder
  };
}
function parseConfigArray(arr) {
  return {
    specChannels: arr[0],
    segmentSize: arr[1],
    interChannels: arr[2],
    hiddenChannels: arr[3],
    filterChannels: arr[4],
    nHeads: arr[5],
    nLayers: arr[6],
    kernelSize: arr[7],
    pDropout: arr[8],
    resblock: arr[9],
    resblockKernelSizes: arr[10],
    resblockDilationSizes: arr[11],
    upsampleRates: arr[12],
    upsampleInitialChannel: arr[13],
    upsampleKernelSizes: arr[14],
    spkEmbedDim: arr[15],
    ginChannels: arr[16],
    sr: arr[17]
  };
}
var OnnxDataType;
(function(OnnxDataType2) {
  OnnxDataType2[OnnxDataType2["UNDEFINED"] = 0] = "UNDEFINED";
  OnnxDataType2[OnnxDataType2["FLOAT"] = 1] = "FLOAT";
  OnnxDataType2[OnnxDataType2["UINT8"] = 2] = "UINT8";
  OnnxDataType2[OnnxDataType2["INT8"] = 3] = "INT8";
  OnnxDataType2[OnnxDataType2["UINT16"] = 4] = "UINT16";
  OnnxDataType2[OnnxDataType2["INT16"] = 5] = "INT16";
  OnnxDataType2[OnnxDataType2["INT32"] = 6] = "INT32";
  OnnxDataType2[OnnxDataType2["INT64"] = 7] = "INT64";
  OnnxDataType2[OnnxDataType2["STRING"] = 8] = "STRING";
  OnnxDataType2[OnnxDataType2["BOOL"] = 9] = "BOOL";
  OnnxDataType2[OnnxDataType2["FLOAT16"] = 10] = "FLOAT16";
  OnnxDataType2[OnnxDataType2["DOUBLE"] = 11] = "DOUBLE";
  OnnxDataType2[OnnxDataType2["UINT32"] = 12] = "UINT32";
  OnnxDataType2[OnnxDataType2["UINT64"] = 13] = "UINT64";
  OnnxDataType2[OnnxDataType2["COMPLEX64"] = 14] = "COMPLEX64";
  OnnxDataType2[OnnxDataType2["COMPLEX128"] = 15] = "COMPLEX128";
  OnnxDataType2[OnnxDataType2["BFLOAT16"] = 16] = "BFLOAT16";
})(OnnxDataType || (OnnxDataType = {}));
function buildSequenceMask(nodes, initializers, lengths, maxLength, outputName, addInt64Const) {
  const zeroConst = addInt64Const(uniqueName("zero"), [0], []);
  const oneConst = addInt64Const(uniqueName("one"), [1], []);
  let maxLenTensor;
  if (typeof maxLength === "number") {
    maxLenTensor = addInt64Const(uniqueName("max_len"), [maxLength], []);
  } else {
    maxLenTensor = maxLength;
  }
  const rangeVals = uniqueName("range_vals");
  nodes.push(range(zeroConst, maxLenTensor, oneConst, rangeVals));
  const unsqueezeAxes0 = addInt64Const(uniqueName("unsqueeze_axes_0"), [0], [1]);
  const rangeUnsqueezed = uniqueName("range_unsqueezed");
  nodes.push(unsqueeze(rangeVals, unsqueezeAxes0, rangeUnsqueezed));
  const unsqueezeAxes1 = addInt64Const(uniqueName("unsqueeze_axes_1"), [1], [1]);
  const lengthsUnsqueezed = uniqueName("lengths_unsqueezed");
  nodes.push(unsqueeze(lengths, unsqueezeAxes1, lengthsUnsqueezed));
  const maskBool = uniqueName("mask_bool");
  nodes.push(less(rangeUnsqueezed, lengthsUnsqueezed, maskBool));
  const maskFloat = uniqueName("mask_float");
  nodes.push(cast(maskBool, maskFloat, OnnxDataType.FLOAT));
  const unsqueezeAxesMid = addInt64Const(uniqueName("unsqueeze_axes_mid"), [1], [1]);
  nodes.push(unsqueeze(maskFloat, unsqueezeAxesMid, outputName));
  return outputName;
}
function getWeightNormKeys(weights, prefix) {
  const p = prefix.endsWith(".") ? prefix.slice(0, -1) : prefix;
  const modernG = `${p}.parametrizations.weight.original0`;
  const modernV = `${p}.parametrizations.weight.original1`;
  if (weights.has(modernG) && weights.has(modernV)) {
    return { weightG: modernG, weightV: modernV };
  }
  const legacyG = `${p}.weight_g`;
  const legacyV = `${p}.weight_v`;
  if (weights.has(legacyG) && weights.has(legacyV)) {
    return { weightG: legacyG, weightV: legacyV };
  }
  return null;
}
function hasWeightNorm(weights, prefix) {
  return getWeightNormKeys(weights, prefix) !== null;
}
function precomputeNormalizedWeight(weightG, weightV) {
  const gData = weightG.data;
  const vData = weightV.data;
  const vShape = weightV.shape;
  const outChannels = vShape[0];
  const channelSize = vData.length / outChannels;
  const result = new Float32Array(vData.length);
  for (let oc2 = 0; oc2 < outChannels; oc2++) {
    const startIdx = oc2 * channelSize;
    let sumSq = 0;
    for (let i = 0; i < channelSize; i++) {
      const v = vData[startIdx + i];
      sumSq += v * v;
    }
    const norm = Math.sqrt(sumSq + 1e-12);
    const g = gData[oc2];
    const scale = g / norm;
    for (let i = 0; i < channelSize; i++) {
      result[startIdx + i] = vData[startIdx + i] * scale;
    }
  }
  return result;
}
function buildWeightNormReconstruction(nodes, initializers, weights, weightGKey, weightVKey, output) {
  const weightGData = weights.get(weightGKey);
  const weightVData = weights.get(weightVKey);
  if (!weightGData || !weightVData) {
    throw new Error(`Weight norm keys not found: ${weightGKey}, ${weightVKey}`);
  }
  const normalizedWeight = precomputeNormalizedWeight(weightGData, weightVData);
  initializers.push(initializer(output, {
    data: normalizedWeight,
    shape: weightVData.shape,
    dtype: "float32"
  }));
  return output;
}
function buildFusedAddTanhSigmoidMultiply(nodes, inputA, inputB, nChannels, output, addInt64Const) {
  let inAct;
  if (inputB) {
    inAct = uniqueName("in_act");
    nodes.push(add(inputA, inputB, inAct));
  } else {
    inAct = inputA;
  }
  const splitSizes = addInt64Const(uniqueName("split_sizes"), [nChannels, nChannels], [2]);
  const tanhInput = uniqueName("tanh_input");
  const sigmoidInput = uniqueName("sigmoid_input");
  nodes.push(splitWithSizes(inAct, splitSizes, [tanhInput, sigmoidInput], 1));
  const tAct = uniqueName("t_act");
  nodes.push(tanh(tanhInput, tAct));
  const sAct = uniqueName("s_act");
  nodes.push(sigmoid(sigmoidInput, sAct));
  nodes.push(mul(tAct, sAct, output));
  return output;
}
function buildWaveNet(nodes, initializers, weights, input, mask, g, prefix, hiddenChannels, kernelSize, dilationRate, nLayers, addWeight, addInt64Const) {
  let x = input;
  const zeroConst = uniqueName("wavenet_zero");
  initializers.push(initializer(zeroConst, {
    data: new Float32Array([0]),
    shape: [],
    dtype: "float32"
  }));
  let output = uniqueName("wavenet_output_init");
  nodes.push(mul(input, zeroConst, output));
  let gConditioned = null;
  const condLayerPrefix = `${prefix}cond_layer`;
  if (g && (weights.has(`${condLayerPrefix}.weight`) || hasWeightNorm(weights, condLayerPrefix))) {
    const wnKeys = getWeightNormKeys(weights, condLayerPrefix);
    let condWeight;
    if (wnKeys) {
      condWeight = uniqueName("cond_layer_weight");
      buildWeightNormReconstruction(nodes, initializers, weights, wnKeys.weightG, wnKeys.weightV, condWeight);
    } else {
      condWeight = addWeight(`${condLayerPrefix}.weight`);
    }
    const condBias = weights.has(`${prefix}cond_layer.bias`) ? addWeight(`${prefix}cond_layer.bias`) : null;
    gConditioned = uniqueName("g_conditioned");
    nodes.push(conv1d(g, condWeight, condBias, gConditioned, 1));
  }
  for (let i = 0; i < nLayers; i++) {
    const dilation = Math.pow(dilationRate, i);
    const padding = Math.floor((kernelSize * dilation - dilation) / 2);
    const inLayerPrefix = `${prefix}in_layers.${i}`;
    const wnKeysIn = getWeightNormKeys(weights, inLayerPrefix);
    let inWeight;
    if (wnKeysIn) {
      inWeight = uniqueName(`in_layer_${i}_weight`);
      buildWeightNormReconstruction(nodes, initializers, weights, wnKeysIn.weightG, wnKeysIn.weightV, inWeight);
    } else {
      inWeight = addWeight(`${inLayerPrefix}.weight`);
    }
    const inBias = weights.has(`${prefix}in_layers.${i}.bias`) ? addWeight(`${prefix}in_layers.${i}.bias`) : null;
    const xIn = uniqueName(`x_in_${i}`);
    nodes.push(conv1d(x, inWeight, inBias, xIn, kernelSize, 1, padding, dilation));
    let gL = null;
    if (gConditioned) {
      const startIdx = i * 2 * hiddenChannels;
      const endIdx = (i + 1) * 2 * hiddenChannels;
      const startConst = addInt64Const(uniqueName(`slice_start_${i}`), [0, startIdx, 0], [3]);
      const endConst = addInt64Const(uniqueName(`slice_end_${i}`), [2147483647, endIdx, 2147483647], [3]);
      const axesConst = addInt64Const(uniqueName(`slice_axes_${i}`), [0, 1, 2], [3]);
      const stepsConst = addInt64Const(uniqueName(`slice_steps_${i}`), [1, 1, 1], [3]);
      gL = uniqueName(`g_l_${i}`);
      nodes.push(slice(gConditioned, startConst, endConst, axesConst, stepsConst, gL));
    }
    const acts = uniqueName(`acts_${i}`);
    buildFusedAddTanhSigmoidMultiply(nodes, xIn, gL, hiddenChannels, acts, addInt64Const);
    const isLastLayer = i === nLayers - 1;
    const resSkipPrefix = `${prefix}res_skip_layers.${i}`;
    const wnKeysResSkip = getWeightNormKeys(weights, resSkipPrefix);
    let resSkipWeight;
    if (wnKeysResSkip) {
      resSkipWeight = uniqueName(`res_skip_${i}_weight`);
      buildWeightNormReconstruction(nodes, initializers, weights, wnKeysResSkip.weightG, wnKeysResSkip.weightV, resSkipWeight);
    } else {
      resSkipWeight = addWeight(`${resSkipPrefix}.weight`);
    }
    const resSkipBias = weights.has(`${prefix}res_skip_layers.${i}.bias`) ? addWeight(`${prefix}res_skip_layers.${i}.bias`) : null;
    const resSkipActs = uniqueName(`res_skip_acts_${i}`);
    nodes.push(conv1d(acts, resSkipWeight, resSkipBias, resSkipActs, 1));
    if (!isLastLayer) {
      const splitSizes = addInt64Const(uniqueName(`split_sizes_${i}`), [hiddenChannels, hiddenChannels], [2]);
      const resActs = uniqueName(`res_acts_${i}`);
      const skipActs = uniqueName(`skip_acts_${i}`);
      nodes.push(splitWithSizes(resSkipActs, splitSizes, [resActs, skipActs], 1));
      const xPlusRes = uniqueName(`x_plus_res_${i}`);
      nodes.push(add(x, resActs, xPlusRes));
      const xMasked = uniqueName(`x_masked_${i}`);
      nodes.push(mul(xPlusRes, mask, xMasked));
      x = xMasked;
      const newOutput = uniqueName(`output_${i}`);
      nodes.push(add(output, skipActs, newOutput));
      output = newOutput;
    } else {
      const newOutput = uniqueName(`output_final`);
      nodes.push(add(output, resSkipActs, newOutput));
      output = newOutput;
    }
  }
  const finalOutput = uniqueName("wavenet_final");
  nodes.push(mul(output, mask, finalOutput));
  return finalOutput;
}
function buildSynthesizerGraph(checkpoint, phoneLen) {
  resetNameCounter();
  const { config, weights, useF0, version } = checkpoint;
  const hiddenDim = version === "v2" ? 768 : 256;
  const nodes = [];
  const initializers = [];
  const inputs = [];
  const outputs = [];
  const addWeight = (name) => {
    const tensor = weights.get(name);
    if (!tensor) {
      throw new Error(`Weight not found: ${name}`);
    }
    initializers.push(initializer(name, tensor));
    return name;
  };
  const addConstant = (name, data, shape2, dtype = "float32") => {
    const arr = data instanceof Float32Array ? data : new Float32Array(data);
    initializers.push(initializer(name, { data: arr, shape: shape2, dtype }));
    return name;
  };
  const addScalar = (name, value) => {
    return addConstant(name, [value], []);
  };
  const addInt64Const = (name, values, shape2) => {
    const arr = new BigInt64Array(values.map((v) => BigInt(v)));
    initializers.push(initializer(name, {
      data: arr,
      shape: shape2,
      dtype: "int64"
    }));
    return name;
  };
  const addFloatConst = (name, value) => {
    const arr = new Float32Array([value]);
    initializers.push(initializer(name, {
      data: arr,
      shape: [],
      dtype: "float32"
    }));
    return name;
  };
  inputs.push(valueInfo("phone", OnnxDataType.FLOAT, [1, "phone_len", hiddenDim]));
  inputs.push(valueInfo("phone_lengths", OnnxDataType.INT64, ["batch"]));
  if (useF0) {
    inputs.push(valueInfo("pitch", OnnxDataType.INT64, [1, "phone_len"]));
    inputs.push(valueInfo("nsff0", OnnxDataType.FLOAT, [1, "phone_len"]));
  }
  inputs.push(valueInfo("sid", OnnxDataType.INT64, ["batch"]));
  const embGWeight = addWeight("emb_g.weight");
  const gFlat = uniqueName("g_flat");
  nodes.push(gather(embGWeight, "sid", gFlat, 0));
  const unsqueezeAxes = addInt64Const("unsqueeze_axes_neg1", [-1], [1]);
  const g = uniqueName("g");
  nodes.push(unsqueeze(gFlat, unsqueezeAxes, g));
  const textEncOut = buildTextEncoder(nodes, initializers, weights, config, useF0, phoneLen, addWeight, addConstant, addInt64Const, addScalar, addFloatConst);
  const { m_p, logs_p, x_mask } = textEncOut;
  const expLogsP = uniqueName("exp_logs_p");
  nodes.push(exp(logs_p, expLogsP));
  const noise = uniqueName("noise");
  nodes.push(randomNormalLike(m_p, noise, 0, 1));
  const noiseScale = addScalar("noise_scale", 0.66666);
  const scaledNoise = uniqueName("scaled_noise");
  nodes.push(mul(noise, noiseScale, scaledNoise));
  const expNoise = uniqueName("exp_noise");
  nodes.push(mul(expLogsP, scaledNoise, expNoise));
  const zPPreMask = uniqueName("z_p_pre_mask");
  nodes.push(add(m_p, expNoise, zPPreMask));
  const zP = uniqueName("z_p");
  nodes.push(mul(zPPreMask, x_mask, zP));
  const z = buildResidualCouplingBlock(
    nodes,
    initializers,
    weights,
    config,
    zP,
    x_mask,
    g,
    true,
    // reverse
    addWeight,
    addConstant,
    addInt64Const
  );
  const zMasked = uniqueName("z_masked");
  nodes.push(mul(z, x_mask, zMasked));
  const audio = buildHiFiGANDecoder(nodes, initializers, weights, config, zMasked, useF0 ? "nsff0" : null, g, useF0, addWeight, addConstant, addInt64Const, addScalar);
  outputs.push(valueInfo("audio", OnnxDataType.FLOAT, ["batch", 1, "audio_len"]));
  nodes.push(node("Identity", [audio], ["audio"]));
  const srConst = addInt64Const("sr_const", [config.sr], [1]);
  nodes.push(node("Identity", [srConst], ["sr"]));
  outputs.push(valueInfo("sr", OnnxDataType.INT64, [1]));
  return {
    name: "RVC_Synthesizer",
    nodes,
    inputs,
    outputs,
    initializers
  };
}
function buildTextEncoder(nodes, initializers, weights, config, useF0, phoneLen, addWeight, addConstant, addInt64Const, addScalar, addFloatConst) {
  const prefix = "enc_p.";
  const embPhoneWeight = addWeight(`${prefix}emb_phone.weight`);
  const embPhoneBias = addWeight(`${prefix}emb_phone.bias`);
  const phoneEmbedded = uniqueName("phone_embedded");
  nodes.push(...linearNodes("phone", embPhoneWeight, embPhoneBias, phoneEmbedded));
  let x = phoneEmbedded;
  if (useF0 && weights.has(`${prefix}emb_pitch.weight`)) {
    const embPitchWeight = addWeight(`${prefix}emb_pitch.weight`);
    const pitchEmbedded = uniqueName("pitch_embedded");
    nodes.push(gather(embPitchWeight, "pitch", pitchEmbedded, 0));
    const xWithPitch = uniqueName("x_with_pitch");
    nodes.push(add(x, pitchEmbedded, xWithPitch));
    x = xWithPitch;
  }
  const scale = addScalar("enc_scale", Math.sqrt(config.hiddenChannels));
  const xScaled = uniqueName("x_scaled");
  nodes.push(mul(x, scale, xScaled));
  const xActivated = uniqueName("x_activated");
  nodes.push(leakyRelu(xScaled, xActivated, 0.1));
  const xTransposed = uniqueName("x_transposed");
  nodes.push(transpose(xActivated, xTransposed, [0, 2, 1]));
  const phoneShape = uniqueName("phone_shape");
  nodes.push(shape("phone", phoneShape));
  const dimOneIdx = addInt64Const("dim_one_idx", [1], [1]);
  const phoneLenDynamic = uniqueName("phone_len_dynamic");
  nodes.push(gather(phoneShape, dimOneIdx, phoneLenDynamic, 0));
  const x_mask = uniqueName("x_mask");
  buildSequenceMask(nodes, initializers, "phone_lengths", phoneLenDynamic, x_mask, addInt64Const);
  let xMasked = uniqueName("x_masked");
  nodes.push(mul(xTransposed, x_mask, xMasked));
  xMasked = buildTransformerEncoder(nodes, initializers, weights, config, xMasked, x_mask, `${prefix}encoder.`, phoneLen, addWeight, addConstant, addInt64Const, addScalar, addFloatConst);
  const projWeight = addWeight(`${prefix}proj.weight`);
  const projBias = addWeight(`${prefix}proj.bias`);
  const stats = uniqueName("stats");
  nodes.push(conv1d(xMasked, projWeight, projBias, stats, 1));
  const statsMasked = uniqueName("stats_masked");
  nodes.push(mul(stats, x_mask, statsMasked));
  const splitSizes = addInt64Const(uniqueName("stats_split_sizes"), [config.interChannels, config.interChannels], [2]);
  const m_p = uniqueName("m_p");
  const logs_p = uniqueName("logs_p");
  nodes.push(splitWithSizes(statsMasked, splitSizes, [m_p, logs_p], 1));
  return { m_p, logs_p, x_mask };
}
function buildTransformerEncoder(nodes, initializers, weights, config, input, mask, prefix, phoneLen, addWeight, addConstant, addInt64Const, addScalar, addFloatConst) {
  let x = input;
  const maskUnsqueeze2Axes = addInt64Const(uniqueName("mask_unsqueeze2_axes"), [3], [1]);
  const maskUnsqueeze2 = uniqueName("mask_unsqueeze2");
  nodes.push(unsqueeze(mask, maskUnsqueeze2Axes, maskUnsqueeze2));
  const maskUnsqueezeMinus1Axes = addInt64Const(uniqueName("mask_unsqueeze_m1_axes"), [2], [1]);
  const maskUnsqueezeMinus1 = uniqueName("mask_unsqueeze_minus1");
  nodes.push(unsqueeze(mask, maskUnsqueezeMinus1Axes, maskUnsqueezeMinus1));
  const attnMask = uniqueName("attn_mask");
  nodes.push(mul(maskUnsqueeze2, maskUnsqueezeMinus1, attnMask));
  for (let i = 0; i < config.nLayers; i++) {
    const layerPrefix = `${prefix}`;
    const attnOut = buildMultiHeadAttention(
      nodes,
      initializers,
      weights,
      config,
      x,
      x,
      attnMask,
      // Use 2D attention mask
      `${layerPrefix}attn_layers.${i}.`,
      phoneLen,
      addWeight,
      addConstant,
      addInt64Const,
      addScalar,
      addFloatConst
    );
    const xResidual1 = uniqueName("x_residual1");
    nodes.push(add(x, attnOut, xResidual1));
    const normWeight1 = addWeight(`${layerPrefix}norm_layers_1.${i}.gamma`);
    const normBias1 = addWeight(`${layerPrefix}norm_layers_1.${i}.beta`);
    const xNorm1 = uniqueName("x_norm1");
    const xT1 = uniqueName("x_transpose1");
    nodes.push(transpose(xResidual1, xT1, [0, 2, 1]));
    const xLN1 = uniqueName("x_ln1");
    nodes.push(layerNorm(xT1, normWeight1, normBias1, xLN1, -1, 1e-5));
    nodes.push(transpose(xLN1, xNorm1, [0, 2, 1]));
    const ffnOut = buildFFN(nodes, initializers, weights, config, xNorm1, mask, `${layerPrefix}ffn_layers.${i}.`, addWeight);
    const xResidual2 = uniqueName("x_residual2");
    nodes.push(add(xNorm1, ffnOut, xResidual2));
    const normWeight2 = addWeight(`${layerPrefix}norm_layers_2.${i}.gamma`);
    const normBias2 = addWeight(`${layerPrefix}norm_layers_2.${i}.beta`);
    const xT2 = uniqueName("x_transpose2");
    nodes.push(transpose(xResidual2, xT2, [0, 2, 1]));
    const xLN2 = uniqueName("x_ln2");
    nodes.push(layerNorm(xT2, normWeight2, normBias2, xLN2, -1, 1e-5));
    const xNorm2 = uniqueName("x_norm2");
    nodes.push(transpose(xLN2, xNorm2, [0, 2, 1]));
    x = xNorm2;
  }
  const xFinal = uniqueName("x_enc_final");
  nodes.push(mul(x, mask, xFinal));
  return xFinal;
}
function buildGetRelativeEmbeddings(nodes, initializers, embeddings, windowSize, timeDim, outputName, addInt64Const, addFloatConst) {
  const oneConst = addInt64Const(uniqueName("rel_one"), [1], [1]);
  const twoConst = addInt64Const(uniqueName("rel_two"), [2], [1]);
  const zeroConst = addInt64Const(uniqueName("rel_zero"), [0], [1]);
  const windowPlus1 = addInt64Const(uniqueName("rel_window_plus_1"), [windowSize + 1], [1]);
  const lengthMinusWindowPlus1 = uniqueName("rel_len_minus_wp1");
  nodes.push(sub(timeDim, windowPlus1, lengthMinusWindowPlus1));
  const padLength = uniqueName("rel_pad_length");
  nodes.push(node("Max", [lengthMinusWindowPlus1, zeroConst], [padLength]));
  const windowPlus1MinusLength = uniqueName("rel_wp1_minus_len");
  nodes.push(sub(windowPlus1, timeDim, windowPlus1MinusLength));
  const start = uniqueName("rel_start");
  nodes.push(node("Max", [windowPlus1MinusLength, zeroConst], [start]));
  const twoTimesLength = uniqueName("rel_two_times_len");
  nodes.push(mul(twoConst, timeDim, twoTimesLength));
  const startPlusTwoLen = uniqueName("rel_start_plus_two_len");
  nodes.push(add(start, twoTimesLength, startPlusTwoLen));
  const end = uniqueName("rel_end");
  nodes.push(sub(startPlusTwoLen, oneConst, end));
  const padsShape = uniqueName("rel_pads_shape");
  nodes.push(concat([zeroConst, padLength, zeroConst, zeroConst, padLength, zeroConst], padsShape, 0));
  const padValue = addFloatConst(uniqueName("rel_pad_value"), 0);
  const paddedEmb = uniqueName("rel_emb_padded");
  nodes.push(pad(embeddings, padsShape, paddedEmb, "constant", padValue));
  const axesConst = addInt64Const(uniqueName("rel_axes"), [1], [1]);
  const stepsConst = addInt64Const(uniqueName("rel_steps"), [1], [1]);
  nodes.push(slice(paddedEmb, start, end, axesConst, stepsConst, outputName));
  return outputName;
}
function buildMatmulWithRelativeKeys(nodes, query, relEmb, outputName, addInt64Const) {
  const unsqueezeAxes = addInt64Const(uniqueName("rel_unsqueeze_axes"), [0], [1]);
  const relEmbUnsqueezed = uniqueName("rel_emb_unsqueezed");
  nodes.push(unsqueeze(relEmb, unsqueezeAxes, relEmbUnsqueezed));
  const relEmbT = uniqueName("rel_emb_transposed");
  nodes.push(transpose(relEmbUnsqueezed, relEmbT, [0, 1, 3, 2]));
  nodes.push(matmul(query, relEmbT, outputName));
  return outputName;
}
function buildMatmulWithRelativeValues(nodes, relWeights, relEmb, outputName, addInt64Const) {
  const unsqueezeAxes = addInt64Const(uniqueName("relv_unsqueeze_axes"), [0], [1]);
  const relEmbUnsqueezed = uniqueName("relv_emb_unsqueezed");
  nodes.push(unsqueeze(relEmb, unsqueezeAxes, relEmbUnsqueezed));
  nodes.push(matmul(relWeights, relEmbUnsqueezed, outputName));
  return outputName;
}
function buildRelativeToAbsolutePosition(nodes, relLogits, batchDim, headsDim, outputName, addInt64Const, addFloatConst) {
  const inputShape = uniqueName("r2a_input_shape");
  nodes.push(shape(relLogits, inputShape));
  const dim2Idx = addInt64Const(uniqueName("r2a_dim2_idx"), [2], [1]);
  const lengthDim = uniqueName("r2a_length");
  nodes.push(gather(inputShape, dim2Idx, lengthDim, 0));
  const oneConst = addInt64Const(uniqueName("r2a_one"), [1], [1]);
  const twoConst = addInt64Const(uniqueName("r2a_two"), [2], [1]);
  const lengthPlus1 = uniqueName("r2a_len_plus_1");
  nodes.push(add(lengthDim, oneConst, lengthPlus1));
  const lengthMinus1 = uniqueName("r2a_len_minus_1");
  nodes.push(sub(lengthDim, oneConst, lengthMinus1));
  const twoLen = uniqueName("r2a_two_len");
  nodes.push(mul(twoConst, lengthDim, twoLen));
  const twoLenMinus1 = uniqueName("r2a_two_len_minus_1");
  nodes.push(sub(twoLen, oneConst, twoLenMinus1));
  const flatSize = uniqueName("r2a_flat_size");
  nodes.push(mul(lengthDim, twoLen, flatSize));
  const pad1Const = addInt64Const(uniqueName("r2a_pad1"), [0, 0, 0, 0, 0, 0, 0, 1], [8]);
  const padValue1 = addFloatConst(uniqueName("r2a_pad_val1"), 0);
  const padded1 = uniqueName("r2a_padded1");
  nodes.push(pad(relLogits, pad1Const, padded1, "constant", padValue1));
  const flatShape = uniqueName("r2a_flat_shape");
  nodes.push(concat([batchDim, headsDim, flatSize], flatShape, 0));
  const flattened = uniqueName("r2a_flattened");
  nodes.push(reshape(padded1, flatShape, flattened));
  const zeroConst = addInt64Const(uniqueName("r2a_zero"), [0], [1]);
  const pad2Shape = uniqueName("r2a_pad2_shape");
  nodes.push(concat([zeroConst, zeroConst, zeroConst, zeroConst, zeroConst, lengthMinus1], pad2Shape, 0));
  const padValue2 = addFloatConst(uniqueName("r2a_pad_val2"), 0);
  const padded2 = uniqueName("r2a_padded2");
  nodes.push(pad(flattened, pad2Shape, padded2, "constant", padValue2));
  const viewShape = uniqueName("r2a_view_shape");
  nodes.push(concat([batchDim, headsDim, lengthPlus1, twoLenMinus1], viewShape, 0));
  const reshaped = uniqueName("r2a_reshaped");
  nodes.push(reshape(padded2, viewShape, reshaped));
  const startDim2 = addInt64Const(uniqueName("r2a_start_dim2"), [0], [1]);
  const axesDim2 = addInt64Const(uniqueName("r2a_axes_dim2"), [2], [1]);
  const stepsDim2 = addInt64Const(uniqueName("r2a_steps_dim2"), [1], [1]);
  const sliced1 = uniqueName("r2a_sliced1");
  nodes.push(slice(reshaped, startDim2, lengthDim, axesDim2, stepsDim2, sliced1));
  const axesDim3 = addInt64Const(uniqueName("r2a_axes_dim3"), [3], [1]);
  const stepsDim3 = addInt64Const(uniqueName("r2a_steps_dim3"), [1], [1]);
  nodes.push(slice(sliced1, lengthMinus1, twoLenMinus1, axesDim3, stepsDim3, outputName));
  return outputName;
}
function buildAbsoluteToRelativePosition(nodes, absWeights, batchDim, headsDim, outputName, addInt64Const, addFloatConst) {
  const inputShape = uniqueName("a2r_input_shape");
  nodes.push(shape(absWeights, inputShape));
  const dim2Idx = addInt64Const(uniqueName("a2r_dim2_idx"), [2], [1]);
  const lengthDim = uniqueName("a2r_length");
  nodes.push(gather(inputShape, dim2Idx, lengthDim, 0));
  const oneConst = addInt64Const(uniqueName("a2r_one"), [1], [1]);
  const twoConst = addInt64Const(uniqueName("a2r_two"), [2], [1]);
  const zeroConst = addInt64Const(uniqueName("a2r_zero"), [0], [1]);
  const lengthMinus1 = uniqueName("a2r_len_minus_1");
  nodes.push(sub(lengthDim, oneConst, lengthMinus1));
  const twoLen = uniqueName("a2r_two_len");
  nodes.push(mul(twoConst, lengthDim, twoLen));
  const lengthSquared = uniqueName("a2r_len_squared");
  nodes.push(mul(lengthDim, lengthDim, lengthSquared));
  const lenTimesLenMinus1 = uniqueName("a2r_len_times_len_minus_1");
  nodes.push(mul(lengthDim, lengthMinus1, lenTimesLenMinus1));
  const flatSize = uniqueName("a2r_flat_size");
  nodes.push(add(lengthSquared, lenTimesLenMinus1, flatSize));
  const pad1Shape = uniqueName("a2r_pad1_shape");
  nodes.push(concat([zeroConst, zeroConst, zeroConst, zeroConst, zeroConst, zeroConst, zeroConst, lengthMinus1], pad1Shape, 0));
  const padValue1 = addFloatConst(uniqueName("a2r_pad_val1"), 0);
  const padded1 = uniqueName("a2r_padded1");
  nodes.push(pad(absWeights, pad1Shape, padded1, "constant", padValue1));
  const flatShape = uniqueName("a2r_flat_shape");
  nodes.push(concat([batchDim, headsDim, flatSize], flatShape, 0));
  const flattened = uniqueName("a2r_flattened");
  nodes.push(reshape(padded1, flatShape, flattened));
  const pad2Shape = uniqueName("a2r_pad2_shape");
  nodes.push(concat([zeroConst, zeroConst, lengthDim, zeroConst, zeroConst, zeroConst], pad2Shape, 0));
  const padValue2 = addFloatConst(uniqueName("a2r_pad_val2"), 0);
  const padded2 = uniqueName("a2r_padded2");
  nodes.push(pad(flattened, pad2Shape, padded2, "constant", padValue2));
  const viewShape = uniqueName("a2r_view_shape");
  nodes.push(concat([batchDim, headsDim, lengthDim, twoLen], viewShape, 0));
  const reshaped = uniqueName("a2r_reshaped");
  nodes.push(reshape(padded2, viewShape, reshaped));
  const startDim3 = addInt64Const(uniqueName("a2r_start"), [1], [1]);
  const axesDim3 = addInt64Const(uniqueName("a2r_axes"), [3], [1]);
  const stepsDim3 = addInt64Const(uniqueName("a2r_steps"), [1], [1]);
  nodes.push(slice(reshaped, startDim3, twoLen, axesDim3, stepsDim3, outputName));
  return outputName;
}
function buildComputeRelativeScores(nodes, initializers, queryScaled, embRelK, batchDim, headsDim, windowSize, timeDim, outputName, addInt64Const, addFloatConst) {
  const relEmbK = uniqueName("rel_emb_k");
  buildGetRelativeEmbeddings(nodes, initializers, embRelK, windowSize, timeDim, relEmbK, addInt64Const, addFloatConst);
  const relLogits = uniqueName("rel_logits");
  buildMatmulWithRelativeKeys(nodes, queryScaled, relEmbK, relLogits, addInt64Const);
  buildRelativeToAbsolutePosition(nodes, relLogits, batchDim, headsDim, outputName, addInt64Const, addFloatConst);
  return outputName;
}
function buildApplyRelativeValues(nodes, initializers, pAttn, embRelV, batchDim, headsDim, windowSize, timeDim, outputName, addInt64Const, addFloatConst) {
  const relWeights = uniqueName("rel_weights");
  buildAbsoluteToRelativePosition(nodes, pAttn, batchDim, headsDim, relWeights, addInt64Const, addFloatConst);
  const relEmbV = uniqueName("rel_emb_v");
  buildGetRelativeEmbeddings(nodes, initializers, embRelV, windowSize, timeDim, relEmbV, addInt64Const, addFloatConst);
  buildMatmulWithRelativeValues(nodes, relWeights, relEmbV, outputName, addInt64Const);
  return outputName;
}
function buildMultiHeadAttention(nodes, initializers, weights, config, query, key, mask, prefix, phoneLen, addWeight, addConstant, addInt64Const, addScalar, addFloatConst) {
  const nHeads = config.nHeads;
  const channels = config.hiddenChannels;
  const kChannels = channels / nHeads;
  const hasRelativePos = weights.has(`${prefix}emb_rel_k`);
  let embRelK = null;
  let embRelV = null;
  let windowSize = 0;
  if (hasRelativePos) {
    embRelK = addWeight(`${prefix}emb_rel_k`);
    embRelV = addWeight(`${prefix}emb_rel_v`);
    const embShape = weights.get(`${prefix}emb_rel_k`).shape;
    windowSize = Math.floor((embShape[1] - 1) / 2);
  }
  const convQWeight = addWeight(`${prefix}conv_q.weight`);
  const convQBias = addWeight(`${prefix}conv_q.bias`);
  const convKWeight = addWeight(`${prefix}conv_k.weight`);
  const convKBias = addWeight(`${prefix}conv_k.bias`);
  const convVWeight = addWeight(`${prefix}conv_v.weight`);
  const convVBias = addWeight(`${prefix}conv_v.bias`);
  const convOWeight = addWeight(`${prefix}conv_o.weight`);
  const convOBias = addWeight(`${prefix}conv_o.bias`);
  const qProj = uniqueName("q_proj");
  const kProj = uniqueName("k_proj");
  const vProj = uniqueName("v_proj");
  nodes.push(conv1d(query, convQWeight, convQBias, qProj, 1));
  nodes.push(conv1d(key, convKWeight, convKBias, kProj, 1));
  nodes.push(conv1d(key, convVWeight, convVBias, vProj, 1));
  const qShape = uniqueName("q_shape");
  nodes.push(shape(qProj, qShape));
  const batchIdx = addInt64Const(uniqueName("batch_idx"), [0], [1]);
  const timeIdx = addInt64Const(uniqueName("time_idx"), [2], [1]);
  const batchDim = uniqueName("batch_dim");
  const timeDim = uniqueName("time_dim");
  nodes.push(gather(qShape, batchIdx, batchDim, 0));
  nodes.push(gather(qShape, timeIdx, timeDim, 0));
  const nHeadsConst = addInt64Const(uniqueName("n_heads"), [nHeads], [1]);
  const kChannelsConst = addInt64Const(uniqueName("k_channels"), [kChannels], [1]);
  const reshapeShape = uniqueName("reshape_shape");
  nodes.push(concat([batchDim, nHeadsConst, kChannelsConst, timeDim], reshapeShape, 0));
  const qReshaped = uniqueName("q_reshaped");
  nodes.push(reshape(qProj, reshapeShape, qReshaped));
  const qHeads = uniqueName("q_heads");
  nodes.push(transpose(qReshaped, qHeads, [0, 1, 3, 2]));
  const kReshaped = uniqueName("k_reshaped");
  nodes.push(reshape(kProj, reshapeShape, kReshaped));
  const kHeads = uniqueName("k_heads");
  nodes.push(transpose(kReshaped, kHeads, [0, 1, 3, 2]));
  const vReshaped = uniqueName("v_reshaped");
  nodes.push(reshape(vProj, reshapeShape, vReshaped));
  const vHeads = uniqueName("v_heads");
  nodes.push(transpose(vReshaped, vHeads, [0, 1, 3, 2]));
  const scaleFactor = addScalar(uniqueName("attn_scale"), 1 / Math.sqrt(kChannels));
  const qScaled = uniqueName("q_scaled");
  nodes.push(mul(qHeads, scaleFactor, qScaled));
  const kT = uniqueName("k_transposed");
  nodes.push(transpose(kHeads, kT, [0, 1, 3, 2]));
  let scoresWithRelative = uniqueName("attn_scores");
  nodes.push(matmul(qScaled, kT, scoresWithRelative));
  if (hasRelativePos && embRelK) {
    const relBatchDim = uniqueName("rel_batch_dim");
    const relHeadsDim = uniqueName("rel_heads_dim");
    const headsIdx = addInt64Const(uniqueName("heads_idx"), [1], [1]);
    nodes.push(gather(qShape, batchIdx, relBatchDim, 0));
    nodes.push(gather(qShape, headsIdx, relHeadsDim, 0));
    const relScores = uniqueName("rel_scores");
    buildComputeRelativeScores(nodes, initializers, qScaled, embRelK, relBatchDim, nHeadsConst, windowSize, timeDim, relScores, addInt64Const, addFloatConst);
    const scoresWithRel = uniqueName("scores_with_rel");
    nodes.push(add(scoresWithRelative, relScores, scoresWithRel));
    scoresWithRelative = scoresWithRel;
  }
  const zeroConst = addScalar(uniqueName("zero"), 0);
  const maskIsZero = uniqueName("mask_is_zero");
  nodes.push(node("Equal", [mask, zeroConst], [maskIsZero]));
  const negInf = addScalar(uniqueName("neg_inf"), -1e4);
  const scoresMasked = uniqueName("scores_masked");
  nodes.push(where(maskIsZero, negInf, scoresWithRelative, scoresMasked));
  const attnWeights = uniqueName("attn_weights");
  nodes.push(softmax(scoresMasked, attnWeights, -1));
  let attnOutput = uniqueName("attn_out");
  nodes.push(matmul(attnWeights, vHeads, attnOutput));
  if (hasRelativePos && embRelV) {
    const relValues = uniqueName("rel_values");
    buildApplyRelativeValues(nodes, initializers, attnWeights, embRelV, batchDim, nHeadsConst, windowSize, timeDim, relValues, addInt64Const, addFloatConst);
    const attnWithRel = uniqueName("attn_with_rel");
    nodes.push(add(attnOutput, relValues, attnWithRel));
    attnOutput = attnWithRel;
  }
  const attnOutT = uniqueName("attn_out_transposed");
  nodes.push(transpose(attnOutput, attnOutT, [0, 1, 3, 2]));
  const channelsConst = addInt64Const(uniqueName("channels"), [channels], [1]);
  const outShape = uniqueName("out_shape");
  nodes.push(concat([batchDim, channelsConst, timeDim], outShape, 0));
  const attnOutReshaped = uniqueName("attn_out_reshaped");
  nodes.push(reshape(attnOutT, outShape, attnOutReshaped));
  const output = uniqueName("mha_output");
  nodes.push(conv1d(attnOutReshaped, convOWeight, convOBias, output, 1));
  return output;
}
function buildFFN(nodes, initializers, weights, config, input, mask, prefix, addWeight, _addConstant, _addInt64Const, _addScalar) {
  const conv1Weight = addWeight(`${prefix}conv_1.weight`);
  const conv1Bias = addWeight(`${prefix}conv_1.bias`);
  const conv2Weight = addWeight(`${prefix}conv_2.weight`);
  const conv2Bias = addWeight(`${prefix}conv_2.bias`);
  const kernelSize = config.filterChannels ? config.kernelSize : 3;
  const padding = Math.floor((kernelSize - 1) / 2);
  const xMasked1 = uniqueName("ffn_x_masked1");
  nodes.push(mul(input, mask, xMasked1));
  const h = uniqueName("ffn_h");
  nodes.push(conv1d(xMasked1, conv1Weight, conv1Bias, h, kernelSize, 1, padding));
  const hAct = uniqueName("ffn_h_act");
  nodes.push(relu(h, hAct));
  const hMasked = uniqueName("ffn_h_masked");
  nodes.push(mul(hAct, mask, hMasked));
  const output = uniqueName("ffn_output");
  nodes.push(conv1d(hMasked, conv2Weight, conv2Bias, output, kernelSize, 1, padding));
  const outputMasked = uniqueName("ffn_output_masked");
  nodes.push(mul(output, mask, outputMasked));
  return outputMasked;
}
function buildResidualCouplingBlock(nodes, initializers, weights, config, input, mask, g, reverse, addWeight, addConstant, addInt64Const, addScalar) {
  let x = input;
  const nFlows = 4;
  const reversedIndices = Array.from({ length: config.interChannels }, (_, i) => config.interChannels - 1 - i);
  const flipIndicesName = addInt64Const(uniqueName("flip_indices"), reversedIndices, [config.interChannels]);
  {
    for (let i = nFlows - 1; i >= 0; i--) {
      const xFlipped = uniqueName("x_flipped_rev");
      nodes.push(flip(x, flipIndicesName, xFlipped, 1));
      x = xFlipped;
      const couplingPrefix = `flow.flows.${i * 2}.`;
      x = buildResidualCouplingLayer(
        nodes,
        initializers,
        weights,
        config,
        x,
        mask,
        g,
        true,
        // reverse
        couplingPrefix,
        addWeight,
        addConstant,
        addInt64Const
      );
    }
  }
  return x;
}
function buildResidualCouplingLayer(nodes, initializers, weights, config, input, mask, g, reverse, prefix, addWeight, addConstant, addInt64Const, _addScalar) {
  const channels = config.interChannels;
  const halfChannels = channels / 2;
  const hiddenChannels = config.hiddenChannels;
  const splitSizes = addInt64Const(uniqueName("split_sizes"), [halfChannels, halfChannels], [2]);
  const x0 = uniqueName("x0");
  const x1 = uniqueName("x1");
  nodes.push(splitWithSizes(input, splitSizes, [x0, x1], 1));
  const preWeight = addWeight(`${prefix}pre.weight`);
  const preBias = addWeight(`${prefix}pre.bias`);
  const hPre = uniqueName("h_pre");
  nodes.push(conv1d(x0, preWeight, preBias, hPre, 1));
  const hPreMasked = uniqueName("h_pre_masked");
  nodes.push(mul(hPre, mask, hPreMasked));
  let waveNetLayers = 0;
  for (let i = 0; i < 20; i++) {
    const hasLayer = weights.has(`${prefix}enc.in_layers.${i}.bias`) || weights.has(`${prefix}enc.in_layers.${i}.weight`) || hasWeightNorm(weights, `${prefix}enc.in_layers.${i}`);
    if (hasLayer) {
      waveNetLayers = i + 1;
    } else {
      break;
    }
  }
  if (waveNetLayers === 0)
    waveNetLayers = 4;
  let waveNetKernelSize = 5;
  const wnKeys = getWeightNormKeys(weights, `${prefix}enc.in_layers.0`);
  if (wnKeys) {
    const weightV = weights.get(wnKeys.weightV);
    if (weightV && weightV.shape.length >= 3) {
      waveNetKernelSize = weightV.shape[2];
    }
  } else if (weights.has(`${prefix}enc.in_layers.0.weight`)) {
    const weight = weights.get(`${prefix}enc.in_layers.0.weight`);
    if (weight && weight.shape.length >= 3) {
      waveNetKernelSize = weight.shape[2];
    }
  }
  const h = buildWaveNet(
    nodes,
    initializers,
    weights,
    hPreMasked,
    mask,
    g,
    `${prefix}enc.`,
    hiddenChannels,
    waveNetKernelSize,
    1,
    // dilationRate - typically 1 for RVC coupling layers
    waveNetLayers,
    addWeight,
    addInt64Const
  );
  const postWeight = addWeight(`${prefix}post.weight`);
  const postBias = addWeight(`${prefix}post.bias`);
  const statsRaw = uniqueName("stats_raw");
  nodes.push(conv1d(h, postWeight, postBias, statsRaw, 1));
  const stats = uniqueName("stats");
  nodes.push(mul(statsRaw, mask, stats));
  const m = stats;
  let xOut;
  {
    const x1SubM = uniqueName("x1_sub_m");
    nodes.push(sub(x1, m, x1SubM));
    const x1New = uniqueName("x1_new");
    nodes.push(mul(x1SubM, mask, x1New));
    xOut = uniqueName("x_coupled");
    nodes.push(concat([x0, x1New], xOut, 1));
  }
  return xOut;
}
function buildHiFiGANDecoder(nodes, initializers, weights, config, input, f0Input, g, useF0, addWeight, addConstant, addInt64Const, addScalar) {
  const prefix = "dec.";
  const isNSF = useF0 && weights.has(`${prefix}m_source.l_linear.weight`);
  if (isNSF && f0Input) {
    return buildGeneratorNSF(nodes, initializers, weights, config, input, f0Input, g, prefix, addWeight, addConstant, addInt64Const, addScalar);
  }
  const convPreWeight = addWeight(`${prefix}conv_pre.weight`);
  const convPreBias = addWeight(`${prefix}conv_pre.bias`);
  let x = uniqueName("dec_x");
  nodes.push(conv1d(input, convPreWeight, convPreBias, x, 7, 1, 3));
  if (weights.has(`${prefix}cond.weight`)) {
    const condWeight = addWeight(`${prefix}cond.weight`);
    const condBias = weights.has(`${prefix}cond.bias`) ? addWeight(`${prefix}cond.bias`) : null;
    const gCond = uniqueName("g_cond");
    nodes.push(conv1d(g, condWeight, condBias, gCond, 1));
    const xCond = uniqueName("x_cond");
    nodes.push(add(x, gCond, xCond));
    x = xCond;
  }
  const numUpsamples = config.upsampleRates.length;
  const numKernels = config.resblockKernelSizes.length;
  for (let i = 0; i < numUpsamples; i++) {
    const xAct = uniqueName("dec_x_act");
    nodes.push(leakyRelu(x, xAct, 0.1));
    const upsPrefix = `${prefix}ups.${i}`;
    const wnKeysUps = getWeightNormKeys(weights, upsPrefix);
    let upWeight;
    if (wnKeysUps) {
      upWeight = uniqueName(`ups_${i}_weight`);
      buildWeightNormReconstruction(nodes, initializers, weights, wnKeysUps.weightG, wnKeysUps.weightV, upWeight);
    } else {
      upWeight = addWeight(`${upsPrefix}.weight`);
    }
    const upBias = weights.has(`${prefix}ups.${i}.bias`) ? addWeight(`${prefix}ups.${i}.bias`) : null;
    const rate = config.upsampleRates[i];
    const kernelSize = config.upsampleKernelSizes[i];
    const padding = rate % 2 === 0 ? Math.floor((kernelSize - rate) / 2) : Math.floor(rate / 2) + rate % 2;
    const outputPadding = rate % 2;
    const xUp = uniqueName("dec_x_up");
    nodes.push(convTranspose1d(xAct, upWeight, upBias, xUp, kernelSize, rate, padding, outputPadding));
    let xs2 = null;
    for (let j = 0; j < numKernels; j++) {
      const resIdx = i * numKernels + j;
      const resOut = buildResBlock(
        nodes,
        initializers,
        weights,
        config,
        xUp,
        // All resblocks take the same upsampled input
        `${prefix}resblocks.${resIdx}.`,
        j,
        addWeight
      );
      if (xs2 === null) {
        xs2 = resOut;
      } else {
        const xsNew = uniqueName("xs_acc");
        nodes.push(add(xs2, resOut, xsNew));
        xs2 = xsNew;
      }
    }
    const numKernelsScalar = addScalar(uniqueName("num_kernels_inv"), 1 / numKernels);
    x = uniqueName("dec_x_avg");
    nodes.push(mul(xs2, numKernelsScalar, x));
  }
  const xActFinal = uniqueName("dec_x_act_final");
  nodes.push(leakyRelu(x, xActFinal, 0.1));
  const convPostWeight = addWeight(`${prefix}conv_post.weight`);
  const audio = uniqueName("audio_raw");
  nodes.push(conv1d(xActFinal, convPostWeight, null, audio, 7, 1, 3));
  const audioFinal = uniqueName("audio_final");
  nodes.push(tanh(audio, audioFinal));
  return audioFinal;
}
function buildResBlock(nodes, initializers, weights, config, input, prefix, kernelIdx, addWeight, _addConstant, _addInt64Const, _addScalar) {
  let x = input;
  const kernelSize = config.resblockKernelSizes[kernelIdx] || 3;
  const dilations = config.resblockDilationSizes[kernelIdx] || [1, 3, 5];
  for (let i = 0; i < dilations.length; i++) {
    const residual = x;
    const xAct1 = uniqueName("resblock_act1");
    nodes.push(leakyRelu(x, xAct1, 0.1));
    const conv1Prefix = `${prefix}convs1.${i}`;
    const wnKeysConv1 = getWeightNormKeys(weights, conv1Prefix);
    let conv1Weight;
    if (wnKeysConv1) {
      conv1Weight = uniqueName(`resblock_conv1_${i}_weight`);
      buildWeightNormReconstruction(nodes, initializers, weights, wnKeysConv1.weightG, wnKeysConv1.weightV, conv1Weight);
    } else {
      conv1Weight = addWeight(`${conv1Prefix}.weight`);
    }
    const conv1Bias = weights.has(`${prefix}convs1.${i}.bias`) ? addWeight(`${prefix}convs1.${i}.bias`) : null;
    const dilation = dilations[i];
    const padding = Math.floor((kernelSize * dilation - dilation) / 2);
    const h = uniqueName("resblock_h");
    nodes.push(conv1d(xAct1, conv1Weight, conv1Bias, h, kernelSize, 1, padding, dilation));
    const hAct = uniqueName("resblock_h_act");
    nodes.push(leakyRelu(h, hAct, 0.1));
    const conv2Prefix = `${prefix}convs2.${i}`;
    const wnKeysConv2 = getWeightNormKeys(weights, conv2Prefix);
    let conv2Weight;
    if (wnKeysConv2) {
      conv2Weight = uniqueName(`resblock_conv2_${i}_weight`);
      buildWeightNormReconstruction(nodes, initializers, weights, wnKeysConv2.weightG, wnKeysConv2.weightV, conv2Weight);
    } else {
      conv2Weight = addWeight(`${conv2Prefix}.weight`);
    }
    const conv2Bias = weights.has(`${prefix}convs2.${i}.bias`) ? addWeight(`${prefix}convs2.${i}.bias`) : null;
    const hConv = uniqueName("resblock_h_conv");
    const padding2 = Math.floor((kernelSize - 1) / 2);
    nodes.push(conv1d(hAct, conv2Weight, conv2Bias, hConv, kernelSize, 1, padding2, 1));
    const xNew = uniqueName("resblock_x_new");
    nodes.push(add(hConv, residual, xNew));
    x = xNew;
  }
  return x;
}
function buildSineGenerator(nodes, initializers, f0, upsamplingFactor, samplingRate, sineAmplitude = 0.1, noiseStddev = 3e-3, voicedThreshold = 0, addScalar, addInt64Const) {
  const voicedThresholdConst = addScalar(uniqueName("voiced_threshold"), voicedThreshold);
  const voicedBool = uniqueName("voiced_bool");
  nodes.push(node("Greater", [f0, voicedThresholdConst], [voicedBool]));
  const voicedMaskF32 = uniqueName("voiced_mask_f32");
  nodes.push(cast(voicedBool, voicedMaskF32, OnnxDataType.FLOAT));
  const f0Expanded = uniqueName("f0_expanded");
  const unsqueezeAxesNeg1 = addInt64Const(uniqueName("unsqueeze_neg1"), [-1], [1]);
  nodes.push(unsqueeze(f0, unsqueezeAxesNeg1, f0Expanded));
  const oneConstInt = addInt64Const(uniqueName("one_int"), [1], []);
  const upFactorPlusOne = addInt64Const(uniqueName("up_factor_plus_one"), [upsamplingFactor + 1], []);
  const upsamplingGrid = uniqueName("upsampling_grid");
  nodes.push(range(oneConstInt, upFactorPlusOne, oneConstInt, upsamplingGrid));
  const upsamplingGridF32 = uniqueName("upsampling_grid_f32");
  nodes.push(cast(upsamplingGrid, upsamplingGridF32, OnnxDataType.FLOAT));
  const srConst = addScalar(uniqueName("sampling_rate"), samplingRate);
  const f0Normalized = uniqueName("f0_normalized");
  nodes.push(div(f0Expanded, srConst, f0Normalized));
  const phaseIncrementsRaw = uniqueName("phase_increments_raw");
  nodes.push(mul(f0Normalized, upsamplingGridF32, phaseIncrementsRaw));
  const sliceStart5a = addInt64Const(uniqueName("slice_start_5a"), [0, 0, upsamplingFactor - 1], [3]);
  const sliceEnd5a = addInt64Const(uniqueName("slice_end_5a"), [2147483647, -1, 2147483647], [3]);
  const sliceAxes5a = addInt64Const(uniqueName("slice_axes_5a"), [0, 1, 2], [3]);
  const sliceSteps5a = addInt64Const(uniqueName("slice_steps_5a"), [1, 1, 1], [3]);
  const phaseLastCol = uniqueName("phase_last_col");
  nodes.push(slice(phaseIncrementsRaw, sliceStart5a, sliceEnd5a, sliceAxes5a, sliceSteps5a, phaseLastCol));
  const halfConst = addScalar(uniqueName("half"), 0.5);
  const oneConstF32 = addScalar(uniqueName("one_f32"), 1);
  const phasePlusHalf = uniqueName("phase_plus_half");
  nodes.push(add(phaseLastCol, halfConst, phasePlusHalf));
  const phaseModOne = uniqueName("phase_mod_one");
  nodes.push(node("Mod", [phasePlusHalf, oneConstF32], [phaseModOne], [
    { name: "fmod", type: "INT", intValue: 1n }
  ]));
  const phaseRemainder = uniqueName("phase_remainder");
  nodes.push(sub(phaseModOne, halfConst, phaseRemainder));
  const cumulativePhaseRaw = uniqueName("cumulative_phase_raw");
  nodes.push(node("CumSum", [phaseRemainder, addInt64Const(uniqueName("cumsum_axis"), [1], [])], [cumulativePhaseRaw]));
  const cumulativePhase = uniqueName("cumulative_phase");
  nodes.push(node("Mod", [cumulativePhaseRaw, oneConstF32], [cumulativePhase], [
    { name: "fmod", type: "INT", intValue: 1n }
  ]));
  const padConst = addInt64Const(uniqueName("pad_const"), [0, 1, 0, 0, 0, 0], [6]);
  const zeroConstF32 = addScalar(uniqueName("zero_f32"), 0);
  const cumulativePhasePadded = uniqueName("cumulative_phase_padded");
  nodes.push(node("Pad", [cumulativePhase, padConst, zeroConstF32], [cumulativePhasePadded]));
  const phaseIncrements = uniqueName("phase_increments");
  nodes.push(add(phaseIncrementsRaw, cumulativePhasePadded, phaseIncrements));
  const batchIdxSine = addInt64Const(uniqueName("batch_idx_sine"), [0], [1]);
  const phaseShape = uniqueName("phase_shape");
  nodes.push(shape(phaseIncrements, phaseShape));
  const batchDimPhase = uniqueName("batch_dim_phase");
  nodes.push(gather(phaseShape, batchIdxSine, batchDimPhase, 0));
  const negOneConst = addInt64Const(uniqueName("neg_one"), [-1], [1]);
  const oneConstDim = addInt64Const(uniqueName("one_dim"), [1], [1]);
  const reshapePhaseShape = uniqueName("reshape_phase_shape");
  nodes.push(concat([batchDimPhase, negOneConst, oneConstDim], reshapePhaseShape, 0));
  const phaseIncrementsFlat = uniqueName("phase_increments_flat");
  nodes.push(reshape(phaseIncrements, reshapePhaseShape, phaseIncrementsFlat));
  const twoPi = addScalar(uniqueName("two_pi"), 2 * Math.PI);
  const phaseRadians = uniqueName("phase_radians");
  nodes.push(mul(phaseIncrementsFlat, twoPi, phaseRadians));
  const sineRaw = uniqueName("sine_raw");
  nodes.push(sin(phaseRadians, sineRaw));
  const sineAmpConst = addScalar(uniqueName("sine_amplitude"), sineAmplitude);
  const sineScaled = uniqueName("sine_scaled");
  nodes.push(mul(sineRaw, sineAmpConst, sineScaled));
  const voicedMaskExpanded = uniqueName("voiced_mask_expanded");
  nodes.push(unsqueeze(voicedMaskF32, unsqueezeAxesNeg1, voicedMaskExpanded));
  const voicedMaskT = uniqueName("voiced_mask_transposed");
  nodes.push(transpose(voicedMaskExpanded, voicedMaskT, [0, 2, 1]));
  const scalesData = new Float32Array([1, 1, upsamplingFactor]);
  const scalesConst = uniqueName("resize_scales");
  initializers.push(initializer(scalesConst, {
    data: scalesData,
    shape: [3],
    dtype: "float32"
  }));
  const voicedMaskResized = uniqueName("voiced_mask_resized");
  nodes.push(node("Resize", [voicedMaskT, "", scalesConst], [voicedMaskResized], [
    { name: "mode", type: "STRING", stringValue: "nearest" },
    { name: "coordinate_transformation_mode", type: "STRING", stringValue: "asymmetric" },
    { name: "nearest_mode", type: "STRING", stringValue: "floor" }
  ]));
  const voicedMaskUpsampled = uniqueName("voiced_mask_upsampled");
  nodes.push(transpose(voicedMaskResized, voicedMaskUpsampled, [0, 2, 1]));
  const noiseStdConst = addScalar(uniqueName("noise_stddev"), noiseStddev);
  const unvoicedAmp = addScalar(uniqueName("unvoiced_amp"), sineAmplitude / 3);
  const voicedNoiseAmp = uniqueName("voiced_noise_amp");
  nodes.push(mul(voicedMaskUpsampled, noiseStdConst, voicedNoiseAmp));
  const oneMinusVoiced = uniqueName("one_minus_voiced");
  nodes.push(sub(oneConstF32, voicedMaskUpsampled, oneMinusVoiced));
  const unvoicedNoiseAmp = uniqueName("unvoiced_noise_amp");
  nodes.push(mul(oneMinusVoiced, unvoicedAmp, unvoicedNoiseAmp));
  const noiseAmplitude = uniqueName("noise_amplitude");
  nodes.push(add(voicedNoiseAmp, unvoicedNoiseAmp, noiseAmplitude));
  const noiseRandom = uniqueName("noise_random");
  nodes.push(randomNormalLike(sineScaled, noiseRandom, 0, 1));
  const noise = uniqueName("noise");
  nodes.push(mul(noiseAmplitude, noiseRandom, noise));
  const sineVoiced = uniqueName("sine_voiced");
  nodes.push(mul(sineScaled, voicedMaskUpsampled, sineVoiced));
  const sineWaveforms = uniqueName("sine_waveforms");
  nodes.push(add(sineVoiced, noise, sineWaveforms));
  return {
    sineWaveforms,
    voicedMask: voicedMaskUpsampled,
    noise
  };
}
function buildSourceModuleHnNSF(nodes, initializers, weights, f0, upsamplingFactor, samplingRate, prefix, addWeight, addScalar, addInt64Const) {
  const { sineWaveforms } = buildSineGenerator(
    nodes,
    initializers,
    f0,
    upsamplingFactor,
    samplingRate,
    0.1,
    // sine_amplitude
    3e-3,
    // noise_stddev
    0,
    // voiced_threshold
    addScalar,
    addInt64Const
  );
  if (weights.has(`${prefix}l_linear.weight`)) {
    const linearWeight = addWeight(`${prefix}l_linear.weight`);
    const linearBias = weights.has(`${prefix}l_linear.bias`) ? addWeight(`${prefix}l_linear.bias`) : null;
    const linearOut = uniqueName("nsf_linear_out");
    nodes.push(...linearNodes(sineWaveforms, linearWeight, linearBias, linearOut));
    const tanhOut = uniqueName("nsf_tanh_out");
    nodes.push(tanh(linearOut, tanhOut));
    const source = uniqueName("nsf_source");
    nodes.push(transpose(tanhOut, source, [0, 2, 1]));
    return source;
  }
  const sourceTransposed = uniqueName("nsf_source_transposed");
  nodes.push(transpose(sineWaveforms, sourceTransposed, [0, 2, 1]));
  return sourceTransposed;
}
function buildGeneratorNSF(nodes, initializers, weights, config, input, f0, g, prefix, addWeight, addConstant, addInt64Const, addScalar) {
  const totalUpsample = config.upsampleRates.reduce((a, b) => a * b, 1);
  let source = null;
  if (weights.has(`${prefix}m_source.l_linear.weight`)) {
    source = buildSourceModuleHnNSF(nodes, initializers, weights, f0, totalUpsample, config.sr, `${prefix}m_source.`, addWeight, addScalar, addInt64Const);
  }
  const convPreWeight = addWeight(`${prefix}conv_pre.weight`);
  const convPreBias = addWeight(`${prefix}conv_pre.bias`);
  let x = uniqueName("nsf_x");
  nodes.push(conv1d(input, convPreWeight, convPreBias, x, 7, 1, 3));
  if (weights.has(`${prefix}cond.weight`)) {
    const condWeight = addWeight(`${prefix}cond.weight`);
    const condBias = weights.has(`${prefix}cond.bias`) ? addWeight(`${prefix}cond.bias`) : null;
    const gCond = uniqueName("nsf_g_cond");
    nodes.push(conv1d(g, condWeight, condBias, gCond, 1));
    const xCond = uniqueName("nsf_x_cond");
    nodes.push(add(x, gCond, xCond));
    x = xCond;
  }
  const numUpsamples = config.upsampleRates.length;
  const numKernels = config.resblockKernelSizes.length;
  for (let i = 0; i < numUpsamples; i++) {
    const xAct = uniqueName("nsf_x_act");
    nodes.push(leakyRelu(x, xAct, 0.1));
    const nsfUpsPrefix = `${prefix}ups.${i}`;
    const wnKeysNsfUps = getWeightNormKeys(weights, nsfUpsPrefix);
    let upWeight;
    if (wnKeysNsfUps) {
      upWeight = uniqueName(`nsf_ups_${i}_weight`);
      buildWeightNormReconstruction(nodes, initializers, weights, wnKeysNsfUps.weightG, wnKeysNsfUps.weightV, upWeight);
    } else {
      upWeight = addWeight(`${nsfUpsPrefix}.weight`);
    }
    const upBias = weights.has(`${prefix}ups.${i}.bias`) ? addWeight(`${prefix}ups.${i}.bias`) : null;
    const rate = config.upsampleRates[i];
    const kernelSize = config.upsampleKernelSizes[i];
    const padding = rate % 2 === 0 ? Math.floor((kernelSize - rate) / 2) : Math.floor(rate / 2) + rate % 2;
    const outputPadding = rate % 2;
    const xUp = uniqueName("nsf_x_up");
    nodes.push(convTranspose1d(xAct, upWeight, upBias, xUp, kernelSize, rate, padding, outputPadding));
    if (source && weights.has(`${prefix}noise_convs.${i}.weight`)) {
      const noiseConvWeight = addWeight(`${prefix}noise_convs.${i}.weight`);
      const noiseConvBias = weights.has(`${prefix}noise_convs.${i}.bias`) ? addWeight(`${prefix}noise_convs.${i}.bias`) : null;
      const noiseWeightTensor = weights.get(`${prefix}noise_convs.${i}.weight`);
      const noiseKernelSize = noiseWeightTensor.shape[2];
      const remainingRates = config.upsampleRates.slice(i + 1);
      const noiseStride = remainingRates.reduce((a, b) => a * b, 1);
      const noisePadding = noiseStride === 1 ? 0 : Math.floor((noiseKernelSize - noiseStride) / 2);
      const sourceConv = uniqueName("nsf_source_conv");
      nodes.push(conv1d(source, noiseConvWeight, noiseConvBias, sourceConv, noiseKernelSize, noiseStride, noisePadding));
      const xWithSource = uniqueName("nsf_x_with_source");
      nodes.push(add(xUp, sourceConv, xWithSource));
      x = xWithSource;
    } else {
      x = xUp;
    }
    let xs2 = null;
    for (let j = 0; j < numKernels; j++) {
      const resIdx = i * numKernels + j;
      const resOut = buildResBlock(nodes, initializers, weights, config, x, `${prefix}resblocks.${resIdx}.`, j, addWeight);
      if (xs2 === null) {
        xs2 = resOut;
      } else {
        const xsNew = uniqueName("nsf_xs_acc");
        nodes.push(add(xs2, resOut, xsNew));
        xs2 = xsNew;
      }
    }
    const numKernelsInv = addScalar(uniqueName("nsf_num_kernels_inv"), 1 / numKernels);
    x = uniqueName("nsf_x_avg");
    nodes.push(mul(xs2, numKernelsInv, x));
  }
  const xActFinal = uniqueName("nsf_x_act_final");
  nodes.push(leakyRelu(x, xActFinal, 0.1));
  const convPostWeight = addWeight(`${prefix}conv_post.weight`);
  const audio = uniqueName("nsf_audio_raw");
  nodes.push(conv1d(xActFinal, convPostWeight, null, audio, 7, 1, 3));
  const audioFinal = uniqueName("nsf_audio_final");
  nodes.push(tanh(audio, audioFinal));
  return audioFinal;
}
function buildOnnxModel(checkpoint, options) {
  const { opsetVersion, phoneLen } = options;
  const graph = buildSynthesizerGraph(checkpoint, phoneLen);
  return {
    irVersion: 8n,
    // ONNX IR version 8
    opsetImports: [
      { domain: "", version: BigInt(opsetVersion) }
      // Default ONNX domain
    ],
    producerName: "browser-pth-to-onnx",
    producerVersion: "1.0.0",
    graph
  };
}
let _nameCounter = 0;
function resetNameCounter() {
  _nameCounter = 0;
}
function uniqueName(prefix) {
  return `${prefix}_${_nameCounter++}`;
}
function attrInt(name, value) {
  return {
    name,
    type: "INT",
    intValue: BigInt(value)
  };
}
function attrInts(name, values) {
  return {
    name,
    type: "INTS",
    intsValue: values.map((v) => BigInt(v))
  };
}
function attrFloat(name, value) {
  return {
    name,
    type: "FLOAT",
    floatValue: value
  };
}
function attrString(name, value) {
  return {
    name,
    type: "STRING",
    stringValue: value
  };
}
function valueInfo(name, elemType, shape2) {
  return {
    name,
    elemType,
    shape: shape2.map((dim) => typeof dim === "number" ? { dimValue: BigInt(dim) } : { dimParam: dim })
  };
}
function initializer(name, tensor) {
  return {
    name,
    data: tensor
  };
}
function node(opType, inputs, outputs, attributes = [], name) {
  return {
    opType,
    name: name || uniqueName(opType.toLowerCase()),
    inputs,
    outputs,
    attributes
  };
}
function conv1d(input, weight, bias, output, kernelSize, stride = 1, padding = 0, dilation = 1, groups = 1) {
  const inputs = bias ? [input, weight, bias] : [input, weight];
  return node("Conv", inputs, [output], [
    attrInts("kernel_shape", [kernelSize]),
    attrInts("strides", [stride]),
    attrInts("pads", [padding, padding]),
    attrInts("dilations", [dilation]),
    attrInt("group", groups)
  ]);
}
function convTranspose1d(input, weight, bias, output, kernelSize, stride = 1, padding = 0, outputPadding = 0, dilation = 1, groups = 1) {
  const inputs = bias ? [input, weight, bias] : [input, weight];
  return node("ConvTranspose", inputs, [output], [
    attrInts("kernel_shape", [kernelSize]),
    attrInts("strides", [stride]),
    attrInts("pads", [padding, padding]),
    attrInts("output_padding", [outputPadding]),
    attrInts("dilations", [dilation]),
    attrInt("group", groups)
  ]);
}
function linearNodes(input, weight, bias, output) {
  const nodes = [];
  const weightT = uniqueName("weight_transposed");
  nodes.push(node("Transpose", [weight], [weightT], [attrInts("perm", [1, 0])]));
  const matmulOut = bias ? uniqueName("matmul_out") : output;
  nodes.push(node("MatMul", [input, weightT], [matmulOut]));
  if (bias) {
    nodes.push(node("Add", [matmulOut, bias], [output]));
  }
  return nodes;
}
function matmul(a, b, output) {
  return node("MatMul", [a, b], [output]);
}
function layerNorm(input, scale, bias, output, axis = -1, epsilon = 1e-5) {
  return node("LayerNormalization", [input, scale, bias], [output], [
    attrInt("axis", axis),
    attrFloat("epsilon", epsilon)
  ]);
}
function relu(input, output) {
  return node("Relu", [input], [output]);
}
function leakyRelu(input, output, alpha = 0.01) {
  return node("LeakyRelu", [input], [output], [attrFloat("alpha", alpha)]);
}
function sigmoid(input, output) {
  return node("Sigmoid", [input], [output]);
}
function tanh(input, output) {
  return node("Tanh", [input], [output]);
}
function add(a, b, output) {
  return node("Add", [a, b], [output]);
}
function mul(a, b, output) {
  return node("Mul", [a, b], [output]);
}
function sub(a, b, output) {
  return node("Sub", [a, b], [output]);
}
function div(a, b, output) {
  return node("Div", [a, b], [output]);
}
function exp(input, output) {
  return node("Exp", [input], [output]);
}
function softmax(input, output, axis = -1) {
  return node("Softmax", [input], [output], [attrInt("axis", axis)]);
}
function transpose(input, output, perm) {
  return node("Transpose", [input], [output], [attrInts("perm", perm)]);
}
function reshape(input, shape2, output, allowzero = 0) {
  return node("Reshape", [input, shape2], [output], [
    attrInt("allowzero", allowzero)
  ]);
}
function unsqueeze(input, axes, output) {
  return node("Unsqueeze", [input, axes], [output]);
}
function concat(inputs, output, axis = 0) {
  return node("Concat", inputs, [output], [attrInt("axis", axis)]);
}
function gather(input, indices, output, axis = 0) {
  return node("Gather", [input, indices], [output], [attrInt("axis", axis)]);
}
function slice(input, starts, ends, axes, steps, output) {
  return node("Slice", [input, starts, ends, axes, steps], [output]);
}
function pad(input, pads, output, mode = "constant", constantValue) {
  const inputs = constantValue ? [input, pads, constantValue] : [input, pads];
  return node("Pad", inputs, [output], [attrString("mode", mode)]);
}
function sin(input, output) {
  return node("Sin", [input], [output]);
}
function randomNormalLike(input, output, mean = 0, scale = 1, dtype = 1) {
  return node("RandomNormalLike", [input], [output], [
    attrFloat("mean", mean),
    attrFloat("scale", scale),
    attrInt("dtype", dtype)
  ]);
}
function where(condition, x, y, output) {
  return node("Where", [condition, x, y], [output]);
}
function less(a, b, output) {
  return node("Less", [a, b], [output]);
}
function cast(input, output, to2) {
  return node("Cast", [input], [output], [attrInt("to", to2)]);
}
function range(start, limit, delta, output) {
  return node("Range", [start, limit, delta], [output]);
}
function shape(input, output) {
  return node("Shape", [input], [output]);
}
function splitWithSizes(input, splitSizes, outputs, axis = 0) {
  return node("Split", [input, splitSizes], outputs, [attrInt("axis", axis)]);
}
function flip(input, indicesName, output, axis) {
  return node("Gather", [input, indicesName], [output], [attrInt("axis", axis)]);
}
function serializeOnnx(model) {
  const writer = new ProtobufWriter();
  writeModelProto(writer, model);
  return writer.finish();
}
class ProtobufWriter {
  chunks = [];
  buffer = new Uint8Array(4096);
  pos = 0;
  /**
   * Write a varint (variable-length integer).
   * For negative numbers, protobuf encodes them as 10-byte varints
   * representing the two's complement 64-bit representation.
   */
  writeVarint(value) {
    let v = BigInt(value);
    if (v < 0n) {
      v = v + (1n << 64n);
    }
    while (v > 0x7fn) {
      this.writeByte(Number(v & 0x7fn) | 128);
      v >>= 7n;
    }
    this.writeByte(Number(v));
  }
  /**
   * Write a signed varint (zigzag encoded).
   */
  writeSignedVarint(value) {
    const v = BigInt(value);
    const encoded = v << 1n ^ v >> 63n;
    this.writeVarint(encoded);
  }
  /**
   * Write a field tag (field number + wire type).
   */
  writeTag(fieldNumber, wireType) {
    this.writeVarint(fieldNumber << 3 | wireType);
  }
  /**
   * Write a single byte.
   */
  writeByte(value) {
    this.ensureCapacity(1);
    this.buffer[this.pos++] = value;
  }
  /**
   * Write raw bytes.
   */
  writeBytes(data) {
    this.ensureCapacity(data.length);
    this.buffer.set(data, this.pos);
    this.pos += data.length;
  }
  /**
   * Write a fixed 32-bit value (little-endian).
   */
  writeFixed32(value) {
    this.ensureCapacity(4);
    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset);
    view.setUint32(this.pos, value, true);
    this.pos += 4;
  }
  /**
   * Write a fixed 64-bit value (little-endian).
   */
  writeFixed64(value) {
    this.ensureCapacity(8);
    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset);
    view.setBigUint64(this.pos, value, true);
    this.pos += 8;
  }
  /**
   * Write a float (32-bit).
   */
  writeFloat(value) {
    this.ensureCapacity(4);
    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset);
    view.setFloat32(this.pos, value, true);
    this.pos += 4;
  }
  /**
   * Write a double (64-bit).
   */
  writeDouble(value) {
    this.ensureCapacity(8);
    const view = new DataView(this.buffer.buffer, this.buffer.byteOffset);
    view.setFloat64(this.pos, value, true);
    this.pos += 8;
  }
  /**
   * Write a length-delimited string.
   */
  writeString(fieldNumber, value) {
    const encoded = new TextEncoder().encode(value);
    this.writeTag(
      fieldNumber,
      2
      /* WireType.LengthDelimited */
    );
    this.writeVarint(encoded.length);
    this.writeBytes(encoded);
  }
  /**
   * Write a length-delimited bytes field.
   */
  writeBytesField(fieldNumber, value) {
    this.writeTag(
      fieldNumber,
      2
      /* WireType.LengthDelimited */
    );
    this.writeVarint(value.length);
    this.writeBytes(value);
  }
  /**
   * Write a varint field.
   */
  writeVarintField(fieldNumber, value) {
    this.writeTag(
      fieldNumber,
      0
      /* WireType.Varint */
    );
    this.writeVarint(value);
  }
  /**
   * Write a fixed64 field.
   */
  writeFixed64Field(fieldNumber, value) {
    this.writeTag(
      fieldNumber,
      1
      /* WireType.Fixed64 */
    );
    this.writeFixed64(value);
  }
  /**
   * Write a float field.
   */
  writeFloatField(fieldNumber, value) {
    this.writeTag(
      fieldNumber,
      5
      /* WireType.Fixed32 */
    );
    this.writeFloat(value);
  }
  /**
   * Write a double field.
   */
  writeDoubleField(fieldNumber, value) {
    this.writeTag(
      fieldNumber,
      1
      /* WireType.Fixed64 */
    );
    this.writeDouble(value);
  }
  /**
   * Write an embedded message.
   */
  writeMessage(fieldNumber, writeFn) {
    const subWriter = new ProtobufWriter();
    writeFn(subWriter);
    const data = subWriter.finish();
    this.writeBytesField(fieldNumber, data);
  }
  /**
   * Write packed repeated int64 field.
   */
  writePackedInt64(fieldNumber, values) {
    if (values.length === 0)
      return;
    const subWriter = new ProtobufWriter();
    for (const v of values) {
      subWriter.writeVarint(v);
    }
    this.writeBytesField(fieldNumber, subWriter.finish());
  }
  /**
   * Write packed repeated float field.
   */
  writePackedFloat(fieldNumber, values) {
    if (values.length === 0)
      return;
    const data = new Uint8Array(values.length * 4);
    const view = new DataView(data.buffer);
    for (let i = 0; i < values.length; i++) {
      view.setFloat32(i * 4, values[i], true);
    }
    this.writeBytesField(fieldNumber, data);
  }
  /**
   * Ensure we have enough buffer space.
   */
  ensureCapacity(needed) {
    if (this.pos + needed > this.buffer.length) {
      this.chunks.push(this.buffer.slice(0, this.pos));
      this.buffer = new Uint8Array(Math.max(4096, needed));
      this.pos = 0;
    }
  }
  /**
   * Finish writing and return the complete buffer.
   */
  finish() {
    if (this.pos > 0) {
      this.chunks.push(this.buffer.slice(0, this.pos));
    }
    const totalSize = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
}
const ModelProtoFields = {
  ir_version: 1,
  opset_import: 8,
  producer_name: 2,
  producer_version: 3,
  graph: 7
};
function writeModelProto(writer, model) {
  writer.writeVarintField(ModelProtoFields.ir_version, model.irVersion);
  if (model.producerName) {
    writer.writeString(ModelProtoFields.producer_name, model.producerName);
  }
  if (model.producerVersion) {
    writer.writeString(ModelProtoFields.producer_version, model.producerVersion);
  }
  for (const opset of model.opsetImports) {
    writer.writeMessage(ModelProtoFields.opset_import, (w) => {
      if (opset.domain) {
        w.writeString(1, opset.domain);
      }
      w.writeVarintField(2, opset.version);
    });
  }
  writer.writeMessage(ModelProtoFields.graph, (w) => writeGraphProto(w, model.graph));
}
const GraphProtoFields = {
  node: 1,
  name: 2,
  initializer: 5,
  input: 11,
  output: 12
};
function writeGraphProto(writer, graph) {
  if (graph.name) {
    writer.writeString(GraphProtoFields.name, graph.name);
  }
  for (const node2 of graph.nodes) {
    writer.writeMessage(GraphProtoFields.node, (w) => writeNodeProto(w, node2));
  }
  for (const input of graph.inputs) {
    writer.writeMessage(GraphProtoFields.input, (w) => writeValueInfoProto(w, input));
  }
  for (const output of graph.outputs) {
    writer.writeMessage(GraphProtoFields.output, (w) => writeValueInfoProto(w, output));
  }
  for (const init of graph.initializers) {
    writer.writeMessage(GraphProtoFields.initializer, (w) => writeTensorProto(w, init.name, init.data));
  }
}
const NodeProtoFields = {
  input: 1,
  output: 2,
  name: 3,
  op_type: 4,
  attribute: 5
};
function writeNodeProto(writer, node2) {
  for (const input of node2.inputs) {
    writer.writeString(NodeProtoFields.input, input);
  }
  for (const output of node2.outputs) {
    writer.writeString(NodeProtoFields.output, output);
  }
  if (node2.name) {
    writer.writeString(NodeProtoFields.name, node2.name);
  }
  writer.writeString(NodeProtoFields.op_type, node2.opType);
  for (const attr of node2.attributes) {
    writer.writeMessage(NodeProtoFields.attribute, (w) => writeAttributeProto(w, attr));
  }
}
const AttributeProtoFields = {
  name: 1,
  type: 20,
  f: 2,
  // float
  i: 3,
  // int64
  s: 4,
  // bytes
  t: 5,
  // TensorProto
  floats: 7,
  // repeated float
  ints: 8
};
const AttributeType = {
  FLOAT: 1,
  INT: 2,
  STRING: 3,
  TENSOR: 4,
  FLOATS: 6,
  INTS: 7
};
function writeAttributeProto(writer, attr) {
  writer.writeString(AttributeProtoFields.name, attr.name);
  switch (attr.type) {
    case "INT":
      writer.writeVarintField(AttributeProtoFields.type, AttributeType.INT);
      writer.writeVarintField(AttributeProtoFields.i, attr.intValue);
      break;
    case "INTS":
      writer.writeVarintField(AttributeProtoFields.type, AttributeType.INTS);
      for (const v of attr.intsValue) {
        writer.writeVarintField(AttributeProtoFields.ints, v);
      }
      break;
    case "FLOAT":
      writer.writeVarintField(AttributeProtoFields.type, AttributeType.FLOAT);
      writer.writeFloatField(AttributeProtoFields.f, attr.floatValue);
      break;
    case "FLOATS":
      writer.writeVarintField(AttributeProtoFields.type, AttributeType.FLOATS);
      for (const v of attr.floatsValue) {
        writer.writeFloatField(AttributeProtoFields.floats, v);
      }
      break;
    case "STRING":
      writer.writeVarintField(AttributeProtoFields.type, AttributeType.STRING);
      writer.writeBytesField(AttributeProtoFields.s, new TextEncoder().encode(attr.stringValue));
      break;
    case "TENSOR":
      writer.writeVarintField(AttributeProtoFields.type, AttributeType.TENSOR);
      writer.writeMessage(AttributeProtoFields.t, (w) => writeTensorProto(w, attr.name, attr.tensorValue));
      break;
  }
}
const ValueInfoProtoFields = {
  name: 1,
  type: 2
};
function writeValueInfoProto(writer, info) {
  writer.writeString(ValueInfoProtoFields.name, info.name);
  writer.writeMessage(ValueInfoProtoFields.type, (w) => {
    w.writeMessage(1, (tw) => {
      tw.writeVarintField(1, info.elemType);
      tw.writeMessage(2, (sw) => {
        for (const dim of info.shape) {
          sw.writeMessage(1, (dw) => {
            if (dim.dimValue !== void 0) {
              dw.writeVarintField(1, dim.dimValue);
            } else if (dim.dimParam !== void 0) {
              dw.writeString(2, dim.dimParam);
            }
          });
        }
      });
    });
  });
}
const TensorProtoFields = {
  dims: 1,
  // repeated int64
  data_type: 2,
  name: 8,
  raw_data: 9
};
function writeTensorProto(writer, name, tensor) {
  for (const dim of tensor.shape) {
    writer.writeVarintField(TensorProtoFields.dims, dim);
  }
  const dataType = dtypeToOnnxType(tensor.dtype);
  writer.writeVarintField(TensorProtoFields.data_type, dataType);
  writer.writeString(TensorProtoFields.name, name);
  const rawData = tensorDataToBytes(tensor);
  writer.writeBytesField(TensorProtoFields.raw_data, rawData);
}
function dtypeToOnnxType(dtype) {
  switch (dtype) {
    case "float32":
      return OnnxDataType.FLOAT;
    case "float64":
      return OnnxDataType.DOUBLE;
    case "int32":
      return OnnxDataType.INT32;
    case "int64":
      return OnnxDataType.INT64;
    case "uint8":
      return OnnxDataType.UINT8;
    default:
      return OnnxDataType.FLOAT;
  }
}
function tensorDataToBytes(tensor) {
  const data = tensor.data;
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data instanceof Float32Array) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (data instanceof Int32Array) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  throw new Error(`Unsupported tensor data type: ${typeof data}`);
}
async function normalizeInput(input) {
  if (input instanceof ArrayBuffer) {
    return input;
  }
  if (input instanceof Uint8Array) {
    if (input.byteOffset !== 0 || input.byteLength !== input.buffer.byteLength) {
      return input.slice().buffer;
    }
    return input.buffer;
  }
  if (input instanceof Blob) {
    return await input.arrayBuffer();
  }
  if (input instanceof Response) {
    if (!input.ok) {
      throw new Error(`Failed to fetch: ${input.status} ${input.statusText}`);
    }
    return await input.arrayBuffer();
  }
  if (typeof ReadableStream !== "undefined" && input instanceof ReadableStream) {
    const reader = input.getReader();
    const chunks = [];
    let totalLength = 0;
    let done = false;
    while (!done) {
      const result = await reader.read();
      done = result.done;
      if (result.value) {
        chunks.push(result.value);
        totalLength += result.value.byteLength;
      }
    }
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return combined.buffer;
  }
  if (typeof URL !== "undefined" && input instanceof URL) {
    const response = await fetch(input.href);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${input.href}: ${response.status} ${response.statusText}`);
    }
    return await response.arrayBuffer();
  }
  if (typeof input === "string") {
    if (!input.startsWith("http://") && !input.startsWith("https://") && !input.startsWith("blob:") && !input.startsWith("data:")) {
      throw new Error(`String input must be a valid URL (http://, https://, blob:, or data:). Got: "${input.substring(0, 50)}${input.length > 50 ? "..." : ""}"`);
    }
    const response = await fetch(input);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${input}: ${response.status} ${response.statusText}`);
    }
    return await response.arrayBuffer();
  }
  const typeName = input === null ? "null" : typeof input === "object" ? input.constructor?.name || "Object" : typeof input;
  throw new Error(`Unsupported input type: ${typeName}. Expected ArrayBuffer, Uint8Array, File, Blob, Response, ReadableStream, URL, or string URL.`);
}
async function pthToOnnx(input, options = {}) {
  const pthBuffer = await normalizeInput(input);
  const { opsetVersion = 17, phoneLen = 100, simplify = false } = options;
  const checkpoint = await parsePth(pthBuffer);
  const onnxModel = buildOnnxModel(checkpoint, {
    opsetVersion,
    phoneLen
  });
  const onnxBuffer = serializeOnnx(onnxModel);
  if (simplify) {
    console.warn("ONNX simplification not yet implemented in browser");
  }
  return {
    onnxBuffer,
    checkpoint,
    sampleRate: checkpoint.config.sr
  };
}
async function convertPthToOnnx(model) {
  try {
    const { onnxBuffer, sampleRate, checkpoint } = await pthToOnnx(model);
    return {
      onnxBuffer: onnxBuffer.slice().buffer,
      metaData: {
        sampleRate,
        version: checkpoint.version,
        useF0: checkpoint.useF0
      }
    };
  } catch (cause) {
    throw new RvcError(
      ErrorCodes.MODEL_CONVERSION_FAILED,
      `Failed to convert model "${model.name}" from .pth to .onnx.`,
      cause
    );
  }
}
async function prepareModel(file) {
  if (file instanceof ArrayBuffer) {
    return { onnxBuffer: file };
  }
  if (file instanceof Uint8Array) {
    return { onnxBuffer: file.buffer };
  }
  const extension = getModelFileExtension(file?.name || "");
  if (extension === ".onnx") {
    const onnxBuffer = await readModelAsArrayBuffer(file);
    return { onnxBuffer };
  }
  return convertPthToOnnx(file);
}
async function loadRmvpeModel(source) {
  const arrayBuffer = await source.arrayBuffer();
  return createSession(arrayBuffer);
}
async function createSession(arrayBuffer) {
  try {
    return await qu.create(arrayBuffer, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "disabled"
    });
  } catch (cause) {
    throw new RvcError(
      ErrorCodes.PITCH_MODEL_LOAD_FAILED,
      "Failed to create RMVPE ONNX session.",
      cause
    );
  }
}
const RMVPE_PARAMS = {
  nMels: 128,
  nFft: 1024,
  hopLength: 160,
  sampleRate: 16e3,
  fMin: 0,
  fMax: 8e3,
  nClass: 360,
  // Output dimension of RMVPE
  centsPerBin: 20,
  centsOffset: 1997.379408437619,
  threshold: 0.03
  // Default threshold for voicing detection
};
function computeMelSpectrogram(audio) {
  const { nMels, nFft, hopLength, sampleRate, fMin, fMax } = RMVPE_PARAMS;
  const pad = nFft >> 1;
  const padded = new Float32Array(audio.length + nFft);
  padded.set(audio, pad);
  // torch.stft(center=True) uses reflect padding: mirror the edges.
  for (let i = 1; i <= pad; i++) {
    padded[pad - i] = audio[i];
    padded[pad + audio.length - 1 + i] = audio[audio.length - 1 - i];
  }
  const numFrames = 1 + Math.floor(audio.length / hopLength);
  const melSpec = new Float32Array(numFrames * nMels);
  const melFilterbank = createMelFilterbank(nFft, nMels, sampleRate, fMin, fMax);
  for (let frame = 0; frame < numFrames; frame++) {
    const start = frame * hopLength;
    const windowed = applyHannWindow(padded, start, nFft);
    const magnitudes = computeMagnitudesFFT(windowed);
    const melFrame = frame * nMels;
    for (let mel = 0; mel < nMels; mel++) {
      let sum = 0;
      const filter = melFilterbank[mel];
      for (let i = 0; i < filter.length; i++) {
        sum += magnitudes[i] * filter[i];
      }
      melSpec[mel * numFrames + frame] = Math.log(Math.max(1e-5, sum));
    }
  }
  return melSpec;
}
function slaneyHzToMel(hz) {
  const f_min = 0.0;
  const f_sp = 200.0 / 3.0;
  const min_log_hz = 1000.0;
  const min_log_mel = (min_log_hz - f_min) / f_sp;
  const logstep = Math.log(6.4) / 27.0;
  if (hz >= min_log_hz) {
    return min_log_mel + Math.log(hz / min_log_hz) / logstep;
  }
  return (hz - f_min) / f_sp;
}

function slaneyMelToHz(mel) {
  const f_min = 0.0;
  const f_sp = 200.0 / 3.0;
  const min_log_hz = 1000.0;
  const min_log_mel = (min_log_hz - f_min) / f_sp;
  const logstep = Math.log(6.4) / 27.0;
  if (mel >= min_log_mel) {
    return min_log_hz * Math.exp(logstep * (mel - min_log_mel));
  }
  return f_min + f_sp * mel;
}

function createMelFilterbank(nFft, nMels, sampleRate, fMin, fMax) {
  const nFftHalf = Math.floor(nFft / 2) + 1;
  const fftfreqs = new Float32Array(nFftHalf);
  for (let j = 0; j < nFftHalf; j++) {
    fftfreqs[j] = j * sampleRate / nFft;
  }
  const melMin = slaneyHzToMel(fMin);
  const melMax = slaneyHzToMel(fMax);
  const hzPoints = new Float32Array(nMels + 2);
  for (let i = 0; i < nMels + 2; i++) {
    const mel = melMin + i * (melMax - melMin) / (nMels + 1);
    hzPoints[i] = slaneyMelToHz(mel);
  }
  const fdiff = new Float32Array(nMels + 1);
  for (let i = 0; i < nMels + 1; i++) {
    fdiff[i] = hzPoints[i + 1] - hzPoints[i];
  }
  const filterbank = [];
  for (let mel = 0; mel < nMels; mel++) {
    const filter = new Float32Array(nFftHalf);
    for (let j = 0; j < nFftHalf; j++) {
      const lower = (fftfreqs[j] - hzPoints[mel]) / fdiff[mel];
      const upper = (hzPoints[mel + 2] - fftfreqs[j]) / fdiff[mel + 1];
      filter[j] = Math.max(0, Math.min(lower, upper));
    }
    const enorm = 2.0 / (hzPoints[mel + 2] - hzPoints[mel]);
    for (let j = 0; j < nFftHalf; j++) {
      filter[j] *= enorm;
    }
    filterbank.push(filter);
  }
  return filterbank;
}
function applyHannWindow(audio, start, nFft) {
  const windowed = new Float32Array(nFft);
  const audioLen = audio.length;
  for (let i = 0; i < nFft; i++) {
    const audioIdx = start + i;
    if (audioIdx < audioLen) {
      const hann = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / nFft);
      windowed[i] = audio[audioIdx] * hann;
    } else {
      windowed[i] = 0;
    }
  }
  return windowed;
}
function computeMagnitudesFFT(frame) {
  const n = frame.length;
  const nHalf = Math.floor(n / 2) + 1;
  const complex = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    complex[i * 2] = frame[i];
    complex[i * 2 + 1] = 0;
  }
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      const tempReal = complex[i * 2];
      const tempImag = complex[i * 2 + 1];
      complex[i * 2] = complex[j * 2];
      complex[i * 2 + 1] = complex[j * 2 + 1];
      complex[j * 2] = tempReal;
      complex[j * 2 + 1] = tempImag;
    }
    let k2 = n >> 1;
    while (k2 <= j) {
      j -= k2;
      k2 >>= 1;
    }
    j += k2;
  }
  for (let stage = 2; stage <= n; stage <<= 1) {
    const angleStep = -2 * Math.PI / stage;
    const wRealStep = Math.cos(angleStep);
    const wImagStep = Math.sin(angleStep);
    for (let group = 0; group < n; group += stage) {
      let wReal = 1;
      let wImag = 0;
      const halfStage = stage >> 1;
      for (let i = 0; i < halfStage; i++) {
        const evenIdx = (group + i) * 2;
        const oddIdx = (group + i + halfStage) * 2;
        const evenReal = complex[evenIdx];
        const evenImag = complex[evenIdx + 1];
        const oddReal = complex[oddIdx];
        const oddImag = complex[oddIdx + 1];
        const twiddledReal = oddReal * wReal - oddImag * wImag;
        const twiddledImag = oddReal * wImag + oddImag * wReal;
        complex[evenIdx] = evenReal + twiddledReal;
        complex[evenIdx + 1] = evenImag + twiddledImag;
        complex[oddIdx] = evenReal - twiddledReal;
        complex[oddIdx + 1] = evenImag - twiddledImag;
        const nextWReal = wReal * wRealStep - wImag * wImagStep;
        const nextWImag = wReal * wImagStep + wImag * wRealStep;
        wReal = nextWReal;
        wImag = nextWImag;
      }
    }
  }
  const magnitudes = new Float32Array(nHalf);
  for (let i = 0; i < nHalf; i++) {
    const real = complex[i * 2];
    const imag = complex[i * 2 + 1];
    magnitudes[i] = Math.sqrt(real * real + imag * imag);
  }
  return magnitudes;
}
function decodeSalienceToF0(salience, frameCount, threshold) {
  const { nClass, centsPerBin, centsOffset } = RMVPE_PARAMS;
  const centsMapping = new Float32Array(nClass + 8);
  for (let i = 0; i < nClass + 8; i++) {
    centsMapping[i] = centsPerBin * (i - 4) + centsOffset;
  }
  const f0 = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame++) {
    const frameOffset = frame * nClass;
    let maxVal = -Infinity;
    let center = 0;
    for (let i = 0; i < nClass; i++) {
      const val = salience[frameOffset + i];
      if (val > maxVal) {
        maxVal = val;
        center = i;
      }
    }
    if (maxVal <= threshold) {
      f0[frame] = 0;
      continue;
    }
    const startIdx = center - 4;
    let productSum = 0;
    let weightSum = 0;
    for (let i = 0; i < 9; i++) {
      const binIdx = startIdx + i;
      const salienceVal = binIdx >= 0 && binIdx < nClass ? salience[frameOffset + binIdx] : 0;
      productSum += salienceVal * (binIdx * centsPerBin + centsOffset);
      weightSum += salienceVal;
    }
    const cents = weightSum > 0 ? productSum / weightSum : 0;
    if (cents <= 0) {
      f0[frame] = 0;
    } else {
      const hz = 10 * Math.pow(2, cents / 1200);
      f0[frame] = hz;
    }
  }
  return f0;
}
function padMelSpectrogram(melSpec, nMels, numFrames, targetFrames) {
  if (targetFrames <= numFrames) {
    return melSpec;
  }
  const padded = new Float32Array(targetFrames * nMels);
  for (let mel = 0; mel < nMels; mel++) {
    const srcOffset = mel * numFrames;
    const dstOffset = mel * targetFrames;
    padded.set(melSpec.subarray(srcOffset, srcOffset + numFrames), dstOffset);
  }
  return padded;
}
async function runRmvpeInference(session, audio) {
  try {
    const { hopLength, threshold, nMels } = RMVPE_PARAMS;
    const numFrames = Math.ceil(audio.length / hopLength);
    const inputName = session.inputNames[0] ?? "mel";
    let inputTensor;
    if (inputName === "waveform") {
      inputTensor = new Te("float32", audio, [1, audio.length]);
    } else {
      const melSpec = computeMelSpectrogram(audio);
      const computedFrames = Math.floor(melSpec.length / nMels);
      const targetFrames = 160 * Math.ceil(computedFrames / 160);
      const paddedMelSpec = padMelSpectrogram(melSpec, nMels, computedFrames, targetFrames);
      inputTensor = new Te("float32", paddedMelSpec, [1, nMels, targetFrames]);
    }
    const feeds = {};
    feeds[inputName] = inputTensor;
    for (const name of session.inputNames) {
      if (name === inputName) continue;
      if (name === "threshold") {
        feeds.threshold = new Te("float32", new Float32Array([threshold]));
      } else if (name === "sr" || name === "sample_rate") {
        feeds[name] = new Te("int64", new BigInt64Array([16000n]));
      }
    }
    const results = await session.run(feeds);
    const outputName = session.outputNames[0] ?? "hidden";
    const outputTensor = results[outputName];
    let f0;
    if (outputTensor.dims.length === 2) {
      const outputFrames = outputTensor.dims[1];
      const data = outputTensor.data;
      f0 = new Float32Array(numFrames);
      for (let i = 0; i < numFrames; i++) {
        const hz = i < outputFrames ? data[i] : 0;
        f0[i] = hz >= 50 && hz <= 1100 ? hz : 0;
      }
    } else if (outputTensor.dims.length === 3 && (outputTensor.dims[1] === RMVPE_PARAMS.nClass || outputTensor.dims[2] === RMVPE_PARAMS.nClass)) {
      const salienceData = outputTensor.data;
      const isLastDimClass = outputTensor.dims[2] === RMVPE_PARAMS.nClass;
      const outputFrames = isLastDimClass ? outputTensor.dims[1] : outputTensor.dims[2];
      const f0All = decodeSalienceToF0(salienceData, outputFrames, threshold);
      f0 = new Float32Array(numFrames);
      for (let i = 0; i < numFrames; i++) {
        const hz = i < f0All.length ? f0All[i] : 0;
        f0[i] = hz >= 50 && hz <= 1100 ? hz : 0;
      }
    } else {
      throw new Error(
        `Unexpected RMVPE output shape: [${outputTensor.dims.join(", ")}], expected [batch, frames] or [batch, ${RMVPE_PARAMS.nClass}, frames]`
      );
    }
    return { f0, frameCount: numFrames };
  } catch (cause) {
    throw new RvcError(ErrorCodes.PITCH_INFERENCE_FAILED, "RMVPE inference failed.", cause);
  }
}
function medianFilterF0(f0, windowSize = 3) {
  if (windowSize < 3 || windowSize % 2 === 0) {
    windowSize = 3;
  }
  const len = f0.length;
  if (len <= windowSize) return new Float32Array(f0);
  const result = new Float32Array(len);
  const halfWindow = Math.floor(windowSize / 2);
  const window = new Array(windowSize);
  let maxDelta = 0;
  let maxDeltaIndex = -1;
  let totalDelta = 0;
  let changedFrames = 0;
  for (let i = 0; i < len; i++) {
    if (f0[i] <= 0) {
      result[i] = 0;
      continue;
    }
    let count = 0;
    for (let j = -halfWindow; j <= halfWindow; j++) {
      const idx = i + j;
      if (idx >= 0 && idx < len && f0[idx] > 0) {
        window[count++] = f0[idx];
      }
    }
    if (count === 0) {
      result[i] = 0;
    } else {
      const slice2 = window.slice(0, count);
      slice2.sort((a, b) => a - b);
      const median = slice2[Math.floor(count / 2)];
      result[i] = median;
      const delta = Math.abs(f0[i] - median);
      if (delta > 0.1) {
        changedFrames++;
        totalDelta += delta;
        if (delta > maxDelta) {
          maxDelta = delta;
          maxDeltaIndex = i;
        }
      }
    }
  }
  if (changedFrames > 0) {
    const avgDelta = totalDelta / changedFrames;
    const percentChanged = (changedFrames / len * 100).toFixed(1);
    console.log(`[F0 Median Filter] window=${windowSize}, frames=${len}`);
    console.log(`  Changed: ${changedFrames}/${len} (${percentChanged}%)`);
    console.log(`  Total delta: ${totalDelta.toFixed(1)}Hz, Avg: ${avgDelta.toFixed(1)}Hz`);
    console.log(`  Max delta: ${maxDelta.toFixed(1)}Hz at frame ${maxDeltaIndex}`);
    if (maxDeltaIndex >= 0 && maxDelta > 5) {
      console.log(
        `  Example: frame ${maxDeltaIndex}: ${f0[maxDeltaIndex].toFixed(1)}Hz → ${result[maxDeltaIndex].toFixed(1)}Hz (Δ${maxDelta.toFixed(1)}Hz)`
      );
    }
  } else {
    console.log(`[F0 Median Filter] window=${windowSize}, frames=${len}, no significant changes`);
  }
  return result;
}
function aggressiveMedianFilterF0(f0, windowSize = 5) {
  if (windowSize < 5 || windowSize % 2 === 0) {
    windowSize = 5;
  }
  const len = f0.length;
  if (len <= windowSize) return new Float32Array(f0);
  const result = new Float32Array(len);
  const halfWindow = Math.floor(windowSize / 2);
  const window = new Array(windowSize);
  let maxDelta = 0;
  let maxDeltaIndex = -1;
  let totalDelta = 0;
  let changedFrames = 0;
  for (let i = 0; i < len; i++) {
    if (f0[i] <= 0) {
      result[i] = 0;
      continue;
    }
    let count = 0;
    for (let j = -halfWindow; j <= halfWindow; j++) {
      const idx = i + j;
      if (idx >= 0 && idx < len && f0[idx] > 0) {
        window[count++] = f0[idx];
      }
    }
    if (count === 0) {
      result[i] = 0;
    } else {
      const slice2 = window.slice(0, count);
      slice2.sort((a, b) => a - b);
      const median = slice2[Math.floor(count / 2)];
      result[i] = median;
      const delta = Math.abs(f0[i] - median);
      if (delta > 0.1) {
        changedFrames++;
        totalDelta += delta;
        if (delta > maxDelta) {
          maxDelta = delta;
          maxDeltaIndex = i;
        }
      }
    }
  }
  if (changedFrames > 0) {
    const avgDelta = totalDelta / changedFrames;
    const percentChanged = (changedFrames / len * 100).toFixed(1);
    console.log(`[F0 Aggressive Median Filter] window=${windowSize}, frames=${len}`);
    console.log(`  Changed: ${changedFrames}/${len} (${percentChanged}%)`);
    console.log(`  Total delta: ${totalDelta.toFixed(1)}Hz, Avg: ${avgDelta.toFixed(1)}Hz`);
    console.log(`  Max delta: ${maxDelta.toFixed(1)}Hz at frame ${maxDeltaIndex}`);
    if (maxDeltaIndex >= 0 && maxDelta > 5) {
      console.log(
        `  Example: frame ${maxDeltaIndex}: ${f0[maxDeltaIndex].toFixed(1)}Hz → ${result[maxDeltaIndex].toFixed(1)}Hz (Δ${maxDelta.toFixed(1)}Hz)`
      );
    }
  } else {
    console.log(
      `[F0 Aggressive Median Filter] window=${windowSize}, frames=${len}, no significant changes`
    );
  }
  return result;
}
function stabilizeShoutingPitchF0(f0) {
  const len = f0.length;
  if (len < 3) return f0;
  const out = new Float32Array(f0);
  for (let i = 1; i < len - 1; i++) {
    const prev = out[i - 1];
    const curr = out[i];
    const next = out[i + 1];
    if (curr > 0 && prev > 0 && next > 0) {
      const ratioPrev = curr / prev;
      const ratioNext = curr / next;
      const neighborRatio = next / prev;
      if (Math.abs(neighborRatio - 1.0) < 0.35) {
        if (
          (ratioPrev > 1.50 && ratioNext > 1.50) ||
          (ratioPrev < 0.66 && ratioNext < 0.66)
        ) {
          out[i] = (prev + next) * 0.5;
        }
      }
    }
  }
  const maxSlew = 1.60;
  const minSlew = 1.0 / maxSlew;
  for (let i = 1; i < len; i++) {
    if (out[i] > 0 && out[i - 1] > 0) {
      const r = out[i] / out[i - 1];
      if (r > maxSlew) {
        out[i] = out[i - 1] * maxSlew;
      } else if (r < minSlew) {
        out[i] = out[i - 1] * minSlew;
      }
    }
  }
  return out;
}
async function estimatePitch(audio, options) {
  const session = options.rmvpe instanceof File ? await loadRmvpeModel(options.rmvpe) : options.rmvpe;
  const { f0, frameCount } = await runRmvpeInference(session, audio);
  const medianFilterEnabled = options.medianFilter !== false;
  const aggressiveMode = options.aggressiveMedianFilter === true;
  const windowSize = options.medianFilterWindow ?? (aggressiveMode ? 5 : 3);
  let filteredF0 = f0;
  if (medianFilterEnabled) {
    if (aggressiveMode) {
      filteredF0 = aggressiveMedianFilterF0(f0, windowSize);
    } else {
      filteredF0 = medianFilterF0(f0, windowSize);
    }
  }
  filteredF0 = stabilizeShoutingPitchF0(filteredF0);
  return {
    f0: filteredF0,
    frameCount,
    hopSize: 160
  };
}
const F0_MIN = 50;
const F0_MAX = 1100; // MUST match RVC v2 training constant: nn.Embedding(256) was trained with f0_mel_max=1127*log(1+1100/700)
const PITCH_SHIFT_CEILING = 1100; // Continuous Hz ceiling for applyPitchShift (must also match training range)
const F0_MEL_MIN = 1127 * Math.log(1 + F0_MIN / 700);
const F0_MEL_MAX = 1127 * Math.log(1 + F0_MAX / 700);
function buildSynthesisFeeds(features, pitch, frameCount, speakerId, pitchShift = 0) {
  try {
    const shiftedF0 = applyPitchShift(pitch.f0, pitchShift);
    return {
      phone: buildPhoneTensor(features, frameCount),
      phone_lengths: buildPhoneLengthsTensor(frameCount),
      pitch: buildPitchTensor(shiftedF0, frameCount),
      nsff0: buildNsff0Tensor(shiftedF0, frameCount),
      sid: buildSpeakerTensor(speakerId),
      rnd: buildRndTensor(frameCount)
    };
  } catch (cause) {
    throw new RvcError(
      ErrorCodes.SYNTH_FEED_BUILD_FAILED,
      `Failed to build synthesis input tensors for ${frameCount} frames: ${cause instanceof Error ? cause.message : "unknown error"}`,
      cause
    );
  }
}
function applyPitchShift(f0, semitones) {
  const factor = semitones === 0 ? 1.0 : 2 ** (semitones / 12);
  const shifted = new Float32Array(f0.length);
  let ceilingHits = 0;
  let voicedFrames = 0;
  for (let i = 0; i < f0.length; i++) {
    const rawHz = f0[i] * factor;
    if (rawHz > 0) {
      voicedFrames++;
      // Cap at training range to keep pitch within the model's learned embedding space
      if (rawHz > PITCH_SHIFT_CEILING) ceilingHits++;
      shifted[i] = Math.min(PITCH_SHIFT_CEILING, Math.max(F0_MIN, rawHz));
    } else {
      shifted[i] = 0;
    }
  }
  if (ceilingHits > 0 && voicedFrames > 0) {
    const pct = (ceilingHits / voicedFrames * 100).toFixed(1);
    consoleProxy.warn(
      `[F0 Ceiling] ${ceilingHits}/${voicedFrames} frames (${pct}%) hit the 1100Hz cap after ${semitones >= 0 ? "+" : ""}${semitones} semitones. Pitch gets pinned at the cap and may sound metallic/electronic — lowering the shift is recommended.`
    );
  }
  // Note: isolated F0 spikes are already handled by the 3-point median
  // filter BEFORE the shift (estimatePitch). No post-shift smoothing here:
  // reining in legitimate momentary high notes would audibly flatten them.
  return shifted;
}
function buildPhoneTensor(features, frameCount) {
  const data = trimFeatureFrames(features.hiddenStates, frameCount, features.featureSize);
  return new Te("float32", data, [1, frameCount, features.featureSize]);
}
function buildPhoneLengthsTensor(frameCount) {
  return new Te("int64", new BigInt64Array([BigInt(frameCount)]), [1]);
}
function buildPitchTensor(f0, frameCount) {
  const data = buildQuantizedPitch(f0, frameCount);
  return new Te("int64", data, [1, frameCount]);
}
function buildNsff0Tensor(f0, frameCount) {
  const data = trimPitchFrames(f0, frameCount);
  return new Te("float32", data, [1, frameCount]);
}
function buildSpeakerTensor(speakerId) {
  return new Te("int64", new BigInt64Array([BigInt(speakerId)]), [1]);
}
function trimFeatureFrames(hiddenStates, frameCount, featureSize) {
  return hiddenStates.slice(0, frameCount * featureSize);
}
function trimPitchFrames(f0, frameCount) {
  return f0.slice(0, frameCount);
}
function buildQuantizedPitch(f0, frameCount) {
  const values = new BigInt64Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    const f0Hz = f0[i] ?? 0;
    let quantized;
    if (f0Hz <= 0) {
      quantized = 1;
    } else {
      const f0Mel = 1127 * Math.log(1 + f0Hz / 700);
      quantized = (f0Mel - F0_MEL_MIN) * 254 / (F0_MEL_MAX - F0_MEL_MIN) + 1;
      quantized = Math.max(1, Math.min(255, quantized));
    }
    values[i] = BigInt(Math.round(quantized));
  }
  return values;
}
function buildRndTensor(frameCount) {
  const size = 1 * 192 * frameCount;
  const data = new Float32Array(size);
  const noiseScale = 0.667; // VITS standard noise_scale for natural human vocal timbre
  for (let i = 0; i < size; i += 2) {
    let u1 = Math.random();
    let u2 = Math.random();
    while (u1 <= 1e-7) u1 = Math.random();
    const radius = Math.sqrt(-2.0 * Math.log(u1)) * noiseScale;
    const theta = 2.0 * Math.PI * u2;
    data[i] = radius * Math.cos(theta);
    if (i + 1 < size) {
      data[i + 1] = radius * Math.sin(theta);
    }
  }
  return new Te("float32", data, [1, 192, frameCount]);
}
function parseSynthesisOutput(outputs) {
  try {
    const audioOutput = outputs.audio;
    if (!(audioOutput instanceof Te)) {
      throw new TypeError('Synthesis output "audio" is missing or not a tensor.');
    }
    const audio = flattenAudioOutput(audioOutput);
    const sampleRate = readSampleRate(outputs.sr);
    return { audio, sampleRate };
  } catch (cause) {
    throw new RvcError(
      ErrorCodes.SYNTH_OUTPUT_PARSE_FAILED,
      `Failed to parse synthesis output: ${cause instanceof Error ? cause.message : "unknown error"}`,
      cause
    );
  }
}
function flattenAudioOutput(audioOutput) {
  if (!(audioOutput.data instanceof Float32Array)) {
    throw new TypeError('Synthesis output "audio" must be float32.');
  }
  return audioOutput.data;
}
function readSampleRate(output) {
  if (!(output instanceof Te)) {
    return void 0;
  }
  const data = output.data;
  if (data instanceof Float32Array || data instanceof Float64Array) {
    return data.length > 0 ? Math.round(data[0]) : void 0;
  }
  if (data instanceof Int32Array || data instanceof Uint32Array) {
    return data.length > 0 ? data[0] : void 0;
  }
  if (data instanceof BigInt64Array || data instanceof BigUint64Array) {
    return data.length > 0 ? Number(data[0]) : void 0;
  }
  return void 0;
}
function computeFrameCount(features, pitch, maxFrames) {
  const minFrames = Math.min(features.upsampledFrameCount, pitch.frameCount);
  const cappedFrames = maxFrames !== void 0 ? Math.min(minFrames, maxFrames) : minFrames;
  return Math.max(1, cappedFrames);
}
async function runInference(session, feeds) {
  try {
    const filteredFeeds = {};
    for (const name of session.inputNames) {
      if (name in feeds) {
        filteredFeeds[name] = feeds[name];
      }
    }
    return await session.run(filteredFeeds);
  } catch (cause) {
    throw new RvcError(
      ErrorCodes.SYNTH_INFERENCE_FAILED,
      `ONNX inference failed during voice synthesis: ${cause instanceof Error ? cause.message : "unknown error"}`,
      cause
    );
  }
}
async function synthesizeVoice(session, features, pitch, options = {}) {
  const frameCount = computeFrameCount(features, pitch, options.maxFrames);
  const speakerId = options.speakerId ?? 0;
  const pitchShift = options.pitchShift ?? 0;
  const feeds = buildSynthesisFeeds(features, pitch, frameCount, speakerId, pitchShift);
  const outputs = await runInference(session, feeds);
  return parseSynthesisOutput(outputs);
}
// Official-RVC-style input conditioning: DC removal + 48Hz 2nd-order
// Butterworth high-pass + peak normalization to -3dB (0.7). Mic and phone
// recordings arrive at wildly different levels; clipped inputs get their
// distortion "learned and amplified" by HuBERT while too-quiet inputs
// degrade feature quality. Normalizing first keeps both cases safe.
function conditionInputAudio(audio, sampleRate = 16000) {
  if (!audio || audio.length === 0) return audio;
  const out = new Float32Array(audio.length);
  let sum = 0;
  for (let i = 0; i < audio.length; i++) sum += audio[i];
  const mean = sum / audio.length;
  const w0 = 2.0 * Math.PI * 48 / sampleRate;
  const cosw0 = Math.cos(w0);
  const alpha = Math.sin(w0) / (2.0 * 0.7071067811865476);
  const a0 = 1.0 + alpha;
  const b0 = (1.0 + cosw0) / 2.0 / a0;
  const b1 = -(1.0 + cosw0) / a0;
  const b2 = (1.0 + cosw0) / 2.0 / a0;
  const a1 = (-2.0 * cosw0) / a0;
  const a2 = (1.0 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  let peak = 0;
  for (let i = 0; i < audio.length; i++) {
    const x0 = audio[i] - mean;
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y0;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    const av = Math.abs(y0);
    if (av > peak) peak = av;
  }
  if (peak > 0.02 && isFinite(peak) && peak > 0) {
    const scale = 0.7 / peak;
    for (let i = 0; i < out.length; i++) out[i] *= scale;
  }
  return out;
}
function applyRmsVolumeEnvelope(input16k, synthAudio, rmsMixRate = 0.25, synthSampleRate = 40000) {
  if (!input16k || !synthAudio || rmsMixRate <= 0) return synthAudio;
  const hop16k = 160;
  const win16k = 640;
  const hopSynth = Math.round(synthSampleRate / 100);
  const winSynth = Math.round(synthSampleRate * 0.04); // 40ms window

  const numFrames = Math.min(
    Math.floor((input16k.length - win16k) / hop16k) + 1,
    Math.floor((synthAudio.length - winSynth) / hopSynth) + 1
  );
  if (numFrames <= 0) return synthAudio;

  const targetGains = new Float32Array(numFrames);
  const exponent = 1.0 - rmsMixRate;

  for (let f = 0; f < numFrames; f++) {
    let sumIn = 0;
    const inStart = f * hop16k;
    for (let i = 0; i < win16k; i++) {
      const s = input16k[inStart + i];
      sumIn += s * s;
    }
    const rmsIn = Math.sqrt(sumIn / win16k + 1e-8);

    let sumSynth = 0;
    const synthStart = f * hopSynth;
    for (let i = 0; i < winSynth; i++) {
      const s = synthAudio[synthStart + i];
      sumSynth += s * s;
    }
    const rmsSynth = Math.sqrt(sumSynth / winSynth + 1e-8);

    if (rmsIn < 0.003) {
      targetGains[f] = 1.0;
    } else {
      const rawRatio = Math.pow(rmsIn / Math.max(1e-4, rmsSynth), exponent);
      // Keep envelope gain conservative: the old [0.2, 4.0] range could
      // multiply the vocoder output by 4x and slam it into the limiter,
      // which is a direct cause of audible clipping/distortion.
      targetGains[f] = Math.max(0.3, Math.min(1.6, rawRatio));
    }
  }

  const output = new Float32Array(synthAudio);
  let currentGain = targetGains[0];

  for (let f = 0; f < numFrames; f++) {
    const startGain = currentGain;
    const nextGain = targetGains[f];
    const synthStart = f * hopSynth;
    const frameLen = Math.min(hopSynth, output.length - synthStart);
    for (let i = 0; i < frameLen; i++) {
      const t = (i + 1) / frameLen;
      const g = startGain + (nextGain - startGain) * t;
      output[synthStart + i] *= g;
    }
    currentGain = nextGain;
  }
  return output;
}
function createBiquadLowShelf(f0, gainDb, sr) {
  const w0 = 2.0 * Math.PI * f0 / sr;
  const A = Math.pow(10.0, gainDb / 40.0);
  const alpha = Math.sin(w0) / 2.0 * Math.sqrt(2.0);
  const b0 = A * ((A + 1.0) - (A - 1.0) * Math.cos(w0) + 2.0 * Math.sqrt(A) * alpha);
  const b1 = 2.0 * A * ((A - 1.0) - (A + 1.0) * Math.cos(w0));
  const b2 = A * ((A + 1.0) - (A - 1.0) * Math.cos(w0) - 2.0 * Math.sqrt(A) * alpha);
  const a0 = (A + 1.0) + (A - 1.0) * Math.cos(w0) + 2.0 * Math.sqrt(A) * alpha;
  const a1 = -2.0 * ((A - 1.0) + (A + 1.0) * Math.cos(w0));
  const a2 = (A + 1.0) + (A - 1.0) * Math.cos(w0) - 2.0 * Math.sqrt(A) * alpha;
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

function createBiquadPeaking(f0, gainDb, Q, sr) {
  const w0 = 2.0 * Math.PI * f0 / sr;
  const A = Math.pow(10.0, gainDb / 40.0);
  const alpha = Math.sin(w0) / (2.0 * Q);
  const b0 = 1.0 + alpha * A;
  const b1 = -2.0 * Math.cos(w0);
  const b2 = 1.0 - alpha * A;
  const a0 = 1.0 + alpha / A;
  const a1 = -2.0 * Math.cos(w0);
  const a2 = 1.0 - alpha / A;
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

function createBiquadHighShelf(f0, gainDb, sr) {
  const w0 = 2.0 * Math.PI * f0 / sr;
  const A = Math.pow(10.0, gainDb / 40.0);
  const alpha = Math.sin(w0) / 2.0 * Math.sqrt(2.0);
  const b0 = A * ((A + 1.0) + (A - 1.0) * Math.cos(w0) + 2.0 * Math.sqrt(A) * alpha);
  const b1 = -2.0 * A * ((A - 1.0) + (A + 1.0) * Math.cos(w0));
  const b2 = A * ((A + 1.0) + (A - 1.0) * Math.cos(w0) - 2.0 * Math.sqrt(A) * alpha);
  const a0 = (A + 1.0) - (A - 1.0) * Math.cos(w0) + 2.0 * Math.sqrt(A) * alpha;
  const a1 = 2.0 * ((A - 1.0) - (A + 1.0) * Math.cos(w0));
  const a2 = (A + 1.0) - (A - 1.0) * Math.cos(w0) - 2.0 * Math.sqrt(A) * alpha;
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

function applyBiquadFilterInPlace(audio, coeffs) {
  const [b0, b1, b2, a1, a2] = coeffs;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < audio.length; i++) {
    const x0 = audio[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    audio[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
}

function createBiquadBandpass(f0, Q, sr) {
  const w0 = 2.0 * Math.PI * f0 / sr;
  const alpha = Math.sin(w0) / (2.0 * Q);
  const b0 = alpha;
  const b1 = 0.0;
  const b2 = -alpha;
  const a0 = 1.0 + alpha;
  const a1 = -2.0 * Math.cos(w0);
  const a2 = 1.0 - alpha;
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

// Dynamic anti-metallic mastering: tames the HiFiGAN "low-end boom + 3-5kHz
// resonance + over-bright high" signature without dulling the source.
function applyHarmonicAirAndWarmth(audio, sampleRate = 40000) {
  if (!audio || audio.length === 0) return audio;
  const processed = new Float32Array(audio);
  // NaN hygiene: a single NaN sample would propagate through every biquad
  // and poison the whole buffer; flush them to silence up front.
  for (let i = 0; i < processed.length; i++) {
    if (isNaN(processed[i])) processed[i] = 0;
  }

  // 1. Tame low-end boom: -3.5dB @ 180Hz low-shelf (was +3dB @ 350Hz which added mud)
  const lowShelf = createBiquadLowShelf(180, -3.5, sampleRate);
  applyBiquadFilterInPlace(processed, lowShelf);

  // 2. Restore vocal body: +2.5dB @ 1200Hz peaking (Q=0.8)
  const bodyBoost = createBiquadPeaking(1200, 2.5, 0.8, sampleRate);
  applyBiquadFilterInPlace(processed, bodyBoost);

  // 3. Dynamic suppression of the 3.0-3.5kHz metallic band, gated by the 1.15k
  //    vocal-body energy so we only cut when harshness is actually present.
  // 3b. Same gating for the 4-5kHz "pinched/shrill" band: large upward pitch
  //     shifts (+10..+12) stack dense harmonics exactly there, which is heard
  //     as 声音过尖/不自然. Cutting dynamically (instead of a static EQ dip)
  //     keeps natural /s/ sibilance intact while taming sustained shrillness.
  const bMetal = createBiquadBandpass(3200, 1.0, sampleRate);
  const bBody = createBiquadBandpass(1150, 0.6, sampleRate);
  const bSharp = createBiquadBandpass(4600, 1.2, sampleRate);
  const metalSig = new Float32Array(processed);
  const bodySig = new Float32Array(processed);
  const sharpSig = new Float32Array(processed);
  applyBiquadFilterInPlace(metalSig, bMetal);
  applyBiquadFilterInPlace(bodySig, bBody);
  applyBiquadFilterInPlace(sharpSig, bSharp);

  const blockSize = Math.max(1, Math.round(sampleRate * 0.005));
  const numBlocks = Math.floor(processed.length / blockSize);
  const gainEnv = new Float32Array(processed.length);
  const sharpEnv = new Float32Array(processed.length);
  let currentGain = 1.0;
  let currentSharpGain = 1.0;

  for (let blk = 0; blk < numBlocks; blk++) {
    const st = blk * blockSize;
    const en = Math.min(st + blockSize, processed.length);
    let sMetal = 0, sBody = 0, sSharp = 0;
    for (let i = st; i < en; i++) {
      sMetal += metalSig[i] * metalSig[i];
      sBody += bodySig[i] * bodySig[i];
      sSharp += sharpSig[i] * sharpSig[i];
    }
    const rmsMetal = Math.sqrt(sMetal / (en - st) + 1e-6);
    const rmsBody = Math.sqrt(sBody / (en - st) + 1e-6);
    const rmsSharp = Math.sqrt(sSharp / (en - st) + 1e-6);
    const ratio = rmsMetal / (rmsBody + 1e-4);
    let targetGain = 1.0;
    if (ratio > 0.30) {
      const redDb = Math.min(8.0, (ratio - 0.30) * 16.0);
      targetGain = Math.pow(10.0, -redDb / 20.0);
    } else if (rmsMetal > 0.10) {
      const redDb = Math.min(6.0, (rmsMetal - 0.10) * 20.0);
      targetGain = Math.pow(10.0, -redDb / 20.0);
    }
    // Shrillness gate: only engage when 4.6k energy dominates the vocal body
    // by a clear margin, and cap the cut gentler than the metallic band so
    // brief sibilants stay crisp.
    const sharpRatio = rmsSharp / (rmsBody + 1e-4);
    let targetSharpGain = 1.0;
    if (sharpRatio > 0.45) {
      const redDb = Math.min(5.5, (sharpRatio - 0.45) * 12.0);
      targetSharpGain = Math.pow(10.0, -redDb / 20.0);
    } else if (rmsSharp > 0.08) {
      const redDb = Math.min(4.0, (rmsSharp - 0.08) * 16.0);
      targetSharpGain = Math.pow(10.0, -redDb / 20.0);
    }
    for (let i = st; i < en; i++) {
      // fast attack, slow release
      const coeff = targetGain < currentGain ? 0.25 : 0.04;
      currentGain += coeff * (targetGain - currentGain);
      gainEnv[i] = currentGain;
      const sharpCoeff = targetSharpGain < currentSharpGain ? 0.2 : 0.04;
      currentSharpGain += sharpCoeff * (targetSharpGain - currentSharpGain);
      sharpEnv[i] = currentSharpGain;
    }
  }
  for (let i = 0; i < processed.length; i++) {
    processed[i] -= metalSig[i] * (1.0 - gainEnv[i]);
    processed[i] -= sharpSig[i] * (1.0 - sharpEnv[i]);
  }

  // 4. Sweep the over-bright top: -3.0dB @ 7500Hz high-shelf
  const highShelf = createBiquadHighShelf(7500, -3.0, sampleRate);
  applyBiquadFilterInPlace(processed, highShelf);

  // 4b. Gentle "studio air" contour: a very light lift around 11-11.5kHz
  // emphasises the natural breath/open-vowel air band so converted speech
  // sounds recorded-in-a-real-room rather than flat/synthetic. Strength is
  // kept tiny so it never re-introduces harshness or sibilance the shelf
  // just removed. (AI翻唱"像本人录音室录制"的空气感来源之一)
  const airPeak = createBiquadPeaking(sampleRate * 0.285, 1.5, 1.2, sampleRate);
  applyBiquadFilterInPlace(processed, airPeak);

  // 5. Transparent peak normalization (official RVC style): scale the whole
  //    buffer proportionally instead of per-sample soft-clipping. The old
  //    tanh knee flattened loud waveform crests into plateaus, which is
  //    heard as distortion/clipping ("破音").
  let peak = 0;
  for (let i = 0; i < processed.length; i++) {
    const av = Math.abs(processed[i]);
    if (av > peak) peak = av;
  }
  if (peak > 0.95 && isFinite(peak) && peak > 0) {
    const scale = 0.95 / peak;
    for (let i = 0; i < processed.length; i++) {
      processed[i] *= scale;
    }
  }

  return processed;
}
function encodeMonoPcmToWav(audio, options = {}) {
  const { sampleRate = 40e3, numChannels = 1, bitsPerSample = 16 } = options;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = audio.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < audio.length; i += 1) {
    let s = audio[i];
    if (isNaN(s)) s = 0;
    if (s > 0.999) s = 0.999;
    else if (s < -0.999) s = -0.999;
    const int16 = s < 0 ? Math.round(s * 32768) : Math.round(s * 32767);
    view.setInt16(offset, int16, true);
    offset += bytesPerSample;
  }
  return new Blob([buffer], { type: "audio/wav" });
}
function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}
const PIPELINE_STAGES = [
  "input_preparation",
  "model_parsing",
  "feature_extraction",
  "pitch_estimation",
  "voice_synthesis",
  "post_processing"
];
async function runPipeline(files, callbacks = {}, options = {}, preDecodedAudio) {
  const ctx = { state: "idle" };
  const emitStage = (state) => {
    ctx.state = state;
    callbacks.onEvent?.({ type: "stage", stage: state });
  };
  try {
    emitStage(PIPELINE_STAGES[0]);
    let audio;
    let sampleRate;
    if (preDecodedAudio) {
      audio = preDecodedAudio.data;
      sampleRate = preDecodedAudio.sampleRate;
    } else {
      const result = await prepareInputAudio(files.audio);
      audio = result.audio;
      sampleRate = result.sampleRate;
    }
    // Condition input (DC removal + 48Hz HPF + peak norm to -3dB) before
    // feature/pitch extraction — prevents over-driven or too-quiet inputs
    // from causing clipping and electric-sounding artifacts downstream.
    audio = conditionInputAudio(audio, sampleRate);
    ctx.inputAudio = audio;
    ctx.sampleRate = sampleRate;
    emitStage(PIPELINE_STAGES[1]);
    const modelBuffer = files.model instanceof ArrayBuffer ? files.model : (files.model instanceof Blob ? await files.model.arrayBuffer() : files.model);
    const { onnxBuffer, metaData } = await prepareModel(modelBuffer);
    ctx.onnxBuffer = onnxBuffer;
    ctx.modelMetaData = metaData;
    const [rvcSession, contentVecBuffer, rmvpeBuffer] = await Promise.all([
      createSessionFromOnnxBuffer(onnxBuffer).then((r) => r.session),
      files.contentVec instanceof ArrayBuffer ? files.contentVec : files.contentVec.arrayBuffer(),
      files.rmvpe instanceof ArrayBuffer ? files.rmvpe : files.rmvpe.arrayBuffer()
    ]);
    const [contentVecSession, rmvpeSession] = await Promise.all([
      qu.create(contentVecBuffer, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all"
      }),
      qu.create(rmvpeBuffer, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all"
      })
    ]);
    ctx.modelSession = rvcSession;
    ctx.backend = "wasm";
    emitStage(PIPELINE_STAGES[2]);
    const chunkingConfig = {
      chunkDuration: options.chunkDuration ?? 6,
      padDuration: options.padDuration ?? 0.5,
      inputSampleRate: options.inputSampleRate ?? 16e3,
      outputSampleRate: options.outputSampleRate ?? 40e3
    };
    let detectedSampleRate = options.outputSampleRate;
    const outputAudio = await processAudioInChunks(
      audio,
      async (chunk, currentChunk, totalChunks) => {
        callbacks.onEvent?.({ type: "chunk_step", step: "feature", current: currentChunk, total: totalChunks });
        const features = await extractHubertFeatures(chunk.data, {
          contentVec: contentVecSession
        });
        callbacks.onEvent?.({ type: "chunk_step", step: "pitch", current: currentChunk, total: totalChunks });
        const pitch = await estimatePitch(chunk.data, {
          rmvpe: rmvpeSession,
          medianFilter: options.medianFilter,
          medianFilterWindow: options.medianFilterWindow,
          aggressiveMedianFilter: options.aggressiveMedianFilter
        });
        callbacks.onEvent?.({ type: "chunk_step", step: "synth", current: currentChunk, total: totalChunks });
        const synthesized = await synthesizeVoice(rvcSession, features, pitch, {
          speakerId: options.speakerId,
          pitchShift: options.pitchShift
        });
        if (synthesized.sampleRate && !detectedSampleRate) {
          detectedSampleRate = synthesized.sampleRate;
        }
        callbacks.onEvent?.({ type: "chunk_step", step: "done", current: currentChunk, total: totalChunks });
        return synthesized.audio;
      },
      chunkingConfig,
      (current, total) => {
        callbacks.onEvent?.({ type: "chunk", current, total });
      }
    );
    const finalSr = detectedSampleRate || options.outputSampleRate || 40e3;
    let finalAudio = outputAudio;
    // 1. Blend RMS Volume Envelope (1.0 = 100% natural neural vocoder dynamics, matching official RVC v2 WebUI)
    finalAudio = applyRmsVolumeEnvelope(audio, finalAudio, options.rmsMixRate ?? 1.0, finalSr);
    // 2. Polish Harmonics & Vocal Air
    finalAudio = applyHarmonicAirAndWarmth(finalAudio, finalSr);

    ctx.outputAudio = finalAudio;
    ctx.hiddenStates = new Float32Array(0);
    ctx.f0 = new Float32Array(0);
    ctx.onnxBuffer = void 0;
    ctx.inputAudio = void 0;
    emitStage(PIPELINE_STAGES[5]);
    ctx.outputWav = encodeMonoPcmToWav(ctx.outputAudio, {
      sampleRate: finalSr
    });
    emitStage("success");
    return ctx;
  } catch (error) {
    ctx.state = "failed";
    ctx.errorMessage = error instanceof Error ? error.message : "Unknown pipeline error";
    if (error instanceof Error) {
      ctx.errorCode = error.code ?? "UNKNOWN_ERROR";
    }
    callbacks.onEvent?.({ type: "stage", stage: "failed" });
    return ctx;
  }
}
const post = (message) => {
  self.postMessage(message);
};
const consoleProxy = {
  log: (...args) => {
    post({ type: "LOG", level: "log", message: args.join(" ") });
  },
  error: (...args) => {
    post({ type: "LOG", level: "error", message: args.join(" ") });
  },
  warn: (...args) => {
    post({ type: "LOG", level: "warn", message: args.join(" ") });
  }
};
self.onmessage = async (event) => {
  const { type } = event.data;
  if (type === "CANCEL") {
    return;
  }
  if (type !== "RUN_PIPELINE") {
    post({
      type: "ERROR",
      code: ErrorCodes.WORKER_UNKNOWN_ERROR,
      error: `Unknown message type: ${type}`
    });
    return;
  }
  const { audio, files, fileNames, options, wasmBaseUrl } = event.data;
  if (wasmBaseUrl) {
    ne.wasm.wasmPaths = wasmBaseUrl;
  }
  try {
    const pipelineFiles = {
      model: files.model,
      audio: new File([], "audio.wav"),
      contentVec: files.contentVec,
      rmvpe: files.rmvpe
    };
    if (files.index) {
      pipelineFiles.index = files.index;
    }
    consoleProxy.log("[Worker] Starting pipeline...");
    const callbacks = {
      onEvent: (event2) => {
        post({ type: "EVENT", event: event2 });
      }
    };
    const result = await runPipeline(pipelineFiles, callbacks, options, {
      data: audio.data,
      sampleRate: audio.sampleRate
    });
    if (result.state === "failed") {
      const errorCode = result.errorCode ?? ErrorCodes.WORKER_UNKNOWN_ERROR;
      const errorMessage = result.errorMessage ?? "Pipeline failed";
      consoleProxy.error("[Worker] Pipeline failed:", `[${errorCode}]`, errorMessage);
      post({ type: "ERROR", code: errorCode, error: errorMessage });
      return;
    }
    const serializableResult = {
      ...result,
      // Clear non-serializable session object
      modelSession: void 0
    };
    consoleProxy.log("[Worker] Pipeline complete!");
    post({ type: "COMPLETE", result: serializableResult });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown worker error";
    const errorCode = error instanceof RvcError ? error.code : ErrorCodes.WORKER_UNKNOWN_ERROR;
    consoleProxy.error("[Worker] Pipeline failed:", `[${errorCode}]`, errorMessage);
    post({ type: "ERROR", code: errorCode, error: errorMessage });
  }
};
post({ type: "LOG", level: "log", message: "[Worker] Ready" });
//# sourceMappingURL=inference.worker.js.map
