// Model download worker (2026-11-01 freeze1).
// Fetching, SHA-256 verification, the IndexedDB chunk cache and assembling the
// ~360 MB model all run here, so the page thread never copies, hashes or
// serialises model bytes (a phone used to freeze while scrolling the
// character gallery during a download). The page only receives progress
// messages (at most every progressMs) and, at the end, one transferred
// ArrayBuffer (zero-copy).
//
// Mirrors are probed concurrently first and ranked by time-to-first-response,
// so a mirror that is blocked or extremely slow from the user's network
// (pages.dev / jsDelivr from mainland China) is skipped instead of eating an
// inactivity timeout per chunk. Every wait has a deadline.
"use strict";

const jobs = new Map();

function post(job, msg, transfer) {
  if (job.cancelled) return;
  self.postMessage({ id: job.id, ...msg }, transfer || []);
}

function deadline(promise, ms, fallback) {
  let timer = 0;
  return Promise.race([
    promise,
    new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), ms); }),
  ]).finally(() => clearTimeout(timer));
}

let dbPromise = null;
function openDb(cfg) {
  if (dbPromise) return dbPromise;
  const attempt = deadline(new Promise((resolve) => {
    if (!self.indexedDB) return resolve(null);
    let req;
    try { req = indexedDB.open(cfg.dbName, 1); } catch { return resolve(null); }
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(cfg.storeName)) db.createObjectStore(cfg.storeName);
    };
    req.onsuccess = (e) => {
      const db = e.target.result;
      db.onversionchange = () => { try { db.close(); } catch {} dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  }), cfg.openMs, null);
  dbPromise = attempt;
  attempt.then((db) => { if (!db && dbPromise === attempt) dbPromise = null; });
  return attempt;
}

async function idbGet(cfg, key) {
  const db = await openDb(cfg);
  if (!db) return null;
  return deadline(new Promise((resolve) => {
    try {
      const req = db.transaction(cfg.storeName, "readonly").objectStore(cfg.storeName).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch { dbPromise = null; resolve(null); }
  }), cfg.readMs, null);
}

async function idbPut(cfg, key, value) {
  const db = await openDb(cfg);
  if (!db) return false;
  const bytes = Number(value?.byteLength ?? value?.size) || 0;
  return deadline(new Promise((resolve) => {
    try {
      const tx = db.transaction(cfg.storeName, "readwrite");
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
      tx.objectStore(cfg.storeName).put(value, key);
    } catch { dbPromise = null; resolve(false); }
  }), cfg.writeBaseMs + Math.ceil(bytes / (4 * 1024 * 1024)) * 1000, false);
}

async function idbDelete(cfg, key) {
  const db = await openDb(cfg);
  if (!db) return;
  try { db.transaction(cfg.storeName, "readwrite").objectStore(cfg.storeName).delete(key); } catch {}
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join("");
}

async function verified(buffer, expected) {
  if (!expected) return true;
  return (await sha256Hex(buffer)) === expected;
}

function hostOf(url) {
  try { return new URL(url).hostname; } catch { return String(url).slice(0, 40); }
}

function stopJob(job, reason) {
  if (job.stopped) return;
  job.stopped = true;
  job.reason = reason;
  job.cancelHooks.forEach((hook) => { try { hook(); } catch {} });
}

function abortError(job) {
  return job.reason || Object.assign(new Error("cancelled"), { name: "AbortError" });
}

// Rank mirrors by how fast they answer with response headers for the first
// chunk that is not cached. Losing probes are aborted immediately, so a probe
// costs at most a few KB per mirror.
async function probeMirrors(job, urls) {
  const started = Date.now();
  const results = urls.map(() => ({ ok: false, ms: Infinity, error: "timeout" }));
  const controllers = urls.map(() => new AbortController());
  const onCancel = () => controllers.forEach((c) => c.abort());
  job.cancelHooks.add(onCancel);
  try {
    await Promise.all(urls.map((url, i) => deadline((async () => {
      try {
        const resp = await fetch(url, { signal: controllers[i].signal, cache: "no-store" });
        results[i] = resp.ok
          ? { ok: true, ms: Date.now() - started }
          : { ok: false, ms: Infinity, error: `HTTP ${resp.status}` };
      } catch (error) {
        results[i] = { ok: false, ms: Infinity, error: error?.name === "AbortError" ? "timeout" : (error?.message || "network error") };
      } finally {
        controllers[i].abort();
      }
    })(), job.probeMs, undefined)));
  } finally {
    controllers.forEach((c) => c.abort());
    job.cancelHooks.delete(onCancel);
  }
  return results;
}

async function downloadFromMirror(job, url, expected, onBytes) {
  const controller = new AbortController();
  const onCancel = () => controller.abort();
  job.cancelHooks.add(onCancel);
  let timer = setTimeout(() => controller.abort(), job.connectMs);
  const rearm = () => { clearTimeout(timer); timer = setTimeout(() => controller.abort(), job.inactivityMs); };
  try {
    const resp = await fetch(url, { signal: controller.signal, cache: "force-cache" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    rearm();
    const declared = Number(resp.headers.get("content-length")) || 0;
    let bytes;
    if (!resp.body) {
      bytes = new Uint8Array(await resp.arrayBuffer());
      onBytes(bytes.byteLength);
    } else {
      const reader = resp.body.getReader();
      // Pre-size when the server says how big the chunk is (one copy per read).
      let store = new Uint8Array(declared > 0 ? declared : 4 * 1024 * 1024);
      let received = 0;
      for (;;) {
        rearm();
        const { done, value } = await reader.read();
        if (done) break;
        if (received + value.byteLength > store.byteLength) {
          const grown = new Uint8Array(Math.max(store.byteLength * 2, received + value.byteLength));
          grown.set(store.subarray(0, received));
          store = grown;
        }
        store.set(value, received);
        received += value.byteLength;
        onBytes(received);
      }
      bytes = received === store.byteLength ? store : store.slice(0, received);
    }
    clearTimeout(timer);
    if (!bytes.byteLength) throw new Error("empty response");
    if (!(await verified(bytes.buffer, expected))) throw new Error("checksum mismatch");
    return bytes.buffer;
  } catch (error) {
    if (job.stopped) throw abortError(job);
    throw new Error(error?.name === "AbortError" ? "no response" : (error?.message || "network error"));
  } finally {
    clearTimeout(timer);
    job.cancelHooks.delete(onCancel);
  }
}

async function runJob(job, m) {
  const cfg = m.db;
  const chunks = m.chunks;
  const count = chunks.length;
  const bytesByChunk = new Float64Array(count);
  let completed = 0;
  let lastPost = 0;
  let phase = "cache";
  let note = "";
  const progress = (force = false) => {
    const now = Date.now();
    if (!force && now - lastPost < job.progressMs) return;
    lastPost = now;
    let loaded = 0;
    for (let i = 0; i < count; i++) loaded += bytesByChunk[i];
    post(job, { type: "progress", phase, loaded, completed, count, note });
  };
  const setPhase = (next, nextNote = "") => { phase = next; note = nextNote; progress(true); };

  setPhase("cache");
  // Legacy whole-model Blob (written by builds before freeze1).
  if (m.checkWhole) {
    const whole = await idbGet(cfg, m.name);
    if (whole instanceof Blob && whole.size > 1024 * 1024) {
      try {
        const buffer = await whole.arrayBuffer();
        if (await verified(buffer, m.sha256)) {
          if (!m.returnBytes) return { size: buffer.byteLength, fromCache: true };
          return { size: buffer.byteLength, fromCache: true, buffer };
        }
      } catch {}
      idbDelete(cfg, m.name);
    }
  }

  // Assembly target: chunks are fixed-size except the last, so each verified
  // chunk is copied straight to its offset and its own buffer is released
  // (peak memory ~= one model, not two or three copies).
  const total = Number(m.totalSize) || 0;
  const parts = m.returnBytes ? new Array(count) : null;
  let target = m.returnBytes && total > 0 ? new Uint8Array(total) : null;
  let nominal = 0;
  const inTarget = new Set();
  const flush = () => {
    if (!target || !nominal) return;
    for (let i = 0; i < count; i++) {
      const b = parts[i];
      if (!b) continue;
      const offset = i * nominal;
      const fits = i < count - 1 ? b.byteLength === nominal : offset + b.byteLength === total;
      if (!fits) {
        // Irregular chunking: give the copied chunks back and concatenate at the end.
        for (const j of inTarget) parts[j] = target.buffer.slice(j * nominal, (j + 1) * nominal);
        inTarget.clear();
        target = null;
        return;
      }
      target.set(new Uint8Array(b), offset);
      parts[i] = null;
      inTarget.add(i);
    }
  };
  const place = (index, buffer) => {
    if (!parts) return;
    parts[index] = buffer;
    if (target && !nominal && index < count - 1) nominal = buffer.byteLength;
    flush();
  };

  // Mirror ranking shared by all chunks of this job.
  let ranking = null;
  let rankingPromise = null;
  const failures = new Map();
  const rank = async (urls) => {
    if (ranking) return ranking;
    if (!rankingPromise) {
      rankingPromise = (async () => {
        for (let round = 1; round <= 2; round++) {
          setPhase("probe", round === 1 ? "" : "retry");
          const results = await probeMirrors(job, urls);
          if (job.stopped) throw abortError(job);
          const order = results.map((r, i) => [i, r]).filter(([, r]) => r.ok).sort((a, b) => a[1].ms - b[1].ms).map(([i]) => i);
          post(job, { type: "probe", round, results: results.map((r, i) => ({ host: hostOf(urls[i]), ok: r.ok, ms: Number.isFinite(r.ms) ? r.ms : null, error: r.error || "" })) });
          if (order.length) {
            ranking = [...order, ...results.map((_, i) => i).filter((i) => !order.includes(i))];
            return ranking;
          }
        }
        const error = new Error("all mirrors unreachable");
        error.code = "RVC_MIRRORS_UNREACHABLE";
        throw error;
      })();
    }
    return rankingPromise;
  };

  const fetchChunk = async (index) => {
    const chunk = chunks[index];
    const cached = await idbGet(cfg, chunk.cacheKey);
    if (cached instanceof ArrayBuffer && cached.byteLength > 0) {
      if (await verified(cached, chunk.sha256)) {
        bytesByChunk[index] = cached.byteLength;
        return { buffer: cached, fromCache: true };
      }
      idbDelete(cfg, chunk.cacheKey);
    }
    if (job.stopped) throw abortError(job);
    const order = await rank(chunk.mirrors);
    if (phase !== "download") setPhase("download");
    let lastError = null;
    // Try mirrors best-first. A mirror that fails twice drops to the end.
    const tries = [...order].sort((a, b) => (failures.get(a) || 0) - (failures.get(b) || 0) || order.indexOf(a) - order.indexOf(b));
    for (let attempt = 0; attempt < Math.min(tries.length, job.maxMirrorTries); attempt++) {
      const mirror = tries[attempt];
      try {
        bytesByChunk[index] = 0;
        const buffer = await downloadFromMirror(job, chunk.mirrors[mirror], chunk.sha256, (n) => {
          bytesByChunk[index] = n;
          progress();
        });
        if (attempt > 0 || (failures.get(mirror) || 0) > 0) note = `via:${hostOf(chunk.mirrors[mirror])}`;
        return { buffer, fromCache: false };
      } catch (error) {
        if (job.stopped) throw abortError(job);
        lastError = error;
        failures.set(mirror, (failures.get(mirror) || 0) + 1);
        const next = tries[attempt + 1];
        bytesByChunk[index] = 0;
        post(job, { type: "switch", chunk: index, from: hostOf(chunk.mirrors[mirror]), to: next === undefined ? "" : hostOf(chunk.mirrors[next]), reason: error.message });
      }
    }
    const error = new Error(`chunk ${index + 1}/${count}: ${lastError?.message || "network error"}`);
    error.code = "RVC_CHUNK_FAILED";
    throw error;
  };

  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(job.concurrency, count)) }, async () => {
    while (next < count) {
      if (job.stopped) throw abortError(job);
      const index = next++;
      const { buffer, fromCache } = await fetchChunk(index);
      if (!fromCache) await idbPut(cfg, chunks[index].cacheKey, buffer);
      bytesByChunk[index] = buffer.byteLength;
      completed++;
      place(index, buffer);
      progress(true);
    }
  });
  // First failure stops the other lanes (and their in-flight fetches).
  await Promise.all(workers.map((lane) => lane.catch((error) => { stopJob(job, error); throw error; })));

  let size = 0;
  for (let i = 0; i < count; i++) size += bytesByChunk[i];
  await idbPut(cfg, `ready:${m.name}`, { size, chunks: count, at: Date.now() });
  if (!m.returnBytes) return { size, fromCache: false };
  if (target && inTarget.size === count) return { size, buffer: target.buffer };
  if (count === 1 && parts[0]) return { size, buffer: parts[0] };
  const out = new Uint8Array(size);
  let offset = 0;
  for (let i = 0; i < count; i++) {
    out.set(new Uint8Array(parts[i]), offset);
    offset += parts[i].byteLength;
    parts[i] = null;
  }
  return { size, buffer: out.buffer };
}

self.onmessage = async (event) => {
  const m = event.data || {};
  if (m.type === "cancel") {
    const job = jobs.get(m.id);
    if (job) {
      job.cancelled = true;
      stopJob(job, Object.assign(new Error("cancelled"), { name: "AbortError" }));
    }
    return;
  }
  if (m.type !== "load") return;
  const job = {
    id: m.id, cancelled: false, stopped: false, reason: null, cancelHooks: new Set(),
    concurrency: Number(m.concurrency) || 4,
    progressMs: Number(m.progressMs) || 200,
    probeMs: Number(m.probeMs) || 7000,
    connectMs: Number(m.connectMs) || 12000,
    inactivityMs: Number(m.inactivityMs) || 15000,
    maxMirrorTries: Number(m.maxMirrorTries) || 4,
  };
  jobs.set(m.id, job);
  try {
    const result = await runJob(job, m);
    if (result.buffer) post(job, { type: "done", size: result.size, fromCache: !!result.fromCache, buffer: result.buffer }, [result.buffer]);
    else post(job, { type: "done", size: result.size, fromCache: !!result.fromCache });
  } catch (error) {
    post(job, { type: "error", code: error?.code || (error?.name === "AbortError" ? "ABORTED" : "RVC_MODEL_FETCH_FAILED"), message: error?.message || String(error) });
  } finally {
    jobs.delete(m.id);
  }
};
